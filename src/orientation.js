import * as THREE from 'three';

// Turns the phone's gyroscope (DeviceOrientation) into a camera rotation.
// Because the virtual camera turns exactly as the phone turns, anything we
// put in the 3D scene stays fixed in the room: look away and back and it's
// still there.

const ZEE = new THREE.Vector3(0, 0, 1);
const Q_TILT = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° about X
const DEG = Math.PI / 180;

export class OrientationTracker {
  constructor() {
    this.quaternion = new THREE.Quaternion();
    this.target = new THREE.Quaternion();
    this.hasData = false;
    this.permission = 'unknown';
    this._euler = new THREE.Euler();
    this._q = new THREE.Quaternion();
    // Fallback for desktop testing: drag to look around.
    this.dragYaw = 0;
    this.dragPitch = 0;
    this._onEvent = this._onEvent.bind(this);
  }

  // Must be called from a tap handler on iOS.
  async start() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      const result = await DOE.requestPermission();
      this.permission = result;
      if (result !== 'granted') throw new Error('Motion access was denied');
    } else {
      this.permission = 'granted';
    }
    window.addEventListener('deviceorientation', this._onEvent, true);
  }

  _onEvent(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const screenAngle = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
    this._euler.set(e.beta * DEG, e.alpha * DEG, -e.gamma * DEG, 'YXZ');
    this.target.setFromEuler(this._euler);
    this.target.multiply(Q_TILT);
    this.target.multiply(this._q.setFromAxisAngle(ZEE, -screenAngle * DEG));
    if (!this.hasData) this.quaternion.copy(this.target);
    this.hasData = true;
  }

  drag(dx, dy) {
    this.dragYaw += dx * 0.005;
    this.dragPitch = Math.max(-1.4, Math.min(1.4, this.dragPitch + dy * 0.005));
  }

  update() {
    if (this.hasData) {
      // Light smoothing removes sensor jitter without adding noticeable lag.
      this.quaternion.slerp(this.target, 0.55);
    } else {
      this._euler.set(this.dragPitch, this.dragYaw, 0, 'YXZ');
      this.quaternion.setFromEuler(this._euler);
    }
  }
}
