import { useState } from "react";
import type { Provider } from "./core";
import { API_PROVIDERS, KIND_LABEL } from "./labels";

export function Connect({
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
