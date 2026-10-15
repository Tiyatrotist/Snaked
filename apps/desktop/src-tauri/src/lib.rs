use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{Manager, RunEvent};

const CORE_PORT: u16 = 8765;

#[derive(Clone, Serialize)]
struct CoreInfo {
    port: u16,
    token: String,
}

struct CoreProcess(Mutex<Option<Child>>);

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
        .invoke_handler(tauri::generate_handler![core_info])
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
