import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Connect } from "./Connect";
import { AgentEvent, Core, CoreClient, Provider } from "./core";
import { DemoCore } from "./demo";
import { ACTION_LABEL, ASK_LABEL, KIND_LABEL, MODES, summarize } from "./labels";
import { Mood, Snake } from "./Snake";
import "./base.css";
import "./pet.css";

const SNAKE = 84; // px, the pet's box
const CRAWL_PX_PER_S = 140;

type Step = { name: string; args: Record<string, unknown>; risk: string; status: string; error?: string };
type Bubble = "closed" | "input" | "work" | "connect";
type Rect = { x: number; y: number; w: number; h: number };

export type PetProps = {
  /** Size of the area the pet lives in (the whole screen in the app, a fake desktop in the demo). */
  width: number;
  height: number;
  /** Distance from the bottom edge to the floor the pet walks on (e.g. a dock). */
  floorInset?: number;
  /** Scale from the core's screen coordinates to this area (1 in the app). */
  coordScale?: number;
  /** Report the interactive parts so the app window can let clicks through everywhere else. */
  onHitRegions?: (rects: Rect[]) => void;
  onAction?: (name: string, args: Record<string, unknown>) => void;
  demo?: boolean;
  initialMode?: string;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const secs = (ms?: number) => (ms === undefined ? "" : `${(ms / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} sn`);

export function Pet({ width, height, floorInset = 0, coordScale = 1, onHitRegions, onAction, demo, initialMode = "ask_every" }: PetProps) {
  const floor = height - floorInset - SNAKE;
  const [pos, setPos] = useState({ x: width * 0.7, y: floor });
  const [moveMs, setMoveMs] = useState(0);
  const [facing, setFacing] = useState<1 | -1>(-1);
  const [mood, setMood] = useState<Mood>("idle");
  const [asleep, setAsleep] = useState(false);
  const [bubble, setBubble] = useState<Bubble>("closed");
  const [online, setOnline] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("");
  const [mode, setMode] = useState(initialMode);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [say, setSay] = useState("");
  const [approval, setApproval] = useState<{ id: string; name: string; args: Record<string, unknown> } | null>(null);
  const [answer, setAnswer] = useState<{ text: string; ms?: number; fast?: boolean; tone?: "error" } | null>(null);
  const [target, setTarget] = useState<{ x: number; y: number; key: number } | null>(null);
  const lastActive = useRef(Date.now());
  const fast = useRef(false);
  const petRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);

  const crawlTo = useCallback((x: number, y: number, speed = CRAWL_PX_PER_S) => {
    setPos((p) => {
      const nx = clamp(x, 0, width - SNAKE);
      const ny = clamp(y, 0, height - SNAKE);
      const dist = Math.hypot(nx - p.x, ny - p.y);
      if (Math.abs(nx - p.x) > 4) setFacing(nx > p.x ? 1 : -1);
      setMoveMs(Math.round((dist / speed) * 1000));
      return { x: nx, y: ny };
    });
  }, [width, height]);

  const handle = useCallback((e: AgentEvent) => {
    lastActive.current = Date.now();
    setAsleep(false);
    switch (e.type) {
      case "ready":
        break;
      case "providers":
        setProviders(e.items);
        setProvider((p) => p || e.items[0]?.id || "");
        break;
      case "fastpath":
        fast.current = true;
        break;
      case "thinking":
        setMood("thinking");
        break;
      case "message":
        setSay(e.text);
        break;
      case "action": {
        setMood(e.status === "awaiting_approval" ? "waiting" : "working");
        setSteps((xs) => {
          const step = { name: e.name, args: e.args, risk: e.risk, status: e.status, error: e.error };
          const last = xs[xs.length - 1];
          if (last && last.name === e.name && summarize(last.args) === summarize(e.args)) return [...xs.slice(0, -1), step];
          return [...xs, step].slice(-4);
        });
        if (e.at && e.status !== "ok") {
          const tx = e.at[0] * coordScale;
          const ty = e.at[1] * coordScale;
          setTarget({ x: tx, y: ty, key: Date.now() });
          // Slither next to the target, not on top of it, so the click lands on the app.
          crawlTo(tx + 26, ty + 22, 1400);
        }
        if (e.status === "ok") onAction?.(e.name, e.args);
        break;
      }
      case "approval":
        setApproval({ id: e.id, name: e.action.name, args: e.action.args });
        setBubble("work");
        break;
      case "done":
      case "stopped":
      case "error": {
        const text = e.type === "done" ? e.summary : e.type === "error" ? e.text : "Durdum.";
        setAnswer({ text, ms: e.t_ms, fast: fast.current, tone: e.type === "error" ? "error" : undefined });
        setBusy(false);
        setApproval(null);
        setTarget(null);
        setMood(e.type === "done" ? "happy" : e.type === "error" ? "sad" : "idle");
        setTimeout(() => setMood("idle"), 2200);
        fast.current = false;
        break;
      }
    }
  }, [coordScale, crawlTo, onAction]);

  const client = useMemo<Core>(() => {
    const Impl = demo || import.meta.env.VITE_DEMO ? DemoCore : CoreClient;
    return new Impl((e) => handleRef.current(e), setOnline);
  }, [demo]);
  const handleRef = useRef(handle);
  handleRef.current = handle;

  useEffect(() => {
    client.connect().then(() => client.send({ type: "set_mode", mode: initialMode }));
  }, [client, initialMode]);

  // Keep the pet on its floor when the area resizes.
  useEffect(() => {
    setPos((p) => ({ x: clamp(p.x, 0, width - SNAKE), y: Math.min(p.y, floor) }));
  }, [width, floor]);

  // Idle life: wander along the floor, fall asleep after a quiet minute.
  useEffect(() => {
    const tick = setInterval(() => {
      if (busy || bubble !== "closed" || drag.current) return;
      const idle = Date.now() - lastActive.current;
      if (idle > 60000) {
        setAsleep(true);
        return;
      }
      if (Math.random() < 0.45) {
        const span = Math.min(320, width / 3);
        setPos((p) => {
          const nx = clamp(p.x + (Math.random() * 2 - 1) * span, 0, width - SNAKE);
          setFacing(nx > p.x ? 1 : -1);
          setMoveMs(Math.round((Math.abs(nx - p.x) / CRAWL_PX_PER_S) * 1000));
          return { x: nx, y: floor };
        });
      }
    }, 3500);
    return () => clearInterval(tick);
  }, [busy, bubble, width, floor]);

  // Tell the host which pixels are ours so clicks elsewhere reach the apps underneath.
  useLayoutEffect(() => {
    if (!onHitRegions) return;
    const rects = [petRef.current, bubbleRef.current]
      .filter((el): el is HTMLDivElement => !!el)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      });
    onHitRegions(rects);
  });

  // Double Escape stops everything.
  useEffect(() => {
    let last = 0;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (Date.now() - last < 400) client.send({ type: "stop" });
      else if (!busy) setBubble("closed");
      last = Date.now();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [client, busy]);

  function start(task: string) {
    const t = task.trim();
    if (!t || busy || !provider) return;
    setSteps([]);
    setSay("");
    setAnswer(null);
    setBusy(true);
    setBubble("work");
    setMood("thinking");
    setInput("");
    client.send({ type: "run", task: t, provider });
  }

  function onPointerDown(ev: React.PointerEvent) {
    (ev.target as Element).setPointerCapture(ev.pointerId);
    drag.current = { dx: ev.clientX - pos.x, dy: ev.clientY - pos.y, moved: false };
  }
  function onPointerMove(ev: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const x = ev.clientX - d.dx;
    const y = ev.clientY - d.dy;
    if (!d.moved && Math.hypot(x - pos.x, y - pos.y) < 5) return;
    d.moved = true;
    setMoveMs(0);
    setPos({ x: clamp(x, 0, width - SNAKE), y: clamp(y, 0, height - SNAKE) });
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    lastActive.current = Date.now();
    setAsleep(false);
    if (d?.moved) {
      // Dropped: glide back down to the floor.
      if (!busy) setTimeout(() => crawlTo(pos.x, floor, 600), 250);
      return;
    }
    setBubble((b) => (b === "closed" ? (busy || answer ? "work" : "input") : busy ? b : "closed"));
  }

  // Bubble sits above the pet, kept on screen.
  const bubbleW = Math.min(340, width - 24);
  const bubbleLeft = clamp(pos.x + SNAKE / 2 - bubbleW / 2, 12, width - bubbleW - 12);
  const roomAbove = pos.y - 18;
  const roomBelow = height - (pos.y + SNAKE) - 18;
  const below = roomAbove < 220 && roomBelow > roomAbove;
  const bubblePlace = below
    ? { top: pos.y + SNAKE + 10, maxHeight: roomBelow }
    : { bottom: height - pos.y + 10, maxHeight: roomAbove };
  const tail = clamp(pos.x + SNAKE / 2 - bubbleLeft, 22, bubbleW - 22);
  const petMood: Mood = !online ? "sad" : asleep ? "idle" : mood;

  return (
    <div className="pet-layer">
      {target && <div key={target.key} className="target" style={{ left: target.x, top: target.y }} />}

      {bubble !== "closed" && (
        <div ref={bubbleRef} className={`bubble-card ${below ? "bubble-card--below" : ""}`} style={{ left: bubbleLeft, width: bubbleW, ...bubblePlace, ["--tail" as string]: `${tail}px` }}>
          {bubble === "connect" && (
            <Connect providers={providers} onConnect={(m) => client.send(m)} onClose={() => setBubble("input")} />
          )}

          {bubble === "input" && (
            <form className="ask" onSubmit={(e) => { e.preventDefault(); start(input); }}>
              <input id="pet-task" autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder={online ? "Ne yapayım?" : "Uyanıyorum…"} />
              <div className="ask__row">
                <select id="pet-model" value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Model">
                  {providers.length === 0 && <option value="">Model yok</option>}
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{KIND_LABEL[p.kind]} · {p.label}</option>
                  ))}
                </select>
                <select id="pet-mode" value={mode} onChange={(e) => { setMode(e.target.value); client.send({ type: "set_mode", mode: e.target.value }); }} aria-label="İzin modu">
                  {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <button type="button" className="icon" title="Bağlantılar" onClick={() => setBubble("connect")}>⚙</button>
              </div>
              {demo && (
                <div className="ask__ideas">
                  {["Spotify'ı aç", "İndirilenler klasörünü düzenle", "Disk durumunu özetle", "Eski indirmeleri sil"].map((s) => (
                    <button type="button" key={s} onClick={() => start(s)}>{s}</button>
                  ))}
                </div>
              )}
            </form>
          )}

          {bubble === "work" && (
            <div className="work">
              {say && <p className="work__say">{say}</p>}
              {steps.length > 0 && (
                <ul className="work__steps">
                  {steps.map((s, i) => (
                    <li key={i} className={`st st--${s.status} st--risk-${s.risk}`}>
                      <span className="st__dot" />
                      <span className="st__label">{ACTION_LABEL[s.name] ?? s.name}</span>
                      <code>{summarize(s.args)}</code>
                    </li>
                  ))}
                </ul>
              )}
              {approval && (
                <div className="permit">
                  <strong>{ASK_LABEL[approval.name] ?? approval.name} istiyorum</strong>
                  <code>{summarize(approval.args)}</code>
                  <div className="permit__btns">
                    <button className="no" onClick={() => { client.send({ type: "approve", id: approval.id, ok: false }); setApproval(null); }}>Reddet</button>
                    <button className="yes" autoFocus onClick={() => { client.send({ type: "approve", id: approval.id, ok: true }); setApproval(null); }}>İzin ver</button>
                  </div>
                </div>
              )}
              {answer && (
                <div className={`answer ${answer.tone === "error" ? "answer--error" : ""}`}>
                  <p>{answer.text}</p>
                  {answer.ms !== undefined && (
                    <span className={`speed ${answer.fast ? "speed--fast" : ""}`}>{answer.fast ? "Anında · " : ""}{secs(answer.ms)}</span>
                  )}
                </div>
              )}
              <div className="work__foot">
                {busy ? (
                  <button className="stop" onClick={() => client.send({ type: "stop" })}>Durdur</button>
                ) : (
                  <button className="again" onClick={() => { setAnswer(null); setSteps([]); setSay(""); setBubble("input"); }}>Yeni görev</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div
        ref={petRef}
        className={`pet ${asleep ? "pet--asleep" : ""} ${moveMs > 0 ? "pet--moving" : ""}`}
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, transitionDuration: `${moveMs}ms` }}
        onTransitionEnd={() => setMoveMs(0)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="button"
        aria-label="Snaked"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setBubble("input")}
      >
        <div className="pet__flip" style={{ transform: `scaleX(${facing})` }}>
          <Snake mood={petMood} size={SNAKE} />
        </div>
        {asleep && <span className="zzz">z<i>z</i><b>z</b></span>}
        {busy && <span className="pet__ring" />}
      </div>
    </div>
  );
}
