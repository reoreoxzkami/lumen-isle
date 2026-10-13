import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./noise";

export const timeU = { value: 0 };

// ---------- helpers ----------
function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx, sy, sz));
}

function prep(geo: THREE.BufferGeometry, color: number | string, m?: THREE.Matrix4, jitter = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute("uv");
  if (jitter > 0) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(
        i,
        x + (hash3(x, y, z) - 0.5) * jitter,
        y + (hash3(y + 1.3, z, x) - 0.5) * jitter,
        z + (hash3(z, x + 2.1, y) - 0.5) * jitter
      );
    }
  }
  if (m) g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs, false)!;

export function makeVegMaterial(amt: number) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader =
      "uniform float uTime;\n" +
      sh.vertexShader.replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3( position );
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float ph = uTime * 1.7 + ip.x * 0.21 + ip.z * 0.17;
  float k = max(position.y, 0.0) * ${amt.toFixed(4)};
  transformed.x += sin(ph) * k;
  transformed.z += cos(ph * 0.8) * k * 0.7;
#endif`
      );
  };
  m.customProgramCacheKey = () => "veg" + amt;
  return m;
}

export const flat = (color: number | string, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

export function hdrBasic(r: number, g: number, b: number, extra: THREE.MeshBasicMaterialParameters = {}) {
  const m = new THREE.MeshBasicMaterial(extra);
  m.color.setRGB(r, g, b);
  return m;
}

// ---------- vegetation geometries ----------
export function buildVegGeometries() {
  const cone = (r: number, h: number, seg: number, closed = false) => new THREE.ConeGeometry(r, h, seg, 1, !closed);
  const pine = merge([
    prep(new THREE.CylinderGeometry(0.16, 0.24, 1.4, 5), 0x6b4a32, M(0, 0.7, 0)),
    prep(cone(1.5, 2.2, 6, true), 0x2c7648, M(0, 2.0, 0), 0.12),
    prep(cone(1.2, 2.0, 6), 0x368a55, M(0, 3.1, 0), 0.1),
    prep(cone(0.85, 1.8, 6), 0x44a066, M(0, 4.2, 0), 0.08),
  ]);
  const snowPine = merge([
    prep(new THREE.CylinderGeometry(0.16, 0.24, 1.4, 5), 0x5d4333, M(0, 0.7, 0)),
    prep(cone(1.5, 2.2, 6, true), 0x3c7a60, M(0, 2.0, 0), 0.12),
    prep(cone(1.2, 2.0, 6), 0xbcd6de, M(0, 3.1, 0), 0.1),
    prep(cone(0.85, 1.8, 6), 0xf4fbff, M(0, 4.2, 0), 0.08),
  ]);
  const blobTree = (trunk: number, c1: number, c2: number, c3: number) =>
    merge([
      prep(new THREE.CylinderGeometry(0.2, 0.3, 1.9, 6), trunk, M(0, 0.95, 0)),
      prep(new THREE.IcosahedronGeometry(1.5, 0), c1, M(0, 3.0, 0, 0, 0.5, 0), 0.25),
      prep(new THREE.IcosahedronGeometry(1.05, 0), c2, M(0.8, 3.7, 0.3, 0, 1, 0), 0.2),
      prep(new THREE.IcosahedronGeometry(1.0, 0), c3, M(-0.8, 2.7, -0.4, 0, 2, 0), 0.2),
    ]);
  const oak = blobTree(0x74503a, 0x5bb04a, 0x6dc558, 0x4c9e43);
  const cherry = blobTree(0x5e4034, 0xf6b3cc, 0xfbc9da, 0xf08fb5);

  const palmParts: THREE.BufferGeometry[] = [];
  let tx = 0;
  for (let i = 0; i < 4; i++) {
    palmParts.push(prep(new THREE.CylinderGeometry(0.15 - i * 0.015, 0.18 - i * 0.015, 0.9, 5), 0x8a6a48, M(tx, 0.45 + i * 0.85, 0, 0, 0, -0.12)));
    tx += 0.1;
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const m = new THREE.Matrix4()
      .multiply(M(tx, 3.5, 0))
      .multiply(M(0, 0, 0, 0, a, 0))
      .multiply(M(0, 0, 0, 0, 0, -0.45))
      .multiply(M(1.0, 0, 0));
    palmParts.push(prep(new THREE.BoxGeometry(2.1, 0.05, 0.55), i % 2 ? 0x3fa85a : 0x52c26d, m, 0.05));
  }
  const palm = merge(palmParts);

  const cactus = merge([
    prep(new THREE.CylinderGeometry(0.32, 0.38, 3, 6), 0x4aa268, M(0, 1.5, 0)),
    prep(new THREE.CylinderGeometry(0.17, 0.17, 0.9, 5), 0x4aa268, M(0.6, 1.4, 0, 0, 0, Math.PI / 2)),
    prep(new THREE.CylinderGeometry(0.17, 0.2, 1.0, 5), 0x4aa268, M(1.05, 1.9, 0)),
    prep(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 5), 0x4aa268, M(-0.5, 1.9, 0, 0, 0, Math.PI / 2)),
    prep(new THREE.CylinderGeometry(0.15, 0.17, 0.8, 5), 0x4aa268, M(-0.85, 2.25, 0)),
  ]);
  const rock = prep(new THREE.DodecahedronGeometry(1, 0), 0x9a9ca4, M(0, 0.3, 0, 0, 0, 0, 1, 0.75, 0.9), 0.22);
  const blade = (x: number, z: number, h: number, tilt: number, a: number) =>
    prep(new THREE.ConeGeometry(0.09, h, 3, 1, true), 0x6bbf45, M(x, h / 2, z, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt));
  const grass = merge([blade(0, 0, 0.9, 0.15, 0), blade(0.12, 0.05, 0.7, 0.3, 1), blade(-0.1, 0.08, 0.8, 0.3, 2.4), blade(0.02, -0.12, 0.6, 0.35, 4)]);
  const flower = merge([
    prep(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 4), 0x4a9a44, M(0, 0.25, 0)),
    prep(new THREE.IcosahedronGeometry(0.14, 0), 0xffffff, M(0, 0.55, 0)),
  ]);
  const bush = prep(new THREE.IcosahedronGeometry(0.8, 0), 0x4d9c46, M(0, 0.5, 0, 0, 0, 0, 1, 0.75, 1), 0.15);
  const pillar = merge([
    prep(new THREE.BoxGeometry(1.3, 0.35, 1.3), 0xb9b2a2, M(0, 0.175, 0)),
    prep(new THREE.CylinderGeometry(0.46, 0.52, 3.6, 6), 0xd3ccbb, M(0, 2.15, 0), 0.05),
    prep(new THREE.BoxGeometry(1.1, 0.3, 1.1), 0xc3bcab, M(0, 4.1, 0)),
  ]);
  return { pine, snowPine, oak, cherry, palm, cactus, rock, grass, flower, bush, pillar };
}

// ---------- character ----------
export interface PlayerRig {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  scarf1: THREE.Group;
  scarf2: THREE.Group;
  glider: THREE.Group;
  lantern: THREE.PointLight;
  head: THREE.Group;
}

export function buildPlayer(): PlayerRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const teal = flat(0x2e8b9a), navy = flat(0x3a3f5c), boot = flat(0x5a3b2a), skin = flat(0xf2c8a0);
  const coral = flat(0xe86a4a, { side: THREE.DoubleSide }), gold = flat(0xffc84a, { side: THREE.DoubleSide });

  const mkLeg = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.85, 0);
    add(g, new THREE.BoxGeometry(0.2, 0.8, 0.22), navy, 0, -0.4, 0);
    add(g, new THREE.BoxGeometry(0.23, 0.2, 0.32), boot, 0, -0.74, 0.04);
    body.add(g);
    return g;
  };
  const legL = mkLeg(-0.13), legR = mkLeg(0.13);
  add(body, new THREE.BoxGeometry(0.52, 0.62, 0.3), teal, 0, 1.15, 0);
  add(body, new THREE.BoxGeometry(0.54, 0.08, 0.32), boot, 0, 0.88, 0);
  const cape = add(body, new THREE.BoxGeometry(0.56, 0.95, 0.05), coral, 0, 1.05, -0.2);
  cape.rotation.x = 0.12;

  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  body.add(head);
  add(head, new THREE.IcosahedronGeometry(0.22, 1), skin, 0, 0, 0);
  add(head, new THREE.IcosahedronGeometry(0.235, 0), flat(0x3b2a22), 0, 0.05, -0.04).scale.set(1, 0.85, 1);
  add(head, new THREE.CylinderGeometry(0.42, 0.42, 0.04, 8), coral, 0, 0.17, 0);
  add(head, new THREE.ConeGeometry(0.25, 0.5, 7), coral, 0, 0.42, 0).rotation.x = -0.15;
  const eyeM = flat(0x20242c);
  add(head, new THREE.BoxGeometry(0.04, 0.06, 0.02), eyeM, -0.08, 0.0, 0.21);
  add(head, new THREE.BoxGeometry(0.04, 0.06, 0.02), eyeM, 0.08, 0.0, 0.21);

  const mkArm = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 1.4, 0);
    add(g, new THREE.BoxGeometry(0.14, 0.55, 0.14), teal, 0, -0.27, 0);
    add(g, new THREE.BoxGeometry(0.12, 0.12, 0.12), skin, 0, -0.6, 0);
    body.add(g);
    return g;
  };
  const armL = mkArm(-0.34), armR = mkArm(0.34);

  // lantern
  const lant = new THREE.Group();
  lant.position.set(0.04, -0.72, 0.1);
  armR.add(lant);
  add(lant, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 6), flat(0x2a2a2a), 0, 0.13, 0);
  const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), hdrBasic(2.4, 1.7, 0.8));
  lant.add(glow);
  const lantern = new THREE.PointLight(0xffc27a, 0, 16, 2);
  lant.add(lantern);

  // scarf
  const sc = new THREE.Group();
  sc.position.set(0, 1.42, -0.12);
  body.add(sc);
  add(sc, new THREE.BoxGeometry(0.4, 0.1, 0.34), gold, 0, 0, 0.1);
  const scarf1 = new THREE.Group();
  sc.add(scarf1);
  add(scarf1, new THREE.BoxGeometry(0.13, 0.04, 0.7), gold, 0, 0, -0.38);
  const scarf2 = new THREE.Group();
  scarf2.position.set(0, 0, -0.74);
  scarf1.add(scarf2);
  add(scarf2, new THREE.BoxGeometry(0.13, 0.04, 0.6), flat(0xffa43a, { side: THREE.DoubleSide }), 0, 0, -0.3);

  // glider
  const glider = new THREE.Group();
  glider.position.set(0, 1.35, -0.1);
  glider.visible = false;
  body.add(glider);
  const wingGeo = (s: number) => {
    const g = new THREE.BufferGeometry();
    const v = [0.2 * s, 0.1, 0.3, 2.0 * s, -0.15, -0.3, 1.7 * s, -0.15, -1.4, 0.2 * s, 0.05, -1.0];
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(v), 3));
    g.setIndex(s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    return g;
  };
  const wingMat = flat(0xffb347, { side: THREE.DoubleSide });
  const wl = new THREE.Mesh(wingGeo(-1), wingMat);
  const wr = new THREE.Mesh(wingGeo(1), wingMat);
  wl.castShadow = wr.castShadow = true;
  glider.add(wl, wr);
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.3), flat(0x7a4a2a));
  rib.position.set(0, 0, -0.5);
  glider.add(rib);

  return { root, body, legL, legR, armL, armR, scarf1, scarf2, glider, lantern, head };
}

// ---------- beacon ----------
export interface BeaconView {
  group: THREE.Group;
  crystalPos: THREE.Vector3;
  setLit: (lit: boolean) => void;
  update: (t: number) => void;
  lit: boolean;
}

export function buildBeacon(hdr: [number, number, number]): BeaconView {
  const group = new THREE.Group();
  const stone = flat(0x8d8a86), stone2 = flat(0xa8a49c), stone3 = flat(0x9a968e);
  const addM = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  addM(new THREE.CylinderGeometry(3.4, 3.8, 0.6, 8), stone, 0, 0.1, 0);
  addM(new THREE.CylinderGeometry(2.5, 2.7, 0.5, 8), stone3, 0, 0.6, 0);
  addM(new THREE.CylinderGeometry(0.6, 1.0, 6.5, 6), stone2, 0, 4.1, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const p = addM(new THREE.BoxGeometry(0.55, 2.6 - (k % 2) * 0.8, 0.55), stone3, Math.cos(a) * 2.1, 1.9 - (k % 2) * 0.4, Math.sin(a) * 2.1);
    p.rotation.set(Math.sin(a) * 0.08, a, -Math.cos(a) * 0.08);
  }
  const runeMat = new THREE.MeshBasicMaterial({ color: 0x2a3038 });
  const crystalMat = new THREE.MeshBasicMaterial({ color: 0x39424f });
  for (let i = 0; i < 3; i++) {
    const r = addM(new THREE.CylinderGeometry(0.66 + (2 - i) * 0.08, 0.7 + (2 - i) * 0.08, 0.12, 6), runeMat, 0, 2.2 + i * 1.5, 0);
    r.castShadow = false;
  }
  const crystal = addM(new THREE.OctahedronGeometry(0.9, 0), crystalMat, 0, 8.6, 0);
  crystal.scale.set(1, 1.6, 1);
  crystal.castShadow = false;
  const halo = addM(new THREE.TorusGeometry(1.6, 0.05, 4, 24), crystalMat, 0, 8.6, 0);
  halo.castShadow = false;
  halo.rotation.x = Math.PI / 2.4;

  const beamMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  beamMat.color.setRGB(hdr[0] * 0.5, hdr[1] * 0.5, hdr[2] * 0.5);
  const beam = addM(new THREE.CylinderGeometry(0.7, 1.3, 220, 10, 1, true), beamMat, 0, 118, 0);
  beam.castShadow = beam.receiveShadow = false;
  beam.visible = false;
  const ringMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  ringMat.color.setRGB(hdr[0] * 0.8, hdr[1] * 0.8, hdr[2] * 0.8);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const r = addM(new THREE.TorusGeometry(5, 0.09, 4, 28), ringMat, 0, 0, 0);
    r.rotation.x = Math.PI / 2;
    r.castShadow = false;
    r.visible = false;
    rings.push(r);
  }
  const view: BeaconView = {
    group,
    crystalPos: new THREE.Vector3(0, 8.6, 0),
    lit: false,
    setLit(lit) {
      view.lit = lit;
      if (lit) {
        runeMat.color.setRGB(hdr[0], hdr[1], hdr[2]);
        crystalMat.color.setRGB(hdr[0] * 1.3, hdr[1] * 1.3, hdr[2] * 1.3);
      } else {
        runeMat.color.set(0x2a3038);
        crystalMat.color.set(0x39424f);
      }
      beam.visible = lit;
      rings.forEach((r) => (r.visible = lit));
      beamMat.opacity = lit ? 0.16 : 0;
      ringMat.opacity = lit ? 0.55 : 0;
    },
    update(t) {
      crystal.position.y = 8.6 + Math.sin(t * 1.5) * 0.25;
      halo.position.y = crystal.position.y;
      crystal.rotation.y = t * 0.8;
      halo.rotation.z = t * 0.6;
      if (view.lit) {
        rings.forEach((r, i) => {
          const f = (t * 0.22 + i / rings.length) % 1;
          r.position.y = 1 + f * 48;
          r.scale.setScalar(1 - f * 0.25);
          r.visible = true;
        });
        beamMat.opacity = 0.14 + Math.sin(t * 2) * 0.03;
      }
    },
  };
  view.setLit(false);
  return view;
}

// ---------- memory stone ----------
export interface StoneView { group: THREE.Group; setRead: (r: boolean) => void; update: (t: number) => void }
export function buildStone(): StoneView {
  const group = new THREE.Group();
  const mat = flat(0x8f9aa6);
  const mono = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.75, 2.4, 5), mat);
  mono.position.y = 1.2;
  mono.castShadow = true;
  group.add(mono);
  const base = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), flat(0x7a838d));
  base.position.set(0.5, 0.2, 0.4);
  base.scale.set(1, 0.4, 1);
  group.add(base);
  const runeMat = hdrBasic(0.6, 1.6, 2.2);
  const rune = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.04), runeMat);
  rune.position.set(0, 1.4, 0.56);
  rune.rotation.x = -0.1;
  group.add(rune);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), runeMat);
  gem.position.y = 3.0;
  group.add(gem);
  return {
    group,
    setRead(r) {
      if (r) runeMat.color.setRGB(0.25, 0.45, 0.6);
      else runeMat.color.setRGB(0.6, 1.6, 2.2);
    },
    update(t) {
      gem.position.y = 3.0 + Math.sin(t * 2) * 0.12;
      gem.rotation.y = t;
    },
  };
}

// ---------- spire ----------
export interface SpireView { group: THREE.Group; setAwake: (a: number) => void; update: (t: number) => void; crystalY: number }
export function buildSpire(): SpireView {
  const group = new THREE.Group();
  const s1 = flat(0xb6b1a6), s2 = flat(0x9d98b4), s3 = flat(0xc9c3d8);
  const addM = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  addM(new THREE.CylinderGeometry(5.2, 6.2, 1.2, 8), s1, 0, 0.3, 0);
  addM(new THREE.CylinderGeometry(3.8, 4.4, 1.0, 8), s2, 0, 1.2, 0);
  addM(new THREE.CylinderGeometry(2.2, 3.2, 9, 8), s3, 0, 6.2, 0);
  addM(new THREE.CylinderGeometry(1.4, 2.1, 8, 7), s2, 0, 14.8, 0);
  addM(new THREE.CylinderGeometry(0.4, 1.3, 6, 6), s3, 0, 21.8, 0);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const f = addM(new THREE.BoxGeometry(0.5, 7 + (k % 2) * 3, 1.4), s1, Math.cos(a) * 3.6, 4.5 + (k % 2) * 1.5, Math.sin(a) * 3.6);
    f.rotation.y = -a;
    f.rotation.z = 0.0;
  }
  const mat = new THREE.MeshBasicMaterial({ color: 0x3a3450 });
  const crystal = addM(new THREE.OctahedronGeometry(2.0, 0), mat, 0, 28, 0);
  crystal.scale.set(1, 1.7, 1);
  crystal.castShadow = false;
  const orbs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const o = addM(new THREE.OctahedronGeometry(0.5, 0), mat, 0, 28, 0);
    o.castShadow = false;
    orbs.push(o);
  }
  const bandMat = new THREE.MeshBasicMaterial({ color: 0x2c2a3a });
  [8, 13, 18].forEach((y, i) => {
    const b = addM(new THREE.CylinderGeometry(2.3 - i * 0.55, 2.3 - i * 0.55 + 0.05, 0.18, 8), bandMat, 0, y, 0);
    b.castShadow = false;
  });
  const beamMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  beamMat.color.setRGB(1.6, 1.4, 1.0);
  const beam = addM(new THREE.CylinderGeometry(1.2, 2.4, 320, 12, 1, true), beamMat, 0, 190, 0);
  beam.castShadow = false;
  beam.visible = false;
  let awake = 0;
  return {
    group,
    crystalY: 28,
    setAwake(a) {
      awake = a;
      const c = 0.22 + a * 2.4;
      mat.color.setRGB(c * 1.0, c * 0.85, c * 0.6 + 0.1);
      bandMat.color.setRGB(0.17 + a * 1.4, 0.16 + a * 1.2, 0.22 + a * 0.9);
      beam.visible = a > 0.01;
      beamMat.opacity = 0.2 * a;
    },
    update(t) {
      crystal.position.y = 28 + Math.sin(t * 1.2) * 0.4;
      crystal.rotation.y = t * 0.5;
      orbs.forEach((o, i) => {
        const a = t * (0.4 + awake * 0.5) + (i / orbs.length) * Math.PI * 2;
        o.position.set(Math.cos(a) * 4.2, 28 + Math.sin(a * 2 + i) * 1.5, Math.sin(a) * 4.2);
        o.rotation.y = t * 2;
      });
    },
  };
}

// ---------- campfire / tent ----------
export interface CampView { group: THREE.Group; light: THREE.PointLight; update: (t: number, night: number) => void }
export function buildCamp(): CampView {
  const group = new THREE.Group();
  const logMat = flat(0x6b4a32), stoneMat = flat(0x8a8d93);
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 5), logMat);
    l.position.y = 0.15;
    l.rotation.set(Math.PI / 2 - 0.3, (i / 4) * Math.PI * 2, 0);
    l.castShadow = true;
    group.add(l);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), stoneMat);
    r.position.set(Math.cos(a) * 0.85, 0.1, Math.sin(a) * 0.85);
    r.castShadow = true;
    group.add(r);
  }
  const flameMat = hdrBasic(2.4, 1.1, 0.25);
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.3 - i * 0.07, 1.0 - i * 0.15, 5), flameMat);
    f.position.set((i - 1) * 0.12, 0.6, (i % 2) * 0.1);
    group.add(f);
    flames.push(f);
  }
  const tent = new THREE.Mesh(new THREE.ConeGeometry(2.3, 2.0, 4), flat(0xd9834b));
  tent.position.set(-3.6, 1.0, -1.8);
  tent.rotation.y = Math.PI / 4 + 0.4;
  tent.castShadow = true;
  group.add(tent);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), flat(0x3a2a24, { side: THREE.DoubleSide }));
  door.position.set(-3.6 + Math.sin(0.4 + Math.PI / 4 + Math.PI / 4) * 1.1, 0.65, -1.8 + Math.cos(0.4 + Math.PI / 2) * 1.1);
  door.visible = false;
  group.add(door);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.4, 6), logMat);
  seat.position.set(1.7, 0.2, 0.6);
  seat.castShadow = true;
  group.add(seat);
  const seat2 = seat.clone();
  seat2.position.set(0.9, 0.2, 1.8);
  group.add(seat2);
  const light = new THREE.PointLight(0xff9a4a, 3, 22, 2);
  light.position.set(0, 1.0, 0);
  group.add(light);
  return {
    group,
    light,
    update(t, night) {
      const f = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
      light.intensity = (2.5 + night * 8) * f;
      flames.forEach((m, i) => {
        m.scale.set(1, 0.85 + Math.sin(t * 10 + i * 2) * 0.2, 1);
        m.rotation.y = t * 2 + i;
      });
    },
  };
}

// ---------- sky ----------
export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color() },
      bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() },
    },
    vertexShader: `varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
void main(){
  float h = clamp(vDir.y, -0.2, 1.0);
  float t = pow(max(h,0.0), 0.55);
  vec3 c = mix(bottom, top, t);
  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  c += sunColor * (pow(s, 6.0) * 0.18 + pow(s, 48.0) * 0.35);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, mat };
}

export function buildStars() {
  const n = 1000;
  const pos = new Float32Array(n * 3);
  const rng = mulberry32(99);
  for (let i = 0; i < n; i++) {
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2;
    const y = Math.abs(u) * 0.95 + 0.05;
    const r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * r * 900;
    pos[i * 3 + 1] = y * 900;
    pos[i * 3 + 2] = Math.sin(a) * r * 900;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = -9;
  return p;
}

export function buildAurora() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { time: { value: 0 }, intensity: { value: 0 } },
    vertexShader: `varying vec2 vUv; uniform float time;
void main(){ vUv = uv; vec3 p = position; p.z += sin(p.x*0.012 + time*0.15)*120.0; p.y += sin(p.x*0.02 + time*0.3)*18.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float time; uniform float intensity;
void main(){
  float band = 0.5 + 0.5*sin(vUv.x*40.0 + time*0.6 + sin(vUv.x*9.0 + time*0.2)*2.5);
  float fade = smoothstep(0.0, 0.12, vUv.y) * pow(1.0 - vUv.y, 1.6);
  vec3 c = mix(vec3(0.2,1.2,0.6), vec3(0.7,0.35,1.3), vUv.y);
  gl_FragColor = vec4(c * (0.4 + band*0.9) * fade * intensity, 1.0);
}`,
  });
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1400, 190, 90, 1), mat);
    m.position.set(0, 330 + i * 40, -520 - i * 160);
    m.rotation.y = i * 0.35;
    m.frustumCulled = false;
    m.renderOrder = -8;
    g.add(m);
  }
  return { group: g, mat };
}

export function buildClouds(count: number) {
  const rng = mulberry32(5150);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x303848 });
  const group = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < count; i++) {
    const c = new THREE.Group();
    const n = 4 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(geo, mat);
      const s = 9 + rng() * 10;
      m.scale.set(s * 1.5, s * 0.6, s);
      m.position.set((k - n / 2) * 12 + rng() * 6, rng() * 4, (rng() - 0.5) * 10);
      c.add(m);
    }
    c.position.set((rng() - 0.5) * 1000, 120 + rng() * 60, (rng() - 0.5) * 1000);
    c.userData.speed = 2 + rng() * 2;
    group.add(c);
  }
  return { group, mat };
}

// ---------- water ----------
export const WATER_SIZE = 1200;
export const WATER_SEG = 150;
export function buildWater() {
  const geo = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEG, WATER_SEG);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({ color: 0x3fa7d6, transparent: true, opacity: 0.82, flatShading: true, shininess: 90, specular: 0x99bbdd });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return { mesh, mat };
}
export const waveH = (x: number, z: number, t: number) =>
  Math.sin(x * 0.09 + t * 0.9) * 0.1 + Math.sin(z * 0.07 - t * 0.7) * 0.09 + Math.sin((x + z) * 0.15 + t * 1.3) * 0.05 - 0.05;

// ---------- particles ----------
export class Particles {
  points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private col: Float32Array;
  private base: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private grav: Float32Array;
  private head = 0;
  constructor(n = 500) {
    this.n = n;
    this.pos = new Float32Array(n * 3).fill(-9999);
    this.col = new Float32Array(n * 3);
    this.base = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.grav = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, life: number, grav = 0) {
    const i = this.head;
    this.head = (this.head + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.base[i * 3] = r; this.base[i * 3 + 1] = g; this.base[i * 3 + 2] = b;
    this.life[i] = life; this.max[i] = life; this.grav[i] = grav;
  }
  burst(x: number, y: number, z: number, count: number, speed: number, r: number, g: number, b: number, life = 1, grav = 2) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y, z, Math.cos(a) * s * sp, u * sp + speed * 0.3, Math.sin(a) * s * sp, r, g, b, life * (0.6 + Math.random() * 0.6), grav);
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -9999;
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.max[i];
      this.col[i * 3] = this.base[i * 3] * f;
      this.col[i * 3 + 1] = this.base[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

// ---------- ambient motes (pollen by day, fireflies at night) ----------
export class Motes {
  points: THREE.Points;
  private n = 110;
  private seed: Float32Array;
  private pos: Float32Array;
  constructor() {
    this.pos = new Float32Array(this.n * 3);
    this.seed = new Float32Array(this.n * 3);
    for (let i = 0; i < this.seed.length; i++) this.seed[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.PointsMaterial({ size: 0.28, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
  }
  update(t: number, cx: number, cy: number, cz: number, night: number, rain: number, groundAt: (x: number, z: number) => number) {
    const R = 28;
    for (let i = 0; i < this.n; i++) {
      const sx = this.seed[i * 3], sy = this.seed[i * 3 + 1], sz = this.seed[i * 3 + 2];
      const ox = ((sx * 2 * R + t * (0.6 + sy) * 0.8 + Math.sin(t * 0.7 + sz * 20) * 1.5) % (2 * R)) - R;
      const oz = ((sz * 2 * R + Math.cos(t * 0.5 + sx * 15) * 1.5) % (2 * R)) - R;
      const x = cx + ox, z = cz + oz;
      const gy = Math.max(groundAt(x, z), 0);
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = gy + 0.6 + sy * 4 + Math.sin(t * 1.2 + sx * 30) * 0.5;
      this.pos[i * 3 + 2] = z;
    }
    void cy;
    this.points.geometry.attributes.position.needsUpdate = true;
    const m = this.points.material as THREE.PointsMaterial;
    m.opacity = (0.35 + night * 0.65) * (1 - rain);
    m.size = 0.2 + night * 0.25;
    m.color.setRGB(1.0 + night * 0.2, 0.95 + night * 0.9, 0.7 - night * 0.2 + 0.2 * (1 - night));
  }
}

// ---------- rain ----------
export class Rain {
  lines: THREE.LineSegments;
  private n = 1600;
  private pos: Float32Array;
  private off: Float32Array;
  constructor() {
    this.pos = new Float32Array(this.n * 6);
    this.off = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      this.off[i * 3] = (Math.random() - 0.5) * 50;
      this.off[i * 3 + 1] = Math.random() * 30;
      this.off[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.LineBasicMaterial({ color: 0xbfd6f0, transparent: true, opacity: 0.0, depthWrite: false });
    this.lines = new THREE.LineSegments(g, m);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
  }
  update(dt: number, cx: number, cy: number, cz: number, amount: number, snow: boolean) {
    this.lines.visible = amount > 0.02;
    if (!this.lines.visible) return;
    const speed = snow ? 5 : 32;
    const len = snow ? 0.18 : 1.1;
    const count = Math.floor(this.n * Math.min(1, amount));
    for (let i = 0; i < this.n; i++) {
      this.off[i * 3 + 1] -= speed * dt * (0.8 + (i % 7) * 0.05);
      if (this.off[i * 3 + 1] < -6) {
        this.off[i * 3 + 1] += 34;
        this.off[i * 3] = (Math.random() - 0.5) * 50;
        this.off[i * 3 + 2] = (Math.random() - 0.5) * 50;
      }
      const vis = i < count;
      const x = cx + this.off[i * 3] + (snow ? Math.sin(this.off[i * 3 + 1] * 0.8 + i) * 0.5 : 0);
      const y = cy + this.off[i * 3 + 1];
      const z = cz + this.off[i * 3 + 2];
      const k = i * 6;
      this.pos[k] = x; this.pos[k + 1] = vis ? y : -9999; this.pos[k + 2] = z;
      this.pos[k + 3] = x + (snow ? 0 : 0.15); this.pos[k + 4] = vis ? y + len : -9999; this.pos[k + 5] = z;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    const m = this.lines.material as THREE.LineBasicMaterial;
    m.opacity = Math.min(0.45, amount * 0.5);
    m.color.set(snow ? 0xffffff : 0xbfd6f0);
  }
}
