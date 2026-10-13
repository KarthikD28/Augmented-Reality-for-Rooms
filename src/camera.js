// Rear camera feed + the maths that lines the 3D view up with it.

export class CameraFeed {
  constructor(video) {
    this.video = video;
    this.stream = null;
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('insecure');
      err.name = 'InsecureContext';
      throw err;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play();
  }

  // Safari can stop the camera when you leave the page (e.g. after AR Quick Look).
  async ensureRunning() {
    if (!this.stream) return;
    const live = this.stream.getVideoTracks().some((t) => t.readyState === 'live');
    if (!live) {
      try { await this.start(); } catch { /* ignore */ }
    } else if (this.video.paused) {
      try { await this.video.play(); } catch { /* ignore */ }
    }
  }

  get ready() {
    return this.video.videoWidth > 0;
  }
}

/**
 * The video is shown with object-fit: cover, so part of it is cropped.
 * Work out how video pixels map onto the screen and what vertical field of
 * view the visible part covers, so the 3D camera matches the real one.
 * longFovDeg = field of view across the long side of the camera image.
 */
export function viewGeometry(video, SW, SH, longFovDeg) {
  const vw = video.videoWidth || SW;
  const vh = video.videoHeight || SH;
  const scale = Math.max(SW / vw, SH / vh);
  const ox = (SW - vw * scale) / 2;
  const oy = (SH - vh * scale) / 2;
  const tanLong = Math.tan((longFovDeg * Math.PI) / 180 / 2);
  const tanV = vh >= vw ? tanLong : (tanLong * vh) / vw;
  const visibleH = SH / scale;
  const vfov = (2 * Math.atan((tanV * visibleH) / vh) * 180) / Math.PI;
  return { vw, vh, scale, ox, oy, vfov, SW, SH };
}
