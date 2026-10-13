import * as THREE from 'three';

// Pre-programmed objects, built from simple shapes at real-world size (metres).
// Wall items are centred on their middle with their back at z = 0.
// Floor items sit on y = 0 with their back at z = 0 (against the wall).

const TAU = Math.PI * 2;

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

// Small deterministic random so every build of an object looks the same.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const BOOK_COLORS = [0x8e3b2f, 0x2f4f6e, 0xd9b44a, 0x4d6b4a, 0x6b4a6b, 0xe8e1d0, 0x2b2b2b, 0xb86b3c];

// ---------- wall items ----------

function buildClock() {
  const g = new THREE.Group();
  const R = 0.15;
  const rimGeo = new THREE.CylinderGeometry(R, R, 0.045, 64).rotateX(Math.PI / 2);
  g.add(mesh(rimGeo, M(0x262626, { roughness: 0.35, metalness: 0.4 }), 0, 0, 0.0225));
  const faceGeo = new THREE.CylinderGeometry(R - 0.014, R - 0.014, 0.004, 64).rotateX(Math.PI / 2);
  g.add(mesh(faceGeo, M(0xf6f1e7, { roughness: 0.9 }), 0, 0, 0.046));

  const tickM = M(0x1d1d1d);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const major = i % 3 === 0;
    const t = box(major ? 0.008 : 0.004, major ? 0.026 : 0.014, 0.003, tickM, Math.sin(a) * (R - 0.03), Math.cos(a) * (R - 0.03), 0.049);
    t.rotation.z = -a;
    g.add(t);
  }
  const hand = (len, wid, color, z) => {
    const pivot = new THREE.Group();
    pivot.position.z = z;
    const geo = new THREE.BoxGeometry(wid, len, 0.002);
    geo.translate(0, len / 2 - 0.015, 0);
    pivot.add(new THREE.Mesh(geo, M(color)));
    g.add(pivot);
    return pivot;
  };
  const hourH = hand(0.07, 0.009, 0x1d1d1d, 0.051);
  const minH = hand(0.105, 0.006, 0x1d1d1d, 0.053);
  const secH = hand(0.115, 0.0025, 0xc0392b, 0.055);
  const capGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.006, 24).rotateX(Math.PI / 2);
  g.add(mesh(capGeo, M(0xc0392b), 0, 0, 0.057));

  // Shows the real time.
  g.userData.update = () => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    secH.rotation.z = (-s / 60) * TAU;
    minH.rotation.z = (-m / 60) * TAU;
    hourH.rotation.z = (-h / 12) * TAU;
  };
  g.userData.update();
  return g;
}

function artTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 384);
  sky.addColorStop(0, '#f2b880');
  sky.addColorStop(0.55, '#e2725b');
  sky.addColorStop(1, '#5b3a5e');
  x.fillStyle = sky;
  x.fillRect(0, 0, 512, 384);
  x.fillStyle = '#fbe3a1';
  x.beginPath();
  x.arc(330, 170, 52, 0, TAU);
  x.fill();
  const ridge = (color, base, amp, seed) => {
    const r = rng(seed);
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(0, 384);
    for (let i = 0; i <= 16; i++) x.lineTo((i / 16) * 512, base - r() * amp);
    x.lineTo(512, 384);
    x.closePath();
    x.fill();
  };
  ridge('#7a4a6b', 250, 70, 3);
  ridge('#4a3457', 300, 60, 7);
  ridge('#2a2238', 345, 40, 11);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildPainting() {
  const g = new THREE.Group();
  const W = 0.8, H = 0.6, F = 0.045, D = 0.035;
  const fm = M(0x8a6a3d, { roughness: 0.45, metalness: 0.25 });
  g.add(box(W, F, D, fm, 0, H / 2 - F / 2, D / 2));
  g.add(box(W, F, D, fm, 0, -H / 2 + F / 2, D / 2));
  g.add(box(F, H - 2 * F, D, fm, -W / 2 + F / 2, 0, D / 2));
  g.add(box(F, H - 2 * F, D, fm, W / 2 - F / 2, 0, D / 2));
  g.add(box(W - 2 * F, H - 2 * F, 0.01, M(0xeeeeee), 0, 0, 0.005));
  const art = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * F, H - 2 * F), M(0xffffff, { map: artTexture(), roughness: 0.85 }));
  art.position.z = 0.0105;
  g.add(art);
  return g;
}

function buildMirror() {
  const g = new THREE.Group();
  const frameGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.03, 72).rotateX(Math.PI / 2).scale(1, 1.8, 1);
  g.add(mesh(frameGeo, M(0xb08d57, { metalness: 0.8, roughness: 0.3 }), 0, 0, 0.015));
  const glassGeo = new THREE.CylinderGeometry(0.225, 0.225, 0.004, 72).rotateX(Math.PI / 2).scale(1, 1.8, 1);
  g.add(mesh(glassGeo, M(0xdfe7ea, { metalness: 1, roughness: 0.05 }), 0, 0, 0.031));
  return g;
}

function buildShelf() {
  const g = new THREE.Group();
  const wood = M(0xc69c6d, { roughness: 0.6 });
  g.add(box(0.9, 0.03, 0.22, wood, 0, 0, 0.11));
  const bracket = M(0x2b2b2b, { metalness: 0.6, roughness: 0.4 });
  g.add(box(0.02, 0.1, 0.02, bracket, -0.32, -0.065, 0.01));
  g.add(box(0.02, 0.02, 0.18, bracket, -0.32, -0.025, 0.09));
  g.add(box(0.02, 0.1, 0.02, bracket, 0.32, -0.065, 0.01));
  g.add(box(0.02, 0.02, 0.18, bracket, 0.32, -0.025, 0.09));
  const r = rng(5);
  let x = -0.4;
  for (let i = 0; i < 9; i++) {
    const w = 0.025 + r() * 0.02;
    const h = 0.16 + r() * 0.08;
    g.add(box(w, h, 0.16, M(BOOK_COLORS[i % BOOK_COLORS.length]), x + w / 2, 0.015 + h / 2, 0.1));
    x += w + 0.003;
  }
  const potGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.09, 24);
  g.add(mesh(potGeo, M(0xe8e1d0), 0.3, 0.06, 0.1));
  g.add(mesh(new THREE.SphereGeometry(0.06, 16, 12), M(0x4d7a46), 0.3, 0.14, 0.1));
  return g;
}

// ---------- floor items ----------

function buildDresser() {
  const g = new THREE.Group();
  const wood = M(0xe9dfcf, { roughness: 0.55 });
  const top = M(0xb07a4a, { roughness: 0.5 });
  const W = 1.2, H = 0.8, D = 0.5, LEG = 0.08;
  g.add(box(W, H - LEG - 0.03, D, wood, 0, LEG + (H - LEG - 0.03) / 2, D / 2));
  g.add(box(W + 0.02, 0.03, D + 0.01, top, 0, H - 0.015, (D + 0.01) / 2));
  const legM = M(0x6b4a2f);
  for (const lx of [-W / 2 + 0.05, W / 2 - 0.05]) {
    for (const lz of [0.05, D - 0.05]) {
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.012, LEG, 12), legM, lx, LEG / 2, lz));
    }
  }
  const front = M(0xf3ece0, { roughness: 0.5 });
  const knob = M(0xb08d57, { metalness: 0.8, roughness: 0.3 });
  const bodyH = H - LEG - 0.03;
  const rows = 3, cols = 2, gap = 0.012;
  const dw = (W - gap * (cols + 1)) / cols;
  const dh = (bodyH - gap * (rows + 1)) / rows;
  for (let rI = 0; rI < rows; rI++) {
    for (let c = 0; c < cols; c++) {
      const x = -W / 2 + gap + dw / 2 + c * (dw + gap);
      const y = LEG + gap + dh / 2 + rI * (dh + gap);
      g.add(box(dw, dh, 0.012, front, x, y, D + 0.006));
      g.add(mesh(new THREE.SphereGeometry(0.014, 16, 12), knob, x, y, D + 0.02));
    }
  }
  return g;
}

function buildBookshelf() {
  const g = new THREE.Group();
  const wood = M(0x7a5638, { roughness: 0.6 });
  const W = 0.8, H = 1.8, D = 0.3, T = 0.02;
  g.add(box(T, H, D, wood, -W / 2 + T / 2, H / 2, D / 2));
  g.add(box(T, H, D, wood, W / 2 - T / 2, H / 2, D / 2));
  g.add(box(W, H, 0.01, M(0x5e4129), 0, H / 2, 0.005));
  const levels = 5;
  const r = rng(9);
  for (let i = 0; i < levels; i++) {
    const y = T / 2 + (i * (H - T)) / (levels - 1);
    g.add(box(W - 2 * T, T, D - 0.01, wood, 0, y, D / 2));
    if (i === levels - 1) continue;
    let x = -W / 2 + T + 0.01;
    while (x < W / 2 - T - 0.06) {
      if (r() < 0.15) { x += 0.05 + r() * 0.08; continue; }
      const w = 0.02 + r() * 0.025;
      const h = 0.2 + r() * 0.12;
      g.add(box(w, h, 0.2, M(BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)]), x + w / 2, y + T / 2 + h / 2, 0.13));
      x += w + 0.002;
    }
  }
  return g;
}

function buildPlant() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.32, 40), M(0xb5653a, { roughness: 0.8 }), 0, 0.16, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 40), M(0xa65a32, { roughness: 0.8 }), 0, 0.315, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.01, 32), M(0x3b2a1e), 0, 0.33, 0));
  const r = rng(21);
  const greens = [0x3f7d3a, 0x4f9147, 0x2f6b34];
  for (let i = 0; i < 11; i++) {
    const pivot = new THREE.Group();
    pivot.position.y = 0.33;
    pivot.rotation.y = i * 2.39996;
    pivot.rotation.x = 0.25 + r() * 0.55;
    const len = 0.35 + r() * 0.3;
    pivot.add(mesh(new THREE.CylinderGeometry(0.006, 0.008, len, 6), M(0x4a6b33), 0, len / 2, 0));
    const leafGeo = new THREE.SphereGeometry(0.1, 16, 12).scale(0.55, 1.5, 0.12);
    const leaf = mesh(leafGeo, M(greens[i % 3], { roughness: 0.55 }), 0, len + 0.1, 0);
    leaf.rotation.x = 0.25;
    pivot.add(leaf);
    g.add(pivot);
  }
  return g;
}

function buildLamp() {
  const g = new THREE.Group();
  const metal = M(0x2b2b2b, { metalness: 0.7, roughness: 0.35 });
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.03, 40), metal, 0, 0.015, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.45, 12), metal, 0, 0.03 + 0.725, 0));
  const shade = new THREE.CylinderGeometry(0.13, 0.2, 0.3, 40, 1, true);
  g.add(mesh(shade, M(0xf3e6d0, { side: THREE.DoubleSide, emissive: 0xffd9a0, emissiveIntensity: 0.55, roughness: 0.9 }), 0, 1.5, 0));
  g.add(mesh(new THREE.SphereGeometry(0.045, 16, 12), M(0xffffff, { emissive: 0xfff0c8, emissiveIntensity: 1.5 }), 0, 1.45, 0));
  return g;
}

export const CATALOG = [
  { id: 'clock', name: 'Clock', emoji: '🕰️', mount: 'wall', build: buildClock },
  { id: 'painting', name: 'Painting', emoji: '🖼️', mount: 'wall', build: buildPainting },
  { id: 'mirror', name: 'Mirror', emoji: '🪞', mount: 'wall', build: buildMirror },
  { id: 'shelf', name: 'Wall shelf', emoji: '📚', mount: 'wall', build: buildShelf },
  { id: 'dresser', name: 'Dresser', emoji: '🗄️', mount: 'floor', build: buildDresser },
  { id: 'bookshelf', name: 'Bookcase', emoji: '📖', mount: 'floor', build: buildBookshelf },
  { id: 'plant', name: 'Floor plant', emoji: '🪴', mount: 'floor', build: buildPlant },
  { id: 'lamp', name: 'Floor lamp', emoji: '💡', mount: 'floor', build: buildLamp },
];

export const getDef = (id) => CATALOG.find((d) => d.id === id);

// ---------- shared helpers ----------

let blobTex = null;
function shadowTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 128, 128);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

const sizeCache = new Map();

/**
 * Build a ready-to-place model. Sizes are measured from the geometry, so the
 * fit checks always use the object's true dimensions.
 */
export function buildModel(def, { shadow = true } = {}) {
  const inner = def.build();
  inner.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(inner);
  const c = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  if (def.mount === 'wall') inner.position.set(-c.x, -c.y, -bbox.min.z);
  else inner.position.set(-c.x, -bbox.min.y, -bbox.min.z);

  const outer = new THREE.Group();
  outer.add(inner);
  outer.userData.def = def;
  outer.userData.size = size;
  outer.userData.update = inner.userData.update;
  sizeCache.set(def.id, size.clone());

  if (shadow) {
    const mat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
    let s;
    if (def.mount === 'floor') {
      s = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.25, size.z * 1.6), mat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(0, 0.003, size.z / 2);
      mat.opacity = 0.6;
    } else {
      s = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.15, size.y * 1.15), mat);
      s.position.set(0, -0.015, 0.002);
      mat.opacity = 0.4;
    }
    s.renderOrder = -1;
    s.userData.isShadow = true;
    outer.add(s);
  }
  return outer;
}

export function getSize(def) {
  if (!sizeCache.has(def.id)) buildModel(def, { shadow: false });
  return sizeCache.get(def.id);
}

export function formatLength(m) {
  return m >= 1 ? `${m.toFixed(2)} m` : `${Math.round(m * 100)} cm`;
}
