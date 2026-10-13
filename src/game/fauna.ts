import * as THREE from "three";
import { World } from "./world";
import { flat } from "./assets";
import { mulberry32, wrapAngle } from "./noise";

interface Animal {
  group: THREE.Group;
  kind: "deer" | "rabbit";
  x: number;
  z: number;
  yaw: number;
  rot: number;
  state: "idle" | "walk" | "flee";
  timer: number;
  legs: THREE.Group[];
  head: THREE.Group | null;
  phase: number;
  walk: number;
  run: number;
  fleeR: number;
}

interface Bird {
  group: THREE.Group;
  wl: THREE.Mesh;
  wr: THREE.Mesh;
  cx: number;
  cz: number;
  rad: number;
  alt: number;
  ang: number;
  speed: number;
  phase: number;
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function buildDeer(rng: () => number) {
  const g = new THREE.Group();
  const body = flat(0xb77a4b), light = flat(0xe8d4b0), dark = flat(0x6d4429), ant = flat(0xd9c9a3);
  box(g, 0.5, 0.5, 1.1, body, 0, 0.98, 0);
  box(g, 0.46, 0.14, 0.9, light, 0, 0.74, 0);
  box(g, 0.12, 0.14, 0.08, light, 0, 1.12, -0.58);
  const head = new THREE.Group();
  head.position.set(0, 1.15, 0.5);
  g.add(head);
  box(head, 0.2, 0.6, 0.22, body, 0, 0.26, 0.1).rotation.x = 0.35;
  box(head, 0.23, 0.25, 0.4, body, 0, 0.6, 0.3);
  box(head, 0.12, 0.12, 0.14, dark, 0, 0.55, 0.54);
  box(head, 0.05, 0.14, 0.08, dark, -0.13, 0.76, 0.2);
  box(head, 0.05, 0.14, 0.08, dark, 0.13, 0.76, 0.2);
  if (rng() > 0.45) {
    [-1, 1].forEach((s) => {
      const a = box(head, 0.03, 0.42, 0.03, ant, 0.09 * s, 0.95, 0.18);
      a.rotation.z = -0.3 * s;
      const b = box(head, 0.03, 0.22, 0.03, ant, 0.2 * s, 1.0, 0.18);
      b.rotation.z = -0.8 * s;
    });
  }
  const legs: THREE.Group[] = [];
  [[-0.17, 0.4], [0.17, 0.4], [-0.17, -0.4], [0.17, -0.4]].forEach(([x, z]) => {
    const l = new THREE.Group();
    l.position.set(x, 0.74, z);
    box(l, 0.1, 0.74, 0.1, dark, 0, -0.37, 0);
    g.add(l);
    legs.push(l);
  });
  return { g, legs, head };
}

function buildRabbit(rng: () => number) {
  const g = new THREE.Group();
  const cols = [0x9b7b5b, 0xf2efe8, 0x8f8f8f, 0xb08a60];
  const body = flat(cols[Math.floor(rng() * cols.length)]), white = flat(0xffffff);
  box(g, 0.28, 0.26, 0.44, body, 0, 0.26, 0);
  box(g, 0.2, 0.2, 0.22, body, 0, 0.38, 0.27);
  box(g, 0.05, 0.28, 0.04, body, -0.05, 0.6, 0.24).rotation.x = -0.2;
  box(g, 0.05, 0.28, 0.04, body, 0.05, 0.6, 0.24).rotation.x = -0.2;
  const tail = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), white);
  tail.position.set(0, 0.3, -0.25);
  g.add(tail);
  const legs: THREE.Group[] = [];
  [-0.1, 0.1].forEach((x) => {
    const l = new THREE.Group();
    l.position.set(x, 0.15, -0.12);
    box(l, 0.08, 0.15, 0.2, body, 0, -0.05, 0.04);
    g.add(l);
    legs.push(l);
  });
  return { g, legs };
}

export class Fauna {
  animals: Animal[] = [];
  birds: Bird[] = [];
  group = new THREE.Group();
  private world: World;

  constructor(world: World) {
    this.world = world;
    const rng = mulberry32(8080);
    // deer
    for (let i = 0; i < 18; i++) {
      const p = world.randomLandPoint(rng, (b) => b === "forest" || b === "meadow");
      const d = buildDeer(rng);
      d.g.scale.setScalar(0.9 + rng() * 0.3);
      this.add({ group: d.g, kind: "deer", x: p.x, z: p.z, legs: d.legs, head: d.head, walk: 1.5, run: 9, fleeR: 14 }, rng);
    }
    for (let i = 0; i < 26; i++) {
      const p = world.randomLandPoint(rng, (b) => b === "meadow" || b === "forest" || b === "rock");
      const r = buildRabbit(rng);
      r.g.scale.setScalar(0.9 + rng() * 0.4);
      this.add({ group: r.g, kind: "rabbit", x: p.x, z: p.z, legs: r.legs, head: null, walk: 2.2, run: 7.5, fleeR: 8 }, rng);
    }
    // birds
    const wingMat = flat(0xf4f1ea, { side: THREE.DoubleSide });
    const dark = flat(0x4a4f62);
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const bm = i % 3 === 0 ? dark : wingMat;
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 4), bm);
      body.rotation.x = Math.PI / 2;
      g.add(body);
      const mkWing = (s: number) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0.2, 1.1 * s, 0, -0.1, 0, 0, -0.35]), 3));
        geo.setIndex(s > 0 ? [0, 1, 2] : [0, 2, 1]);
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, bm);
        g.add(m);
        return m;
      };
      const wl = mkWing(-1), wr = mkWing(1);
      g.scale.setScalar(1.4);
      this.group.add(g);
      const c = world.randomLandPoint(rng, () => true);
      this.birds.push({ group: g, wl, wr, cx: c.x, cz: c.z, rad: 25 + rng() * 40, alt: 35 + rng() * 40, ang: rng() * 6.28, speed: (rng() > 0.5 ? 1 : -1) * (7 + rng() * 4), phase: rng() * 6 });
    }
  }

  private add(p: { group: THREE.Group; kind: "deer" | "rabbit"; x: number; z: number; legs: THREE.Group[]; head: THREE.Group | null; walk: number; run: number; fleeR: number }, rng: () => number) {
    const a: Animal = { ...p, yaw: rng() * 6.28, rot: rng() * 6.28, state: "idle", timer: rng() * 4, phase: rng() * 6 };
    this.animals.push(a);
    this.group.add(a.group);
  }

  update(dt: number, px: number, pz: number, t: number, day: number) {
    const w = this.world;
    for (const a of this.animals) {
      const dx = a.x - px, dz = a.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 > 170 * 170) { a.group.visible = false; continue; }
      a.group.visible = true;
      const d = Math.sqrt(d2);
      if (d < a.fleeR && a.state !== "flee") {
        a.state = "flee";
        a.timer = 2 + Math.random() * 1.5;
        a.yaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.9;
      }
      a.timer -= dt;
      if (a.timer <= 0) {
        if (a.state === "idle") {
          a.state = "walk";
          a.timer = 2 + Math.random() * 3;
          a.yaw += (Math.random() - 0.5) * 2.5;
        } else {
          a.state = "idle";
          a.timer = 2 + Math.random() * 5;
        }
      }
      let speed = 0;
      if (a.state === "walk") speed = a.walk;
      else if (a.state === "flee") speed = a.run;
      if (speed > 0) {
        const nx = a.x + Math.sin(a.yaw) * speed * dt;
        const nz = a.z + Math.cos(a.yaw) * speed * dt;
        const h = w.height(nx, nz);
        if (h < 1.0 || w.slopeAt(nx, nz) > 0.8 || Math.hypot(nx, nz) > 215) {
          a.yaw += Math.PI * 0.6 + Math.random();
        } else {
          a.x = nx;
          a.z = nz;
        }
      }
      a.rot += wrapAngle(a.yaw - a.rot) * Math.min(1, dt * 6);
      const gy = w.height(a.x, a.z);
      a.phase += dt * (a.kind === "rabbit" ? 10 : speed * 3.2);
      let hop = 0;
      if (a.kind === "rabbit") {
        if (speed > 0) {
          hop = Math.abs(Math.sin(a.phase)) * (a.state === "flee" ? 0.4 : 0.22);
          a.legs.forEach((l) => (l.rotation.x = Math.sin(a.phase) * 0.7));
        } else a.legs.forEach((l) => (l.rotation.x = 0));
      } else {
        const amp = speed > 0 ? (a.state === "flee" ? 0.8 : 0.45) : 0;
        a.legs.forEach((l, i) => (l.rotation.x = Math.sin(a.phase + (i % 2 === (i < 2 ? 0 : 1) ? 0 : Math.PI)) * amp));
        if (a.head) {
          const target = a.state === "idle" ? 0.95 + Math.sin(t * 1.5 + a.x) * 0.08 : a.state === "flee" ? -0.1 : 0.1;
          a.head.rotation.x += (target - a.head.rotation.x) * Math.min(1, dt * 3);
        }
      }
      a.group.position.set(a.x, gy + hop, a.z);
      a.group.rotation.y = a.rot;
    }
    for (const b of this.birds) {
      b.group.visible = day > 0.25;
      if (!b.group.visible) continue;
      b.ang += (b.speed * dt) / b.rad;
      b.phase += dt * 7;
      const x = b.cx + Math.cos(b.ang) * b.rad, z = b.cz + Math.sin(b.ang) * b.rad;
      const y = Math.max(w.height(b.cx, b.cz), 5) + b.alt + Math.sin(b.phase * 0.2) * 2;
      b.group.position.set(x, y, z);
      const sgn = b.speed > 0 ? 1 : -1;
      b.group.rotation.y = Math.atan2(-Math.sin(b.ang) * sgn, Math.cos(b.ang) * sgn);
      b.group.rotation.z = -0.25 * sgn;
      const f = Math.sin(b.phase) * 0.7;
      b.wl.rotation.z = -f;
      b.wr.rotation.z = f;
    }
  }
}
