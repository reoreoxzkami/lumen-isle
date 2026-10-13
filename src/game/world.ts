import * as THREE from "three";
import { Noise, mulberry32, clamp, lerp, smoothstep } from "./noise";

export type Biome = "meadow" | "forest" | "desert" | "snow" | "beach" | "rock" | "sea";

export const WORLD_SIZE = 600;
export const HALF = 300;
export const GRID = 240;
export const CELL = WORLD_SIZE / GRID;
export const WATER_Y = 0;
const SEA_FLOOR = -14;

export interface Vec3 { x: number; y: number; z: number }
export interface Placement { x: number; y: number; z: number; rot: number; s: number; t: number }
export interface BeaconSite extends Vec3 {
  id: number;
  cost: number;
  hdr: [number, number, number];
  css: string;
}
export interface StoneSite extends Vec3 { id: number; rot: number }
export interface ShardSite extends Vec3 { id: number }
interface Pad { x: number; z: number; h: number; r0: number; r1: number }
interface Collider { x: number; z: number; r: number }

export interface Vegetation {
  pine: Placement[];
  snowPine: Placement[];
  oak: Placement[];
  cherry: Placement[];
  palm: Placement[];
  cactus: Placement[];
  rock: Placement[];
  grass: Placement[];
  flower: Placement[];
  bush: Placement[];
  pillar: Placement[];
}

const nBase = new Noise(1337);
const nDetail = new Noise(7);
const nWarp = new Noise(99);
const nBiome = new Noise(4242);

const MOUNT = { x: 20, z: -110 };
const DESERT = { x: 150, z: 90 };
const LAKES = [
  { x: -70, z: 100, r: 30 },
  { x: 95, z: -40, r: 24 },
  { x: 35, z: 25, r: 15 },
];

function rawHeight(x: number, z: number): number {
  const wx = x + nWarp.fbm(x * 0.006, z * 0.006, 2) * 45;
  const wz = z + nWarp.fbm(x * 0.006 + 37.1, z * 0.006 + 11.7, 2) * 45;
  const d = Math.hypot(wx, wz) / 270;
  const mask = 1 - smoothstep(0.6, 1.0, d);
  const hills = nBase.fbm(x * 0.008, z * 0.008, 4) * 0.5 + 0.5;
  let land = 4 + hills * hills * 20 + nDetail.fbm(x * 0.035, z * 0.035, 3) * 1.8;
  const mdx = x - MOUNT.x, mdz = z - MOUNT.z;
  const mt = Math.exp(-(mdx * mdx + mdz * mdz) / (2 * 60 * 60));
  const ridge = 1 - Math.abs(nBase.noise(x * 0.014 + 10, z * 0.014 + 10));
  land += mt * (64 + ridge * ridge * 18);
  for (const l of LAKES) {
    const dist = Math.hypot(x - l.x, z - l.z);
    const f = 1 - smoothstep(l.r * 0.3, l.r * 1.25, dist);
    land = lerp(land, -5, f);
  }
  return lerp(SEA_FLOOR, land, Math.pow(mask, 0.8));
}

function rawSlope(x: number, z: number) {
  const e = 2;
  const dx = (rawHeight(x + e, z) - rawHeight(x - e, z)) / (2 * e);
  const dz = (rawHeight(x, z + e) - rawHeight(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}

const PAL = {
  meadowA: new THREE.Color("#79c34b"),
  meadowB: new THREE.Color("#a1d65e"),
  forestA: new THREE.Color("#3f9447"),
  forestB: new THREE.Color("#2b7a43"),
  sand: new THREE.Color("#efd696"),
  dsandA: new THREE.Color("#ecc778"),
  dsandB: new THREE.Color("#d9a55c"),
  snow: new THREE.Color("#eef4f9"),
  snowB: new THREE.Color("#cfe0ee"),
  rockA: new THREE.Color("#8f9199"),
  rockB: new THREE.Color("#6f7079"),
  seabed: new THREE.Color("#a99a73"),
};

export class World {
  heights = new Float32Array((GRID + 1) * (GRID + 1));
  pads: Pad[] = [];
  avoid: { x: number; z: number; r: number }[] = [];
  spawn!: Vec3;
  camp!: Vec3;
  spire!: Vec3;
  beacons: BeaconSite[] = [];
  stones: StoneSite[] = [];
  shards: ShardSite[] = [];
  veg: Vegetation = {
    pine: [], snowPine: [], oak: [], cherry: [], palm: [], cactus: [],
    rock: [], grass: [], flower: [], bush: [], pillar: [],
  };
  private colliders = new Map<number, Collider[]>();

  constructor() {
    this.placeSites();
    const w = GRID + 1;
    for (let j = 0; j < w; j++) {
      for (let i = 0; i < w; i++) {
        this.heights[j * w + i] = this.finalHeight(-HALF + i * CELL, -HALF + j * CELL);
      }
    }
    // sites y
    const fix = (v: Vec3) => { v.y = this.height(v.x, v.z); };
    fix(this.spawn);
    this.beacons.forEach(fix);
    fix(this.spire);
    this.camp = { x: this.spawn.x + 7, y: 0, z: this.spawn.z - 4 };
    fix(this.camp);
    this.avoid.push({ x: this.camp.x, z: this.camp.z, r: 5 });
    this.placeStones();
    this.placeShards();
    this.scatter();
  }

  // ---------- sites ----------
  private findSite(tx: number, tz: number, minH: number, maxSlope: number) {
    for (let r = 0; r <= 140; r += 4) {
      const steps = r === 0 ? 1 : Math.ceil(r / 3) + 5;
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r;
        const h = rawHeight(x, z);
        if (h < minH) continue;
        if (rawSlope(x, z) > maxSlope) continue;
        return { x, z };
      }
    }
    return { x: tx, z: tz };
  }

  private addPad(x: number, z: number, r0: number, r1: number, hOverride?: number) {
    const h = hOverride ?? rawHeight(x, z);
    this.pads.push({ x, z, h, r0, r1 });
    this.avoid.push({ x, z, r: r1 * 0.8 });
    return h;
  }

  private placeSites() {
    const sp = this.findSite(30, 100, 4, 0.25);
    this.spawn = { x: sp.x, y: 0, z: sp.z };
    this.addPad(sp.x, sp.z, 8, 18);

    const targets: { x: number; z: number; minH: number; slope: number; cost: number; hdr: [number, number, number]; css: string }[] = [
      { x: -25, z: 55, minH: 4, slope: 0.3, cost: 6, hdr: [2.0, 1.6, 0.5], css: "#ffd36b" },
      { x: -130, z: -40, minH: 4, slope: 0.3, cost: 10, hdr: [0.6, 2.0, 0.8], css: "#7dffa0" },
      { x: 130, z: 70, minH: 4, slope: 0.3, cost: 14, hdr: [2.2, 1.0, 0.35], css: "#ff9a4d" },
      { x: -70, z: 138, minH: 3, slope: 0.3, cost: 18, hdr: [0.5, 1.6, 2.2], css: "#6fd8ff" },
      { x: -25, z: -80, minH: 35, slope: 0.9, cost: 22, hdr: [1.4, 0.9, 2.2], css: "#c19bff" },
    ];
    targets.forEach((t, id) => {
      const p = this.findSite(t.x, t.z, t.minH, t.slope);
      this.addPad(p.x, p.z, 9, 20);
      this.beacons.push({ id, x: p.x, y: 0, z: p.z, cost: t.cost, hdr: t.hdr, css: t.css });
    });

    // spire at summit
    let best = -1e9, bx = MOUNT.x, bz = MOUNT.z;
    for (let x = MOUNT.x - 36; x <= MOUNT.x + 36; x += 3) {
      for (let z = MOUNT.z - 36; z <= MOUNT.z + 36; z += 3) {
        const h = rawHeight(x, z);
        if (h > best) { best = h; bx = x; bz = z; }
      }
    }
    this.addPad(bx, bz, 7, 17, best - 1.5);
    this.spire = { x: bx, y: 0, z: bz };
  }

  private tryPlace(rng: () => number, pred: (x: number, z: number, h: number, b: Biome) => boolean, minDist: number, existing: Vec3[]): Vec3 | null {
    for (let i = 0; i < 8000; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 190;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = this.height(x, z);
      if (h < 1.2) continue;
      if (this.nearAvoid(x, z, 4)) continue;
      if (this.slopeAt(x, z) > 0.55) continue;
      const b = this.biomeAt(x, z, h);
      if (!pred(x, z, h, b)) continue;
      if (existing.some((e) => Math.hypot(e.x - x, e.z - z) < minDist)) continue;
      return { x, y: h, z };
    }
    return null;
  }

  private placeStones() {
    const rng = mulberry32(555);
    const taken: Vec3[] = [...this.beacons, this.spawn, this.spire];
    const mk = (id: number, p: Vec3 | null) => {
      const pos = p ?? { x: this.spawn.x + 10 + id * 3, y: 0, z: this.spawn.z + 10 };
      pos.y = this.height(pos.x, pos.z);
      this.stones.push({ id, x: pos.x, y: pos.y, z: pos.z, rot: rng() * 6.28 });
      taken.push(pos);
      this.avoid.push({ x: pos.x, z: pos.z, r: 3 });
    };
    // 0: near spawn
    const near = (c: Vec3, lo: number, hi: number) => (x: number, z: number) => {
      const d = Math.hypot(x - c.x, z - c.z);
      return d > lo && d < hi;
    };
    mk(0, this.tryPlace(rng, near(this.spawn, 14, 26), 10, taken));
    const preds: ((x: number, z: number, h: number, b: Biome) => boolean)[] = [
      (_x, _z, _h, b) => b === "forest",
      (_x, _z, _h, b) => b === "forest",
      (_x, _z, _h, b) => b === "desert",
      (_x, _z, _h, b) => b === "meadow",
      (_x, _z, h, b) => b === "meadow" && h > 11,
      (x, z) => near({ x: LAKES[1].x, y: 0, z: LAKES[1].z }, 24, 44)(x, z),
      (_x, _z, _h, b) => b === "snow" || b === "rock",
      (_x, _z, _h, b) => b === "snow",
    ];
    preds.forEach((pr, i) => mk(i + 1, this.tryPlace(rng, pr, 35, taken)));
    mk(9, { x: this.spire.x + Math.cos(0.9) * 11, y: 0, z: this.spire.z + Math.sin(0.9) * 11 });
  }

  private placeShards() {
    const rng = mulberry32(777);
    let id = 0;
    const ok = (x: number, z: number) => {
      const h = this.height(x, z);
      return h > 1.0 && this.slopeAt(x, z) < 0.9 && !this.pads.some((p) => Math.hypot(p.x - x, p.z - z) < p.r0 * 0.8);
    };
    const add = (x: number, y: number, z: number) => this.shards.push({ id: id++, x, y, z });
    // singles
    let n = 0;
    for (let i = 0; i < 20000 && n < 58; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 205;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!ok(x, z)) continue;
      add(x, this.height(x, z) + 1.3, z);
      n++;
    }
    // clusters of 3
    n = 0;
    for (let i = 0; i < 20000 && n < 8; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 190;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      if (!ok(cx, cz)) continue;
      for (let k = 0; k < 3; k++) {
        const aa = (k / 3) * Math.PI * 2;
        const x = cx + Math.cos(aa) * 3.2, z = cz + Math.sin(aa) * 3.2;
        add(x, this.height(x, z) + 1.3, z);
      }
      n++;
    }
    // sky rings of 9
    n = 0;
    for (let i = 0; i < 20000 && n < 2; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 170;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const h = this.height(cx, cz);
      if (!ok(cx, cz) || h < 8 || this.slopeAt(cx, cz) > 0.5) continue;
      for (let k = 0; k < 9; k++) {
        const aa = (k / 9) * Math.PI * 2;
        const x = cx + Math.cos(aa) * 9, z = cz + Math.sin(aa) * 9;
        add(x, h + 15 + Math.sin(aa * 2) * 2, z);
      }
      n++;
    }
  }

  // ---------- queries ----------
  private finalHeight(x: number, z: number) {
    let h = rawHeight(x, z);
    for (const p of this.pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d >= p.r1) continue;
      const t = 1 - smoothstep(p.r0, p.r1, d);
      h = lerp(h, p.h, t);
    }
    return h;
  }

  height(x: number, z: number): number {
    const gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return SEA_FLOOR;
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const w = GRID + 1;
    const H = this.heights;
    const h00 = H[j * w + i], h10 = H[j * w + i + 1], h01 = H[(j + 1) * w + i], h11 = H[(j + 1) * w + i + 1];
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  slopeAt(x: number, z: number) {
    const e = 1.5;
    const dx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const dz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }

  /** writes unit normal into out */
  normalAt(x: number, z: number, out: Vec3) {
    const e = 1.2;
    const dx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const dz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    const l = Math.hypot(dx, 1, dz);
    out.x = -dx / l;
    out.y = 1 / l;
    out.z = -dz / l;
  }

  snowLine(x: number, z: number) {
    return 46 + nBiome.noise(x * 0.04, z * 0.04) * 4;
  }

  biomeAt(x: number, z: number, h: number): Biome {
    if (h < -0.8) return "sea";
    if (h < 2.0) return "beach";
    const sl = this.snowLine(x, z);
    if (h > sl) return "snow";
    if (h > sl - 14 && nBiome.noise(x * 0.06 + 9, z * 0.06 - 4) > -0.15) return "rock";
    const dd = Math.hypot(x - DESERT.x, z - DESERT.z) + nBiome.fbm(x * 0.02, z * 0.02, 2) * 40;
    if (dd < 100) return "desert";
    const f = nBiome.fbm(x * 0.012 + 100, z * 0.012 + 100, 3) + (x < -40 ? 0.38 : 0) + (z < -60 && x < 0 ? 0.2 : 0);
    if (f > 0.14) return "forest";
    return "meadow";
  }

  colorAt(x: number, z: number, h: number, slope: number, out: THREE.Color, rnd: number) {
    const b = this.biomeAt(x, z, h);
    const n = nBiome.noise(x * 0.05, z * 0.05) * 0.5 + 0.5;
    switch (b) {
      case "meadow": out.copy(PAL.meadowA).lerp(PAL.meadowB, n); break;
      case "forest": out.copy(PAL.forestA).lerp(PAL.forestB, n); break;
      case "desert": out.copy(PAL.dsandA).lerp(PAL.dsandB, n); break;
      case "snow": out.copy(PAL.snow).lerp(PAL.snowB, n * 0.6); break;
      case "rock": out.copy(PAL.rockA).lerp(PAL.rockB, n); break;
      default: out.copy(PAL.sand); break;
    }
    if (b === "rock") {
      // patches of grass on rocky slopes
      if (h < 30 && n > 0.55) out.lerp(PAL.meadowA, 0.5);
    }
    if (h < 0.4) {
      out.lerp(PAL.seabed, smoothstep(0.4, -2, h));
      out.multiplyScalar(lerp(1, 0.5, smoothstep(0, -10, h)));
    }
    const rs = smoothstep(0.7, 1.15, slope);
    if (b !== "sea" && b !== "beach") out.lerp(b === "snow" ? PAL.rockA : PAL.rockB, rs * (b === "snow" ? 0.55 : 0.85));
    out.multiplyScalar(0.93 + rnd * 0.14);
  }

  nearAvoid(x: number, z: number, pad = 0) {
    for (const a of this.avoid) {
      const dx = x - a.x, dz = z - a.z;
      const rr = a.r + pad;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  // ---------- colliders ----------
  private ckey(cx: number, cz: number) { return cx * 1000 + cz; }
  private addCollider(x: number, z: number, r: number) {
    const cx = Math.floor((x + HALF) / 8), cz = Math.floor((z + HALF) / 8);
    const k = this.ckey(cx, cz);
    let a = this.colliders.get(k);
    if (!a) { a = []; this.colliders.set(k, a); }
    a.push({ x, z, r });
  }
  resolve(pos: { x: number; z: number }, radius: number) {
    const cx = Math.floor((pos.x + HALF) / 8), cz = Math.floor((pos.z + HALF) / 8);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const a = this.colliders.get(this.ckey(cx + i, cz + j));
        if (!a) continue;
        for (const c of a) {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const rr = c.r + radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            pos.x = c.x + (dx / d) * rr;
            pos.z = c.z + (dz / d) * rr;
          }
        }
      }
    }
    // beacons / spire / stones as solid pillars
    const solids: { x: number; z: number; r: number }[] = [];
    for (const b of this.beacons) solids.push({ x: b.x, z: b.z, r: 1.3 });
    solids.push({ x: this.spire.x, z: this.spire.z, r: 2.4 });
    for (const s of this.stones) solids.push({ x: s.x, z: s.z, r: 0.7 });
    for (const c of solids) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const rr = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * rr;
        pos.z = c.z + (dz / d) * rr;
      }
    }
  }

  randomLandPoint(rng: () => number, pred: (b: Biome, h: number) => boolean): Vec3 {
    for (let i = 0; i < 5000; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 200;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = this.height(x, z);
      if (h < 1.5 || this.slopeAt(x, z) > 0.6) continue;
      if (pred(this.biomeAt(x, z, h), h)) return { x, y: h, z };
    }
    return { x: this.spawn.x, y: this.spawn.y, z: this.spawn.z };
  }

  // ---------- vegetation ----------
  private scatter() {
    const rnd = mulberry32(2024);
    const V = this.veg;
    const mk = (x: number, y: number, z: number, s: number, t = rnd()): Placement => ({ x, y, z, rot: rnd() * Math.PI * 2, s, t });

    for (let i = 0; i < 170000; i++) {
      const x = (rnd() - 0.5) * 580, z = (rnd() - 0.5) * 580;
      const h = this.height(x, z);
      if (h < 0.7) continue;
      if (this.nearAvoid(x, z)) continue;
      const slope = this.slopeAt(x, z);
      const b = this.biomeAt(x, z, h);
      const q = rnd();
      if (slope > 0.95) {
        if (q < 0.07) { const s = 1.2 + rnd() * 2.2; V.rock.push(mk(x, h, z, s)); this.addCollider(x, z, s * 0.9); }
        continue;
      }
      switch (b) {
        case "forest":
          if (q < 0.2) {
            const s = 0.8 + rnd() * 0.9;
            if (rnd() < 0.55) V.pine.push(mk(x, h, z, s)); else V.oak.push(mk(x, h, z, s));
            this.addCollider(x, z, 0.5 * s);
          } else if (q < 0.25) V.bush.push(mk(x, h, z, 0.7 + rnd() * 0.8));
          else if (q < 0.265) { const s = 0.6 + rnd() * 1.1; V.rock.push(mk(x, h, z, s)); this.addCollider(x, z, s * 0.9); }
          break;
        case "meadow": {
          const cherryZone = nBiome.noise(x * 0.02 + 300, z * 0.02 - 120) > 0.3;
          if (cherryZone && q < 0.05) {
            const s = 0.9 + rnd() * 0.7;
            V.cherry.push(mk(x, h, z, s));
            this.addCollider(x, z, 0.5 * s);
          } else if (q < 0.006) {
            const s = 0.9 + rnd() * 0.8;
            V.oak.push(mk(x, h, z, s));
            this.addCollider(x, z, 0.5 * s);
          } else if (q < 0.016) V.bush.push(mk(x, h, z, 0.7 + rnd() * 0.7));
          else if (q < 0.022) { const s = 0.6 + rnd() * 1.3; V.rock.push(mk(x, h, z, s)); this.addCollider(x, z, s * 0.9); }
          break;
        }
        case "desert":
          if (q < 0.005) { const s = 0.8 + rnd() * 0.8; V.cactus.push(mk(x, h, z, s)); this.addCollider(x, z, 0.5 * s); }
          else if (q < 0.013) { const s = 0.7 + rnd() * 1.6; V.rock.push(mk(x, h, z, s, 2 + rnd())); this.addCollider(x, z, s * 0.9); }
          else if (q < 0.022) V.bush.push(mk(x, h, z, 0.5 + rnd() * 0.6, 2 + rnd()));
          break;
        case "beach":
          if (q < 0.007 && h > 0.9) { const s = 0.9 + rnd() * 0.5; V.palm.push(mk(x, h, z, s)); this.addCollider(x, z, 0.35 * s); }
          else if (q < 0.013) { const s = 0.5 + rnd() * 0.9; V.rock.push(mk(x, h, z, s)); this.addCollider(x, z, s * 0.9); }
          break;
        case "snow":
          if (q < 0.07 && h < 72) { const s = 0.9 + rnd() * 0.8; V.snowPine.push(mk(x, h, z, s)); this.addCollider(x, z, 0.5 * s); }
          else if (q < 0.09) { const s = 0.8 + rnd() * 1.8; V.rock.push(mk(x, h, z, s)); this.addCollider(x, z, s * 0.9); }
          break;
        case "rock":
          if (q < 0.05) { const s = 0.9 + rnd() * 1.8; V.rock.push(mk(x, h, z, s)); this.addCollider(x, z, s * 0.9); }
          else if (q < 0.08) { const s = 0.8 + rnd() * 0.7; V.pine.push(mk(x, h, z, s)); this.addCollider(x, z, 0.5 * s); }
          break;
        default:
          break;
      }
    }

    // grass & flowers
    for (let i = 0; i < 170000; i++) {
      const x = (rnd() - 0.5) * 580, z = (rnd() - 0.5) * 580;
      const h = this.height(x, z);
      if (h < 1.0) continue;
      if (this.nearAvoid(x, z, -4)) continue;
      const slope = this.slopeAt(x, z);
      if (slope > 0.8) continue;
      const b = this.biomeAt(x, z, h);
      const q = rnd();
      if (b === "meadow") {
        if (q < 0.55) V.grass.push(mk(x, h, z, 0.8 + rnd() * 0.7, rnd()));
        else if (q < 0.62) V.flower.push(mk(x, h, z, 0.8 + rnd() * 0.6));
      } else if (b === "forest") {
        if (q < 0.35) V.grass.push(mk(x, h, z, 0.8 + rnd() * 0.8, rnd()));
        else if (q < 0.37) V.flower.push(mk(x, h, z, 0.7 + rnd() * 0.5));
      } else if (b === "desert") {
        if (q < 0.03) V.grass.push(mk(x, h, z, 0.7 + rnd() * 0.5, 2 + rnd()));
      } else if (b === "rock") {
        if (q < 0.12) V.grass.push(mk(x, h, z, 0.7 + rnd() * 0.5, rnd()));
      }
    }

    // ruins
    let ruins = 0;
    for (let i = 0; i < 8000 && ruins < 16; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 185;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const h = this.height(cx, cz);
      if (h < 3 || this.slopeAt(cx, cz) > 0.35 || this.nearAvoid(cx, cz, 8)) continue;
      const cnt = 4 + Math.floor(rnd() * 4);
      const rad = 4 + rnd() * 2.5;
      for (let k = 0; k < cnt; k++) {
        const aa = (k / cnt) * Math.PI * 2 + rnd() * 0.2;
        const x = cx + Math.cos(aa) * rad, z = cz + Math.sin(aa) * rad;
        const s = 0.5 + rnd() * 0.9;
        V.pillar.push({ x, y: this.height(x, z), z, rot: rnd() * 6.28, s, t: rnd() });
        this.addCollider(x, z, 0.65);
      }
      this.avoid.push({ x: cx, z: cz, r: rad + 2 });
      ruins++;
    }
  }

  // ---------- terrain mesh data ----------
  buildTerrain() {
    const cells = GRID * GRID;
    const pos = new Float32Array(cells * 6 * 3);
    const col = new Float32Array(cells * 6 * 3);
    const w = GRID + 1;
    const H = this.heights;
    const c = new THREE.Color();
    const rng = mulberry32(31337);
    let p = 0;
    const push = (x: number, y: number, z: number) => { pos[p] = x; pos[p + 1] = y; pos[p + 2] = z; p += 3; };
    let q = 0;
    const pushC = () => { for (let k = 0; k < 3; k++) { col[q] = c.r; col[q + 1] = c.g; col[q + 2] = c.b; q += 3; } };
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const x0 = -HALF + i * CELL, z0 = -HALF + j * CELL;
        const x1 = x0 + CELL, z1 = z0 + CELL;
        const h00 = H[j * w + i], h10 = H[j * w + i + 1], h01 = H[(j + 1) * w + i], h11 = H[(j + 1) * w + i + 1];
        // tri A: v00, v01, v10
        push(x0, h00, z0); push(x0, h01, z1); push(x1, h10, z0);
        let cx = (x0 + x0 + x1) / 3, cz = (z0 + z1 + z0) / 3, ch = (h00 + h01 + h10) / 3;
        let sl = Math.hypot(h10 - h00, h01 - h00) / CELL;
        this.colorAt(cx, cz, ch, sl, c, rng());
        pushC();
        // tri B: v10, v01, v11
        push(x1, h10, z0); push(x0, h01, z1); push(x1, h11, z1);
        cx = (x1 + x0 + x1) / 3; cz = (z0 + z1 + z1) / 3; ch = (h10 + h01 + h11) / 3;
        sl = Math.hypot(h11 - h01, h11 - h10) / CELL;
        this.colorAt(cx, cz, ch, sl, c, rng());
        pushC();
      }
    }
    return { pos, col };
  }

  /** RGBA map image */
  buildMapImage(size: number) {
    const data = new Uint8ClampedArray(size * size * 4);
    const c = new THREE.Color();
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const x = -HALF + ((i + 0.5) / size) * WORLD_SIZE;
        const z = -HALF + ((j + 0.5) / size) * WORLD_SIZE;
        const h = this.height(x, z);
        let r: number, g: number, b: number;
        if (h < 0) {
          const d = smoothstep(0, -9, h);
          r = lerp(95, 28, d); g = lerp(190, 82, d); b = lerp(225, 150, d);
        } else {
          this.colorAt(x, z, h, 0, c, 0.5);
          c.convertLinearToSRGB();
          const shade = clamp(1 + (this.height(x - 3, z - 3) - this.height(x + 3, z + 3)) * 0.06, 0.6, 1.3);
          r = c.r * 255 * shade; g = c.g * 255 * shade; b = c.b * 255 * shade;
        }
        const k = (j * size + i) * 4;
        data[k] = r; data[k + 1] = g; data[k + 2] = b; data[k + 3] = 255;
      }
    }
    return data;
  }
}
