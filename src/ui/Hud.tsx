import { useCallback, type ReactNode } from "react";
import type { Game } from "../game/Game";
import type { HudState } from "../game/state";
import { wrapAngle } from "../game/noise";

export type TFn = (key: string, ...args: (string | number)[]) => string;

export interface Toast {
  id: number;
  text: string;
  good: boolean;
}

function Compass({ hud, t }: { hud: HudState; t: TFn }) {
  const half = Math.PI / 2;
  const items: { rel: number; el: ReactNode; key: string }[] = [];
  const cardinals: [string, number, boolean][] = [
    ["N", 0, true], ["NE", -Math.PI / 4, false], ["E", -Math.PI / 2, true], ["SE", -Math.PI * 0.75, false],
    ["S", Math.PI, true], ["SW", Math.PI * 0.75, false], ["W", Math.PI / 2, true], ["NW", Math.PI / 4, false],
  ];
  cardinals.forEach(([label, bearing, major]) => {
    const rel = wrapAngle(bearing - hud.heading);
    if (Math.abs(rel) < half)
      items.push({
        rel,
        key: label,
        el: <span className={major ? "text-white font-semibold text-sm" : "text-white/50 text-[10px]"}>{label}</span>,
      });
  });
  hud.markers.forEach((m, i) => {
    const rel = wrapAngle(m.bearing - hud.heading);
    if (Math.abs(rel) < half)
      items.push({
        rel,
        key: "m" + i,
        el: (
          <span
            className="block rotate-45"
            style={{
              width: m.kind === "spire" ? 12 : 10,
              height: m.kind === "spire" ? 12 : 10,
              background: m.lit ? m.color : "transparent",
              border: `2px solid ${m.lit ? "#fff" : "rgba(255,255,255,.7)"}`,
              boxShadow: m.lit ? `0 0 10px ${m.color}` : "none",
            }}
          />
        ),
      });
  });
  void t;
  return (
    <div className="relative h-8 w-[min(460px,60vw)] overflow-hidden rounded-full border border-white/15 bg-slate-900/40 backdrop-blur-sm"
      style={{ maskImage: "linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent)" }}>
      {items.map((it) => (
        <div key={it.key} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${50 - (it.rel / half) * 50}%` }}>
          {it.el}
        </div>
      ))}
      <div className="absolute left-1/2 top-0 h-1.5 w-px -translate-x-1/2 bg-amber-300" />
    </div>
  );
}

function Clock({ tod }: { tod: number }) {
  const hours = tod * 24;
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours - Math.floor(hours)) * 60);
  const sunUp = tod > 0.25 && tod < 0.75;
  const phase = sunUp ? (tod - 0.25) / 0.5 : ((tod + 0.25) % 1) / 0.5;
  const x = 50 - Math.cos(phase * Math.PI) * 42;
  const y = 52 - Math.sin(phase * Math.PI) * 38;
  return (
    <div className="flex items-center gap-2 text-xs text-white/80">
      <svg viewBox="0 0 100 60" className="h-7 w-12">
        <path d="M8 52 Q50 -20 92 52" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2" strokeDasharray="3 4" />
        <line x1="4" y1="52" x2="96" y2="52" stroke="rgba(255,255,255,.35)" strokeWidth="2" />
        <circle cx={x} cy={y} r="8" fill={sunUp ? "#ffd36b" : "#cfe0ff"} />
      </svg>
      <span className="tabular-nums">{String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}</span>
    </div>
  );
}

export function Hud({ game, hud, t, toasts }: { game: Game; hud: HudState; t: TFn; toasts: Toast[] }) {
  // Callback ref: re-registers the minimap whenever the canvas remounts
  // (e.g. after leaving photo mode), so it never draws into a detached canvas.
  const mini = useCallback((c: HTMLCanvasElement | null) => game.registerMinimap(c), [game]);

  if (hud.photo) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center">
        <div className="rounded-full bg-black/40 px-4 py-1.5 text-xs tracking-wider text-white/80 backdrop-blur">
          📷 C: {t("key.photo").split("/").pop()?.trim()} · [ ] : time · P: exit
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none text-white">
      {/* top center */}
      <div className="absolute inset-x-0 top-3 flex flex-col items-center gap-2">
        <Compass hud={hud} t={t} />
        <div className="flex flex-col items-center gap-1">
          {toasts.map((x) => (
            <div key={x.id} className={`toast rounded-full px-4 py-1.5 text-sm font-medium backdrop-blur-md ${x.good ? "bg-amber-400/25 border border-amber-200/50 text-amber-50" : "bg-slate-900/55 border border-white/20 text-white/90"}`}>
              {x.text}
            </div>
          ))}
        </div>
      </div>

      {/* top left: objective + counters */}
      <div className="absolute left-4 top-4 w-[min(300px,40vw)] space-y-2">
        <div className="rounded-2xl border border-white/15 bg-slate-900/45 p-3 backdrop-blur-md">
          <div className="text-[10px] uppercase tracking-[0.25em] text-amber-200/80">Quest</div>
          <div className="mt-0.5 text-sm font-medium leading-snug">{t(hud.objectiveKey, ...hud.objectiveArgs)}</div>
          {hud.subKey && <div className="mt-1 text-xs text-white/65">{t(hud.subKey, ...hud.subArgs)}</div>}
          <div className="mt-2 flex gap-1.5">
            {hud.beacons.map((b, i) => (
              <span key={i} title={t(b.nameKey)} className="h-3 w-3 rotate-45 border"
                style={{ background: b.lit ? b.color : "transparent", borderColor: b.lit ? "#fff" : "rgba(255,255,255,.55)", boxShadow: b.lit ? `0 0 8px ${b.color}` : "none" }} />
            ))}
          </div>
        </div>
        <div className="flex gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-full border border-cyan-200/30 bg-slate-900/45 px-3 py-1 backdrop-blur-md">
            <span className="inline-block h-2.5 w-2.5 rotate-45 bg-cyan-300 shadow-[0_0_8px_#67e8f9]" />
            <span className="font-semibold tabular-nums">{hud.shards}</span>
            <span className="text-white/50">{t("hud.shards")}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-900/45 px-3 py-1 backdrop-blur-md">
            <span className="text-white/70">◈</span>
            <span className="tabular-nums">{hud.stones}/{hud.stonesTotal}</span>
          </div>
        </div>
      </div>

      {/* top right: controls hint */}
      <div className="absolute right-4 top-4 rounded-xl border border-white/10 bg-slate-900/35 px-3 py-2 text-[10px] leading-relaxed text-white/60 backdrop-blur-sm">
        {([
          ["WASD", t("key.move")],
          ["Mouse", t("key.look")],
          ["Shift", t("key.sprint")],
          ["Space", t("key.jump")],
          ["E", t("key.interact")],
          ["M", t("key.map")],
          ["P / C", t("key.photo")],
          ["Wheel", t("key.zoom")],
          ["Esc", t("key.release")],
        ] as [string, string][]).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="w-11 shrink-0 font-semibold text-white/80">{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>

      {/* bottom left */}
      <div className="absolute bottom-5 left-5 w-[min(260px,50vw)] space-y-1.5">
        <div className="flex items-end justify-between text-[11px] text-white/80">
          <span className="font-medium">{t(hud.biome)}</span>
          <span className="tabular-nums text-white/60">{Math.round(hud.altitude)} m</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full border border-white/20 bg-slate-900/50 backdrop-blur-sm">
          <div className="h-full rounded-full transition-[width] duration-100"
            style={{ width: `${Math.max(0, Math.min(1, hud.stamina)) * 100}%`, background: hud.exhausted ? "linear-gradient(90deg,#ef4444,#f97316)" : "linear-gradient(90deg,#34d399,#fde047)" }} />
        </div>
        <div className="flex justify-between text-[10px] uppercase tracking-widest text-white/45">
          <span>{t("hud.stamina")}</span>
          <span>{hud.mode === "glide" ? t("mode.glide") : hud.mode === "swim" ? t("mode.swim") : ""}</span>
        </div>
      </div>

      {/* bottom right minimap */}
      <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2">
        <div className="flex items-center gap-3 rounded-full border border-white/15 bg-slate-900/45 px-3 py-1 backdrop-blur-md">
          <Clock tod={hud.tod} />
          {hud.rain > 0.2 && <span title="rain">🌧</span>}
        </div>
        <canvas ref={mini} width={340} height={340} className="h-[170px] w-[170px] rounded-full shadow-[0_6px_30px_rgba(0,0,0,.45)]" />
        <div className="text-[10px] text-white/50">M · Map</div>
      </div>

      {/* prompt */}
      {hud.prompt && (
        <div className="absolute inset-x-0 top-[62%] flex justify-center">
          <div className={`prompt flex items-center gap-3 rounded-2xl border px-5 py-2.5 text-base backdrop-blur-md ${hud.prompt.ok ? "border-amber-200/60 bg-amber-300/20" : "border-white/20 bg-slate-900/50 text-white/80"}`}>
            {hud.prompt.ok && <kbd className="rounded-md border border-white/60 bg-white/15 px-2 py-0.5 text-sm font-bold">E</kbd>}
            <span>{t(hud.prompt.key, ...hud.prompt.args)}</span>
          </div>
        </div>
      )}

      {/* hint */}
      {hud.hintKey && !hud.prompt && (
        <div className="absolute inset-x-0 bottom-24 flex justify-center">
          <div className="hint rounded-full bg-black/35 px-5 py-2 text-sm tracking-wide text-white/90 backdrop-blur-sm">{t(hud.hintKey)}</div>
        </div>
      )}
    </div>
  );
}
