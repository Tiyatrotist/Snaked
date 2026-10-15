import { invoke } from "@tauri-apps/api/core";

export type Provider = { id: string; label: string; kind: "api_key" | "local" | "subscription" };

export type AgentEvent =
  | { type: "ready"; screen_control: boolean }
  | { type: "providers"; items: Provider[] }
  | { type: "thinking"; step: number }
  | { type: "message"; text: string }
  | {
      type: "action";
      name: string;
      args: Record<string, unknown>;
      risk: "low" | "medium" | "high";
      status: "awaiting_approval" | "running" | "ok" | "failed" | "rejected" | "denied";
      error?: string;
    }
  | { type: "approval"; id: string; action: { name: string; args: Record<string, unknown> } }
  | { type: "done"; summary: string }
  | { type: "stopped" }
  | { type: "error"; text: string };

type CoreInfo = { port: number; token: string };

async function coreInfo(): Promise<CoreInfo> {
  if ("__TAURI_INTERNALS__" in window) return invoke<CoreInfo>("core_info");
  // Plain browser during UI development: run `snaked-core serve --token dev`.
  return { port: 8765, token: import.meta.env.VITE_SNAKED_TOKEN ?? "dev" };
}

export interface Core {
  connect(): Promise<void>;
  send(msg: Record<string, unknown>): void;
}

export class CoreClient implements Core {
  private ws?: WebSocket;
  constructor(private onEvent: (e: AgentEvent) => void, private onStatus: (up: boolean) => void) {}

  async connect(): Promise<void> {
    const { port, token } = await coreInfo();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "hello", token }));
      this.onStatus(true);
      this.send({ type: "providers" });
    };
    ws.onmessage = (m) => this.onEvent(JSON.parse(m.data));
    ws.onclose = () => {
      this.onStatus(false);
      setTimeout(() => this.connect(), 1500); // the core may still be starting
    };
    this.ws = ws;
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
