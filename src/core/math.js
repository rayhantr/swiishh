/**
 * Minimal 3-D vector helpers. Vectors are plain `{x, y, z}` objects and the
 * mutating variants (suffix `…To` / no suffix) are preferred in hot paths to
 * avoid allocation inside the 240 Hz physics loop.
 */

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });

export const copy = (out, a) => { out.x = a.x; out.y = a.y; out.z = a.z; return out; };
export const set = (out, x, y, z) => { out.x = x; out.y = y; out.z = z; return out; };

export const add = (out, a, b) => set(out, a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (out, a, b) => set(out, a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (out, a, s) => set(out, a.x * s, a.y * s, a.z * s);

/** out = a + b·s — the workhorse of every integrator. */
export const addScaled = (out, a, b, s) =>
  set(out, a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);

export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (out, a, b) => {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  return set(out, x, y, z);
};

export const lenSq = (a) => a.x * a.x + a.y * a.y + a.z * a.z;
export const len = (a) => Math.sqrt(lenSq(a));

/** Normalizes in place; leaves the vector untouched if it is ~zero. */
export const normalize = (out, a) => {
  const l = len(a);
  return l > 1e-9 ? scale(out, a, 1 / l) : copy(out, a);
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Frame-rate independent exponential smoothing toward `b`. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
