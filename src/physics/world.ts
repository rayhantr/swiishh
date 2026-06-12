import { COURT, BALL, NET, GAME, PHYSICS } from '../config.ts';
import { v3, copy, len, lerp } from '../core/math.ts';
import type { Vec3 } from '../core/math.ts';
import { Ball } from './ball.ts';
import { Net } from './net.ts';
import { collideFloor, collideBackboard, collideRim } from './colliders.ts';
import { Emitter } from '../core/events.ts';

export type WorldEvents = {
  bounce: { speed: number };
  rim: { speed: number };
  board: { speed: number };
  score: { swish: boolean; points: number };
  miss: undefined;
  rest: undefined;
};

/**
 * Owns the ball, the net and the shot lifecycle. Emits:
 *
 *  'bounce'  {speed}          — floor contact
 *  'rim'     {speed}          — rim contact
 *  'board'   {speed}          — backboard contact
 *  'score'   {swish, points}  — ball passed down through the rim
 *  'miss'                     — live shot ended without a score
 *  'rest'                     — ball came to rest on the floor
 *
 * A shot is "live" from launch until it scores, touches the floor, leaves
 * the play volume, or times out. Floor-first means a free throw can never
 * score after bouncing, so the first floor contact resolves a live shot.
 */
export class World extends Emitter<WorldEvents> {
  ball = new Ball();
  net = new Net();
  shotLive = false;
  rimTouched = false;
  boardTouched = false;
  shotTime = 0;
  private _prev = v3();
  private _netCooldown = 0;

  launch(vel: Vec3, spin: Vec3): void {
    this.ball.launch(vel, spin);
    this.shotLive = true;
    this.rimTouched = false;
    this.boardTouched = false;
    this.shotTime = 0;
  }

  /** One fixed step. The 240 Hz step is small enough that a single pass per
   *  collider is robust (max travel ≈ 5 cm at peak speed vs. a 14 cm rim
   *  contact envelope). */
  step(dt: number): void {
    const ball = this.ball;
    if (this.shotLive) this.shotTime += dt;

    copy(this._prev, ball.pos);
    ball.integrate(dt);

    if (!ball.held && !ball.asleep) {
      // ── collisions ────────────────────────────────────────────────
      const rimHit = collideRim(ball);
      if (rimHit > 0.3) {
        this.rimTouched = true;
        this.emit('rim', { speed: rimHit });
      } else if (rimHit > 0) {
        this.rimTouched = true;
      }

      const boardHit = collideBackboard(ball, this._prev.z);
      if (boardHit > 0.3) {
        this.boardTouched = true;
        this.emit('board', { speed: boardHit });
      } else if (boardHit > 0) {
        this.boardTouched = true;
      }

      const floorHit = collideFloor(ball);
      if (floorHit > 0.5) this.emit('bounce', { speed: floorHit });
      if (floorHit > 0 && this.shotLive) this.#endShot(false);

      // ── net drag: the cone of cord below the rim slows the ball ──
      this.#applyNetDrag(dt);

      // ── scoring: downward crossing of the rim plane, inside the ring ──
      if (this.shotLive && this._prev.y > COURT.RIM_CENTER.y && ball.pos.y <= COURT.RIM_CENTER.y && ball.vel.y < 0) {
        const t = (this._prev.y - COURT.RIM_CENTER.y) / (this._prev.y - ball.pos.y);
        const cx = lerp(this._prev.x, ball.pos.x, t) - COURT.RIM_CENTER.x;
        const cz = lerp(this._prev.z, ball.pos.z, t) - COURT.RIM_CENTER.z;
        if (Math.hypot(cx, cz) < COURT.RIM_RADIUS - ball.radius * 0.25) {
          this.#score();
        }
      }

      // ── out of bounds / timeout / rest ────────────────────────────
      const oob =
        Math.abs(ball.pos.x) > COURT.OUT_OF_BOUNDS.x ||
        ball.pos.z > COURT.OUT_OF_BOUNDS.zNear ||
        ball.pos.z < COURT.OUT_OF_BOUNDS.zFar;
      if (this.shotLive && (oob || this.shotTime > GAME.SHOT_TIMEOUT_MS / 1000)) {
        this.#endShot(false);
      }

      if (
        !this.shotLive &&
        ball.pos.y < ball.radius + 0.01 &&
        len(ball.vel) < BALL.REST_SPEED
      ) {
        ball.asleep = true;
        this.emit('rest');
      }
    }

    this.net.step(dt, ball);
    if (this._netCooldown > 0) this._netCooldown -= dt;
  }

  #applyNetDrag(dt: number): void {
    const ball = this.ball;
    const c = COURT.RIM_CENTER;
    const depth = c.y - ball.pos.y;
    if (depth < 0 || depth > NET.DEPTH + ball.radius) return;

    const t = Math.min(depth / NET.DEPTH, 1);
    const coneR = COURT.RIM_RADIUS * lerp(1, NET.BOTTOM_RADIUS_SCALE, t);
    const h = Math.hypot(ball.pos.x - c.x, ball.pos.z - c.z);
    if (h > coneR + ball.radius * 0.5) return;

    const k = Math.exp(-NET.BALL_DRAG * dt);
    ball.vel.x *= k;
    ball.vel.y *= k * 0.985; // cords grip the ball a touch harder vertically
    ball.vel.z *= k;
  }

  #score(): void {
    this.shotLive = false;
    const swish = !this.rimTouched && !this.boardTouched;
    this.emit('score', {
      swish,
      points: swish ? GAME.POINTS_CLEAN : GAME.POINTS_RATTLED,
    });
  }

  #endShot(scored: boolean): void {
    this.shotLive = false;
    if (!scored) this.emit('miss');
  }
}
