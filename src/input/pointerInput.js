import { Emitter } from '../core/events.js';

/**
 * Mouse / touch / stylus fallback. Emits the same vocabulary the game
 * expects from any controller:
 *
 *  'down' {x, y}   — press, normalized 0..1 canvas coordinates
 *  'move' {x, y}
 *  'up'   {x, y}
 *
 * Pointer events unify mouse and touch; pointer capture keeps the drag
 * alive even when the finger slides off the canvas edge mid-flick.
 */
export class PointerInput extends Emitter {
  constructor(el) {
    super();
    this.el = el;
    this.active = false;
    this._handlers = [
      ['pointerdown', (e) => this.#down(e)],
      ['pointermove', (e) => this.#move(e)],
      ['pointerup', (e) => this.#up(e)],
      ['pointercancel', (e) => this.#up(e)],
    ];
  }

  attach() {
    for (const [ev, fn] of this._handlers) this.el.addEventListener(ev, fn);
  }

  detach() {
    for (const [ev, fn] of this._handlers) this.el.removeEventListener(ev, fn);
    this.active = false;
  }

  #norm(e) {
    const r = this.el.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    };
  }

  #down(e) {
    this.active = true;
    this.el.setPointerCapture?.(e.pointerId);
    this.emit('down', this.#norm(e));
  }

  #move(e) {
    if (!this.active) return;
    this.emit('move', this.#norm(e));
  }

  #up(e) {
    if (!this.active) return;
    this.active = false;
    this.emit('up', this.#norm(e));
  }
}
