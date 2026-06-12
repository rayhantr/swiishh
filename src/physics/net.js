import { NET, COURT } from '../config.js';
import { v3, set, copy, sub, len, scale, addScaled, lerp } from '../core/math.js';

const _delta = v3();

/**
 * Verlet-simulated net: STRANDS vertical strands of RINGS nodes hanging from
 * the rim, linked vertically and around each ring with rope constraints
 * (resist stretch only — slack rope, like real cord). The ball pushes nodes
 * outward; the net never pushes the ball (the cone-drag in world.js stands in
 * for that), which keeps the coupled system unconditionally stable.
 */
export class Net {
  constructor() {
    this.strands = NET.STRANDS;
    this.rings = NET.RINGS;
    /** @type {{pos: any, prev: any, pinned: boolean}[]} flat [strand * rings + ring] */
    this.nodes = [];

    const c = COURT.RIM_CENTER;
    for (let s = 0; s < this.strands; s++) {
      const angle = (s / this.strands) * Math.PI * 2;
      for (let k = 0; k < this.rings; k++) {
        const t = k / (this.rings - 1);
        const radius = COURT.RIM_RADIUS * lerp(1, NET.BOTTOM_RADIUS_SCALE, t);
        const pos = v3(
          c.x + Math.cos(angle) * radius,
          c.y - t * NET.DEPTH,
          c.z + Math.sin(angle) * radius,
        );
        this.nodes.push({ pos, prev: v3(pos.x, pos.y, pos.z), pinned: k === 0 });
      }
    }

    // Rest lengths for vertical + ring-neighbor links.
    this.vRest = NET.DEPTH / (this.rings - 1);
    this.ringRest = [];
    for (let k = 0; k < this.rings; k++) {
      const t = k / (this.rings - 1);
      const radius = COURT.RIM_RADIUS * lerp(1, NET.BOTTOM_RADIUS_SCALE, t);
      this.ringRest.push(2 * radius * Math.sin(Math.PI / this.strands));
    }
  }

  node(s, k) {
    return this.nodes[s * this.rings + k];
  }

  step(dt, ball) {
    // Verlet integration.
    for (const n of this.nodes) {
      if (n.pinned) continue;
      const vx = (n.pos.x - n.prev.x) * NET.DAMPING;
      const vy = (n.pos.y - n.prev.y) * NET.DAMPING;
      const vz = (n.pos.z - n.prev.z) * NET.DAMPING;
      copy(n.prev, n.pos);
      n.pos.x += vx;
      n.pos.y += vy + NET.GRAVITY * dt * dt;
      n.pos.z += vz;
    }

    // Ball pushes nodes to its surface (one-way coupling).
    const reach = ball.radius + 0.02;
    for (const n of this.nodes) {
      if (n.pinned) continue;
      sub(_delta, n.pos, ball.pos);
      const d = len(_delta);
      if (d < reach && d > 1e-6) {
        scale(_delta, _delta, 1 / d);
        addScaled(n.pos, ball.pos, _delta, reach);
      }
    }

    // Rope constraints (only resist stretching).
    for (let it = 0; it < NET.ITERATIONS; it++) {
      for (let s = 0; s < this.strands; s++) {
        for (let k = 0; k < this.rings - 1; k++) {
          this.#rope(this.node(s, k), this.node(s, k + 1), this.vRest);
        }
        for (let k = 1; k < this.rings; k++) {
          this.#rope(this.node(s, k), this.node((s + 1) % this.strands, k), this.ringRest[k]);
        }
      }
    }
  }

  #rope(a, b, rest) {
    sub(_delta, b.pos, a.pos);
    const d = len(_delta);
    if (d <= rest || d < 1e-9) return;
    const corr = (d - rest) / d;
    const wa = a.pinned ? 0 : 1;
    const wb = b.pinned ? 0 : 1;
    const wSum = wa + wb;
    if (!wSum) return;
    addScaled(a.pos, a.pos, _delta, (corr * wa) / wSum);
    addScaled(b.pos, b.pos, _delta, (-corr * wb) / wSum);
  }
}
