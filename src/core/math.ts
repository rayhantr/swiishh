/**
 * Minimal 3-D vector helpers. Vectors are plain `{x, y, z}` objects and the
 * mutating variants (suffix `…To` / no suffix) are preferred in hot paths to
 * avoid allocation inside the 240 Hz physics loop.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const copy = (out: Vec3, a: Vec3): Vec3 => { out.x = a.x; out.y = a.y; out.z = a.z; return out; };
export const set = (out: Vec3, x: number, y: number, z: number): Vec3 => { out.x = x; out.y = y; out.z = z; return out; };

export const add = (out: Vec3, a: Vec3, b: Vec3): Vec3 => set(out, a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (out: Vec3, a: Vec3, b: Vec3): Vec3 => set(out, a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (out: Vec3, a: Vec3, s: number): Vec3 => set(out, a.x * s, a.y * s, a.z * s);

/** out = a + b·s — the workhorse of every integrator. */
export const addScaled = (out: Vec3, a: Vec3, b: Vec3, s: number): Vec3 =>
  set(out, a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (out: Vec3, a: Vec3, b: Vec3): Vec3 => {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  return set(out, x, y, z);
};

export const lenSq = (a: Vec3): number => a.x * a.x + a.y * a.y + a.z * a.z;
export const len = (a: Vec3): number => Math.sqrt(lenSq(a));

/** Normalizes in place; leaves the vector untouched if it is ~zero. */
export const normalize = (out: Vec3, a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? scale(out, a, 1 / l) : copy(out, a);
};

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate independent exponential smoothing toward `b`. */
export const damp = (a: number, b: number, rate: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-rate * dt));
