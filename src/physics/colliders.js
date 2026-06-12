import { COURT, SURFACES } from '../config.js';
import { v3, set, sub, dot, len, scale, cross, addScaled, normalize } from '../core/math.js';

/**
 * Contact resolution and the three colliders that matter for a free throw:
 * floor (infinite plane), backboard (finite plane with tunnel-proof crossing
 * test) and rim (torus, treated as the closest point on the rim circle).
 *
 * Deliberate simplifications, documented for contributors:
 *  - backboard edges/pole are not colliders (the rim catches almost
 *    everything a free throw can reach),
 *  - the net only damps the ball (see world.js); strands push outward
 *    visually but do not bounce the ball.
 */

// scratch
const _n = v3();
const _rVec = v3();
const _vContact = v3();
const _vt = v3();
const _t = v3();
const _impulse = v3();
const _dSpin = v3();

/**
 * Impulse-based contact response for a hollow sphere (a basketball shell has
 * I = ⅔·m·r²). Applies restitution along the normal and Coulomb friction
 * tangentially; friction couples linear velocity and spin, which is what
 * makes backspin "check up" on the floor and grab the rim.
 *
 * Works in velocity (per-unit-mass) space, so no masses appear.
 *
 * @returns {number} normal impact speed (0 if separating)
 */
export function resolveContact(ball, normal, depth, surface) {
  // Positional correction — push the ball out of penetration.
  addScaled(ball.pos, ball.pos, normal, depth);

  const vn = dot(ball.vel, normal);
  if (vn >= 0) return 0;

  // Normal impulse with restitution.
  addScaled(ball.vel, ball.vel, normal, -(1 + surface.restitution) * vn);

  // Velocity of the ball's surface at the contact point (includes spin).
  scale(_rVec, normal, -ball.radius);
  cross(_vContact, ball.spin, _rVec);
  addScaled(_vContact, _vContact, ball.vel, 1);
  const vtN = dot(_vContact, normal);
  addScaled(_vt, _vContact, normal, -vtN);
  const slip = len(_vt);

  if (slip > 1e-4) {
    normalize(_t, _vt);
    // Hollow sphere: a tangential impulse j changes the contact-point speed
    // by j·(1/m + r²/I) = j·2.5/m  ⇒  stopping impulse = slip/2.5.
    const jStop = slip / 2.5;
    const jMax = surface.friction * (1 + surface.restitution) * -vn;
    const j = Math.min(jStop, jMax);

    addScaled(ball.vel, ball.vel, _t, -j);
    // Δω = (r × J) / I, with I/m = ⅔·r² for a hollow sphere.
    scale(_impulse, _t, -j);
    cross(_dSpin, _rVec, _impulse);
    addScaled(ball.spin, ball.spin, _dSpin, 1 / ((2 / 3) * ball.radius * ball.radius));
  }

  return -vn;
}

/** @returns impact speed, or 0 if no contact this step. */
export function collideFloor(ball) {
  const pen = ball.radius - (ball.pos.y - COURT.FLOOR_Y);
  if (pen <= 0) return 0;
  set(_n, 0, 1, 0);
  return resolveContact(ball, _n, pen, SURFACES.FLOOR);
}

/**
 * Backboard: plane at z = BOARD_FACE_Z facing the shooter (+z). Uses the
 * previous position to catch fast crossings that would tunnel through the
 * thin plane in a single step.
 */
export function collideBackboard(ball, prevZ) {
  const { BOARD_FACE_Z, BOARD_WIDTH, BOARD_BOTTOM_Y, BOARD_HEIGHT } = COURT;
  const within =
    Math.abs(ball.pos.x) <= BOARD_WIDTH / 2 &&
    ball.pos.y >= BOARD_BOTTOM_Y &&
    ball.pos.y <= BOARD_BOTTOM_Y + BOARD_HEIGHT;
  if (!within) return 0;

  // Only the front face is collidable; a ball that wrapped over the board
  // and is now behind it must not get pushed back through the glass.
  if (prevZ < BOARD_FACE_Z) return 0;

  const surface = BOARD_FACE_Z + ball.radius;
  const crossed = prevZ >= surface && ball.pos.z < surface;
  const overlapping = Math.abs(ball.pos.z - BOARD_FACE_Z) < ball.radius;
  if (!crossed && !overlapping) return 0;

  set(_n, 0, 0, 1);
  return resolveContact(ball, _n, surface - ball.pos.z, SURFACES.BOARD);
}

const _rimDelta = v3();
const _rimClosest = v3();

/**
 * Rim as a torus: find the closest point on the rim circle to the ball
 * center, then collide sphere-vs-tube. This single test handles front iron,
 * back iron, side rattles and rolls around the cylinder.
 */
export function collideRim(ball) {
  const c = COURT.RIM_CENTER;
  sub(_rimDelta, ball.pos, c);
  // Project onto the rim's horizontal plane to find the nearest circle point.
  const hx = _rimDelta.x;
  const hz = _rimDelta.z;
  const hLen = Math.hypot(hx, hz) || 1e-9;
  set(
    _rimClosest,
    c.x + (hx / hLen) * COURT.RIM_RADIUS,
    c.y,
    c.z + (hz / hLen) * COURT.RIM_RADIUS,
  );

  sub(_n, ball.pos, _rimClosest);
  const dist = len(_n);
  const minDist = ball.radius + COURT.RIM_TUBE_RADIUS;
  if (dist >= minDist || dist < 1e-9) return 0;

  scale(_n, _n, 1 / dist);
  return resolveContact(ball, _n, minDist - dist, SURFACES.RIM);
}
