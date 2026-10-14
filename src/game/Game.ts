import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { World, HALF, WORLD_SIZE, WATER_Y, type Placement } from "./world";
import {
  timeU, buildVegGeometries, makeVegMaterial, buildPlayer, buildBeacon, buildStone, buildSpire, buildCamp,
  buildSky, buildStars, buildAurora, buildClouds, buildWater, waveH, WATER_SIZE, WATER_SEG,
  Particles, Motes, Rain, hdrBasic, type PlayerRig, type BeaconView, type StoneView, type SpireView, type CampView,
} from "./assets";
import { Fauna } from "./fauna";
import { AudioEngine } from "./audio";
import { clamp, lerp, smoothstep, wrapAngle } from "./noise";
import { tr } from "./i18n";
import { SAVE_KEY, type EndStats, type HudState, type Marker, type Phase, type SaveData, type Settings } from "./state";

const TAU = Math.PI * 2;
const DAY_LEN = 600;
const GRAVITY = 28;

interface SkyStop { h: number; top: THREE.Color; bot: THREE.Color }
const SKY: SkyStop[] = [
  { h: -0.3, top: "#050a1c", bot: "#0b1230" },
  { h: -0.1, top: "#0d1642", bot: "#2a2a5a" },
  { h: -0.01, top: "#2a3b7a", bot: "#e0775a" },
  { h: 0.12, top: "#4b7ccb", bot: "#f6bf8a" },
  { h: 0.4, top: "#3a8de0", bot: "#a8d9f6" },
  { h: 1.0, top: "#2f83e4", bot: "#b4e0fa" },
].map((s) => ({ h: s.h, top: new THREE.Color(s.top), bot: new THREE.Color(s.bot) }));

function sampleSky(h: number, key: "top" | "bot", out: THREE.Color) {
  if (h <= SKY[0].h) return out.copy(SKY[0][key]);
  for (let i = 1; i < SKY.length; i++) {
    if (h <= SKY[i].h) {
      const a = SKY[i - 1], b = SKY[i];
      return out.lerpColors(a[key], b[key], (h - a.h) / (b.h - a.h));
    }
  }
  return out.copy(SKY[SKY.length - 1][key]);
}

type Mode = "walk" | "swim" | "glide" | "air";

interface Interactable { type: "beacon" | "stone" | "camp" | "spire"; id: number; d: number }

export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly world: World;
  readonly audio = new AudioEngine();
  settings: Settings;
  phase: Phase = "title";

  onHud?: (h: HudState) => void;
  onToast?: (key: string, args: (string | number)[], good: boolean) => void;
  onPhase?: (p: Phase) => void;
  onLore?: (id: number | null) => void;
  onEnding?: (s: EndStats) => void;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private raf = 0;
  private lastT = performance.now();
  private t = 0;
  private fps = 60;

  // lights & sky
  private sun: THREE.DirectionalLight;
  private moon: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private skyMesh: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private sunMesh: THREE.Mesh;
  private moonMesh: THREE.Mesh;
  private aurora: { group: THREE.Group; mat: THREE.ShaderMaterial };
  private clouds: { group: THREE.Group; mat: THREE.MeshLambertMaterial };
  private waterMesh: THREE.Mesh;
  private waterMat: THREE.MeshPhongMaterial;
  private fog: THREE.Fog;
  private sunDir = new THREE.Vector3(0, 1, 0);
  private tod = 0.76;
  private dayF = 1;
  private nightF = 0;
  private rain = 0;
  private rainTarget = 0;
  private weatherT = 180;
  private thunderT = 10;
  private flash = 0;
  private auroraLevel = 0;
  private spireAwake = 0;
  private tmpA = new THREE.Color();
  private tmpB = new THREE.Color();

  // entities
  private rig: PlayerRig;
  private blob: THREE.Mesh;
  private beaconViews: BeaconView[] = [];
  private beaconLight: THREE.PointLight;
  private stoneViews: StoneView[] = [];
  private spireView: SpireView;
  private campView: CampView;
  private fauna: Fauna;
  private particles = new Particles(700);
  private motes = new Motes();
  private rainFx = new Rain();
  private shardMesh: THREE.InstancedMesh;
  private shardPos: THREE.Vector3[] = [];

  // player
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private facing = 0;
  private onGround = true;
  private mode: Mode = "walk";
  private gliding = false;
  private glideHeading = 0;
  private stamina = 100;
  private maxStamina = 100;
  private exhausted = false;
  private airTime = 0;
  private coyote = 0;
  private stepAcc = 0;
  private wasSwimming = false;
  private walkPhase = 0;
  private bank = 0;
  private inUpdraft = false;
  private seaWarn = 0;

  // camera
  private camYaw = 0;
  private camPitch = 0.35;
  private camDist = 7.5;
  private camCur = 7.5;
  private titleAngle = 0;
  private endingT = 0;

  // input
  private keys = new Set<string>();
  private jumpPressed = false;
  private interactPressed = false;
  private mouseDown = false;
  private locked = false;
  private suppressPause = false;
  private wantShot = false;
  photo = false;

  // progress
  private collected = new Set<number>();
  private spent = 0;
  private lit = new Set<number>();
  private read = new Set<number>();
  private playTime = 0;
  private finished = false;
  private nearest: Interactable | null = null;
  private saveT = 0;
  private hudT = 0;
  private hintFlags = { moved: false, jumped: false, glided: false, sprinted: false, map: false, updraft: false };
  private hintTime: Record<string, number> = {};
  private curHint: string | null = null;
  private movedDist = 0;

  // fade
  private fadeV = 0;
  private fadeTarget = 0;
  private fadeCb: (() => void) | null = null;
  private fadeEl: HTMLElement | null = null;

  // maps
  private mapCanvas: HTMLCanvasElement;
  private minimap: HTMLCanvasElement | null = null;
  private minimapT = 0;
  private fullMap: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2600);
    this.scene.add(this.camera);

    this.world = new World();
    const w = this.world;

    // fog
    this.fog = new THREE.Fog(0xaad8f5, 70, 420);
    this.scene.fog = this.fog;

    // sky
    const sky = buildSky();
    this.skyMesh = sky.mesh;
    this.skyMat = sky.mat;
    this.scene.add(sky.mesh);
    this.stars = buildStars();
    this.scene.add(this.stars);
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(34, 16, 12), hdrBasic(4, 3.2, 2, { fog: false }));
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(22, 16, 12), hdrBasic(1.5, 1.6, 1.9, { fog: false }));
    this.sunMesh.frustumCulled = this.moonMesh.frustumCulled = false;
    this.scene.add(this.sunMesh, this.moonMesh);
    this.aurora = buildAurora();
    this.scene.add(this.aurora.group);
    this.clouds = buildClouds(26);
    this.scene.add(this.clouds.group);

    // lights
    this.hemi = new THREE.HemisphereLight(0xbfe0ff, 0x6b5a3a, 1.4);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    this.sun.shadow.camera.left = -48;
    this.sun.shadow.camera.right = 48;
    this.sun.shadow.camera.top = 48;
    this.sun.shadow.camera.bottom = -48;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.5;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0.4);
    this.scene.add(this.moon, this.moon.target);
    this.beaconLight = new THREE.PointLight(0xffffff, 0, 60, 1.6);
    this.scene.add(this.beaconLight);

    // terrain
    const td = w.buildTerrain();
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(td.pos, 3));
    tg.setAttribute("color", new THREE.BufferAttribute(td.col, 3));
    tg.computeVertexNormals();
    tg.computeBoundingSphere();
    const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    const water = buildWater();
    this.waterMesh = water.mesh;
    this.waterMat = water.mat;
    this.waterMesh.frustumCulled = false;
    this.scene.add(this.waterMesh);

    this.buildVegetation();

    // beacons
    w.beacons.forEach((b) => {
      const v = buildBeacon(b.hdr);
      v.group.position.set(b.x, b.y, b.z);
      this.scene.add(v.group);
      this.beaconViews.push(v);
    });
    w.stones.forEach((s) => {
      const v = buildStone();
      v.group.position.set(s.x, s.y, s.z);
      v.group.rotation.y = s.rot;
      this.scene.add(v.group);
      this.stoneViews.push(v);
    });
    this.spireView = buildSpire();
    this.spireView.group.position.set(w.spire.x, w.spire.y, w.spire.z);
    this.scene.add(this.spireView.group);
    this.campView = buildCamp();
    this.campView.group.position.set(w.camp.x, w.camp.y, w.camp.z);
    this.scene.add(this.campView.group);

    // shards
    const sgeo = new THREE.OctahedronGeometry(0.4, 0);
    sgeo.scale(1, 1.5, 1);
    const smat = hdrBasic(0.5, 1.8, 2.4);
    this.shardMesh = new THREE.InstancedMesh(sgeo, smat, w.shards.length);
    this.shardMesh.frustumCulled = false;
    w.shards.forEach((s) => this.shardPos.push(new THREE.Vector3(s.x, s.y, s.z)));
    this.scene.add(this.shardMesh);

    // player
    this.rig = buildPlayer();
    this.scene.add(this.rig.root);
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.scene.add(this.blob);

    this.fauna = new Fauna(w);
    this.scene.add(this.fauna.group);
    this.scene.add(this.particles.points, this.motes.points, this.rainFx.lines);

    // post
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.65, 1.25);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // map image
    this.mapCanvas = document.createElement("canvas");
    this.mapCanvas.width = this.mapCanvas.height = 512;
    const mctx = this.mapCanvas.getContext("2d")!;
    const img = new ImageData(w.buildMapImage(512), 512, 512);
    mctx.putImageData(img, 0, 0);

    this.placeAtCampfire();
    this.applySettings(settings);
    this.attachEvents();
    this.updateEnvironment(0);
    this.syncProgressVisuals();
  }

  // ====================== setup helpers ======================
  private buildVegetation() {
    const geos = buildVegGeometries();
    const V = this.world.veg;
    const plain = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const tree = makeVegMaterial(0.02);
    const palmM = makeVegMaterial(0.03);
    const grassM = makeVegMaterial(0.14);
    const flowerM = makeVegMaterial(0.18);
    const bushM = makeVegMaterial(0.03);
    const c = new THREE.Color();
    const flowerPal: [number, number, number][] = [[1, 0.45, 0.65], [1, 0.85, 0.25], [1, 1, 1], [0.65, 0.5, 1], [1, 0.5, 0.2]];
    this.addVeg(geos.pine, tree, V.pine, true, (p) => c.setScalar(0.85 + p.t * 0.3));
    this.addVeg(geos.snowPine, tree, V.snowPine, true, (p) => c.setScalar(0.9 + p.t * 0.2));
    this.addVeg(geos.oak, tree, V.oak, true, (p) => c.setRGB(0.85 + p.t * 0.25, 0.95 + p.t * 0.1, 0.8 + p.t * 0.2));
    this.addVeg(geos.cherry, tree, V.cherry, true, (p) => c.setRGB(1, 0.9 + p.t * 0.1, 0.95));
    this.addVeg(geos.palm, palmM, V.palm, true, () => c.setScalar(1));
    this.addVeg(geos.cactus, plain, V.cactus, true, (p) => c.setRGB(0.9 + p.t * 0.2, 1, 0.9));
    this.addVeg(geos.rock, plain, V.rock, true, (p) => (p.t >= 2 ? c.setRGB(1.25, 1.0, 0.75) : c.setScalar(0.8 + p.t * 0.4)));
    this.addVeg(geos.grass, grassM, V.grass, false, (p) => (p.t >= 2 ? c.setRGB(4.0, 0.9, 2.5) : c.setRGB(0.8 + p.t * 0.4, 0.9 + p.t * 0.2, 0.7 + p.t * 0.3)));
    this.addVeg(geos.flower, flowerM, V.flower, false, (p) => {
      const f = flowerPal[Math.floor(p.t * flowerPal.length) % flowerPal.length];
      return c.setRGB(f[0], f[1], f[2]);
    });
    this.addVeg(geos.bush, bushM, V.bush, true, (p) => (p.t >= 2 ? c.setRGB(6, 1.15, 2.6) : c.setRGB(0.85 + p.t * 0.3, 0.9 + p.t * 0.2, 0.85)));
    this.addVeg(geos.pillar, plain, V.pillar, true, (p) => c.setScalar(0.85 + p.t * 0.25));
  }

  private addVeg(geo: THREE.BufferGeometry, mat: THREE.Material, list: Placement[], shadow: boolean, color: (p: Placement) => THREE.Color) {
    const CH = 150;
    const buckets = new Map<number, Placement[]>();
    for (const p of list) {
      const k = Math.floor((p.x + HALF) / CH) * 100 + Math.floor((p.z + HALF) / CH);
      let a = buckets.get(k);
      if (!a) { a = []; buckets.set(k, a); }
      a.push(p);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    buckets.forEach((arr) => {
      const im = new THREE.InstancedMesh(geo, mat, arr.length);
      arr.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot);
        pos.set(p.x, p.y, p.z);
        sc.set(p.s, p.s, p.s);
        m.compose(pos, q, sc);
        im.setMatrixAt(i, m);
        im.setColorAt(i, color(p));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = shadow;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.scene.add(im);
    });
  }

  private placeAtCampfire() {
    const c = this.world.camp;
    this.pos.set(c.x - 2.6, 0, c.z + 1.8);
    this.pos.y = this.world.height(this.pos.x, this.pos.z);
    this.vel.set(0, 0, 0);
    this.facing = Math.atan2(c.x - this.pos.x, c.z - this.pos.z);
    this.onGround = true;
  }

  applySettings(s: Settings) {
    this.settings = s;
    this.audio.setVolumes(s.master, s.music, s.sfx);
    const dpr = window.devicePixelRatio || 1;
    const pr = s.quality === "high" ? Math.min(dpr, 2) : s.quality === "medium" ? Math.min(dpr, 1.5) : 1;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.sun.castShadow = s.quality !== "low";
    const size = s.quality === "high" ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.resize();
  }

  resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  // ====================== lifecycle ======================
  start() {
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.detachEvents();
    this.renderer.dispose();
  }

  private attachEvents() {
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onLockChange);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: true });
  }
  private detachEvents() {
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.onPhase?.(p);
  }

  private lockPointer() {
    try {
      const r = this.canvas.requestPointerLock() as unknown;
      if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => undefined);
    } catch {
      /* ignore */
    }
  }
  private unlockPointer() {
    this.suppressPause = true;
    if (document.pointerLockElement) document.exitPointerLock();
    window.setTimeout(() => (this.suppressPause = false), 200);
  }

  // ====================== input ======================
  private onKeyDown = (e: KeyboardEvent) => {
    const c = e.code;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(c)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(c);
    switch (this.phase) {
      case "playing":
        if (c === "Space") this.jumpPressed = true;
        else if (c === "KeyE") this.interactPressed = true;
        else if (c === "KeyM") this.openMap();
        else if (c === "KeyP") this.togglePhoto();
        else if (c === "KeyC") this.wantShot = true;
        else if (c === "Escape") this.pause();
        break;
      case "map":
        if (c === "KeyM" || c === "Escape") this.closeMap();
        break;
      case "paused":
        if (c === "Escape") this.resume();
        break;
      case "lore":
        if (c === "Escape" || c === "KeyE") this.closeLore();
        break;
      default:
        break;
    }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onBlur = () => {
    this.keys.clear();
    if (this.phase === "playing") this.pause();
  };
  private onMouseDown = (e: MouseEvent) => {
    this.mouseDown = true;
    if (this.phase === "playing" && !this.locked && e.button === 0) this.lockPointer();
  };
  private onMouseUp = () => { this.mouseDown = false; };
  private onMouseMove = (e: MouseEvent) => {
    if (this.phase !== "playing") return;
    if (!this.locked && !this.mouseDown) return;
    const s = 0.0024 * this.settings.sens;
    this.camYaw -= e.movementX * s;
    this.camPitch += e.movementY * s * (this.settings.invertY ? -1 : 1);
    this.camPitch = clamp(this.camPitch, -0.45, 1.4);
  };
  private onWheel = (e: WheelEvent) => {
    if (this.phase !== "playing") return;
    this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 0.8, 3.5, 16);
  };
  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked && this.phase === "playing" && !this.suppressPause) this.pause();
  };

  // ====================== phases / flow ======================
  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  private resetProgress() {
    this.collected.clear();
    this.lit.clear();
    this.read.clear();
    this.spent = 0;
    this.playTime = 0;
    this.finished = false;
    this.spireAwake = 0;
    this.auroraLevel = 0;
    this.maxStamina = 100;
    this.stamina = 100;
    this.hintFlags = { moved: false, jumped: false, glided: false, sprinted: false, map: false, updraft: false };
    this.hintTime = {};
  }

  newGame() {
    this.audio.init();
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    this.fadeThen(() => {
      this.resetProgress();
      const s = this.world.spawn;
      this.pos.set(s.x, s.y, s.z);
      this.vel.set(0, 0, 0);
      const b = this.world.beacons[0];
      this.camYaw = Math.atan2(-(b.x - s.x), -(b.z - s.z));
      this.facing = Math.atan2(b.x - s.x, b.z - s.z);
      this.camPitch = 0.3;
      this.tod = 0.3;
      this.rain = this.rainTarget = 0;
      this.weatherT = 200;
      this.syncProgressVisuals();
      this.beginPlay();
    });
  }

  continueGame() {
    this.audio.init();
    let data: SaveData | null = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) data = JSON.parse(raw) as SaveData;
    } catch { /* ignore */ }
    if (!data) { this.newGame(); return; }
    const d = data;
    this.fadeThen(() => {
      this.resetProgress();
      d.collected.forEach((i) => this.collected.add(i));
      d.beacons.forEach((i) => this.lit.add(i));
      d.stones.forEach((i) => this.read.add(i));
      this.spent = d.spent;
      this.playTime = d.playTime;
      this.finished = d.finished;
      this.tod = d.time;
      this.pos.set(d.pos[0], d.pos[1], d.pos[2]);
      this.pos.y = Math.max(this.pos.y, this.world.height(this.pos.x, this.pos.z));
      this.vel.set(0, 0, 0);
      this.camYaw = d.yaw;
      this.facing = d.yaw + Math.PI;
      this.maxStamina = 100 + this.lit.size * 20;
      this.stamina = this.maxStamina;
      this.hintFlags = { moved: true, jumped: true, glided: true, sprinted: true, map: this.lit.size > 0, updraft: this.lit.size > 1 };
      this.spireAwake = this.lit.size >= 5 ? 1 : 0;
      this.auroraLevel = this.spireAwake;
      this.syncProgressVisuals();
      this.beginPlay();
    });
  }

  private beginPlay() {
    this.gliding = false;
    this.onGround = true;
    this.photo = false;
    this.setPhase("playing");
    this.lockPointer();
  }

  // No pause screen: just save and release the mouse; the world keeps running.
  // Clicking the canvas re-locks the pointer.
  pause() {
    if (this.phase !== "playing") return;
    this.save();
    this.keys.clear();
    this.unlockPointer();
  }
  resume() {
    if (this.phase !== "paused") return;
    this.setPhase("playing");
    this.lockPointer();
  }
  toTitle() {
    this.save();
    this.unlockPointer();
    this.fadeThen(() => {
      this.placeAtCampfire();
      this.setPhase("title");
    });
  }
  openMap() {
    if (this.phase !== "playing") return;
    this.hintFlags.map = true;
    this.unlockPointer();
    this.setPhase("map");
  }
  closeMap() {
    if (this.phase !== "map") return;
    this.setPhase("playing");
    this.lockPointer();
  }
  closeLore() {
    if (this.phase !== "lore") return;
    this.onLore?.(null);
    this.setPhase("playing");
    this.lockPointer();
  }
  private togglePhoto() {
    this.photo = !this.photo;
    this.pushHud();
  }
  continueAfterEnding() {
    this.setPhase("playing");
    this.lockPointer();
  }
  fastTravel(id: number) {
    if (!this.lit.has(id)) return;
    const b = this.world.beacons[id];
    this.onToast?.("t.travel", [], true);
    this.audio.whoosh();
    this.setPhase("playing");
    this.lockPointer();
    this.fadeThen(() => {
      const a = Math.random() * TAU;
      this.pos.set(b.x + Math.cos(a) * 5, 0, b.z + Math.sin(a) * 5);
      this.pos.y = this.world.height(this.pos.x, this.pos.z);
      this.vel.set(0, 0, 0);
      this.gliding = false;
      this.onGround = true;
    });
  }

  private fadeThen(cb: () => void) {
    this.fadeTarget = 1;
    this.fadeCb = cb;
  }

  // ====================== save ======================
  save() {
    if (this.phase === "title") return;
    const d: SaveData = {
      v: 1,
      pos: [this.pos.x, this.pos.y, this.pos.z],
      yaw: this.camYaw,
      collected: [...this.collected],
      spent: this.spent,
      beacons: [...this.lit],
      stones: [...this.read],
      time: this.tod,
      playTime: this.playTime,
      finished: this.finished,
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
  }

  private syncProgressVisuals() {
    this.beaconViews.forEach((v, i) => v.setLit(this.lit.has(i)));
    this.stoneViews.forEach((v, i) => v.setRead(this.read.has(i)));
    this.spireView.setAwake(this.spireAwake);
  }

  // ====================== main loop ======================
  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    const now = performance.now();
    const raw = (now - this.lastT) / 1000;
    this.lastT = now;
    const dt = Math.min(raw, 0.05);
    if (raw > 0) this.fps = lerp(this.fps, 1 / raw, 0.05);
    this.updateFade(raw);
    this.step(dt);
    this.render();
  };

  private updateFade(dt: number) {
    if (!this.fadeEl) this.fadeEl = document.getElementById("fade");
    if (this.fadeV < this.fadeTarget) {
      this.fadeV = Math.min(this.fadeTarget, this.fadeV + dt * 3);
      if (this.fadeV >= 1 && this.fadeCb) {
        const cb = this.fadeCb;
        this.fadeCb = null;
        cb();
        this.fadeTarget = 0;
      }
    } else if (this.fadeV > this.fadeTarget) {
      this.fadeV = Math.max(this.fadeTarget, this.fadeV - dt * 2.2);
    }
    if (this.fadeEl) this.fadeEl.style.opacity = String(this.fadeV);
  }

  private step(dt: number) {
    const simPhases = this.phase === "title" || this.phase === "playing" || this.phase === "ending";
    if (simPhases) {
      this.t += dt;
      timeU.value = this.t;
      if (this.phase === "playing") {
        this.playTime += dt;
        this.updatePlayer(dt);
        this.updateInteract();
        this.updateHints(dt);
        this.saveT += dt;
        if (this.saveT > 25) { this.saveT = 0; this.save(); }
      }
      this.updateShards(dt, this.phase === "playing");
      if (this.photo) {
        if (this.keys.has("BracketRight")) this.tod = (this.tod + dt * 0.08) % 1;
        if (this.keys.has("BracketLeft")) this.tod = (this.tod - dt * 0.08 + 1) % 1;
      } else {
        this.tod = (this.tod + (dt / DAY_LEN) * (this.phase === "title" ? 0.35 : 1)) % 1;
      }
      this.updateWeather(dt);
      this.updateEnvironment(dt);
      this.fauna.update(dt, this.pos.x, this.pos.z, this.t, this.dayF);
      this.beaconViews.forEach((v) => v.update(this.t));
      this.stoneViews.forEach((v) => v.update(this.t));
      this.spireView.update(this.t);
      this.campView.update(this.t, this.nightF);
      this.animatePlayer(dt);
      this.updateAmbientFx(dt);
    }
    this.updateCamera(dt);
    this.particles.update(simPhases ? dt : 0);
    this.updateAudio(dt);
    this.hudT += dt;
    if (this.hudT > 0.1) { this.hudT = 0; this.pushHud(); }
    if (this.minimap) {
      this.minimapT += dt;
      if (this.minimapT > 0.05) { this.minimapT = 0; this.drawMinimap(this.minimap); }
    }
    if (this.phase === "map" && this.fullMap) this.drawFullMap(this.fullMap);
  }

  private render() {
    if (this.settings.quality === "high") {
      this.bloom.enabled = true;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    if (this.wantShot) {
      this.wantShot = false;
      try {
        const a = document.createElement("a");
        const d = new Date();
        const p = (n: number) => String(n).padStart(2, "0");
        a.download = `lumen-isle-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
        a.href = this.canvas.toDataURL("image/png");
        a.click();
        this.onToast?.("t.photo", [], true);
      } catch { /* ignore */ }
    }
  }

  // ====================== player ======================
  private updatePlayer(dt: number) {
    const w = this.world;
    const k = this.keys;
    const ix = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const iz = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const hasInput = ix !== 0 || iz !== 0;
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
    let dx = -sy * iz + cy * ix;
    let dz = -cy * iz - sy * ix;
    const dl = Math.hypot(dx, dz);
    if (dl > 0) { dx /= dl; dz /= dl; }
    const sprintKey = k.has("ShiftLeft") || k.has("ShiftRight");

    const groundH0 = w.height(this.pos.x, this.pos.z);
    const depth = WATER_Y - groundH0;
    const swimming = depth > 0.8 && this.pos.y < WATER_Y - 0.15;
    if (swimming && !this.wasSwimming) {
      this.audio.splash();
      this.particles.burst(this.pos.x, WATER_Y + 0.2, this.pos.z, 24, 4, 0.6, 0.9, 1.2, 0.8, 8);
      this.gliding = false;
    }
    this.wasSwimming = swimming;

    // jump / glide
    if (this.jumpPressed) {
      if (swimming) {
        this.vel.y = 8.5;
        this.audio.jump();
      } else if (this.onGround || this.coyote > 0) {
        this.vel.y = 11;
        this.onGround = false;
        this.coyote = 0;
        this.audio.jump();
        this.hintFlags.jumped = true;
        this.particles.burst(this.pos.x, this.pos.y + 0.1, this.pos.z, 6, 2, 0.5, 0.45, 0.35, 0.5, 2);
      } else if (this.airTime > 0.25 && (this.stamina > 4 || this.gliding)) {
        this.gliding = !this.gliding;
        if (this.gliding) {
          const sp = Math.hypot(this.vel.x, this.vel.z);
          this.glideHeading = sp > 1.5 ? Math.atan2(-this.vel.x, -this.vel.z) : this.camYaw;
          this.audio.glideOpen();
          this.hintFlags.glided = true;
        }
      }
    }
    this.jumpPressed = false;

    const sprinting = sprintKey && hasInput && !this.exhausted && this.stamina > 0 && this.onGround && !swimming;
    if (sprinting) this.hintFlags.sprinted = true;

    // horizontal
    if (this.gliding) {
      let gs = 14, sink = 2.4;
      if (iz > 0) { gs = 19; sink = 5.5; }
      else if (iz < 0) { gs = 8; sink = 1.6; }
      if (ix === 0 && iz >= 0) {
        const diff = wrapAngle(this.camYaw - this.glideHeading);
        this.glideHeading += clamp(diff, -2.4 * dt, 2.4 * dt);
      } else if (ix !== 0) {
        const turn = -ix * 1.6 * dt;
        this.glideHeading += turn;
        this.camYaw += turn;
      }
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const ns = lerp(sp, gs, 1 - Math.exp(-1.5 * dt));
      this.vel.x = -Math.sin(this.glideHeading) * ns;
      this.vel.z = -Math.cos(this.glideHeading) * ns;
      this.vel.y = lerp(this.vel.y, -sink, 1 - Math.exp(-3 * dt));
    } else {
      let maxSpeed = 6.2, accel = this.onGround ? 14 : 3.5;
      if (swimming) { maxSpeed = sprintKey ? 5.4 : 3.7; accel = 6; }
      else if (sprinting) maxSpeed = 10.8;
      const a = 1 - Math.exp(-accel * dt);
      this.vel.x += (dx * maxSpeed - this.vel.x) * a;
      this.vel.z += (dz * maxSpeed - this.vel.z) * a;
    }

    // updrafts
    this.inUpdraft = false;
    if (!swimming && !this.onGround) {
      const cols: { x: number; z: number; y: number; h: number; r: number }[] = [];
      this.lit.forEach((id) => { const b = w.beacons[id]; cols.push({ x: b.x, z: b.z, y: b.y, h: 58, r: 6.5 }); });
      if (this.spireAwake > 0.5) cols.push({ x: w.spire.x, z: w.spire.z, y: w.spire.y, h: 110, r: 8 });
      for (const c of cols) {
        if (Math.hypot(this.pos.x - c.x, this.pos.z - c.z) < c.r && this.pos.y > c.y - 1 && this.pos.y < c.y + c.h) {
          this.inUpdraft = true;
          if (this.gliding) this.vel.y = lerp(this.vel.y, 9, 1 - Math.exp(-4 * dt));
          else this.vel.y += 17 * dt;
          this.hintFlags.updraft = true;
          if (Math.random() < 0.5) this.particles.emit(c.x + (Math.random() - 0.5) * 8, this.pos.y - 2 + Math.random() * 4, c.z + (Math.random() - 0.5) * 8, 0, 6, 0, 0.5, 1.2, 1.6, 1.2, 0);
          break;
        }
      }
    }

    // vertical
    if (swimming) {
      const target = WATER_Y - 0.55 + Math.sin(this.t * 2) * 0.04;
      this.vel.y += ((target - this.pos.y) * 5 - this.vel.y) * (1 - Math.exp(-8 * dt));
      this.onGround = false;
      this.gliding = false;
    } else if (!this.gliding) {
      this.vel.y -= GRAVITY * dt;
      if (this.vel.y < -45) this.vel.y = -45;
    }

    // integrate
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    w.resolve(this.pos, 0.45);
    const rr = Math.hypot(this.pos.x, this.pos.z);
    if (rr > 285) {
      const f = 285 / rr;
      this.pos.x *= f;
      this.pos.z *= f;
      if (this.t - this.seaWarn > 20) { this.seaWarn = this.t; this.onToast?.("t.sea", [], false); }
    }

    // ground
    if (!swimming) {
      const gh = w.height(this.pos.x, this.pos.z);
      if (this.pos.y <= gh) {
        if (!this.onGround && this.vel.y < -8) {
          const pw = clamp(-this.vel.y / 28, 0, 1);
          this.audio.land(pw);
          this.particles.burst(this.pos.x, gh + 0.1, this.pos.z, 8 + Math.floor(pw * 10), 2.5, 0.6, 0.55, 0.45, 0.6, 3);
        }
        this.pos.y = gh;
        if (this.vel.y < 0) this.vel.y = 0;
        this.onGround = true;
        this.gliding = false;
      } else if (this.onGround && this.vel.y <= 0 && this.pos.y - gh < 0.5) {
        this.pos.y = gh;
      } else {
        this.onGround = false;
      }
      if (this.onGround) {
        const n = { x: 0, y: 1, z: 0 };
        w.normalAt(this.pos.x, this.pos.z, n);
        if (n.y < 0.55) {
          this.vel.x += n.x * 40 * dt;
          this.vel.z += n.z * 40 * dt;
        }
      }
    }
    if (this.pos.y < -40) {
      const s = w.spawn;
      this.pos.set(s.x, s.y, s.z);
      this.vel.set(0, 0, 0);
    }

    this.airTime = this.onGround || swimming ? 0 : this.airTime + dt;
    this.coyote = this.onGround ? 0.12 : Math.max(0, this.coyote - dt);

    // stamina
    const hsp = Math.hypot(this.vel.x, this.vel.z);
    const moving = hasInput && hsp > 0.5;
    if (sprinting && moving) this.stamina -= 14 * dt;
    else if (this.gliding && !this.inUpdraft) this.stamina -= 6 * dt;
    else if (this.onGround || swimming) this.stamina += 26 * dt;
    if (this.stamina <= 0) {
      this.stamina = 0;
      this.exhausted = true;
      this.gliding = false;
    }
    if (this.stamina > this.maxStamina) this.stamina = this.maxStamina;
    if (this.exhausted && this.stamina > this.maxStamina * 0.3) this.exhausted = false;

    // facing
    if (hsp > 0.4 && (hasInput || this.gliding || !this.onGround)) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      const diff = wrapAngle(target - this.facing);
      this.facing += diff * (1 - Math.exp(-12 * dt));
      this.bank += (clamp(diff * 1.5, -0.7, 0.7) - this.bank) * (1 - Math.exp(-6 * dt));
    } else {
      this.bank += (0 - this.bank) * (1 - Math.exp(-6 * dt));
    }

    // footsteps
    if (this.onGround && hsp > 1.2) {
      this.stepAcc += hsp * dt;
      const stride = sprinting ? 3.4 : 2.4;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const gh = w.height(this.pos.x, this.pos.z);
        const b = w.biomeAt(this.pos.x, this.pos.z, gh);
        const surf = gh < 0.05 ? "water" : b === "desert" || b === "beach" ? "sand" : b === "snow" ? "snow" : b === "rock" ? "rock" : "grass";
        this.audio.step(surf, sprinting);
        if (surf === "sand") this.particles.burst(this.pos.x, gh + 0.1, this.pos.z, 3, 1.2, 0.7, 0.6, 0.4, 0.5, 2);
        if (surf === "snow") this.particles.burst(this.pos.x, gh + 0.1, this.pos.z, 3, 1.2, 0.9, 0.95, 1, 0.5, 2);
      }
    } else if (swimming && hsp > 1) {
      this.stepAcc += hsp * dt;
      if (this.stepAcc > 2.6) {
        this.stepAcc = 0;
        this.audio.step("water", false);
        this.particles.burst(this.pos.x, WATER_Y + 0.1, this.pos.z, 4, 1.5, 0.6, 0.9, 1.2, 0.6, 3);
      }
    } else if (this.onGround) this.stepAcc = 0;

    if (!this.hintFlags.moved) {
      this.movedDist += hsp * dt;
      if (this.movedDist > 4) this.hintFlags.moved = true;
    }
    this.mode = swimming ? "swim" : this.gliding ? "glide" : this.onGround ? "walk" : "air";
  }

  private animatePlayer(dt: number) {
    const r = this.rig;
    r.root.visible = true;
    r.root.position.copy(this.pos);
    r.root.rotation.y = this.facing;
    const hsp = Math.hypot(this.vel.x, this.vel.z);
    const sp01 = Math.min(1, hsp / 6.2);
    const lerpR = (o: THREE.Object3D, key: "x" | "y" | "z", v: number, rate = 14) => {
      o.rotation[key] += (v - o.rotation[key]) * (1 - Math.exp(-rate * dt));
    };
    if (this.onGround && this.phase !== "title") this.walkPhase += dt * (4 + hsp * 0.95) * (hsp > 0.4 ? 1 : 0);
    else if (this.mode === "swim") this.walkPhase += dt * (3 + hsp * 1.5);
    const sw = Math.sin(this.walkPhase) * sp01 * 0.95;
    const breathe = Math.sin(this.t * 2) * 0.02;
    let bodyPitch = 0;
    let legL = sw, legR = -sw, armL = -sw * 0.8, armR = sw * 0.35 - 0.1, armLz = 0, armRz = 0;
    if (this.mode === "glide") {
      bodyPitch = 1.15;
      legL = 0.12; legR = 0.12;
      armL = -2.7; armR = -2.7; armLz = 0.25; armRz = -0.25;
    } else if (this.mode === "swim") {
      bodyPitch = 0.95;
      legL = Math.sin(this.walkPhase * 2) * 0.5;
      legR = -legL;
      armL = Math.sin(this.walkPhase) * 1.5 - 1.2;
      armR = -Math.sin(this.walkPhase) * 1.5 - 1.2;
    } else if (this.mode === "air") {
      const rising = this.vel.y > 0;
      legL = rising ? -0.5 : 0.2; legR = rising ? 0.3 : -0.2;
      armL = rising ? -2.2 : -0.8; armR = rising ? -2.2 : -0.8;
      armLz = 0.5; armRz = -0.5;
      bodyPitch = rising ? 0.05 : 0.1;
    } else if (hsp < 0.4) {
      armL = breathe * 3; armR = -0.15 - breathe * 3;
    }
    lerpR(r.body, "x", bodyPitch, 10);
    const bp = r.body.rotation.x;
    r.body.position.set(0, 0.9 * (1 - Math.cos(bp)) + (this.onGround ? Math.abs(Math.cos(this.walkPhase)) * 0.05 * sp01 : 0), -0.9 * Math.sin(bp));
    lerpR(r.body, "z", this.mode === "glide" ? -this.bank * 0.9 : -this.bank * 0.25, 8);
    lerpR(r.legL, "x", legL);
    lerpR(r.legR, "x", legR);
    lerpR(r.armL, "x", armL);
    lerpR(r.armR, "x", armR);
    lerpR(r.armL, "z", armLz);
    lerpR(r.armR, "z", armRz);
    r.glider.visible = this.mode === "glide";
    r.glider.rotation.z = Math.sin(this.t * 3) * 0.03;
    const lift = 0.1 + Math.min(1, hsp / 14) * 0.5;
    r.scarf1.rotation.x = lift + Math.sin(this.t * 5) * 0.08;
    r.scarf1.rotation.y = Math.sin(this.t * 3.1) * 0.15;
    r.scarf2.rotation.x = Math.sin(this.t * 8 + 1) * 0.25 * (0.4 + hsp * 0.05);
    r.scarf2.rotation.y = Math.sin(this.t * 4.3) * 0.3;
    r.head.rotation.x = this.mode === "glide" || this.mode === "swim" ? -bp * 0.8 : 0;
    r.lantern.intensity = this.nightF * 6 + this.rain * 1.5 + 0.2;
    // blob
    const gh = this.world.height(this.pos.x, this.pos.z);
    const hgt = clamp(this.pos.y - Math.max(gh, WATER_Y), 0, 30);
    this.blob.visible = this.mode !== "swim";
    this.blob.position.set(this.pos.x, gh + 0.06, this.pos.z);
    this.blob.scale.setScalar(Math.max(0.2, 1 - hgt * 0.04));
    (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.2 * this.dayF * (1 - hgt / 40);
  }

  // ====================== interactions ======================
  private updateInteract() {
    const w = this.world;
    const list: Interactable[] = [];
    const px = this.pos.x, pz = this.pos.z;
    const consider = (type: Interactable["type"], id: number, x: number, z: number, r: number) => {
      const d = Math.hypot(px - x, pz - z);
      if (d < r) list.push({ type, id, d });
    };
    w.beacons.forEach((b) => consider("beacon", b.id, b.x, b.z, 5.5));
    w.stones.forEach((s) => consider("stone", s.id, s.x, s.z, 3.6));
    consider("camp", 0, w.camp.x, w.camp.z, 3.8);
    consider("spire", 0, w.spire.x, w.spire.z, 8);
    list.sort((a, b) => a.d - b.d);
    this.nearest = list.length ? list[0] : null;

    if (!this.interactPressed) return;
    this.interactPressed = false;
    const n = this.nearest;
    if (!n) return;
    switch (n.type) {
      case "beacon": {
        if (this.lit.has(n.id)) return;
        const b = w.beacons[n.id];
        const have = this.collected.size - this.spent;
        if (have < b.cost) return;
        this.spent += b.cost;
        this.lit.add(n.id);
        this.beaconViews[n.id].setLit(true);
        this.audio.beacon();
        const bp = this.beaconViews[n.id].crystalPos;
        this.particles.burst(b.x, b.y + bp.y, b.z, 90, 14, b.hdr[0], b.hdr[1], b.hdr[2], 2.2, 1.5);
        this.maxStamina = 100 + this.lit.size * 20;
        this.stamina = this.maxStamina;
        this.exhausted = false;
        this.onToast?.("t.beacon", [`b.${n.id}`], true);
        window.setTimeout(() => this.onToast?.("t.stam", [], true), 1600);
        if (this.lit.size >= 5) {
          window.setTimeout(() => this.onToast?.("t.spire", [], true), 3400);
        }
        this.save();
        break;
      }
      case "stone": {
        const first = !this.read.has(n.id);
        this.read.add(n.id);
        this.stoneViews[n.id].setRead(true);
        this.audio.stone();
        this.keys.clear();
        this.unlockPointer();
        this.setPhase("lore");
        this.onLore?.(n.id);
        if (first) this.onToast?.("t.stone", [this.read.size, w.stones.length], true);
        this.save();
        break;
      }
      case "camp": {
        this.audio.whoosh();
        this.fadeThen(() => {
          const night = this.tod < 0.25 || this.tod > 0.75;
          this.tod = night ? 0.28 : 0.76;
          this.rain = this.rainTarget = 0;
          this.weatherT = 150;
          this.stamina = this.maxStamina;
          this.save();
        });
        break;
      }
      case "spire": {
        if (this.lit.size < 5) return;
        this.startEnding();
        break;
      }
    }
  }

  private startEnding() {
    this.finished = true;
    this.keys.clear();
    this.unlockPointer();
    this.endingT = 0;
    this.audio.spire();
    this.setPhase("ending");
    this.save();
    const s: EndStats = {
      playTime: this.playTime,
      shardsFound: this.collected.size,
      shardsTotal: this.world.shards.length,
      stones: this.read.size,
      stonesTotal: this.world.stones.length,
    };
    this.onEnding?.(s);
  }

  private updateShards(dt: number, canPick: boolean) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const px = this.pos.x, py = this.pos.y + 1.0, pz = this.pos.z;
    this.world.shards.forEach((s, i) => {
      if (this.collected.has(s.id)) {
        m.makeScale(0, 0, 0);
        this.shardMesh.setMatrixAt(i, m);
        return;
      }
      const p = this.shardPos[i];
      const dx = px - p.x, dy = py - p.y, dz = pz - p.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (canPick) {
        if (d < 7) {
          const sp = (3 + (7 - d) * 2.5) * dt;
          p.x += (dx / d) * sp; p.y += (dy / d) * sp; p.z += (dz / d) * sp;
        }
        if (d < 1.5) {
          this.collected.add(s.id);
          this.audio.pickup(this.collected.size);
          this.particles.burst(p.x, p.y, p.z, 20, 5, 0.5, 1.6, 2.2, 0.9, 0);
          this.onToast?.("t.shard", [], true);
          this.saveT = Math.max(this.saveT, 20);
        }
      }
      const bob = Math.sin(this.t * 2 + i) * 0.15;
      q.setFromAxisAngle(up, this.t * 1.4 + i);
      const near = d < 140 ? 1 : 0;
      sc.setScalar(near * (1 + Math.sin(this.t * 3 + i) * 0.06));
      m.compose(new THREE.Vector3(p.x, p.y + bob, p.z), q, sc);
      this.shardMesh.setMatrixAt(i, m);
    });
    this.shardMesh.instanceMatrix.needsUpdate = true;
  }

  private updateHints(dt: number) {
    const f = this.hintFlags;
    let key: string | null = null;
    if (!f.moved) key = "hint.move";
    else if (!f.jumped) key = "hint.jump";
    else if (!f.glided) key = "hint.glide";
    else if (!f.sprinted) key = "hint.sprint";
    else if (this.collected.size === 0) key = "hint.shard";
    else if (!f.map && this.lit.size >= 1) key = "hint.map";
    else if (!f.updraft && this.lit.size >= 1) key = "hint.updraft";
    if (key) {
      this.hintTime[key] = (this.hintTime[key] ?? 0) + dt;
      if (this.hintTime[key] > 18) {
        // give up on this hint
        if (key === "hint.move") f.moved = true;
        else if (key === "hint.jump") f.jumped = true;
        else if (key === "hint.glide") f.glided = true;
        else if (key === "hint.sprint") f.sprinted = true;
        else if (key === "hint.shard") this.hintTime[key] = 0;
        else if (key === "hint.map") f.map = true;
        else f.updraft = true;
      }
    }
    this.curHint = this.phase === "playing" ? key : null;
  }

  // ====================== environment ======================
  private updateWeather(dt: number) {
    if (this.phase === "title") { this.rain = this.rainTarget = 0; return; }
    this.weatherT -= dt;
    if (this.weatherT <= 0) {
      if (this.rainTarget > 0) {
        this.rainTarget = 0;
        this.weatherT = 150 + Math.random() * 200;
        this.onToast?.("t.rainstop", [], false);
      } else if (Math.random() < 0.5) {
        this.rainTarget = 0.5 + Math.random() * 0.5;
        this.weatherT = 50 + Math.random() * 90;
        this.onToast?.("t.rain", [], false);
      } else this.weatherT = 60 + Math.random() * 60;
    }
    this.rain += (this.rainTarget - this.rain) * (1 - Math.exp(-dt * 0.3));
    if (this.rain > 0.7) {
      this.thunderT -= dt;
      if (this.thunderT <= 0) {
        this.thunderT = 9 + Math.random() * 16;
        this.flash = 1;
        window.setTimeout(() => this.audio.thunder(), 400 + Math.random() * 1400);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 2.6);
  }

  private updateEnvironment(dt: number) {
    const a = (this.tod - 0.25) * TAU;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.35).normalize();
    const sunH = this.sunDir.y;
    this.dayF = smoothstep(-0.05, 0.25, sunH);
    this.nightF = 1 - smoothstep(-0.25, 0.02, sunH);
    const rain = this.rain;
    const p = this.pos;
    const cam = this.camera.position;

    const top = sampleSky(sunH, "top", this.tmpA);
    const bot = sampleSky(sunH, "bot", this.tmpB);
    const gray = (top.r + top.g + top.b) / 3;
    top.lerp(new THREE.Color(gray * 0.9, gray * 0.95, gray * 1.05), rain * 0.65);
    const grayB = (bot.r + bot.g + bot.b) / 3;
    bot.lerp(new THREE.Color(grayB * 0.85, grayB * 0.9, grayB), rain * 0.7);
    (this.skyMat.uniforms.top.value as THREE.Color).copy(top);
    (this.skyMat.uniforms.bottom.value as THREE.Color).copy(bot);
    (this.skyMat.uniforms.sunDir.value as THREE.Vector3).copy(this.sunDir);
    (this.skyMat.uniforms.sunColor.value as THREE.Color).setRGB(1.0, 0.65 + smoothstep(0, 0.4, sunH) * 0.25, 0.35).multiplyScalar(this.dayF * (1 - rain * 0.8));
    this.fog.color.copy(bot);
    // fog tightens in rain
    this.fog.near = 70 * (1 - rain * 0.65);
    this.fog.far = 430 * (1 - rain * 0.55);

    // lights
    const warm = smoothstep(0.05, 0.4, sunH);
    this.sun.color.setRGB(1, lerp(0.7, 0.95, warm), lerp(0.45, 0.88, warm));
    this.sun.intensity = this.dayF * 3.1 * (1 - rain * 0.6);
    this.sun.position.set(p.x + this.sunDir.x * 100, p.y + this.sunDir.y * 100, p.z + this.sunDir.z * 100);
    this.sun.target.position.set(p.x, p.y, p.z);
    this.moon.intensity = this.nightF * 0.6 * (1 - rain * 0.5);
    this.moon.position.set(p.x - this.sunDir.x * 100, p.y - this.sunDir.y * 100 + 20, p.z - this.sunDir.z * 100);
    this.moon.target.position.set(p.x, p.y, p.z);
    this.hemi.color.copy(top).lerp(new THREE.Color(1, 1, 1), 0.35);
    this.hemi.groundColor.setRGB(lerp(0.12, 0.38, this.dayF), lerp(0.12, 0.3, this.dayF), lerp(0.2, 0.2, this.dayF));
    this.hemi.intensity = lerp(0.45, 1.8, this.dayF) * (1 - rain * 0.25) + this.flash * 3;

    // celestial bodies
    this.skyMesh.position.copy(cam);
    this.stars.position.copy(cam);
    (this.stars.material as THREE.PointsMaterial).opacity = this.nightF * (1 - rain);
    this.sunMesh.position.set(cam.x + this.sunDir.x * 850, cam.y + this.sunDir.y * 850, cam.z + this.sunDir.z * 850);
    this.moonMesh.position.set(cam.x - this.sunDir.x * 850, cam.y - this.sunDir.y * 850, cam.z - this.sunDir.z * 850);
    this.sunMesh.visible = rain < 0.7 && sunH > -0.15;
    this.moonMesh.visible = rain < 0.7 && sunH < 0.1;

    // aurora
    const target = this.lit.size >= 5 ? 1 : 0;
    this.auroraLevel += (target - this.auroraLevel) * (1 - Math.exp(-dt * 0.4));
    this.spireAwake += ((target > 0 ? 1 : 0) - this.spireAwake) * (1 - Math.exp(-dt * 0.5));
    this.spireView.setAwake(this.spireAwake);
    this.aurora.mat.uniforms.time.value = this.t;
    this.aurora.mat.uniforms.intensity.value = this.auroraLevel * (0.2 + 0.8 * this.nightF) * (1 - rain * 0.7);
    this.aurora.group.position.set(cam.x, 0, cam.z);

    // clouds
    this.clouds.mat.color.setRGB(lerp(0.2, 1, this.dayF) * (1 - rain * 0.35), lerp(0.24, 1, this.dayF) * (1 - rain * 0.35), lerp(0.36, 1, this.dayF) * (1 - rain * 0.3));
    this.clouds.mat.emissive.setRGB(lerp(0.03, 0.13, this.dayF), lerp(0.04, 0.14, this.dayF), lerp(0.08, 0.17, this.dayF));
    this.clouds.group.children.forEach((c) => {
      c.position.x += (c.userData.speed as number) * dt * (1 + rain);
      if (c.position.x - cam.x > 520) c.position.x -= 1040;
      if (c.position.z - cam.z > 520) c.position.z -= 1040;
      if (c.position.z - cam.z < -520) c.position.z += 1040;
      if (c.position.x - cam.x < -520) c.position.x += 1040;
    });

    // water
    this.waterMat.color.lerpColors(new THREE.Color("#173f6e"), new THREE.Color("#3fa9d8"), this.dayF).multiplyScalar(1 - rain * 0.25);
    const pos = this.waterMesh.geometry.attributes.position as THREE.BufferAttribute;
    const cell = WATER_SIZE / WATER_SEG;
    const cx = Math.round(cam.x / cell) * cell, cz = Math.round(cam.z / cell) * cell;
    this.waterMesh.position.set(cx, WATER_Y, cz);
    const t = this.t;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + cx, wz = pos.getZ(i) + cz;
      pos.setY(i, waveH(wx, wz, t));
    }
    pos.needsUpdate = true;

    // beacon point light
    let bd = 1e9, bi = -1;
    this.lit.forEach((id) => {
      const b = this.world.beacons[id];
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < bd) { bd = d; bi = id; }
    });
    if (bi >= 0 && bd < 70) {
      const b = this.world.beacons[bi];
      this.beaconLight.position.set(b.x, b.y + 9, b.z);
      this.beaconLight.color.setRGB(b.hdr[0] / 2.2, b.hdr[1] / 2.2, b.hdr[2] / 2.2);
      this.beaconLight.intensity = lerp(0, 90, 1 - smoothstep(10, 70, bd));
    } else this.beaconLight.intensity = 0;

    this.bloom.strength = 0.45 + this.nightF * 0.25;
  }

  private updateAmbientFx(dt: number) {
    const p = this.pos;
    this.motes.update(this.t, p.x, p.y, p.z, this.nightF, this.rain, (x, z) => this.world.height(x, z));
    const h = this.world.height(p.x, p.z);
    const snow = this.world.biomeAt(p.x, p.z, h) === "snow" || h > 40;
    this.rainFx.update(dt, this.camera.position.x, this.camera.position.y, this.camera.position.z, snow ? Math.max(this.rain, 0) : this.rain, snow);
    // campfire embers
    const c = this.world.camp;
    if (Math.hypot(p.x - c.x, p.z - c.z) < 90 && Math.random() < 0.5) {
      this.particles.emit(c.x + (Math.random() - 0.5) * 0.5, c.y + 0.8, c.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6, 1.4 + Math.random(), (Math.random() - 0.5) * 0.6, 1.8, 0.8, 0.2, 1.6 + Math.random(), -0.2);
    }
    // beacon sparks
    this.lit.forEach((id) => {
      const b = this.world.beacons[id];
      if (Math.hypot(p.x - b.x, p.z - b.z) < 120 && Math.random() < 0.35) {
        const a = Math.random() * TAU, r = 1 + Math.random() * 1.5;
        this.particles.emit(b.x + Math.cos(a) * r, b.y + 1, b.z + Math.sin(a) * r, 0, 2 + Math.random() * 2, 0, b.hdr[0] * 0.6, b.hdr[1] * 0.6, b.hdr[2] * 0.6, 3, 0);
      }
    });
    if (this.spireAwake > 0.5 && Math.hypot(p.x - this.world.spire.x, p.z - this.world.spire.z) < 140 && Math.random() < 0.6) {
      const s = this.world.spire;
      const a = Math.random() * TAU, r = 2 + Math.random() * 4;
      this.particles.emit(s.x + Math.cos(a) * r, s.y + 1, s.z + Math.sin(a) * r, 0, 3 + Math.random() * 3, 0, 1.3, 1.1, 0.7, 4, 0);
    }
  }

  // ====================== camera ======================
  private updateCamera(dt: number) {
    const cam = this.camera;
    const w = this.world;
    if (this.phase === "title") {
      this.titleAngle += dt * 0.06;
      const c = w.camp;
      const R = 15;
      const x = c.x + Math.cos(this.titleAngle) * R, z = c.z + Math.sin(this.titleAngle) * R;
      cam.position.set(x, Math.max(w.height(x, z), c.y) + 4.5 + Math.sin(this.titleAngle * 2) * 1.2, z);
      cam.lookAt(c.x - 1.2, c.y + 2.2, c.z + 0.6);
      cam.fov += (58 - cam.fov) * 0.1;
      cam.updateProjectionMatrix();
      return;
    }
    if (this.phase === "ending") {
      this.endingT += dt;
      const s = w.spire;
      const ang = this.endingT * 0.12 + 0.6;
      const R = 40 + Math.sin(this.endingT * 0.2) * 6;
      const x = s.x + Math.cos(ang) * R, z = s.z + Math.sin(ang) * R;
      const y = s.y + 14 + Math.min(this.endingT * 0.8, 22);
      cam.position.set(x, Math.max(y, w.height(x, z) + 3), z);
      cam.lookAt(s.x, s.y + 24, s.z);
      cam.fov += (62 - cam.fov) * 0.1;
      cam.updateProjectionMatrix();
      return;
    }
    if (this.phase !== "playing") return;

    const tx = this.pos.x, ty = this.pos.y + 1.55, tz = this.pos.z;
    const cp = Math.cos(this.camPitch);
    const dirx = Math.sin(this.camYaw) * cp, diry = Math.sin(this.camPitch), dirz = Math.cos(this.camYaw) * cp;
    let dist = this.camDist * (this.mode === "glide" ? 1.3 : 1);
    for (let s = 1; s <= 12; s++) {
      const f = s / 12;
      const px = tx + dirx * dist * f, py = ty + diry * dist * f, pz = tz + dirz * dist * f;
      if (py < w.height(px, pz) + 0.7) { dist = Math.max(1.2, dist * (f - 0.08)); break; }
    }
    if (dist < this.camCur) this.camCur = dist;
    else this.camCur += (dist - this.camCur) * (1 - Math.exp(-4 * dt));
    const cx = tx + dirx * this.camCur, cz = tz + dirz * this.camCur;
    const cy = Math.max(ty + diry * this.camCur, w.height(cx, cz) + 0.6);
    cam.position.set(cx, cy, cz);
    cam.lookAt(tx, ty + 0.2, tz);
    const hsp = Math.hypot(this.vel.x, this.vel.z);
    const fovT = 62 + (this.mode === "glide" ? 14 : 0) + Math.min(1, hsp / 11) * (this.mode === "glide" ? 0 : 5) + (this.inUpdraft ? 4 : 0);
    cam.fov += (fovT - cam.fov) * (1 - Math.exp(-4 * dt));
    cam.updateProjectionMatrix();
  }

  // ====================== audio / hud ======================
  private updateAudio(dt: number) {
    const alt = this.pos.y;
    const h = this.world.height(this.pos.x, this.pos.z);
    const hsp = Math.hypot(this.vel.x, this.vel.z);
    this.audio.update(dt, {
      wind: clamp((alt - 6) / 70, 0, 0.6) + (this.mode === "glide" ? 0.45 : 0) + clamp(hsp / 40, 0, 0.2),
      rain: this.rain,
      night: this.nightF,
      sea: (1 - smoothstep(1.5, 12, h)) * 0.9 + (Math.hypot(this.pos.x, this.pos.z) > 170 ? 0.3 : 0),
      speed: clamp(hsp / 20, 0, 1),
      inMenu: this.phase !== "playing",
    });
  }

  private pushHud() {
    if (!this.onHud) return;
    const w = this.world;
    const markers: Marker[] = w.beacons.map((b) => ({
      bearing: Math.atan2(-(b.x - this.pos.x), -(b.z - this.pos.z)),
      lit: this.lit.has(b.id),
      color: b.css,
      kind: "beacon" as const,
    }));
    if (this.lit.size >= 5) {
      markers.push({ bearing: Math.atan2(-(w.spire.x - this.pos.x), -(w.spire.z - this.pos.z)), lit: true, color: "#fff2b0", kind: "spire" });
    }
    const have = this.collected.size - this.spent;
    let objectiveKey = "obj.main";
    let objectiveArgs: (string | number)[] = [this.lit.size, 5];
    let subKey: string | null = null;
    let subArgs: (string | number)[] = [];
    if (this.lit.size < 5) {
      const unlit = w.beacons.filter((b) => !this.lit.has(b.id));
      const minCost = Math.min(...unlit.map((b) => b.cost));
      subKey = "obj.cost";
      subArgs = [minCost, have];
    } else if (!this.finished) objectiveKey = "obj.spire";
    else { objectiveKey = "obj.free"; objectiveArgs = []; }

    let prompt: HudState["prompt"] = null;
    const n = this.nearest;
    if (n && this.phase === "playing") {
      switch (n.type) {
        case "beacon": {
          const b = w.beacons[n.id];
          if (this.lit.has(n.id)) prompt = { key: "p.beacon.lit", args: [], ok: false };
          else prompt = { key: have >= b.cost ? "p.beacon.ok" : "p.beacon.no", args: [b.cost, have], ok: have >= b.cost };
          break;
        }
        case "stone": prompt = { key: this.read.has(n.id) ? "p.stone.read" : "p.stone", args: [], ok: true }; break;
        case "camp": prompt = { key: "p.camp", args: [], ok: true }; break;
        case "spire": prompt = this.lit.size >= 5 ? { key: this.finished ? "p.spire.done" : "p.spire.ok", args: [], ok: true } : { key: "p.spire.no", args: [], ok: false }; break;
      }
    }
    const gh = w.height(this.pos.x, this.pos.z);
    const hud: HudState = {
      shards: have,
      shardsFound: this.collected.size,
      shardsTotal: w.shards.length,
      beaconsLit: this.lit.size,
      beaconsTotal: 5,
      stones: this.read.size,
      stonesTotal: w.stones.length,
      stamina: this.stamina / this.maxStamina,
      exhausted: this.exhausted,
      mode: this.mode,
      prompt,
      objectiveKey,
      objectiveArgs,
      subKey,
      subArgs,
      photo: this.photo,
      tod: this.tod,
      rain: this.rain,
      heading: this.camYaw,
      markers,
      biome: "biome." + w.biomeAt(this.pos.x, this.pos.z, gh),
      altitude: Math.max(0, this.pos.y),
      fps: Math.round(this.fps),
      hintKey: this.curHint,
      beacons: w.beacons.map((b) => ({ lit: this.lit.has(b.id), color: b.css, nameKey: `b.${b.id}` })),
    };
    this.onHud(hud);
  }

  // ====================== maps ======================
  registerMinimap(c: HTMLCanvasElement | null) { this.minimap = c; }
  registerFullMap(c: HTMLCanvasElement | null) { this.fullMap = c; }

  private diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string | null, stroke: string) {
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  drawMinimap(cv: HTMLCanvasElement) {
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const S = cv.width, R = S / 2;
    const p = this.pos;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 3, 0, TAU);
    ctx.clip();
    ctx.fillStyle = "#16324a";
    ctx.fillRect(0, 0, S, S);
    const ppm = S / 190;
    ctx.translate(R, R);
    ctx.rotate(this.camYaw);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapCanvas, -(p.x + HALF) * ppm, -(p.z + HALF) * ppm, WORLD_SIZE * ppm, WORLD_SIZE * ppm);
    this.world.shards.forEach((s) => {
      if (this.collected.has(s.id)) return;
      const dx = (s.x - p.x) * ppm, dy = (s.z - p.z) * ppm;
      if (dx * dx + dy * dy > (R - 6) * (R - 6) * 0.55) return;
      ctx.fillStyle = "#7df3ff";
      ctx.fillRect(dx - 2, dy - 2, 4, 4);
    });
    this.world.beacons.forEach((b) => {
      let dx = (b.x - p.x) * ppm, dy = (b.z - p.z) * ppm;
      const d = Math.hypot(dx, dy), lim = R - 14;
      if (d > lim) { dx *= lim / d; dy *= lim / d; }
      this.diamond(ctx, dx, dy, 7, this.lit.has(b.id) ? b.css : null, this.lit.has(b.id) ? "#fff" : "#e8f0f8");
    });
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(R, R, R - 3, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#1a2a3a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(R, R - 10); ctx.lineTo(R + 7, R + 8); ctx.lineTo(R, R + 4); ctx.lineTo(R - 7, R + 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  drawFullMap(cv: HTMLCanvasElement) {
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const S = cv.width;
    const k = S / WORLD_SIZE;
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.mapCanvas, 0, 0, S, S);
    const X = (x: number) => (x + HALF) * k;
    ctx.font = `${Math.round(S / 38)}px sans-serif`;
    ctx.textAlign = "center";
    this.world.stones.forEach((s) => {
      if (!this.read.has(s.id)) return;
      ctx.fillStyle = "#9fe6ff";
      ctx.fillRect(X(s.x) - 3, X(s.z) - 3, 6, 6);
    });
    this.world.beacons.forEach((b) => {
      const lit = this.lit.has(b.id);
      this.diamond(ctx, X(b.x), X(b.z), S / 55, lit ? b.css : "rgba(20,30,40,0.7)", lit ? "#fff" : "#cfd8e0");
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 4;
      const label = tr(this.settings.lang, `b.${b.id}`);
      ctx.strokeText(label, X(b.x), X(b.z) - S / 40);
      ctx.fillText(label, X(b.x), X(b.z) - S / 40);
    });
    const sp = this.world.spire;
    this.diamond(ctx, X(sp.x), X(sp.z), S / 60, this.lit.size >= 5 ? "#fff2b0" : "#8d8aa5", "#fff");
    ctx.save();
    ctx.translate(X(this.pos.x), X(this.pos.z));
    ctx.rotate(-this.camYaw);
    ctx.fillStyle = "#ff5a4a";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(9, 10); ctx.lineTo(0, 5); ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  mapPick(cv: HTMLCanvasElement, clientX: number, clientY: number): number | null {
    const r = cv.getBoundingClientRect();
    const wx = ((clientX - r.left) / r.width) * WORLD_SIZE - HALF;
    const wz = ((clientY - r.top) / r.height) * WORLD_SIZE - HALF;
    let best: number | null = null, bd = 18;
    this.world.beacons.forEach((b) => {
      const d = Math.hypot(b.x - wx, b.z - wz);
      if (d < bd && this.lit.has(b.id)) { bd = d; best = b.id; }
    });
    return best;
  }

  getPlayTime() { return this.playTime; }
}
