import { Emitter } from '../core/events.ts';

/** Normalized 0..1 canvas coordinates. */
export interface PointerPoint {
  x: number;
  y: number;
}

export type PointerInputEvents = {
  down: PointerPoint;
  move: PointerPoint;
  up: PointerPoint;
};

type PointerEventName = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel';

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
export class PointerInput extends Emitter<PointerInputEvents> {
  el: HTMLElement;
  active = false;
  private _handlers: Array<[PointerEventName, (e: PointerEvent) => void]>;

  constructor(el: HTMLElement) {
    super();
    this.el = el;
    this._handlers = [
      ['pointerdown', (e) => this.#down(e)],
      ['pointermove', (e) => this.#move(e)],
      ['pointerup', (e) => this.#up(e)],
      ['pointercancel', (e) => this.#up(e)],
    ];
  }

  attach(): void {
    for (const [ev, fn] of this._handlers) this.el.addEventListener(ev, fn);
  }

  detach(): void {
    for (const [ev, fn] of this._handlers) this.el.removeEventListener(ev, fn);
    this.active = false;
  }

  #norm(e: PointerEvent): PointerPoint {
    const r = this.el.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    };
  }

  #down(e: PointerEvent): void {
    this.active = true;
    this.el.setPointerCapture?.(e.pointerId);
    this.emit('down', this.#norm(e));
  }

  #move(e: PointerEvent): void {
    if (!this.active) return;
    this.emit('move', this.#norm(e));
  }

  #up(e: PointerEvent): void {
    if (!this.active) return;
    this.active = false;
    this.emit('up', this.#norm(e));
  }
}
