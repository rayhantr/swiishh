import { RENDER } from '../config.js';

/**
 * A fixed pinhole camera behind the shooter, looking straight down −z.
 * No rotation matrix needed: composition is handled by placing the
 * principal point (HORIZON) rather than tilting the view, which keeps
 * projection a two-line function we can call thousands of times a frame.
 */
export class Camera {
  constructor() {
    this.pos = { ...RENDER.CAM_POS };
    this.w = 0;
    this.h = 0;
    this.f = 0;   // focal length in px
    this.cx = 0;
    this.cy = 0;
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    // Fit landscape by height, portrait by width, so the hoop always frames.
    this.f = Math.min(w * 1.45, h * 1.38);
    this.cx = w / 2;
    this.cy = h * RENDER.HORIZON;
  }

  /**
   * @param {{x,y,z}} p world point
   * @param {{x?,y?,s?,visible?}} out reused output record
   * @returns screen point + perspective scale `s` (px per meter at that depth)
   */
  project(p, out = {}) {
    const d = this.pos.z - p.z;
    if (d < 0.05) {
      out.visible = false;
      return out;
    }
    const s = this.f / d;
    out.x = this.cx + (p.x - this.pos.x) * s;
    out.y = this.cy - (p.y - this.pos.y) * s;
    out.s = s;
    out.visible = true;
    return out;
  }
}
