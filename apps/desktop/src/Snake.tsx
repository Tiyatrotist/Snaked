export type Mood = "idle" | "thinking" | "working" | "waiting" | "sad" | "happy";

/** The Snaked mascot. Each mood maps to a CSS animation in App.css. */
export function Snake({ mood, size = 72 }: { mood: Mood; size?: number }) {
  return (
    <svg className={`snake snake--${mood}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--snake-a)" />
          <stop offset="1" stopColor="var(--snake-b)" />
        </linearGradient>
      </defs>
      <path
        className="snake__body"
        d="M10 50c0-9 9-11 18-11s18-2 18-11-6-13-15-13"
        fill="none"
        stroke="url(#body)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <g className="snake__head">
        <ellipse cx="30" cy="14" rx="10" ry="9" fill="var(--snake-a)" />
        <g className="snake__eyes">
          <circle cx="26.5" cy="12" r="2.2" fill="var(--ink)" />
          <circle cx="34" cy="12" r="2.2" fill="var(--ink)" />
          <circle cx="27.2" cy="11.3" r="0.7" fill="#fff" />
          <circle cx="34.7" cy="11.3" r="0.7" fill="#fff" />
        </g>
        <path className="snake__tongue" d="M30 22v5l-2 2M30 27l2 2" stroke="#ff5c7a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <path className="snake__mouth" d="M27 17q3 2.5 6 0" stroke="var(--ink)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
