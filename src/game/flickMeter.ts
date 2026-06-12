import { HOLD } from '../config.ts';
import { clamp } from '../core/math.ts';

/** Flick velocity in the hold plane, m/s. */
export interface Flick {
  x: number;
  y: number;
}

/** One hold-plane sample: position in meters, t in performance.now() ms. */
export interface HoldSample {
  x: number;
  y: number;
  t: number;
}

/**
 * Measures the release flick from a trail of hold-plane samples.
 *
 * Why peak, not trailing-average: the tracker reports "hand opened" tens of
 * milliseconds AFTER the real release — fast hands motion-blur and the pinch
 * classifier needs open fingers to settle. By then the hand has decelerated
 * (or stopped), so the velocity *at* the release event reads near zero and
 * a genuine throw gets misread as a fumble.
 *
 * Instead we slide a VELOCITY_WINDOW_MS-wide probe across the recent
 * history and take the fastest upward window whose end falls within
 * FLICK_RECENCY_MS of now. That recovers the true flick even when the
 * release event arrives late, while a hand that aimed quickly and then
 * settled still reads as a drop (the fast probes have aged out).
 *
 * Pure and DOM-free so tests/simulate.ts can exercise it.
 *
 * @param history oldest → newest
 */
export function measureFlick(history: HoldSample[], now: number): Flick {
  let bestY = 0;
  let bestX = 0;
  for (let j = history.length - 1; j > 0; j--) {
    const end = history[j];
    if (now - end.t > HOLD.FLICK_RECENCY_MS) break; // older ends only get older

    let i = j - 1;
    while (i > 0 && end.t - history[i].t < HOLD.VELOCITY_WINDOW_MS) i--;
    const start = history[i];
    const dt = (end.t - start.t) / 1000;
    if (dt < 0.025 || dt > 0.25) continue; // degenerate or frame-stall span

    const vy = (end.y - start.y) / dt;
    if (vy > bestY) {
      bestY = vy;
      bestX = (end.x - start.x) / dt;
    }
  }
  return { x: clamp(bestX, -14, 14), y: clamp(bestY, -14, 14) };
}
