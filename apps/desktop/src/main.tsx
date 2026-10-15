import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { DemoDesktop } from "./DemoDesktop";
import { Pet } from "./Pet";

const inTauri = "__TAURI_INTERNALS__" in window;

let lastRegions = "";
function sendHitRegions(rects: { x: number; y: number; w: number; h: number }[]) {
  const key = JSON.stringify(rects.map((r) => [r.x, r.y, r.w, r.h].map(Math.round)));
  if (key === lastRegions) return;
  lastRegions = key;
  invoke("set_hit_regions", { rects });
}

/** The real app: one transparent always-on-top window covering the screen. */
function Overlay() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    document.documentElement.classList.add("overlay");
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return (
    <Pet
      width={size.w}
      height={size.h}
      onHitRegions={inTauri ? sendHitRegions : undefined}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{import.meta.env.VITE_DEMO ? <DemoDesktop /> : <Overlay />}</React.StrictMode>,
);
