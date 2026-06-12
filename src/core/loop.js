import { PHYSICS } from '../config.js';

/**
 * Fixed-timestep game loop. Physics always steps at PHYSICS.FIXED_DT for
 * determinism; rendering happens once per animation frame. An accumulator
 * absorbs the difference, and frame gaps are clamped so a backgrounded tab
 * doesn't fast-forward the simulation when it wakes up.
 */
export class Loop {
  /**
   * @param {{ update: (dt: number) => void, render: (dt: number) => void }} hooks
   */
  constructor({ update, render }) {
    this.update = update;
    this.render = render;
    this.running = false;
    this._last = 0;
    this._acc = 0;
    this._raf = 0;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._acc = 0;
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _tick(now) {
    if (!this.running) return;
    const frameDt = Math.min((now - this._last) / 1000, PHYSICS.MAX_FRAME_DT);
    this._last = now;

    this._acc += frameDt;
    while (this._acc >= PHYSICS.FIXED_DT) {
      this.update(PHYSICS.FIXED_DT);
      this._acc -= PHYSICS.FIXED_DT;
    }

    this.render(frameDt);
    this._raf = requestAnimationFrame(this._tick);
  }
}
