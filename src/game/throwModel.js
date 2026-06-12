import { THROW, COURT } from '../config.js';
import { v3, clamp, lerp } from '../core/math.js';

/**
 * Pure mapping from a release flick (measured hand/pointer velocity in the
 * hold plane, m/s) to a launch state. Shared by the game and by
 * tests/simulate.mjs so the tuning that ships is the tuning that's tested.
 *
 * The player's flick controls arc (vy) and aim (vx) directly; forward speed
 * is derived from flick strength — flicking harder throws both higher AND
 * farther, which matches the intuition of a real shot.
 *
 * @param {{x: number, y: number}} flick  in-plane velocity at release, m/s
 * @param {{x: number, y: number, z: number}} pos  release position
 * @param {number} assist  0..1 — blends forward/lateral speed toward the
 *   no-drag ballistic solution for the player's own arc. Vertical speed is
 *   never assisted, so arc and timing stay honest.
 * @returns {{vel: any, spin: any}}
 */
export function computeLaunch(flick, pos, assist = 0) {
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
      // that would land dead center — with ~4.5 % padding for air drag.
      const t = (vy + Math.sqrt(disc)) / g;
      const vzIdeal = ((COURT.RIM_CENTER.z - pos.z) / t) * 1.055;
      const vxIdeal = (COURT.RIM_CENTER.x - pos.x) / t;
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
