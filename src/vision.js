// Lightweight "is this part of the room empty?" analysis.
//
// Each tick we shrink the camera frame, find edges (Sobel), and build a
// summed-area table so we can ask "what fraction of this patch is edges?"
// in constant time. Plain walls have almost no edges; furniture, frames,
// switches, doorways and corners have lots.

const AW = 160; // analysis width in pixels

export class EdgeAnalyzer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.W = 0;
    this.H = 0;
    this.ready = false;
  }

  analyze(video, edgeThreshold) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return false;

    const W = AW;
    const H = Math.max(2, Math.round((AW * vh) / vw));
    if (W !== this.W || H !== this.H) {
      this.W = W;
      this.H = H;
      this.canvas.width = W;
      this.canvas.height = H;
      this.gray = new Float32Array(W * H);
      this.blur = new Float32Array(W * H);
      this.integral = new Uint32Array((W + 1) * (H + 1));
    }

    this.ctx.drawImage(video, 0, 0, W, H);
    const px = this.ctx.getImageData(0, 0, W, H).data;
    const { gray, blur, integral } = this;

    for (let i = 0, j = 0; i < W * H; i++, j += 4) {
      gray[i] = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];
    }

    // 3x3 box blur to suppress sensor noise.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
          blur[y * W + x] = gray[y * W + x];
          continue;
        }
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const r = (y + dy) * W + x;
          s += gray[r - 1] + gray[r] + gray[r + 1];
        }
        blur[y * W + x] = s / 9;
      }
    }

    // Sobel edges -> binary -> summed-area table.
    const W1 = W + 1;
    for (let x = 0; x <= W; x++) integral[x] = 0;
    for (let y = 0; y < H; y++) {
      let row = 0;
      integral[(y + 1) * W1] = 0;
      for (let x = 0; x < W; x++) {
        let e = 0;
        if (x > 0 && y > 0 && x < W - 1 && y < H - 1) {
          const i = y * W + x;
          const tl = blur[i - W - 1], t = blur[i - W], tr = blur[i - W + 1];
          const l = blur[i - 1], r = blur[i + 1];
          const bl = blur[i + W - 1], b = blur[i + W], br = blur[i + W + 1];
          const gx = tr + 2 * r + br - tl - 2 * l - bl;
          const gy = bl + 2 * b + br - tl - 2 * t - tr;
          if (Math.abs(gx) + Math.abs(gy) > edgeThreshold) e = 1;
        }
        row += e;
        integral[(y + 1) * W1 + x + 1] = integral[y * W1 + x + 1] + row;
      }
    }
    this.ready = true;
    return true;
  }

  /** Edge density (0..1) around a screen point, or null if off the video. */
  densityAtScreen(sx, sy, radiusPx, geom) {
    if (!this.ready) return null;
    const vx = (sx - geom.ox) / geom.scale;
    const vy = (sy - geom.oy) / geom.scale;
    if (vx < 0 || vy < 0 || vx > geom.vw || vy > geom.vh) return null;
    const k = this.W / geom.vw;
    const ax = vx * k;
    const ay = vy * k;
    const ar = Math.max(1.5, (radiusPx / geom.scale) * k);
    const x0 = Math.max(0, Math.floor(ax - ar));
    const y0 = Math.max(0, Math.floor(ay - ar));
    const x1 = Math.min(this.W, Math.ceil(ax + ar));
    const y1 = Math.min(this.H, Math.ceil(ay + ar));
    const area = (x1 - x0) * (y1 - y0);
    if (area <= 0) return null;
    const W1 = this.W + 1;
    const I = this.integral;
    const sum = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
    return sum / area;
  }
}
