import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AgentEvent, CoreClient, Provider } from "./core";
import { Mood, Snake } from "./Snake";
import "./App.css";

type Item =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "action"; name: string; args: Record<string, unknown>; risk: string; status: string; error?: string }
  | { kind: "note"; text: string; tone?: "error" | "ok" };

type Approval = { id: string; name: string; args: Record<string, unknown> };

const MODES = [
  { id: "suggest", label: "Sadece öner" },
  { id: "ask_every", label: "Her adımda sor" },
  { id: "auto_safe", label: "Güvenliyse otomatik" },
  { id: "full_auto", label: "Tam otomatik" },
];

const API_PROVIDERS = ["openai", "anthropic", "gemini", "mistral", "groq", "deepseek", "xai", "openrouter"];

const KIND_LABEL: Record<Provider["kind"], string> = {
  subscription: "Abonelik",
  api_key: "API",
  local: "Yerel",
};

const ACTION_LABEL: Record<string, string> = {
  screenshot: "Ekrana baktı",
  click: "Tıkladı",
  double_click: "Çift tıkladı",
  scroll: "Kaydırdı",
  type: "Yazdı",
  key: "Tuşa bastı",
  open_app: "Uygulama açtı",
  shell: "Komut çalıştırdı",
  read_file: "Dosya okudu",
  write_file: "Dosya yazdı",
  list_dir: "Klasöre baktı",
};

const ASK_LABEL: Record<string, string> = {
  screenshot: "Ekran görüntüsü almak",
  click: "Tıklamak",
  double_click: "Çift tıklamak",
  scroll: "Kaydırmak",
  type: "Yazı yazmak",
  key: "Tuşa basmak",
  open_app: "Uygulama açmak",
  shell: "Komut çalıştırmak",
  read_file: "Dosya okumak",
  write_file: "Dosya yazmak",
  list_dir: "Klasöre bakmak",
};

function summarize(args: Record<string, unknown>): string {
  const v = args.command ?? args.text ?? args.path ?? args.name ?? args.combo ?? args.target;
  if (v !== undefined) return String(v);
  if ("x" in args) return `${args.x}, ${args.y}`;
  return "";
}

export default function App() {
  const [online, setOnline] = useState(false);
  const [screenControl, setScreenControl] = useState(true);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("");
  const [mode, setMode] = useState("ask_every");
  const [items, setItems] = useState<Item[]>([]);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<Mood>("idle");
  const [input, setInput] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const feed = useRef<HTMLDivElement>(null);

  const client = useMemo(
    () =>
      new CoreClient(
        (e: AgentEvent) => handle(e),
        (up) => setOnline(up),
      ),
    [],
  );

  function push(item: Item) {
    setItems((xs) => [...xs, item]);
  }

  function finish(nextMood: Mood) {
    setBusy(false);
    setApproval(null);
    setMood(nextMood);
    setTimeout(() => setMood("idle"), 2500);
  }

  function handle(e: AgentEvent) {
    switch (e.type) {
      case "ready":
        setScreenControl(e.screen_control);
        break;
      case "providers":
        setProviders(e.items);
        setProvider((p) => p || e.items[0]?.id || "");
        if (e.items.length === 0) setShowConnect(true);
        break;
      case "thinking":
        setMood("thinking");
        break;
      case "message":
        push({ kind: "agent", text: e.text });
        break;
      case "action":
        setMood(e.status === "awaiting_approval" ? "waiting" : "working");
        setItems((xs) => {
          const last = xs[xs.length - 1];
          const item: Item = { kind: "action", name: e.name, args: e.args, risk: e.risk, status: e.status, error: e.error };
          if (last?.kind === "action" && last.name === e.name && summarize(last.args) === summarize(e.args)) {
            return [...xs.slice(0, -1), item];
          }
          return [...xs, item];
        });
        break;
      case "approval":
        setApproval({ id: e.id, name: e.action.name, args: e.action.args });
        break;
      case "done":
        push({ kind: "agent", text: e.summary });
        finish("happy");
        break;
      case "stopped":
        push({ kind: "note", text: "Durduruldu." });
        finish("idle");
        break;
      case "error":
        push({ kind: "note", text: e.text, tone: "error" });
        finish("sad");
        break;
    }
  }

  useEffect(() => {
    client.connect();
  }, [client]);

  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [items, approval]);

  // Double Escape stops the agent from anywhere in the window.
  useEffect(() => {
    let last = 0;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (Date.now() - last < 400) client.send({ type: "stop" });
      last = Date.now();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [client]);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const task = input.trim();
    if (!task || busy) return;
    push({ kind: "user", text: task });
    setInput("");
    setBusy(true);
    setMood("thinking");
    client.send({ type: "run", task, provider });
  }

  function answer(ok: boolean) {
    if (!approval) return;
    client.send({ type: "approve", id: approval.id, ok });
    setApproval(null);
  }

  function changeMode(m: string) {
    setMode(m);
    client.send({ type: "set_mode", mode: m });
  }

  return (
    <div className="app">
      <header className="top">
        <Snake mood={online ? mood : "sad"} size={52} />
        <div className="top__title">
          <h1>Snaked</h1>
          <span className={`dot ${online ? "dot--on" : ""}`}>{online ? "Hazır" : "Çekirdek başlatılıyor…"}</span>
        </div>
        <button className="ghost" onClick={() => setShowConnect((s) => !s)}>
          Bağlantılar
        </button>
      </header>

      {showConnect && <Connect providers={providers} onConnect={(m) => client.send(m)} onClose={() => setShowConnect(false)} />}

      <div className="feed" ref={feed}>
        {items.length === 0 && (
          <div className="empty">
            <Snake mood="idle" size={110} />
            <p>Bilgisayarında ne yapmamı istersin?</p>
            <div className="chips">
              {["İndirilenler klasörünü türlere göre düzenle", "Masaüstündeki ekran görüntülerini bir klasöre taşı", "Bu bilgisayarın disk durumunu özetle"].map((s) => (
                <button key={s} className="chip" onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
            {!screenControl && <p className="hint">Ekran kontrolü kapalı: komut ve dosya araçları çalışır.</p>}
          </div>
        )}
        {items.map((it, i) => {
          if (it.kind === "user") return <div key={i} className="bubble bubble--user">{it.text}</div>;
          if (it.kind === "agent") return <div key={i} className="bubble bubble--agent">{it.text}</div>;
          if (it.kind === "note") return <div key={i} className={`note note--${it.tone ?? "info"}`}>{it.text}</div>;
          return (
            <div key={i} className={`step step--${it.status} step--risk-${it.risk}`}>
              <span className="step__icon" />
              <span className="step__label">{ACTION_LABEL[it.name] ?? it.name}</span>
              <code className="step__arg">{summarize(it.args)}</code>
              {it.error && <span className="step__err">{it.error}</span>}
            </div>
          );
        })}
        {approval && (
          <div className="approval">
            <div className="approval__head">Snaked şunu yapmak istiyor</div>
            <div className="approval__what">
              <strong>{ASK_LABEL[approval.name] ?? approval.name}</strong>
              <code>{summarize(approval.args)}</code>
            </div>
            <div className="approval__buttons">
              <button className="danger-ghost" onClick={() => answer(false)}>Reddet</button>
              <button className="primary" onClick={() => answer(true)} autoFocus>İzin ver</button>
            </div>
          </div>
        )}
      </div>

      <form className="composer" onSubmit={submit}>
        <div className="composer__row">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Model">
            {providers.length === 0 && <option value="">Model bağlı değil</option>}
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {KIND_LABEL[p.kind]} · {p.label}
              </option>
            ))}
          </select>
          <select value={mode} onChange={(e) => changeMode(e.target.value)} aria-label="İzin modu">
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="composer__row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={busy ? "Çalışıyorum… (durdurmak için Esc Esc)" : "Bir görev yaz…"}
            disabled={busy}
          />
          {busy ? (
            <button type="button" className="stop" onClick={() => client.send({ type: "stop" })}>Durdur</button>
          ) : (
            <button type="submit" className="primary" disabled={!online || !provider}>Başla</button>
          )}
        </div>
      </form>
    </div>
  );
}

function Connect({
  providers,
  onConnect,
  onClose,
}: {
  providers: Provider[];
  onConnect: (msg: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("openai");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");

  return (
    <div className="connect">
      <div className="connect__head">
        <h2>Model bağla</h2>
        <button className="ghost" onClick={onClose}>Kapat</button>
      </div>
      <div className="cards">
        <div className="card">
          <strong>ChatGPT aboneliği</strong>
          <span>Codex CLI'ı kurup ChatGPT hesabınla giriş yap, Snaked otomatik bulur.</span>
        </div>
        <div className="card">
          <strong>Claude aboneliği</strong>
          <span>Claude Code'u kurup giriş yap, Snaked otomatik bulur.</span>
        </div>
        <div className="card">
          <strong>Yerel model</strong>
          <span>Ollama veya LM Studio açıksa modeller otomatik listelenir.</span>
        </div>
      </div>
      <form
        className="apikey"
        onSubmit={(e) => {
          e.preventDefault();
          if (!key) return;
          onConnect({ type: "connect_api", provider: name, api_key: key, model: model || undefined });
          setKey("");
        }}
      >
        <strong>API anahtarı</strong>
        <div className="composer__row">
          <select value={name} onChange={(e) => setName(e.target.value)}>
            {API_PROVIDERS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model (isteğe bağlı)" />
        </div>
        <div className="composer__row">
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Anahtar" />
          <button className="primary" type="submit">Ekle</button>
        </div>
      </form>
      <button className="ghost" onClick={() => onConnect({ type: "providers" })}>Yeniden tara</button>
      {providers.length > 0 && (
        <ul className="connected">
          {providers.map((p) => (
            <li key={p.id}>
              <span className={`tag tag--${p.kind}`}>{KIND_LABEL[p.kind]}</span> {p.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
