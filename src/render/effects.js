import { RENDER } from '../config.js';
import { v3 } from '../core/math.js';

/**
 * Juice: ball trail, score confetti, floating text popups, screen flash.
 * Everything lives in world space and is projected at draw time, so effects
 * stay glued to the court under resize.
 */
export class Effects {
  constructor() {
    this.trail = [];      // {x,y,z}
    this.particles = [];  // {pos, vel, life, maxLife, color, size, spin}
    this.texts = [];      // {pos, text, color, t}
    this.flash = 0;
  }

  pushTrail(pos) {
    this.trail.push({ x: pos.x, y: pos.y, z: pos.z });
    if (this.trail.length > RENDER.TRAIL_LENGTH) this.trail.shift();
  }

  clearTrail() {
    this.trail.length = 0;
  }

  burst(pos, colors, count = 26) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const speed = 1.4 + (i % 5) * 0.55;
      this.particles.push({
        pos: v3(pos.x, pos.y, pos.z),
        vel: v3(Math.cos(a) * speed, 1.6 + (i % 3) * 0.9, Math.sin(a) * speed * 0.5),
        life: 0,
        maxLife: 0.8 + (i % 4) * 0.18,
        color: colors[i % colors.length],
        size: 0.028 + (i % 3) * 0.012,
        spin: (i % 2 ? 1 : -1) * (2 + (i % 4)),
      });
    }
  }

  popText(pos, text, color = '#ffb454') {
    this.texts.push({ pos: v3(pos.x, pos.y, pos.z), text, color, t: 0 });
  }

  flashScreen(strength = 0.18) {
    this.flash = Math.max(this.flash, strength);
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 6.5 * dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      t.pos.y += 0.55 * dt;
      if (t.t > 1.4) this.texts.splice(i, 1);
    }
    this.flash = Math.max(0, this.flash - dt * 0.9);
  }

  drawTrail(ctx, cam, ballRadius) {
    const n = this.trail.length;
    if (n < 2) return;
    const pt = {};
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = (i / n) ** 2 * 0.22;
      cam.project(this.trail[i], pt);
      if (!pt.visible) continue;
      ctx.fillStyle = `rgba(255, 140, 60, ${a})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, ballRadius * pt.s * (0.4 + 0.6 * (i / n)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawParticles(ctx, cam) {
    const pt = {};
    for (const p of this.particles) {
      cam.project(p.pos, pt);
      if (!pt.visible) continue;
      const fade = 1 - p.life / p.maxLife;
      const size = p.size * pt.s;
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(p.life * p.spin);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  drawTexts(ctx, cam) {
    const pt = {};
    for (const t of this.texts) {
      cam.project(t.pos, pt);
      if (!pt.visible) continue;
      const fade = t.t < 1.0 ? 1 : 1 - (t.t - 1.0) / 0.4;
      const size = Math.max(18, 0.34 * pt.s);
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.font = `${size}px Bungee, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 14;
      ctx.fillText(t.text, pt.x, pt.y);
      ctx.restore();
    }
  }

  drawFlash(ctx, w, h) {
    if (this.flash <= 0) return;
    ctx.fillStyle = `rgba(255, 196, 120, ${this.flash})`;
    ctx.fillRect(0, 0, w, h);
  }
}
