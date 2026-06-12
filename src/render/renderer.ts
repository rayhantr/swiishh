import { COURT, RENDER, DEBUG } from '../config.ts';
import { Camera, newProjected } from './camera.ts';
import { Effects } from './effects.ts';
import {
  drawBackdrop, drawGround, drawHoopStructure,
  rimEllipse, drawRimHalf, drawNet,
} from './court.ts';
import { clamp } from '../core/math.ts';
import type { World } from '../physics/world.ts';
import type { Ball } from '../physics/ball.ts';
import type { Cursor, GameView } from '../game/game.ts';

const _p = newProjected();

/**
 * Composes the frame. Depth is handled painter's-style with three ball
 * slots relative to the rim plane (behind / through / in front), which is
 * exact for everything a free throw can do.
 */
export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera = new Camera();
  effects = new Effects();
  time = 0;
  private _fps = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, RENDER.MAX_DPR);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.resize(w, h);
  }

  render(world: World, view: GameView, dt: number): void {
    this.time += dt;
    this.effects.update(dt);
    const ctx = this.ctx;
    const cam = this.camera;
    const ball = world.ball;

    drawBackdrop(ctx, cam, this.time);
    drawGround(ctx, cam);
    if (view.ballVisible) this.#drawBallShadow(ctx, cam, ball);
    drawHoopStructure(ctx, cam);

    const rim = rimEllipse(cam);
    const rimZ = COURT.RIM_CENTER.z;
    const slot = ball.pos.z < rimZ - 0.3 ? 'behind' : ball.pos.z > rimZ + 0.5 ? 'front' : 'through';

    if (view.ballVisible && slot === 'behind') this.#drawBall(ctx, cam, ball);
    drawRimHalf(ctx, rim, 'far');
    drawNet(ctx, cam, world.net, 'far');
    if (view.ballVisible && slot === 'through') {
      this.effects.drawTrail(ctx, cam, ball.radius);
      this.#drawBall(ctx, cam, ball);
    }
    drawNet(ctx, cam, world.net, 'near');
    drawRimHalf(ctx, rim, 'near');
    if (view.ballVisible && slot === 'front') {
      this.effects.drawTrail(ctx, cam, ball.radius);
      this.#drawBall(ctx, cam, ball);
    }

    if (view.cursor?.present) this.#drawHandCursor(ctx, cam, view.cursor);

    this.effects.drawParticles(ctx, cam);
    this.effects.drawTexts(ctx, cam);
    this.effects.drawFlash(ctx, cam.w, cam.h);

    if (DEBUG) this.#drawDebug(ctx, world, dt);
  }

  #drawBallShadow(ctx: CanvasRenderingContext2D, cam: Camera, ball: Ball): void {
    cam.project({ x: ball.pos.x, y: 0, z: ball.pos.z }, _p);
    if (!_p.visible) return;
    const r = ball.radius * _p.s;
    const spread = 1 + ball.pos.y * 0.22;
    const alpha = clamp(0.4 - ball.pos.y * 0.055, 0.06, 0.4);
    const g = ctx.createRadialGradient(_p.x, _p.y, 0, _p.x, _p.y, r * spread);
    g.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.translate(_p.x, _p.y);
    ctx.scale(1, 0.32);
    ctx.translate(-_p.x, -_p.y);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(_p.x, _p.y, r * spread, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  #drawBall(ctx: CanvasRenderingContext2D, cam: Camera, ball: Ball): void {
    cam.project(ball.pos, _p);
    if (!_p.visible) return;
    const r = ball.radius * _p.s;
    const { x, y } = _p;

    // body — lit from the floodlight side (upper area)
    const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.45, r * 0.15, x, y, r);
    body.addColorStop(0, '#ff9a4d');
    body.addColorStop(0.55, '#f0691f');
    body.addColorStop(1, '#a93d12');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // seams — the horizontal seam slides with accumulated backspin so the
    // ball visibly rotates in flight
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(60, 22, 8, 0.8)';
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    const phase = Math.sin(ball.rollAngle);
    ctx.beginPath();
    ctx.ellipse(x, y, r, Math.abs(phase) * r * 0.92, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.4, r, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // specular glint
    ctx.fillStyle = 'rgba(255, 230, 190, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.35, y - r * 0.45, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  #drawHandCursor(ctx: CanvasRenderingContext2D, cam: Camera, cursor: Cursor): void {
    cam.project(cursor, _p);
    if (!_p.visible) return;
    const r = 0.09 * _p.s;
    const pulse = 1 + 0.08 * Math.sin(this.time * 6);
    ctx.save();
    ctx.strokeStyle = cursor.active ? '#7ee8c7' : 'rgba(255, 180, 84, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = cursor.active ? '#7ee8c7' : '#ffb454';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(_p.x, _p.y, r * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(_p.x, _p.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.restore();
  }

  #drawDebug(ctx: CanvasRenderingContext2D, world: World, dt: number): void {
    this._fps = this._fps * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
    const b = world.ball;
    const lines = [
      `fps ${this._fps.toFixed(0)}`,
      `pos ${b.pos.x.toFixed(2)} ${b.pos.y.toFixed(2)} ${b.pos.z.toFixed(2)}`,
      `vel ${b.vel.x.toFixed(2)} ${b.vel.y.toFixed(2)} ${b.vel.z.toFixed(2)}`,
      `spin ${b.spin.x.toFixed(1)} ${b.spin.y.toFixed(1)} ${b.spin.z.toFixed(1)}`,
      `live ${world.shotLive} rim ${world.rimTouched} board ${world.boardTouched}`,
    ];
    ctx.save();
    ctx.font = '12px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#7ee8c7';
    lines.forEach((l, i) => ctx.fillText(l, 12, this.camera.h - 76 + i * 15));
    ctx.restore();
  }
}
