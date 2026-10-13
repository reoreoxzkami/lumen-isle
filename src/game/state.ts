export type Lang = "ja" | "en";
export type Quality = "high" | "medium" | "low";
export type Phase = "title" | "playing" | "paused" | "map" | "lore" | "ending";

export interface Settings {
  lang: Lang;
  master: number;
  music: number;
  sfx: number;
  sens: number;
  invertY: boolean;
  quality: Quality;
}

export const defaultSettings: Settings = {
  lang: typeof navigator !== "undefined" && navigator.language && navigator.language.startsWith("ja") ? "ja" : "en",
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  sens: 1,
  invertY: false,
  quality: "high",
};

const SETTINGS_KEY = "lumenisle.settings.v1";
export const SAVE_KEY = "lumenisle.save.v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...defaultSettings };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export interface SaveData {
  v: 1;
  pos: [number, number, number];
  yaw: number;
  collected: number[];
  spent: number;
  beacons: number[];
  stones: number[];
  time: number;
  playTime: number;
  finished: boolean;
}

export interface Marker {
  bearing: number;
  lit: boolean;
  color: string;
  kind: "beacon" | "spire";
}

export interface HudState {
  shards: number;
  shardsFound: number;
  shardsTotal: number;
  beaconsLit: number;
  beaconsTotal: number;
  stones: number;
  stonesTotal: number;
  stamina: number;
  exhausted: boolean;
  mode: "walk" | "swim" | "glide" | "air";
  prompt: { key: string; args: (string | number)[]; ok: boolean } | null;
  objectiveKey: string;
  objectiveArgs: (string | number)[];
  subKey: string | null;
  subArgs: (string | number)[];
  photo: boolean;
  tod: number;
  rain: number;
  heading: number;
  markers: Marker[];
  biome: string;
  altitude: number;
  fps: number;
  hintKey: string | null;
  beacons: { lit: boolean; color: string; nameKey: string }[];
}

export interface EndStats {
  playTime: number;
  shardsFound: number;
  shardsTotal: number;
  stones: number;
  stonesTotal: number;
}
