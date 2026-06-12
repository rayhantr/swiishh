import { HOLD, THROW, GAME, ASSIST, COURT, GESTURE } from '../config.js';
import { v3, set, clamp, lerp, damp } from '../core/math.js';
import { computeLaunch } from './throwModel.js';
import { Stats } from './scoring.js';

const SPAWN = v3(0, 1.55, HOLD.Z);
/** Hand input is expanded so you don't have to reach the frame edges. */
const REACH = 1.35;

/**
 * The conductor. Owns the shot lifecycle:
 *
 *   idle ──grab──▶ held ──flick──▶ flight ──score/miss/rest──▶ wait ──▶ idle
 *
 * and translates whichever controller is active (hand or pointer) into that
 * lifecycle. Controllers stay dumb; all gameplay decisions live here.
 */
export class Game {
  constructor({ world, renderer, hud, audio }) {
    this.world = world;
    this.renderer = renderer;
    this.hud = hud;
    this.audio = audio;
    this.stats = new Stats();

    this.mode = null;          // 'camera' | 'pointer'
    this.playing = false;
    this.paused = false;
    this.assistEnabled = true;
    this.phase = 'idle';       // idle | held | flight | wait

    this.holdTarget = v3(SPAWN.x, SPAWN.y, SPAWN.z);
    this.cursor = { x: 0, y: 0, z: HOLD.Z, active: false, present: false };
    this.history = [];         // {x, y, t} hold-plane samples for flick velocity
    this.idleT = 0;
    this.respawnTimer = -1;
    this.handLostAt = 0;
    this.tutored = this.#loadFlag('swish.tutored');
    this._trailTick = 0;

    this.#wireWorld();
  }

  // ── session ───────────────────────────────────────────────────────────
  begin(mode) {
    this.mode = mode;
    this.playing = true;
    this.paused = false;
    this.respawn();
    this.hud.setStats(this.stats);
    this.hud.setPlayingChrome(true, mode);
    if (!this.tutored) {
      this.hud.message(
        mode === 'camera' ? 'PINCH OR FIST TO GRAB' : 'PRESS THE BALL TO GRAB',
        mode === 'camera' ? 'then flick your hand up to shoot' : 'then drag and flick up to shoot',
        5000,
      );
    }
  }

  quit() {
    this.playing = false;
    this.paused = false;
    this.phase = 'idle';
    this.world.ball.reset(SPAWN);
    this.cursor.present = false;
    this.hud.setPlayingChrome(false);
    this.hud.clearMessage();
  }

  setPaused(p) {
    if (!this.playing) return;
    this.paused = p;
    this.hud.setPaused(p);
  }

  toggleAssist() {
    this.assistEnabled = !this.assistEnabled;
    this.hud.setAssist(this.assistEnabled);
    return this.assistEnabled;
  }

  get assist() {
    if (!this.assistEnabled) return 0;
    return this.mode === 'camera' ? ASSIST.CAMERA : ASSIST.POINTER;
  }

  // ── input: hand tracking ──────────────────────────────────────────────
  onHand(e) {
    if (!this.playing || this.paused) return;

    if (!e.present) {
      this.cursor.present = false;
      if (this.phase === 'held') {
        if (!this.handLostAt) this.handLostAt = performance.now();
        else if (performance.now() - this.handLostAt > GESTURE.LOST_HAND_DROP_MS) {
          this.#drop();
          this.hud.toast('Hand left the frame — ball dropped');
        }
      }
      return;
    }
    this.handLostAt = 0;

    // Expand reach so comfortable hand motion covers the whole hold plane.
    const nx = clamp((e.x - 0.5) * REACH + 0.5, 0, 1);
    const ny = clamp((e.y - 0.5) * REACH + 0.5, 0, 1);
    this.#setHoldTarget(nx, ny);
    this.cursor.present = true;
    this.cursor.active = e.grab;
    this.cursor.x = this.holdTarget.x;
    this.cursor.y = this.holdTarget.y;

    if (e.grab && this.phase === 'idle') this.#grab();
    else if (!e.grab && this.phase === 'held') this.#release();
  }

  // ── input: pointer ────────────────────────────────────────────────────
  onPointerDown(p) {
    if (!this.playing || this.paused || this.phase !== 'idle') return;
    this.#setHoldTarget(p.x, p.y);
    if (this.#pointerNearBall(p)) this.#grab();
    else if (!this.tutored) this.hud.message('PRESS ON THE BALL', 'grab it, then flick up', 1800);
  }

  onPointerMove(p) {
    if (this.phase !== 'held') return;
    this.#setHoldTarget(p.x, p.y);
  }

  onPointerUp() {
    if (this.phase === 'held') this.#release();
  }

  #pointerNearBall(p) {
    const cam = this.renderer.camera;
    const ballPt = cam.project(this.world.ball.pos, {});
    if (!ballPt.visible) return false;
    const px = p.x * cam.w;
    const py = p.y * cam.h;
    const grabRadius = Math.max(60, this.world.ball.radius * ballPt.s * 2.6);
    return Math.hypot(px - ballPt.x, py - ballPt.y) < grabRadius;
  }

  // ── shot lifecycle ────────────────────────────────────────────────────
  #setHoldTarget(nx, ny) {
    set(
      this.holdTarget,
      (nx - 0.5) * 2 * HOLD.X_RANGE,
      lerp(HOLD.Y_MAX, HOLD.Y_MIN, ny),
      HOLD.Z,
    );
  }

  #grab() {
    const ball = this.world.ball;
    ball.held = true;
    ball.asleep = false;
    set(ball.vel, 0, 0, 0);
    set(ball.spin, 0, 0, 0);
    this.phase = 'held';
    this.history.length = 0;
    this.renderer.effects.clearTrail();
    this.audio.unlock();
    if (!this.tutored) this.hud.message('FLICK UP TO SHOOT', 'a smooth upward snap — arc matters', 3000);
  }

  #release() {
    const flick = this.#measureFlick();
    this.history.length = 0;

    if (flick.y < THROW.MIN_UP_FLICK) return this.#drop(flick);

    const ball = this.world.ball;
    const { vel, spin } = computeLaunch(flick, ball.pos, this.assist);
    this.world.launch(vel, spin);
    this.stats.registerAttempt();
    this.hud.setStats(this.stats);
    this.phase = 'flight';
  }

  /** Weak release: the ball just slips out — no attempt counted. */
  #drop(flick = { x: 0, y: 0 }) {
    const ball = this.world.ball;
    ball.held = false;
    set(ball.vel, flick.x * 0.6, Math.max(flick.y, 0) * 0.6, 0);
    this.phase = 'flight';
  }

  /** Average velocity over the trailing window — robust to per-frame noise. */
  #measureFlick() {
    const now = performance.now();
    const h = this.history;
    let oldest = null;
    for (const sample of h) {
      if (now - sample.t <= HOLD.VELOCITY_WINDOW_MS) { oldest = sample; break; }
    }
    const newest = h[h.length - 1];
    if (!oldest || !newest || newest.t - oldest.t < 16) return { x: 0, y: 0 };
    const dt = (newest.t - oldest.t) / 1000;
    return {
      x: clamp((newest.x - oldest.x) / dt, -14, 14),
      y: clamp((newest.y - oldest.y) / dt, -14, 14),
    };
  }

  #wireWorld() {
    const { world, hud, audio } = this;

    world.on('score', ({ swish, points }) => {
      const isNewHigh = this.stats.registerMake(points);
      hud.setStats(this.stats);
      hud.bumpScore();
      audio.swish();
      audio.score(swish);

      const fx = this.renderer.effects;
      fx.popText(COURT.RIM_CENTER, `+${points}`, swish ? '#7ee8c7' : '#ffb454');
      fx.burst(COURT.RIM_CENTER, swish ? ['#7ee8c7', '#fff3da', '#ffb454'] : ['#ffb454', '#ff6a3d']);
      fx.flashScreen(swish ? 0.16 : 0.1);

      if (swish) hud.message('SWISH!', this.stats.streak >= 3 ? `${this.stats.streak} in a row 🔥` : 'nothing but net');
      else if (this.stats.streak >= 3) hud.message(`${this.stats.streak} STRAIGHT`, 'stay hot');
      if (isNewHigh && this.stats.score > 10) hud.toast(`New high score: ${this.stats.highScore}`);
      if (!this.tutored) { this.tutored = true; this.#saveFlag('swish.tutored'); }

      this.#scheduleRespawn(GAME.RESPAWN_DELAY_MS);
    });

    world.on('miss', () => {
      this.stats.registerMiss();
      hud.setStats(this.stats);
      hud.message('MISS', this.#missReason());
      this.#scheduleRespawn(GAME.RESPAWN_DELAY_MS + 500);
    });

    world.on('rest', () => {
      if (this.phase === 'flight') this.#scheduleRespawn(350);
    });

    world.on('bounce', ({ speed }) => audio.bounce(speed / 7));
    world.on('rim', ({ speed }) => audio.rim(speed / 6));
    world.on('board', ({ speed }) => audio.board(speed / 7));
  }

  #missReason() {
    const b = this.world.ball;
    const rimZ = COURT.RIM_CENTER.z;
    if (this.world.rimTouched) return 'in and out — so close';
    if (this.world.boardTouched) return 'off the glass';
    if (Math.abs(b.pos.x) > 0.5) return b.pos.x > 0 ? 'wide right' : 'wide left';
    if (b.pos.z > rimZ + 0.4) return 'short — flick harder';
    if (b.pos.z < rimZ - 0.5) return 'long — softer touch';
    return 'unlucky bounce';
  }

  #scheduleRespawn(ms) {
    if (this.respawnTimer >= 0 || this.phase === 'wait') return;
    this.phase = 'wait';
    this.respawnTimer = ms / 1000;
  }

  respawn() {
    this.world.ball.reset(SPAWN);
    this.phase = 'idle';
    this.idleT = 0;
    this.respawnTimer = -1;
    this.renderer.effects.clearTrail();
  }

  // ── per-physics-step update (called before world.step) ───────────────
  update(dt) {
    if (!this.playing || this.paused) return;
    const ball = this.world.ball;

    if (this.phase === 'idle') {
      this.idleT += dt;
      ball.pos.y = SPAWN.y + Math.sin(this.idleT * Math.PI * 2 * GAME.IDLE_BOB_HZ) * GAME.IDLE_BOB_AMP;
    } else if (this.phase === 'held') {
      const k = HOLD.SMOOTHING;
      ball.pos.x = damp(ball.pos.x, this.holdTarget.x, k, dt);
      ball.pos.y = damp(ball.pos.y, this.holdTarget.y, k, dt);
      ball.pos.z = damp(ball.pos.z, this.holdTarget.z, k, dt);
      ball.rollAngle += dt * 1.5; // a little life in the hand
      this.history.push({ x: this.holdTarget.x, y: this.holdTarget.y, t: performance.now() });
      if (this.history.length > 64) this.history.shift();
    } else if (this.phase === 'flight') {
      if (++this._trailTick % 8 === 0) this.renderer.effects.pushTrail(ball.pos);
    } else if (this.phase === 'wait') {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
    }
  }

  /** What the renderer needs to know this frame. */
  get view() {
    return {
      ballVisible: this.playing,
      cursor: this.mode === 'camera' && this.playing && !this.paused ? this.cursor : null,
    };
  }

  #loadFlag(key) {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  }

  #saveFlag(key) {
    try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
  }
}
