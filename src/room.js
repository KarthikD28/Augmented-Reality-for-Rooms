import * as THREE from 'three';
import { formatLength } from './objects.js';

const UP = new THREE.Vector3(0, 1, 0);
export const ACCENT = 0x7cf2c4;

// ---------- text labels floating in 3D ----------

export function makeLabel(text, { scale = 0.5 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, scale / 4, 1);
  sprite.renderOrder = 10;
  sprite.userData.canvas = canvas;
  setLabel(sprite, text);
  return sprite;
}

export function setLabel(sprite, text) {
  if (sprite.userData.text === text) return;
  sprite.userData.text = text;
  const c = sprite.userData.canvas;
  const x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  x.font = '600 52px -apple-system, system-ui, sans-serif';
  const w = Math.min(c.width - 8, x.measureText(text).width + 64);
  const left = (c.width - w) / 2;
  x.fillStyle = 'rgba(12,12,14,0.78)';
  x.beginPath();
  x.roundRect(left, 14, w, 100, 50);
  x.fill();
  x.fillStyle = '#ffffff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, c.width / 2, 66);
  sprite.material.map.needsUpdate = true;
}

// ---------- walls ----------

function makeWallVisual() {
  const g = new THREE.Group();
  const pts = [];
  for (let u = -3; u <= 3.001; u += 0.5) pts.push(u, 0, 0, u, 2.5, 0);
  for (let v = 0.5; v <= 2.5001; v += 0.5) pts.push(-3, v, 0, 3, v, 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }));
  grid.position.z = 0.003;
  g.add(grid);
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 0.03),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  base.position.set(0, 0.015, 0.004);
  g.add(base);
  g.userData.grid = grid;
  return g;
}

export class Wall {
  constructor(id, origin, normal) {
    this.id = id;
    this.name = `Wall ${id}`;
    this.group = new THREE.Group();
    this.visual = makeWallVisual();
    this.group.add(this.visual);
    this.label = makeLabel(this.name, { scale: 0.7 });
    this.label.position.set(0, 2.1, 0.01);
    this.group.add(this.label);
    this.gaps = [];
    this.setPlane(origin, normal);
  }

  setPlane(origin, normal) {
    this.origin = origin.clone().setY(0);
    this.normal = normal.clone().setY(0).normalize();
    this.right = new THREE.Vector3().crossVectors(UP, this.normal).normalize();
    const m = new THREE.Matrix4().makeBasis(this.right, UP, this.normal);
    this.group.quaternion.setFromRotationMatrix(m);
    this.group.position.copy(this.origin);
    this.group.updateMatrixWorld(true);
  }

  distanceFrom(p) {
    return Math.abs(p.clone().sub(this.origin).dot(this.normal));
  }

  toLocal(p) {
    const d = p.clone().sub(this.origin);
    return { u: d.dot(this.right), v: p.y, w: d.dot(this.normal) };
  }

  toWorld(u, v, w = 0) {
    return this.origin.clone().addScaledVector(this.right, u).addScaledVector(UP, v).addScaledVector(this.normal, w);
  }

  intersect(origin, dir) {
    const denom = dir.dot(this.normal);
    if (denom > -1e-3) return null;
    const t = this.origin.clone().sub(origin).dot(this.normal) / denom;
    if (t <= 0) return null;
    return origin.clone().addScaledVector(dir, t);
  }

  addGap(a, b) {
    const left = Math.min(a, b);
    const right = Math.max(a, b);
    // Replace any earlier measurement that overlaps.
    this.gaps = this.gaps.filter((g) => {
      const overlap = g.a < right && g.b > left;
      if (overlap) this.group.remove(g.visual);
      return !overlap;
    });
    const visual = makeDimension(left, right, ACCENT);
    this.group.add(visual);
    const gap = { a: left, b: right, visual };
    this.gaps.push(gap);
    return gap;
  }
}

/** A floor-level dimension line from u=a to u=b with a width label. */
export function makeDimension(a, b, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.025), mat);
  bar.rotation.x = -Math.PI / 2;
  bar.position.set(0, 0.006, 0.08);
  g.add(bar);
  const tick = (u) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.18, 0.012), mat);
    t.position.set(u, 0.09, 0.08);
    g.add(t);
    return t;
  };
  g.userData.ticks = [tick(0), tick(0)];
  g.userData.bar = bar;
  g.userData.label = makeLabel('', { scale: 0.45 });
  g.add(g.userData.label);
  updateDimension(g, a, b);
  return g;
}

export function updateDimension(g, a, b, color) {
  const left = Math.min(a, b);
  const right = Math.max(a, b);
  const w = Math.max(0.001, right - left);
  g.userData.bar.scale.x = w;
  g.userData.bar.position.x = (left + right) / 2;
  g.userData.ticks[0].position.x = left;
  g.userData.ticks[1].position.x = right;
  g.userData.label.position.set((left + right) / 2, 0.3, 0.1);
  setLabel(g.userData.label, formatLength(w));
  if (color !== undefined) g.userData.bar.material.color.set(color);
}

// ---------- room: walls + placed objects ----------

export class Room {
  constructor(scene) {
    this.scene = scene;
    this.walls = [];
    this.placed = [];
    this.nextWallId = 1;
    this.nextItemId = 1;
  }

  addWall(origin, normal) {
    const n = normal.clone().setY(0).normalize();
    const existing = this.walls.find((w) => w.normal.dot(n) > Math.cos((25 * Math.PI) / 180));
    if (existing) {
      existing.setPlane(origin, n);
      return { wall: existing, replaced: true };
    }
    const wall = new Wall(this.nextWallId++, origin, n);
    this.walls.push(wall);
    this.scene.add(wall.group);
    return { wall, replaced: false };
  }

  /** The wall you're most squarely facing. */
  pickWall(dir) {
    const h = dir.clone().setY(0);
    if (h.lengthSq() < 1e-6) return null;
    h.normalize();
    let best = null;
    let bestScore = 0.5;
    for (const w of this.walls) {
      const s = -h.dot(w.normal);
      if (s > bestScore) { best = w; bestScore = s; }
    }
    return best;
  }

  itemBox(def, size, u, v) {
    if (def.mount === 'wall') {
      return { u0: u - size.x / 2, u1: u + size.x / 2, v0: v - size.y / 2, v1: v + size.y / 2, w0: 0, w1: size.z };
    }
    return { u0: u - size.x / 2, u1: u + size.x / 2, v0: 0, v1: size.y, w0: 0, w1: size.z };
  }

  findCollision(wall, b, ignoreId) {
    const e = 0.005;
    for (const it of this.placed) {
      if (it.wall !== wall || it.id === ignoreId) continue;
      const o = it.box;
      if (b.u0 < o.u1 - e && b.u1 > o.u0 + e && b.v0 < o.v1 - e && b.v1 > o.v0 + e && b.w0 < o.w1 - e && b.w1 > o.w0 + e) return it;
    }
    return null;
  }

  place(def, wall, u, v, model) {
    const size = model.userData.size;
    const vv = def.mount === 'wall' ? v : 0;
    model.position.set(u, vv, 0);
    wall.group.add(model);
    const item = { id: this.nextItemId++, def, wall, u, v: vv, model, box: this.itemBox(def, size, u, vv) };
    model.traverse((o) => { o.userData.itemId = item.id; });
    this.placed.push(item);
    return item;
  }

  remove(item) {
    item.wall.group.remove(item.model);
    this.placed = this.placed.filter((p) => p !== item);
  }

  clear() {
    for (const w of this.walls) this.scene.remove(w.group);
    this.walls = [];
    this.placed = [];
    this.nextWallId = 1;
  }

  setGuidesVisible(on) {
    for (const w of this.walls) {
      w.visual.userData.grid.visible = on;
      w.label.visible = on;
    }
  }
}

// ---------- fit checks ----------

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * probe(worldPoint) -> { visible, busy } tells us whether the camera image
 * shows something (an edge-y "occupied" area) at that point in the room.
 */
export function checkWallItem({ def, size, wall, u, v, room, probe, ignoreId }) {
  const w = size.x, h = size.y;
  v = clamp(v, h / 2 + 0.12, Math.max(h / 2 + 0.12, 2.6 - h / 2));

  const hit = room.findCollision(wall, room.itemBox(def, size, u, v), ignoreId);
  if (hit) return { ok: false, u, v, msg: `Overlaps the ${hit.def.name.toLowerCase()}` };

  const N = 5;
  let vis = 0, busy = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const uu = u + (i / (N - 1) - 0.5) * w * 0.9;
      const vv = v + (j / (N - 1) - 0.5) * h * 0.9;
      const r = probe(wall.toWorld(uu, vv, 0.005));
      if (!r.visible) continue;
      vis++;
      if (r.busy) busy++;
    }
  }
  if (vis < N * N * 0.6) return { ok: false, u, v, msg: 'Keep the whole spot on screen' };
  if (busy / vis > 0.2) return { ok: false, u, v, msg: "Wall isn't clear here — something's already there" };
  return { ok: true, u, v, msg: `${def.name} fits here — tap Place` };
}

export function checkFloorItem({ def, size, wall, u, room, probe, ignoreId }) {
  const w = size.x, h = size.y;
  const step = 0.05;
  // Sample the wall just above the skirting board, up to the item's height.
  const heights = [0.25, 0.45, 0.65, 0.9].filter((y) => y <= Math.max(h, 0.5));

  const columnBusy = (uu) => {
    for (const it of room.placed) {
      if (it.wall !== wall || it.id === ignoreId) continue;
      const b = it.box;
      if (uu >= b.u0 && uu <= b.u1 && (it.def.mount === 'floor' || b.v0 < h)) return true;
    }
    let vis = 0, busy = 0;
    for (const y of heights) {
      const r = probe(wall.toWorld(uu, y, 0.02));
      if (!r.visible) continue;
      vis++;
      if (r.busy) busy++;
    }
    if (vis === 0) return null;
    return busy / vis >= 0.5;
  };

  let left, right, openL = false, openR = false, measured = false;
  const gap = wall.gaps.find((g) => u >= g.a - 0.05 && u <= g.b + 0.05);
  if (gap) {
    left = gap.a;
    right = gap.b;
    measured = true;
  } else {
    const c = columnBusy(u);
    if (c === null) return { ok: false, u, msg: 'Aim so the bottom of the wall is on screen' };
    if (c) return { ok: false, u, left: u, right: u, width: 0, msg: "Something's already here — aim at an empty stretch" };
    left = u;
    right = u;
    for (let s = step; s <= 4; s += step) {
      const r = columnBusy(u - s);
      if (r === null) { openL = true; break; }
      if (r) break;
      left = u - s;
    }
    for (let s = step; s <= 4; s += step) {
      const r = columnBusy(u + s);
      if (r === null) { openR = true; break; }
      if (r) break;
      right = u + s;
    }
    left -= step / 2;
    right += step / 2;
  }

  const width = right - left;
  if (width < w + 0.02) {
    if (openL || openR) {
      return { ok: false, u, left, right, width, msg: `About ${formatLength(width)} free so far — turn to see the rest` };
    }
    return { ok: false, u, left, right, width, msg: `Won't fit — ${def.name.toLowerCase()} is ${formatLength(w)} wide, space is ${formatLength(width)}` };
  }

  const su = clamp(u, left + w / 2 + 0.01, right - w / 2 - 0.01);
  const hit = room.findCollision(wall, room.itemBox(def, size, su, 0), ignoreId);
  if (hit) return { ok: false, u: su, left, right, width, msg: `Bumps into the ${hit.def.name.toLowerCase()}` };
  return {
    ok: true, u: su, left, right, width,
    msg: `Fits — ${formatLength(width)} free${measured ? ' (measured)' : ''}, needs ${formatLength(w)}`,
  };
}
