import type { Provider } from "./core";

export const MODES = [
  { id: "suggest", label: "Sadece öner" },
  { id: "ask_every", label: "Her adımda sor" },
  { id: "auto_safe", label: "Güvenliyse otomatik" },
  { id: "full_auto", label: "Tam otomatik" },
];

export const API_PROVIDERS = ["openai", "anthropic", "gemini", "mistral", "groq", "deepseek", "xai", "openrouter"];

export const KIND_LABEL: Record<Provider["kind"], string> = {
  subscription: "Abonelik",
  api_key: "API",
  local: "Yerel",
};

export const ACTION_LABEL: Record<string, string> = {
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

export const ASK_LABEL: Record<string, string> = {
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

export function summarize(args: Record<string, unknown>): string {
  const v = args.command ?? args.text ?? args.path ?? args.name ?? args.combo ?? args.target;
  if (v !== undefined) return String(v);
  if ("x" in args) return `${args.x}, ${args.y}`;
  return "";
}

