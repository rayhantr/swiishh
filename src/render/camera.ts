import { RENDER } from '../config.ts';
import type { Vec3 } from '../core/math.ts';

/** Reusable projection output record. */
export interface Projected {
  x: number;
  y: number;
  /** perspective scale — px per meter at that depth */
  s: number;
  visible: boolean;
}

export const newProjected = (): Projected => ({ x: 0, y: 0, s: 0, visible: false });

/**
 * A fixed pinhole camera behind the shooter, looking straight down −z.
 * No rotation matrix needed: composition is handled by placing the
 * principal point (HORIZON) rather than tilting the view, which keeps
 * projection a two-line function we can call thousands of times a frame.
 */
export class Camera {
  pos: Vec3 = { ...RENDER.CAM_POS };
  w = 0;
  h = 0;
  f = 0;   // focal length in px
  cx = 0;
  cy = 0;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    // Fit landscape by height, portrait by width, so the hoop always frames.
    this.f = Math.min(w * 1.45, h * 1.38);
    this.cx = w / 2;
    this.cy = h * RENDER.HORIZON;
  }

  /**
   * @param p world point
   * @param out reused output record
   * @returns screen point + perspective scale `s` (px per meter at that depth)
   */
  project(p: Vec3, out: Projected = newProjected()): Projected {
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
