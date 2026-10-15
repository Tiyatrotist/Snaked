// In-browser simulation of snaked-core, used for the web demo (VITE_DEMO=1).
// It replays scripted tasks through the same event protocol the real core speaks.
import type { AgentEvent, Core } from "./core";

type Risk = "low" | "medium" | "high";
type Step =
  | { say: string }
  | { tool: string; args: Record<string, unknown>; risk: Risk; delay?: number; at?: [number, number] }
  | { done: string };

const PROVIDERS = [
  { id: "subscription/chatgpt", label: "ChatGPT (Codex CLI)", kind: "subscription" as const },
  { id: "subscription/claude", label: "Claude (Claude Code)", kind: "subscription" as const },
  { id: "ollama_chat/llama3.2", label: "Ollama · llama3.2", kind: "local" as const },
];

const FAST: { match: RegExp; tool: string; args: Record<string, unknown>; at?: [number, number]; summary: string }[] = [
  { match: /spotify/i, tool: "open_app", args: { name: "Spotify" }, at: [560, 588], summary: "Spotify açıldı." },
  { match: /safari|chrome|tarayıcı/i, tool: "open_app", args: { name: "Safari" }, at: [440, 588], summary: "Safari açıldı." },
  { match: /terminal/i, tool: "open_app", args: { name: "Terminal" }, at: [620, 588], summary: "Terminal açıldı." },
];

const SCRIPTS: { match: RegExp; steps: Step[] }[] = [
  {
    match: /sil|temizle|delete/i,
    steps: [
      { tool: "list_dir", args: { path: "~/Downloads" }, risk: "low", at: [62, 78] },
      { say: "30 günden eski 23 dosya var. Silmeden önce onayını alacağım." },
      { tool: "shell", args: { command: "find ~/Downloads -mtime +30 -delete" }, risk: "high" },
      { done: "30 günden eski 23 dosyayı sildim, 4,2 GB yer açıldı." },
    ],
  },
  {
    match: /indiril|düzenle|download/i,
    steps: [
      { say: "İndirilenler klasörüne bakıp dosyaları türlerine göre ayıracağım." },
      { tool: "list_dir", args: { path: "~/Downloads" }, risk: "low", at: [62, 78] },
      { say: "14 dosya var: 6 PDF, 5 görsel, 2 kurulum dosyası ve 1 arşiv." },
      { tool: "shell", args: { command: "mkdir -p ~/Downloads/{Belgeler,Görseller,Kurulum,Arşiv}" }, risk: "medium" },
      { tool: "shell", args: { command: "mv ~/Downloads/*.pdf ~/Downloads/Belgeler/" }, risk: "medium" },
      { tool: "shell", args: { command: "mv ~/Downloads/*.{png,jpg} ~/Downloads/Görseller/" }, risk: "medium" },
      { tool: "shell", args: { command: "mv ~/Downloads/*.{dmg,exe} ~/Downloads/Kurulum/ && mv ~/Downloads/*.zip ~/Downloads/Arşiv/" }, risk: "medium" },
      { done: "Bitti. 14 dosyayı 4 klasöre ayırdım: Belgeler (6), Görseller (5), Kurulum (2), Arşiv (1). Hiçbir şey silinmedi." },
    ],
  },
  {
    match: /ekran görüntü|screenshot/i,
    steps: [
      { tool: "list_dir", args: { path: "~/Desktop" }, risk: "low", at: [62, 268] },
      { say: "Masaüstünde 9 ekran görüntüsü buldum." },
      { tool: "shell", args: { command: "mkdir -p ~/Desktop/Ekran\\ Görüntüleri && mv ~/Desktop/Ekran*.png ~/Desktop/Ekran\\ Görüntüleri/" }, risk: "medium" },
      { done: "9 ekran görüntüsünü Masaüstündeki \"Ekran Görüntüleri\" klasörüne taşıdım." },
    ],
  },
  {
    match: /disk/i,
    steps: [
      { tool: "shell", args: { command: "df -h /" }, risk: "medium" },
      { tool: "shell", args: { command: "du -sh ~/* | sort -rh | head -5" }, risk: "medium" },
      { done: "Diskin 512 GB, 371 GB'ı dolu (%72). En çok yer kaplayanlar: Filmler 96 GB, Library 64 GB, İndirilenler 21 GB." },
    ],
  },
];

const FALLBACK: Step[] = [
  { say: "Önce ekrana bakıyorum." },
  { tool: "screenshot", args: {}, risk: "low" },
  { tool: "open_app", args: { name: "Safari" }, risk: "medium", at: [440, 588] },
  { tool: "click", args: { x: 520, y: 150, target: "Adres çubuğu" }, risk: "medium", at: [520, 150] },
  { tool: "type", args: { text: "hava durumu istanbul" }, risk: "medium" },
  { tool: "key", args: { combo: "enter" }, risk: "medium" },
  { done: "Safari'de aramayı açtım. (Bu bir demo; gerçek uygulamada istediğin her görevi yapar.)" },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DemoCore implements Core {
  private mode = "ask_every";
  private run = 0;
  private pending?: (ok: boolean) => void;

  constructor(private onEvent: (e: AgentEvent) => void, private onStatus: (up: boolean) => void) {}

  async connect(): Promise<void> {
    await wait(500);
    this.onStatus(true);
    this.onEvent({ type: "ready", screen_control: true });
    this.onEvent({ type: "providers", items: PROVIDERS });
  }

  send(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case "set_mode":
        this.mode = String(msg.mode);
        break;
      case "run":
        this.play(String(msg.task));
        break;
      case "approve":
        this.pending?.(Boolean(msg.ok));
        break;
      case "stop":
        this.run++;
        this.pending?.(false);
        this.onEvent({ type: "stopped" });
        break;
      case "connect_api":
        PROVIDERS.push({ id: `${msg.provider}`, label: `${msg.provider} · API`, kind: "api_key" as never });
        this.onEvent({ type: "providers", items: [...PROVIDERS] });
        break;
      case "providers":
        this.onEvent({ type: "providers", items: [...PROVIDERS] });
        break;
    }
  }

  private async ask(base: Omit<Extract<AgentEvent, { type: "action" }>, "status">, id: string, alive: () => boolean): Promise<boolean> {
    this.onEvent({ ...base, status: "awaiting_approval" });
    const ok = await new Promise<boolean>((resolve) => {
      this.pending = resolve;
      this.onEvent({ type: "approval", id, action: { name: base.name, args: base.args } });
    });
    this.pending = undefined;
    if (!alive()) return false;
    if (!ok) {
      this.onEvent({ ...base, status: "rejected" });
      this.onEvent({ type: "done", summary: "Tamam, bunu yapmadım. Başka bir yol denememi istersen söyle." });
    }
    return ok;
  }

  private decide(risk: Risk): "allow" | "ask" | "deny" {
    if (this.mode === "suggest") return "deny";
    if (risk === "high" || this.mode === "ask_every") return "ask";
    if (this.mode === "auto_safe") return risk === "low" ? "allow" : "ask";
    return "allow";
  }

  private async play(task: string) {
    const id = ++this.run;
    const alive = () => id === this.run;
    const started = performance.now();
    const emit = (e: AgentEvent) => this.onEvent({ ...e, t_ms: Math.round(performance.now() - started) });
    const fast = FAST.find((f) => f.match.test(task));
    if (fast) {
      emit({ type: "fastpath" });
      const base = { type: "action" as const, name: fast.tool, args: fast.args, risk: "medium" as Risk, at: fast.at };
      if (this.decide("medium") === "ask" && !(await this.ask(base, "1", alive))) return;
      emit({ ...base, status: "running" });
      await wait(60);
      emit({ ...base, status: "ok" });
      emit({ type: "done", summary: fast.summary });
      return;
    }
    const steps = SCRIPTS.find((s) => s.match.test(task))?.steps ?? FALLBACK;
    let n = 0;
    for (const step of steps) {
      if (!alive()) return;
      this.onEvent({ type: "thinking", step: n++ });
      await wait(550); // a fast model's round trip
      if (!alive()) return;
      if ("say" in step) {
        this.onEvent({ type: "message", text: step.say });
        continue;
      }
      if ("done" in step) {
        emit({ type: "done", summary: step.done });
        return;
      }
      const base = { type: "action" as const, name: step.tool, args: step.args, risk: step.risk, at: step.at };
      const decision = this.decide(step.risk);
      if (decision === "deny") {
        this.onEvent({ ...base, status: "denied" });
        this.onEvent({ type: "done", summary: "\"Sadece öner\" modundayım, hiçbir şey yapmadım. Yukarıdaki adımları uygulamamı istersen modu değiştir." });
        return;
      }
      if (decision === "ask" && !(await this.ask(base, String(n), alive))) return;
      this.onEvent({ ...base, status: "running" });
      await wait(step.delay ?? 600);
      if (!alive()) return;
      this.onEvent({ ...base, status: "ok" });
    }
  }
}
