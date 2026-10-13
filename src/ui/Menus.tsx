import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Game } from "../game/Game";
import type { EndStats, HudState, Settings } from "../game/state";
import type { TFn } from "./Hud";

function Btn({ game, onClick, children, primary, small }: { game: Game | null; onClick: () => void; children: ReactNode; primary?: boolean; small?: boolean }) {
  return (
    <button
      onMouseEnter={() => game?.audio.hover()}
      onClick={() => { game?.audio.click(); onClick(); }}
      className={`menu-btn ${primary ? "menu-btn-primary" : ""} ${small ? "!py-1.5 !text-sm" : ""}`}
    >
      {children}
    </button>
  );
}

export function Panel({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`panel-in w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-3xl border border-white/20 bg-slate-900/60 p-6 text-white shadow-2xl backdrop-blur-xl sm:p-8`}>
      <h2 className="mb-5 text-center text-xl font-light tracking-[0.3em] text-amber-100">{title}</h2>
      {children}
    </div>
  );
}

function Slider({ label, value, min = 0, max = 1, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-sm text-white/80">
        <span>{label}</span>
        <span className="tabular-nums text-white/50">{Math.round(((value - min) / (max - min)) * 100)}</span>
      </div>
      <input type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-amber-300" />
    </label>
  );
}

export function SettingsPanel({ game, settings, onChange, t, onBack }: { game: Game | null; settings: Settings; onChange: (s: Settings) => void; t: TFn; onBack: () => void }) {
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });
  return (
    <Panel title={t("menu.settings")}>
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-sm text-white/80">{t("set.lang")}</div>
          <div className="flex gap-2">
            {(["ja", "en"] as const).map((l) => (
              <button key={l} onClick={() => { game?.audio.click(); set({ lang: l }); }}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm transition ${settings.lang === l ? "border-amber-200 bg-amber-300/25 text-white" : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"}`}>
                {l === "ja" ? "日本語" : "English"}
              </button>
            ))}
          </div>
        </div>
        <Slider label={t("set.master")} value={settings.master} onChange={(v) => set({ master: v })} />
        <Slider label={t("set.music")} value={settings.music} onChange={(v) => set({ music: v })} />
        <Slider label={t("set.sfx")} value={settings.sfx} onChange={(v) => set({ sfx: v })} />
        <Slider label={t("set.sens")} value={settings.sens} min={0.3} max={2.5} onChange={(v) => set({ sens: v })} />
        <label className="flex cursor-pointer items-center justify-between text-sm text-white/80">
          <span>{t("set.invert")}</span>
          <input type="checkbox" checked={settings.invertY} onChange={(e) => set({ invertY: e.target.checked })} className="h-4 w-4 accent-amber-300" />
        </label>
        <div>
          <div className="mb-1 text-sm text-white/80">{t("set.quality")}</div>
          <div className="grid gap-2">
            {(["high", "medium", "low"] as const).map((q) => (
              <button key={q} onClick={() => { game?.audio.click(); set({ quality: q }); }}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${settings.quality === q ? "border-amber-200 bg-amber-300/25 text-white" : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"}`}>
                {t("q." + q)}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => {
            game?.audio.click();
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen?.();
          }}
          className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
        >
          ⛶ {t("menu.fullscreen")}
        </button>
        <div className="pt-1">
          <Btn game={game} onClick={onBack}>{t("menu.back")}</Btn>
        </div>
      </div>
    </Panel>
  );
}

export function HowTo({ game, t, onBack }: { game: Game | null; t: TFn; onBack: () => void }) {
  const rows: [string, string][] = [
    ["W A S D", t("key.move")],
    ["Mouse", t("key.look")],
    ["Shift", t("key.sprint")],
    ["Space", t("key.jump")],
    ["E", t("key.interact")],
    ["M", t("key.map")],
    ["P / C", t("key.photo")],
    ["Wheel", t("key.zoom")],
    ["Esc", t("key.pause")],
  ];
  return (
    <Panel title={t("how.title")} wide>
      <p className="mb-5 text-sm leading-relaxed text-white/80">{t("how.story")}</p>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center gap-3 text-sm">
            <kbd className="min-w-[4.5rem] rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-center text-xs font-semibold">{k}</kbd>
            <span className="text-white/80">{v}</span>
          </div>
        ))}
      </div>
      <p className="mt-5 rounded-xl border border-cyan-200/20 bg-cyan-300/10 p-3 text-sm text-cyan-50/90">💡 {t("how.tip")}</p>
      <div className="mt-6"><Btn game={game} onClick={onBack}>{t("menu.back")}</Btn></div>
    </Panel>
  );
}

export function Credits({ game, t, onBack }: { game: Game | null; t: TFn; onBack: () => void }) {
  return (
    <Panel title={t("credits.title")}>
      <p className="whitespace-pre-line text-center text-sm leading-7 text-white/80">{t("credits.body")}</p>
      <div className="mt-6"><Btn game={game} onClick={onBack}>{t("menu.back")}</Btn></div>
    </Panel>
  );
}

export function TitleMenu({ game, t, hasSave, onContinue, onNew, onSettings, onHow, onCredits }: {
  game: Game | null; t: TFn; hasSave: boolean; onContinue: () => void; onNew: () => void; onSettings: () => void; onHow: () => void; onCredits: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-between bg-[radial-gradient(ellipse_at_20%_50%,rgba(8,12,30,.78),rgba(8,12,30,.15)_60%,transparent)] p-6 sm:p-12">
      <div />
      <div className="max-w-xl">
        <div className="title-in">
          <div className="text-xs uppercase tracking-[0.55em] text-amber-200/80">A Low-Poly Open World</div>
          <h1 className="mt-3 bg-gradient-to-r from-amber-100 via-amber-200 to-rose-200 bg-clip-text text-6xl font-extralight leading-none tracking-[0.18em] text-transparent drop-shadow-[0_4px_30px_rgba(255,190,100,.35)] sm:text-8xl">
            LUMEN<br />ISLE
          </h1>
          <div className="mt-4 text-xl font-light tracking-[0.35em] text-white/90">{t("title.sub")}</div>
          <p className="mt-2 text-sm text-white/60">{t("title.tag")}</p>
        </div>
        <div className="menu-in mt-10 flex w-72 flex-col gap-3">
          {confirm ? (
            <div className="rounded-2xl border border-white/20 bg-slate-900/60 p-4 backdrop-blur-md">
              <p className="mb-3 text-sm text-white/85">{t("menu.newConfirm")}</p>
              <div className="flex gap-2">
                <Btn game={game} small primary onClick={() => { setConfirm(false); onNew(); }}>{t("menu.yes")}</Btn>
                <Btn game={game} small onClick={() => setConfirm(false)}>{t("menu.no")}</Btn>
              </div>
            </div>
          ) : (
            <>
              {hasSave && <Btn game={game} primary onClick={onContinue}>{t("menu.continue")}</Btn>}
              <Btn game={game} primary={!hasSave} onClick={() => (hasSave ? setConfirm(true) : onNew())}>{t("menu.new")}</Btn>
              <Btn game={game} onClick={onHow}>{t("menu.howto")}</Btn>
              <Btn game={game} onClick={onSettings}>{t("menu.settings")}</Btn>
              <Btn game={game} onClick={onCredits}>{t("menu.credits")}</Btn>
            </>
          )}
        </div>
      </div>
      <div className="flex items-end justify-between text-[11px] text-white/40">
        <span>v1.0.0 · WASD / Mouse / Space / E</span>
        <span>© LUMEN ISLE</span>
      </div>
    </div>
  );
}

export function PauseMenu({ game, t, hud, onResume, onSettings, onHow, onTitle }: {
  game: Game; t: TFn; hud: HudState | null; onResume: () => void; onSettings: () => void; onHow: () => void; onTitle: () => void;
}) {
  return (
    <Panel title={t("menu.paused")}>
      {hud && (
        <div className="mb-5 grid grid-cols-3 gap-2 text-center text-xs text-white/70">
          <div className="rounded-xl bg-white/5 p-2"><div className="text-lg font-light text-cyan-200">{hud.shardsFound}/{hud.shardsTotal}</div>{t("hud.shards")}</div>
          <div className="rounded-xl bg-white/5 p-2"><div className="text-lg font-light text-amber-200">{hud.beaconsLit}/{hud.beaconsTotal}</div>{t("hud.beacons")}</div>
          <div className="rounded-xl bg-white/5 p-2"><div className="text-lg font-light text-violet-200">{hud.stones}/{hud.stonesTotal}</div>{t("hud.stones")}</div>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <Btn game={game} primary onClick={onResume}>{t("menu.resume")}</Btn>
        <Btn game={game} onClick={onHow}>{t("menu.howto")}</Btn>
        <Btn game={game} onClick={onSettings}>{t("menu.settings")}</Btn>
        <Btn game={game} onClick={onTitle}>{t("menu.title")}</Btn>
      </div>
    </Panel>
  );
}

export function LoreModal({ game, id, t, onClose }: { game: Game; id: number; t: TFn; onClose: () => void }) {
  return (
    <div className="panel-in w-full max-w-lg rounded-3xl border border-cyan-200/30 bg-slate-950/75 p-8 text-white shadow-[0_0_80px_rgba(80,200,255,.25)] backdrop-blur-xl">
      <div className="text-center text-[10px] uppercase tracking-[0.5em] text-cyan-200/70">Memory Stone · {id + 1}/10</div>
      <h3 className="mt-2 text-center text-2xl font-light tracking-widest text-cyan-50">{t(`lore.${id}.t`)}</h3>
      <div className="mx-auto my-5 h-px w-24 bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent" />
      <p className="whitespace-pre-line text-center text-base leading-8 text-white/85">{t(`lore.${id}.b`)}</p>
      <div className="mt-7 flex justify-center">
        <div className="w-40"><Btn game={game} primary onClick={onClose}>{t("lore.close")}</Btn></div>
      </div>
    </div>
  );
}

export function MapOverlay({ game, t }: { game: Game; t: TFn }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    game.registerFullMap(ref.current);
    return () => game.registerFullMap(null);
  }, [game]);
  return (
    <div className="panel-in flex flex-col items-center gap-3">
      <div className="text-sm font-light tracking-[0.4em] text-amber-100">{t("map.title")}</div>
      <canvas
        ref={ref}
        width={800}
        height={800}
        onMouseMove={(e) => setHover(game.mapPick(e.currentTarget, e.clientX, e.clientY) !== null)}
        onClick={(e) => {
          const id = game.mapPick(e.currentTarget, e.clientX, e.clientY);
          if (id !== null) game.fastTravel(id);
        }}
        className="rounded-2xl border-2 border-white/40 shadow-[0_10px_60px_rgba(0,0,0,.6)]"
        style={{ width: "min(76vh, 90vw)", height: "min(76vh, 90vw)", cursor: hover ? "pointer" : "default" }}
      />
      <div className="text-xs text-white/70">{t("map.hint")}</div>
    </div>
  );
}

export function EndingScreen({ game, t, stats, onContinue, onTitle }: { game: Game; t: TFn; stats: EndStats; onContinue: () => void; onTitle: () => void }) {
  const m = Math.floor(stats.playTime / 60), h = Math.floor(m / 60);
  const time = `${h}:${String(m % 60).padStart(2, "0")}:${String(Math.floor(stats.playTime % 60)).padStart(2, "0")}`;
  return (
    <div className="ending-in flex w-full max-w-xl flex-col items-center text-center text-white">
      <div className="text-xs uppercase tracking-[0.6em] text-amber-200/80">Fin</div>
      <h2 className="mt-3 bg-gradient-to-r from-amber-100 via-white to-cyan-100 bg-clip-text text-5xl font-extralight tracking-[0.25em] text-transparent sm:text-6xl">{t("end.title")}</h2>
      <p className="mt-6 whitespace-pre-line text-base leading-8 text-white/85">{t("end.body")}</p>
      <div className="mt-8 grid w-full grid-cols-3 gap-3 text-sm">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur"><div className="text-xl font-light text-amber-100">{time}</div><div className="text-white/60">{t("end.time")}</div></div>
        <div className="rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur"><div className="text-xl font-light text-cyan-100">{stats.shardsFound}/{stats.shardsTotal}</div><div className="text-white/60">{t("end.shards")}</div></div>
        <div className="rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur"><div className="text-xl font-light text-violet-100">{stats.stones}/{stats.stonesTotal}</div><div className="text-white/60">{t("end.stones")}</div></div>
      </div>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        <Btn game={game} primary onClick={onContinue}>{t("end.continue")}</Btn>
        <Btn game={game} onClick={onTitle}>{t("end.title2")}</Btn>
      </div>
    </div>
  );
}
