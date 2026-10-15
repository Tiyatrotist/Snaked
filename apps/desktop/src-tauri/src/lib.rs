use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{Manager, RunEvent, WebviewWindow};

const CORE_PORT: u16 = 8765;

#[derive(Clone, Serialize)]
struct CoreInfo {
    port: u16,
    token: String,
}

struct CoreProcess(Mutex<Option<Child>>);

/// Parts of the overlay the pet occupies, in CSS pixels. Everywhere else, clicks pass
/// through to the apps underneath.
#[derive(Clone, Copy, Deserialize)]
struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

struct HitRegions(Mutex<Vec<Rect>>);

#[tauri::command]
fn set_hit_regions(rects: Vec<Rect>, regions: tauri::State<HitRegions>) {
    *regions.0.lock().unwrap() = rects;
}

/// Cover the primary monitor's work area (above the taskbar or dock) with the overlay.
fn place_overlay(win: &WebviewWindow) -> tauri::Result<()> {
    if let Some(monitor) = win.primary_monitor()? {
        let area = monitor.work_area();
        win.set_position(area.position)?;
        win.set_size(area.size)?;
    }
    // Show first: on Linux the native window only exists once shown, and changing
    // cursor handling on an unrealized window panics inside tao.
    win.show()?;
    win.set_ignore_cursor_events(true)
}

/// A transparent window can't hit-test per pixel, so poll the cursor and only accept
/// mouse input while it is over the pet or its bubble.
fn watch_cursor(win: WebviewWindow) {
    std::thread::spawn(move || {
        let mut ignoring = true;
        loop {
            std::thread::sleep(Duration::from_millis(25));
            let (Ok(cursor), Ok(origin), Ok(scale)) =
                (win.cursor_position(), win.outer_position(), win.scale_factor())
            else {
                continue;
            };
            let x = (cursor.x - origin.x as f64) / scale;
            let y = (cursor.y - origin.y as f64) / scale;
            let inside = win
                .state::<HitRegions>()
                .0
                .lock()
                .unwrap()
                .iter()
                .any(|r| x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
            if inside == ignoring && win.set_ignore_cursor_events(!inside).is_ok() {
                ignoring = !inside;
            }
        }
    });
}

/// Random token for the local WebSocket, so other programs on the machine can't drive the agent.
fn random_token() -> String {
    (0..2)
        .map(|_| {
            let mut h = RandomState::new().build_hasher();
            h.write_u64(std::process::id() as u64);
            format!("{:016x}", h.finish())
        })
        .collect()
}

/// Where the Python core lives. Development uses the repo checkout; packaged builds will
/// ship a frozen sidecar binary instead (see docs/roadmap).
fn core_dir() -> PathBuf {
    std::env::var("SNAKED_CORE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../core")))
}

fn spawn_core(token: &str) -> std::io::Result<Child> {
    let mut child = Command::new("uv")
        .args(["run", "--extra", "desktop", "snaked-core", "serve", "--port"])
        .arg(CORE_PORT.to_string())
        .current_dir(core_dir())
        .env("SNAKED_TOKEN", token)
        .stdout(Stdio::piped())
        .spawn()?;
    // Forward core logs to our stdout without blocking startup.
    if let Some(out) = child.stdout.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                println!("[core] {line}");
            }
        });
    }
    Ok(child)
}

#[tauri::command]
fn core_info(info: tauri::State<CoreInfo>) -> CoreInfo {
    info.inner().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let token = random_token();
    let child = spawn_core(&token)
        .map_err(|e| eprintln!("could not start snaked-core: {e}"))
        .ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(CoreInfo { port: CORE_PORT, token })
        .manage(CoreProcess(Mutex::new(child)))
        .manage(HitRegions(Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![core_info, set_hit_regions])
        .setup(|app| {
            let win = app.get_webview_window("main").expect("main window");
            place_overlay(&win)?;
            watch_cursor(win);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(mut child) = app.state::<CoreProcess>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
