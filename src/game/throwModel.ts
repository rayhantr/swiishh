import { THROW, COURT, ASSIST } from '../config.ts';
import { v3, clamp, lerp } from '../core/math.ts';
import type { Vec3 } from '../core/math.ts';
import type { Flick } from './flickMeter.ts';

/**
 * Pure mapping from a release flick (measured hand/pointer velocity in the
 * hold plane, m/s) to a launch state. Shared by the game and by
 * tests/simulate.ts so the tuning that ships is the tuning that's tested.
 *
 * The player's flick controls arc (vy) and aim (vx) directly; forward speed
 * is derived from flick strength — flicking harder throws both higher AND
 * farther, which matches the intuition of a real shot.
 *
 * @param flick  in-plane velocity at release, m/s
 * @param pos    release position
 * @param assist 0..1 — blends forward/lateral speed toward the no-drag
 *   ballistic solution for the player's own arc. Vertical speed is never
 *   assisted, so arc and timing stay honest.
 */
export function computeLaunch(flick: Flick, pos: Vec3, assist = 0): { vel: Vec3; spin: Vec3 } {
  const up = Math.max(0, flick.y);
  const vy = up * THROW.GAIN_UP;
  let vx = flick.x * THROW.GAIN_SIDE;
  let vz = -(THROW.FWD_BASE + up * THROW.FWD_FROM_FLICK);

  if (assist > 0) {
    const g = 9.81;
    const dy = COURT.RIM_CENTER.y - pos.y;
    const disc = vy * vy - 2 * g * dy;
    if (disc > 0) {
      // Time of the descending crossing of rim height, then the velocity
      // that would land dead center. Drag steals a fraction of range that
      // grows with flight time, so the padding scales with t (calibrated —
      // see ASSIST.DRAG_PAD_PER_S).
      const t = (vy + Math.sqrt(disc)) / g;
      const pad = 1 + ASSIST.DRAG_PAD_PER_S * t;
      const vzIdeal = ((COURT.RIM_CENTER.z - pos.z) / t) * pad;
      const vxIdeal = ((COURT.RIM_CENTER.x - pos.x) / t) * pad;
      vz = lerp(vz, vzIdeal, assist);
      vx = lerp(vx, vxIdeal, assist);
    }
  }

  const speed = Math.hypot(vx, vy, vz);
  if (speed > THROW.MAX_SPEED) {
    const s = THROW.MAX_SPEED / speed;
    vx *= s;
    vz *= s;
  }

  const backspin = clamp(
    THROW.BACKSPIN_BASE + up * THROW.BACKSPIN_FROM_FLICK,
    0,
    THROW.BACKSPIN_MAX,
  );
  const sidespin = clamp(-flick.x * THROW.SIDESPIN_FROM_SIDE, -8, 8);

  return { vel: v3(vx, vy, vz), spin: v3(backspin, sidespin, 0) };
}
