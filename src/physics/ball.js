import { PHYSICS, BALL } from '../config.js';
import { v3, set, copy, len, cross, normalize, addScaled, scale } from '../core/math.js';

const CROSS_SECTION = Math.PI * BALL.RADIUS * BALL.RADIUS;
const DRAG_K = 0.5 * PHYSICS.AIR_DENSITY * BALL.DRAG_COEF * CROSS_SECTION / BALL.MASS;

// scratch vectors — reused every step, never allocated in the loop
const _acc = v3();
const _magnusDir = v3();

/**
 * The ball. In flight it experiences gravity, quadratic air drag and Magnus
 * lift from its spin. `spin` is an angular-velocity vector (rad/s); positive
 * x-spin is backspin for a ball travelling toward the hoop (−z), which
 * produces upward lift — exactly like a real free throw.
 */
export class Ball {
  constructor() {
    this.radius = BALL.RADIUS;
    this.pos = v3(0, 1.6, 0.2);
    this.vel = v3();
    this.spin = v3();
    this.held = false;
    this.asleep = false;
    /** Accumulated rotation angle — purely visual (seam rendering). */
    this.rollAngle = 0;
  }

  reset(pos) {
    copy(this.pos, pos);
    set(this.vel, 0, 0, 0);
    set(this.spin, 0, 0, 0);
    this.held = false;
    this.asleep = false;
  }

  launch(vel, spin) {
    copy(this.vel, vel);
    copy(this.spin, spin);
    this.held = false;
    this.asleep = false;
  }

  integrate(dt) {
    if (this.held || this.asleep) return;

    const speed = len(this.vel);
    set(_acc, 0, PHYSICS.GRAVITY, 0);

    // Quadratic drag: a = −k·|v|·v
    addScaled(_acc, _acc, this.vel, -DRAG_K * speed);

    // Magnus lift. Empirical Cl ≈ 1 / (2 + v/(r·ω)), capped — a good fit for
    // basketballs in the 5–10 m/s, 1–3 rev/s regime.
    const spinMag = len(this.spin);
    if (speed > 0.05 && spinMag > 0.5) {
      const cl = Math.min(
        BALL.MAGNUS_MAX_CL,
        1 / (2 + speed / (this.radius * spinMag)),
      );
      const fOverM = 0.5 * PHYSICS.AIR_DENSITY * cl * CROSS_SECTION * speed * speed / BALL.MASS;
      cross(_magnusDir, this.spin, this.vel);
      normalize(_magnusDir, _magnusDir);
      addScaled(_acc, _acc, _magnusDir, fOverM);
    }

    // Semi-implicit Euler — stable for stiff contact at small fixed steps.
    addScaled(this.vel, this.vel, _acc, dt);
    addScaled(this.pos, this.pos, this.vel, dt);

    // Air slowly bleeds spin off the ball.
    scale(this.spin, this.spin, Math.exp(-BALL.SPIN_AIR_DECAY * dt));
    this.rollAngle += this.spin.x * dt;
  }
}
