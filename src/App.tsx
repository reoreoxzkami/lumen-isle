import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "./game/Game";
import { tr } from "./game/i18n";
import { loadSettings, saveSettings, type EndStats, type HudState, type Phase, type Settings } from "./game/state";
import { Hud, type TFn, type Toast } from "./ui/Hud";
import { Credits, EndingScreen, HowTo, LoreModal, MapOverlay, PauseMenu, SettingsPanel, TitleMenu } from "./ui/Menus";

type Screen = "main" | "settings" | "howto" | "credits";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const settingsRef = useRef(settings);
  const [phase, setPhase] = useState<Phase>("title");
  const [hud, setHud] = useState<HudState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lore, setLore] = useState<number | null>(null);
  const [ending, setEnding] = useState<EndStats | null>(null);
  const [screen, setScreen] = useState<Screen>("main");
  const [hasSave, setHasSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toastId = useRef(0);

  const t: TFn = useCallback((k, ...a) => tr(settings.lang, k, ...a), [settings.lang]);

  useEffect(() => {
    settingsRef.current = settings;
    saveSettings(settings);
    document.documentElement.lang = settings.lang;
    document.title = settings.lang === "ja" ? "LUMEN ISLE — 灯火の旅人" : "LUMEN ISLE — Wanderer of the Last Light";
    gameRef.current?.applySettings(settings);
  }, [settings]);

  useEffect(() => {
    let g: Game | null = null;
    const id = window.setTimeout(() => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        g = new Game(canvas, settingsRef.current);
        const gg = g;
        gg.onHud = setHud;
        gg.onPhase = (p) => {
          setPhase(p);
          if (p === "paused" || p === "title") setScreen("main");
          if (p === "title") setHasSave(gg.hasSave());
        };
        gg.onLore = setLore;
        gg.onEnding = setEnding;
        gg.onToast = (key, args, good) => {
          const lang = settingsRef.current.lang;
          const a = args.map((x) => (typeof x === "string" && x.startsWith("b.") ? tr(lang, x) : x));
          const tid = ++toastId.current;
          setToasts((prev) => [...prev.slice(-2), { id: tid, text: tr(lang, key, ...a), good }]);
          window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== tid)), 3400);
        };
        setHasSave(gg.hasSave());
        gg.start();
        gameRef.current = gg;
        setGame(gg);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 80);
    return () => {
      window.clearTimeout(id);
      g?.dispose();
      gameRef.current = null;
    };
  }, []);

  const overlay = "absolute inset-0 z-20 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[3px]";

  const subScreen = (back: () => void) => {
    if (!game) return null;
    if (screen === "settings") return <SettingsPanel game={game} settings={settings} onChange={setSettings} t={t} onBack={back} />;
    if (screen === "howto") return <HowTo game={game} t={t} onBack={back} />;
    if (screen === "credits") return <Credits game={game} t={t} onBack={back} />;
    return null;
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-950 text-white" onPointerDown={() => gameRef.current?.audio.init()}>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

      {game && hud && (phase === "playing" || phase === "paused" || phase === "lore") && <Hud game={game} hud={hud} t={t} toasts={toasts} />}

      {game && phase === "title" &&
        (screen === "main" ? (
          <TitleMenu
            game={game}
            t={t}
            hasSave={hasSave}
            onContinue={() => game.continueGame()}
            onNew={() => game.newGame()}
            onSettings={() => setScreen("settings")}
            onHow={() => setScreen("howto")}
            onCredits={() => setScreen("credits")}
          />
        ) : (
          <div className={overlay}>{subScreen(() => setScreen("main"))}</div>
        ))}

      {game && phase === "paused" && (
        <div className={overlay}>
          {screen === "main" ? (
            <PauseMenu
              game={game}
              t={t}
              hud={hud}
              onResume={() => game.resume()}
              onSettings={() => setScreen("settings")}
              onHow={() => setScreen("howto")}
              onTitle={() => game.toTitle()}
            />
          ) : (
            subScreen(() => setScreen("main"))
          )}
        </div>
      )}

      {game && phase === "map" && (
        <div className={overlay}>
          <MapOverlay game={game} t={t} />
        </div>
      )}

      {game && phase === "lore" && lore !== null && (
        <div className={overlay}>
          <LoreModal game={game} id={lore} t={t} onClose={() => game.closeLore()} />
        </div>
      )}

      {game && phase === "ending" && ending && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent p-4">
          <EndingScreen game={game} t={t} stats={ending} onContinue={() => game.continueAfterEnding()} onTitle={() => game.toTitle()} />
        </div>
      )}

      <div id="fade" className="pointer-events-none fixed inset-0 z-50 bg-black" style={{ opacity: 0 }} />

      {!game && !error && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-slate-950">
          <div className="text-4xl font-extralight tracking-[0.4em] text-amber-100">LUMEN ISLE</div>
          <div className="mt-6 h-px w-48 overflow-hidden bg-white/10"><div className="loading-bar h-full w-1/3 bg-amber-200" /></div>
          <div className="mt-4 text-xs tracking-widest text-white/50">{tr(settings.lang, "menu.loading")}</div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slate-950 p-8 text-center">
          <div className="max-w-md">
            <div className="text-xl text-amber-100">WebGL error</div>
            <p className="mt-3 text-sm text-white/70">
              {settings.lang === "ja"
                ? "WebGLを初期化できませんでした。ブラウザのハードウェアアクセラレーションを有効にして再読み込みしてください。"
                : "Could not initialize WebGL. Please enable hardware acceleration in your browser and reload."}
            </p>
            <p className="mt-3 break-all text-xs text-white/30">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
