import { useEffect, useRef, useState } from "react";
import { Pet } from "./Pet";
import "./desktop.css";

// The demo's fake screen uses a 1000 x 620 coordinate space (aspect ratio set in desktop.css).
const VW = 1000;

type Win = { id: number; app: string; lines: string[] };

const ICONS = [
  { label: "İndirilenler", x: 62, y: 78 },
  { label: "Belgeler", x: 62, y: 172 },
  { label: "Masaüstü", x: 62, y: 268 },
];
const DOCK = [
  { label: "Finder", x: 380, color: "#3b82f6" },
  { label: "Safari", x: 440, color: "#0ea5e9" },
  { label: "Mail", x: 500, color: "#60a5fa" },
  { label: "Spotify", x: 560, color: "#1db954" },
  { label: "Terminal", x: 620, color: "#334155" },
];

function windowFor(name: string, args: Record<string, unknown>): Omit<Win, "id"> | null {
  if (name === "open_app") {
    const app = String(args.name);
    if (app === "Spotify") return { app, lines: ["Şimdi çalıyor", "Barış Manço · Dönence"] };
    return { app, lines: [app === "Safari" ? "google.com" : `${app} hazır`] };
  }
  const cmd = String(args.command ?? "");
  if (name === "shell" && cmd.startsWith("mv ~/Downloads/*.{dmg")) return { app: "İndirilenler", lines: ["Belgeler · 6 öğe", "Görseller · 5 öğe", "Kurulum · 2 öğe", "Arşiv · 1 öğe"] };
  if (name === "shell" && cmd.startsWith("df")) return { app: "Terminal", lines: ["Filesystem  Size  Used  Avail  Use%", "/dev/disk3  512G  371G  141G   72%"] };
  if (name === "shell" && cmd.includes("Ekran")) return { app: "Ekran Görüntüleri", lines: ["9 öğe"] };
  return null;
}

export function DemoDesktop() {
  const desk = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [wins, setWins] = useState<Win[]>([]);

  useEffect(() => {
    const el = desk.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const s = size.w / VW; // virtual -> CSS pixels
  const dockH = 58 * s;

  return (
    <div className="desk" ref={desk}>
      <div className="desk__menubar">
        <b>Snaked</b>
        <span>Dosya</span>
        <span>Düzen</span>
        <span className="desk__clock">Per 08:06</span>
      </div>
      {ICONS.map((i) => (
        <div key={i.label} className="desk__icon" style={{ left: i.x * s, top: i.y * s }}>
          <span className="folder" />
          <small>{i.label}</small>
        </div>
      ))}
      {wins.map((w, n) => (
        <div key={w.id} className="desk__win" style={{ left: (300 + n * 34) * s, top: (90 + n * 30) * s }}>
          <div className="desk__winbar">
            <i /><i /><i />
            <span>{w.app}</span>
            <button aria-label="Kapat" onClick={() => setWins((xs) => xs.filter((x) => x.id !== w.id))}>×</button>
          </div>
          <div className="desk__winbody">
            {w.lines.map((l) => <div key={l}>{l}</div>)}
          </div>
        </div>
      ))}
      <div className="desk__dock" style={{ height: dockH }}>
        {DOCK.map((d) => (
          <span key={d.label} className="desk__app" title={d.label} style={{ left: d.x * s, background: d.color }} />
        ))}
      </div>
      {size.w > 0 && (
        <Pet
          demo
          initialMode="full_auto"
          width={size.w}
          height={size.h}
          floorInset={dockH + 4}
          coordScale={s}
          onAction={(name, args) => {
            const w = windowFor(name, args);
            if (w) setWins((xs) => [...xs.slice(-2), { ...w, id: Date.now() }]);
          }}
        />
      )}
    </div>
  );
}
