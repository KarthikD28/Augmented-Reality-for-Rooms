import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './style.css';
import { OrientationTracker } from './orientation.js';
import { CameraFeed, viewGeometry } from './camera.js';
import { EdgeAnalyzer } from './vision.js';
import { CATALOG, getDef, buildModel, getSize, formatLength } from './objects.js';
import { Room, checkWallItem, checkFloorItem, makeDimension, updateDimension, ACCENT } from './room.js';
import { quickLookSupported, prepareQuickLook, openQuickLookUrl } from './quicklook.js';

const $ = (id) => document.getElementById(id);
const OK_COLOR = 0x4ade80;
const BAD_COLOR = 0xf87171;

// ---------- settings ----------

const DEFAULTS = { phoneHeight: 1.35, fov: 67, sensitivity: 0.5 };
const settings = (() => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('roomfit-settings') || '{}') }; }
  catch { return { ...DEFAULTS }; }
})();
const saveSettings = () => { try { localStorage.setItem('roomfit-settings', JSON.stringify(settings)); } catch { /* private mode */ } };
const edgeThreshold = () => 120 - 90 * settings.sensitivity;
const BUSY_DENSITY = 0.12;

// ---------- three.js setup ----------

const video = $('cam');
const glCanvas = $('gl');
const scanCanvas = $('scan');
const scanCtx = scanCanvas.getContext('2d');

const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(1, 3, 2);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60);
camera.position.set(0, settings.phoneHeight, 0);

const tracker = new OrientationTracker();
const feed = new CameraFeed(video);
const analyzer = new EdgeAnalyzer();
const room = new Room(scene);

let SW = window.innerWidth;
let SH = window.innerHeight;
let geom = viewGeometry(video, SW, SH, settings.fov);

function resize() {
  SW = window.innerWidth;
  SH = window.innerHeight;
  renderer.setSize(SW, SH, false);
  const dpr = Math.min(window.devicePixelRatio, 2);
  scanCanvas.width = SW * dpr;
  scanCanvas.height = SH * dpr;
  scanCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 300));
resize();

// ---------- projection helpers ----------

const _v = new THREE.Vector3();
function worldToScreen(p) {
  _v.copy(p).applyMatrix4(camera.matrixWorldInverse);
  if (_v.z > -0.05) return null;
  _v.applyMatrix4(camera.projectionMatrix);
  const x = ((_v.x + 1) / 2) * SW;
  const y = ((1 - _v.y) / 2) * SH;
  if (x < 0 || y < 0 || x > SW || y > SH) return null;
  return { x, y };
}

function probe(p) {
  const s = worldToScreen(p);
  if (!s) return { visible: false };
  if (!analyzer.ready) return { visible: true, busy: false }; // no camera: assume clear
  const d = analyzer.densityAtScreen(s.x, s.y, 8, geom);
  if (d == null) return { visible: false };
  return { visible: true, busy: d > BUSY_DENSITY };
}

const forward = () => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

function floorHit(dir) {
  if (dir.y > -0.05) return null;
  const t = -camera.position.y / dir.y;
  if (t > 12) return null;
  return camera.position.clone().addScaledVector(dir, t);
}

// ---------- UI helpers ----------

const hintEl = $('hint');
const hintText = $('hintText');
function setHint(text, tone = 'info') {
  if (hintText.textContent !== text) hintText.textContent = text;
  const cls = `hint ${tone}`;
  if (hintEl.className !== cls) hintEl.className = cls;
  const r = $('reticle');
  const rc = `reticle ${tone}`;
  if (r.className !== rc) r.className = rc;
}

let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

const PANELS = ['panelWall', 'panelPlace', 'panelMeasure', 'panelSelected'];
function showPanel(id) {
  for (const p of PANELS) $(p).classList.toggle('hidden', p !== id);
}

// ---------- state ----------

const state = {
  mode: 'intro', // intro | wall | place | measure | selected
  defId: 'clock',
  ghost: null,
  outline: null,
  check: null,
  selected: null,
  selBox: null,
  measure: null,
  guides: true,
  lastOk: null,
  started: false,
};

// floor marker used while locking a wall
const floorRing = new THREE.Mesh(
  new THREE.RingGeometry(0.09, 0.12, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9, depthWrite: false }),
);
floorRing.visible = false;
scene.add(floorRing);

// free-space bar shown under floor items while placing
const gapBar = makeDimension(0, 1, OK_COLOR);
gapBar.visible = false;

// ---------- object tray ----------

function buildTray() {
  const tray = $('tray');
  for (const def of CATALOG) {
    const s = getSize(def);
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.id = def.id;
    b.innerHTML = `
      <span class="chip-emoji">${def.emoji}</span>
      <span class="chip-name">${def.name}</span>
      <span class="chip-size">${Math.round(s.x * 100)}×${Math.round(s.y * 100)} cm</span>
      <span class="chip-tag ${def.mount}">${def.mount === 'wall' ? 'Wall' : 'Floor'}</span>`;
    b.addEventListener('click', () => selectDef(def.id));
    tray.appendChild(b);
  }
}

function selectDef(id) {
  state.defId = id;
  for (const c of document.querySelectorAll('.chip')) c.classList.toggle('active', c.dataset.id === id);
  makeGhost();
}

function makeGhost() {
  if (state.ghost && state.ghost.parent) state.ghost.parent.remove(state.ghost);
  const def = getDef(state.defId);
  const ghost = buildModel(def);
  ghost.traverse((o) => {
    if (o.isMesh && !o.userData.isShadow) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.62;
    }
  });
  const s = ghost.userData.size;
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(s.x, s.y, s.z));
  const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: OK_COLOR, transparent: true, opacity: 0.9, depthTest: false }));
  outline.position.set(0, def.mount === 'wall' ? 0 : s.y / 2, s.z / 2);
  outline.renderOrder = 5;
  ghost.add(outline);
  ghost.visible = false;
  state.ghost = ghost;
  state.outline = outline;
}

function attach(obj, parent) {
  if (obj.parent !== parent) parent.add(obj);
}

// ---------- modes ----------

function enterWallMode() {
  state.mode = 'wall';
  showPanel('panelWall');
  $('btnWallBack').classList.toggle('hidden', room.walls.length === 0);
  if (state.ghost) state.ghost.visible = false;
  gapBar.visible = false;
}

function enterPlaceMode() {
  state.mode = 'place';
  floorRing.visible = false;
  showPanel('panelPlace');
  clearSelection();
  if (!state.ghost) selectDef(state.defId);
}

function enterMeasureMode() {
  if (!room.walls.length) return;
  state.mode = 'measure';
  if (state.ghost) state.ghost.visible = false;
  gapBar.visible = false;
  state.measure = { step: 0, wall: null, a: 0, marker: null };
  $('btnMark').textContent = 'Mark left edge';
  $('measureSub').textContent = 'Aim at the floor right by the left edge of the open space.';
  showPanel('panelMeasure');
}

function exitMeasure() {
  const m = state.measure;
  if (m && m.marker && m.marker.parent) m.marker.parent.remove(m.marker);
  state.measure = null;
  enterPlaceMode();
}

function selectItem(item) {
  clearSelection();
  state.selected = item;
  state.mode = 'selected';
  if (state.ghost) state.ghost.visible = false;
  gapBar.visible = false;
  state.selBox = new THREE.BoxHelper(item.model, ACCENT);
  scene.add(state.selBox);
  const s = item.model.userData.size;
  $('selTitle').textContent = `${item.def.emoji} ${item.def.name}`;
  $('selSub').textContent = `${item.wall.name} · ${formatLength(s.x)} wide × ${formatLength(s.y)} tall`;
  const ql = $('btnQuickLook');
  ql.classList.toggle('hidden', !quickLookSupported());
  ql.disabled = true;
  ql.textContent = 'Preparing AR…';
  prepareQuickLook(item.def)
    .then((url) => { ql.dataset.url = url; ql.disabled = false; ql.textContent = 'View in AR'; })
    .catch(() => { ql.textContent = 'AR unavailable'; });
  showPanel('panelSelected');
}

function clearSelection() {
  if (state.selBox) scene.remove(state.selBox);
  state.selBox = null;
  state.selected = null;
}

// ---------- per-frame logic ----------

function updateWallMode() {
  const dir = forward();
  const hit = floorHit(dir);
  if (!hit) {
    floorRing.visible = false;
    setHint('Tilt down to where the wall meets the floor', 'info');
    return;
  }
  const dist = Math.hypot(hit.x, hit.z);
  floorRing.position.set(hit.x, 0.005, hit.z);
  floorRing.visible = true;
  if (dist < 0.4 || dist > 8) {
    setHint('Too close or too far — aim at the base of a wall', 'bad');
    return;
  }
  setHint(`Wall base ≈ ${formatLength(dist)} away — tap Lock wall`, 'ok');
}

function lockWall() {
  const dir = forward();
  const hit = floorHit(dir);
  if (!hit) return toast('Aim lower — at the line where the wall meets the floor');
  const dist = Math.hypot(hit.x, hit.z);
  if (dist < 0.4 || dist > 8) return toast('Aim at the base of a wall 0.5–8 m away');
  const normal = new THREE.Vector3(-dir.x, 0, -dir.z).normalize();
  const { wall, replaced } = room.addWall(hit, normal);
  room.setGuidesVisible(state.guides);
  toast(`${wall.name} ${replaced ? 're-locked' : 'locked'} · ${formatLength(dist)} away`);
  if (navigator.vibrate) navigator.vibrate(15);
  enterPlaceMode();
}

function updatePlaceMode() {
  const def = getDef(state.defId);
  const ghost = state.ghost;
  const dir = forward();
  const wall = room.pickWall(dir);
  state.check = null;
  if (!wall) {
    ghost.visible = false;
    gapBar.visible = false;
    setHint('Face a locked wall, or tap + Wall to add this one', 'info');
    return;
  }
  const size = ghost.userData.size;
  let res;
  if (def.mount === 'wall') {
    gapBar.visible = false;
    const p = wall.intersect(camera.position, dir);
    if (!p) { ghost.visible = false; setHint('Face the wall', 'info'); return; }
    const { u, v } = wall.toLocal(p);
    res = checkWallItem({ def, size, wall, u, v, room, probe });
    attach(ghost, wall.group);
    ghost.position.set(res.u, res.v, 0);
  } else {
    const p = floorHit(dir);
    if (!p) { ghost.visible = false; gapBar.visible = false; setHint('Tilt down to the floor in front of the wall', 'info'); return; }
    const { u } = wall.toLocal(p);
    res = checkFloorItem({ def, size, wall, u, room, probe });
    attach(ghost, wall.group);
    ghost.position.set(res.u, 0, 0);
    if (res.left !== undefined && res.right > res.left) {
      attach(gapBar, wall.group);
      updateDimension(gapBar, res.left, res.right, res.ok ? OK_COLOR : BAD_COLOR);
      gapBar.visible = true;
    } else {
      gapBar.visible = false;
    }
  }
  ghost.visible = true;
  state.outline.material.color.set(res.ok ? OK_COLOR : BAD_COLOR);
  res.wall = wall;
  res.defId = def.id;
  state.check = res;
  if (res.ok) state.lastOk = { res, t: performance.now() };
  setHint(res.msg, res.ok ? 'ok' : 'bad');
}

function placeCurrent() {
  let res = state.check;
  if (!res) return toast('Face a locked wall first');
  // Camera noise can flip a check for a single frame; if it was clear a moment
  // ago at (almost) the same spot, use that result.
  const prev = state.lastOk;
  if (!res.ok && prev && performance.now() - prev.t < 700 && prev.res.wall === res.wall &&
      prev.res.defId === res.defId && Math.abs(prev.res.u - res.u) < 0.08 && !/Overlaps|Bumps/.test(res.msg)) {
    res = prev.res;
  }
  if (!res.ok) return toast(res.msg);
  state.lastOk = null;
  const def = getDef(state.defId);
  const model = buildModel(def);
  room.place(def, res.wall, res.u, res.v ?? 0, model);
  if (navigator.vibrate) navigator.vibrate(20);
  toast(`${def.name} placed — look away and back, it stays put`);
}

function updateMeasureMode() {
  const m = state.measure;
  const dir = forward();
  const wall = m.wall || room.pickWall(dir);
  const p = floorHit(dir);
  if (!wall || !p) {
    setHint(wall ? 'Aim at the floor along the wall' : 'Face a locked wall', 'info');
    return;
  }
  const { u } = wall.toLocal(p);
  if (m.step === 0) {
    setHint(`Left edge on ${wall.name} — tap Mark`, 'ok');
  } else {
    updateDimension(m.marker, m.a, u, ACCENT);
    setHint(`Width ${formatLength(Math.abs(u - m.a))} — aim at the right edge`, 'ok');
  }
}

function markMeasure() {
  const m = state.measure;
  const dir = forward();
  const wall = m.wall || room.pickWall(dir);
  const p = floorHit(dir);
  if (!wall || !p) return toast('Aim at the floor right along a locked wall');
  const { u } = wall.toLocal(p);
  if (m.step === 0) {
    m.wall = wall;
    m.a = u;
    m.marker = makeDimension(u, u + 0.001, ACCENT);
    wall.group.add(m.marker);
    m.step = 1;
    $('btnMark').textContent = 'Mark right edge';
    $('measureSub').textContent = 'Now aim at the floor by the right edge of the space.';
  } else {
    if (Math.abs(u - m.a) < 0.1) return toast('Move further along the wall for the right edge');
    wall.group.remove(m.marker);
    m.marker = null;
    wall.addGap(m.a, u);
    toast(`Space measured: ${formatLength(Math.abs(u - m.a))}. Floor items placed here use it.`);
    exitMeasure();
  }
}

// scan overlay: dots where the wall looks clear, red cells where something's there
function drawScan() {
  scanCtx.clearRect(0, 0, SW, SH);
  if (!state.guides || !analyzer.ready || state.mode === 'intro' || state.mode === 'selected') return;
  const cell = 26;
  for (let y = cell / 2 + 60; y < SH - 40; y += cell) {
    for (let x = cell / 2; x < SW; x += cell) {
      const d = analyzer.densityAtScreen(x, y, 9, geom);
      if (d == null) continue;
      if (d > BUSY_DENSITY) {
        scanCtx.fillStyle = 'rgba(248,113,113,0.22)';
        scanCtx.fillRect(x - cell / 2 + 1, y - cell / 2 + 1, cell - 2, cell - 2);
      } else {
        scanCtx.fillStyle = 'rgba(255,255,255,0.28)';
        scanCtx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  }
}

// ---------- main loop ----------

let lastAnalysis = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (!state.started) return;

  tracker.update();
  camera.quaternion.copy(tracker.quaternion);
  geom = viewGeometry(video, SW, SH, settings.fov);
  if (Math.abs(camera.fov - geom.vfov) > 0.01 || camera.aspect !== SW / SH) {
    camera.fov = geom.vfov;
    camera.aspect = SW / SH;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();

  if (t - lastAnalysis > 110 && feed.ready) {
    lastAnalysis = t;
    analyzer.analyze(video, edgeThreshold());
    drawScan();
  }

  if (state.mode === 'wall') updateWallMode();
  else if (state.mode === 'place') updatePlaceMode();
  else if (state.mode === 'measure') updateMeasureMode();
  else if (state.mode === 'selected') setHint(`${state.selected.def.name} selected`, 'info');

  for (const it of room.placed) it.model.userData.update?.();
  if (state.ghost?.visible) state.ghost.userData.update?.();

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ---------- input ----------

let down = null;
glCanvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), moved: false };
});
glCanvas.addEventListener('pointermove', (e) => {
  if (!down) return;
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down.moved = true;
  if (!tracker.hasData) tracker.drag(e.clientX - down.lx, e.clientY - down.ly);
  down.lx = e.clientX;
  down.ly = e.clientY;
});
glCanvas.addEventListener('pointerup', (e) => {
  if (down && !down.moved && performance.now() - down.t < 500) onTap(e.clientX, e.clientY);
  down = null;
});

const raycaster = new THREE.Raycaster();
function onTap(x, y) {
  if (state.mode !== 'place' && state.mode !== 'selected') return;
  raycaster.setFromCamera(new THREE.Vector2((x / SW) * 2 - 1, -(y / SH) * 2 + 1), camera);
  const hits = raycaster.intersectObjects(room.placed.map((p) => p.model), true);
  const hit = hits.find((h) => !h.object.userData.isShadow);
  if (hit) {
    const item = room.placed.find((p) => p.id === hit.object.userData.itemId);
    if (item) return selectItem(item);
  }
  if (state.mode === 'selected') enterPlaceMode();
}

$('btnLock').addEventListener('click', lockWall);
$('btnWallBack').addEventListener('click', enterPlaceMode);
$('btnAddWall').addEventListener('click', enterWallMode);
$('btnPlace').addEventListener('click', placeCurrent);
$('btnMeasure').addEventListener('click', enterMeasureMode);
$('btnMark').addEventListener('click', markMeasure);
$('btnMeasureCancel').addEventListener('click', exitMeasure);
$('btnDone').addEventListener('click', enterPlaceMode);
$('btnRemove').addEventListener('click', () => {
  if (!state.selected) return;
  const name = state.selected.def.name;
  room.remove(state.selected);
  toast(`${name} removed`);
  enterPlaceMode();
});
$('btnQuickLook').addEventListener('click', (e) => {
  const url = e.currentTarget.dataset.url;
  if (url) openQuickLookUrl(url);
});
$('btnScan').addEventListener('click', (e) => {
  state.guides = !state.guides;
  e.currentTarget.classList.toggle('on', state.guides);
  room.setGuidesVisible(state.guides);
  if (!state.guides) scanCtx.clearRect(0, 0, SW, SH);
});

// settings
function syncSettingsUI() {
  $('inHeight').value = settings.phoneHeight;
  $('inFov').value = settings.fov;
  $('inSens').value = settings.sensitivity;
  $('valHeight').textContent = `${Math.round(settings.phoneHeight * 100)} cm`;
  $('valFov').textContent = `${settings.fov}°`;
  $('valSens').textContent = `${Math.round(settings.sensitivity * 100)}%`;
}
$('btnSettings').addEventListener('click', () => { syncSettingsUI(); $('settings').classList.remove('hidden'); });
$('btnCloseSettings').addEventListener('click', () => $('settings').classList.add('hidden'));
$('inHeight').addEventListener('input', (e) => {
  settings.phoneHeight = parseFloat(e.target.value);
  camera.position.y = settings.phoneHeight;
  saveSettings();
  syncSettingsUI();
});
$('inFov').addEventListener('input', (e) => { settings.fov = parseFloat(e.target.value); saveSettings(); syncSettingsUI(); });
$('inSens').addEventListener('input', (e) => { settings.sensitivity = parseFloat(e.target.value); saveSettings(); syncSettingsUI(); });
$('btnReset').addEventListener('click', () => {
  room.clear();
  clearSelection();
  if (state.ghost?.parent) state.ghost.parent.remove(state.ghost);
  if (gapBar.parent) gapBar.parent.remove(gapBar);
  $('settings').classList.add('hidden');
  toast('Room cleared');
  enterWallMode();
});

// Camera can stop when Safari is backgrounded or after AR Quick Look.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.started) feed.ensureRunning();
});

// ---------- start ----------

function begin() {
  $('intro').classList.add('hidden');
  state.started = true;
  buildTray();
  selectDef(state.defId);
  enterWallMode();
}

$('btnStart').addEventListener('click', async () => {
  const btn = $('btnStart');
  const err = $('introError');
  btn.disabled = true;
  btn.textContent = 'Starting…';
  err.textContent = '';
  let motionOk = true;
  try { await tracker.start(); } catch { motionOk = false; }
  try {
    await feed.start();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Try again';
    if (e.name === 'InsecureContext') {
      err.textContent = 'The camera needs a secure (https://) link. Open the https address shown in your terminal.';
    } else if (e.name === 'NotAllowedError') {
      err.textContent = 'Camera access was blocked. On iPhone: Settings › Apps › Safari › Camera → Allow, then reload.';
    } else {
      err.textContent = `Couldn't start the camera (${e.name || e.message}).`;
    }
    $('btnNoCam').classList.remove('hidden');
    return;
  }
  begin();
  if (!motionOk) toast('Motion access denied — objects won’t stay pinned. Reload and tap Allow.');
});

$('btnNoCam').addEventListener('click', () => {
  begin();
  toast('No camera — drag to look around');
});

// Handy for debugging from Safari's Web Inspector.
window.__roomfit = { room, state, camera, settings, prepareQuickLook, getDef };
