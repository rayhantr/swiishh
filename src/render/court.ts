import { COURT } from '../config.ts';
import { newProjected } from './camera.ts';
import type { Camera } from './camera.ts';
import type { Vec3 } from '../core/math.ts';
import type { Net } from '../physics/net.ts';

/**
 * All static scenery: night sky, floodlit asphalt, chalk markings, pole,
 * backboard, rim and net. Pure draw functions — geometry is projected fresh
 * each frame (a few hundred points; trivial next to the canvas fills).
 *
 * Visual language: "midnight blacktop" — a single sodium floodlight over the
 * hoop, chalk-white lines, everything else falling away into blue-black.
 */

const CHALK = 'rgba(240, 235, 224, 0.5)';
const BASELINE_Z = COURT.BOARD_FACE_Z - 1.219; // backboard sits 4 ft inside the baseline
const POLE_Z = -5.35;

// Deterministic starfield (seeded — no Math.random so frames are stable).
const STARS = Array.from({ length: 70 }, (_, i) => {
  const h = (i * 2654435761) % 4096;
  return { x: (h % 64) / 64, y: ((h >> 6) % 64) / 64, tw: (i % 5) + 2 };
});

const _p = newProjected();
const _q = newProjected();

function projectedPath(ctx: CanvasRenderingContext2D, cam: Camera, points: Vec3[]): void {
  ctx.beginPath();
  let started = false;
  for (const wp of points) {
    cam.project(wp, _p);
    if (!_p.visible) continue;
    if (started) ctx.lineTo(_p.x, _p.y);
    else { ctx.moveTo(_p.x, _p.y); started = true; }
  }
}

export function drawBackdrop(ctx: CanvasRenderingContext2D, cam: Camera, time: number): void {
  const { w, h } = cam;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#06070c');
  sky.addColorStop(0.55, '#0c0f18');
  sky.addColorStop(1, '#131722');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // stars — fade near the horizon, twinkle slowly
  for (const s of STARS) {
    const y = s.y * cam.cy * 0.95;
    const a = 0.25 + 0.2 * Math.sin(time * 0.7 + s.tw);
    ctx.fillStyle = `rgba(220, 228, 255, ${a * (1 - s.y)})`;
    ctx.fillRect(s.x * w, y, 1.5, 1.5);
  }

  // city silhouette across the horizon
  ctx.fillStyle = '#0a0c13';
  const skyline = [0.06, 0.13, 0.09, 0.18, 0.11, 0.07, 0.15, 0.1];
  const bw = w / skyline.length;
  for (let i = 0; i < skyline.length; i++) {
    const bh = skyline[i] * h;
    ctx.fillRect(i * bw, cam.cy - bh + h * 0.04, bw + 1, bh);
  }

  // sodium floodlight halo above the hoop
  cam.project({ x: 0, y: 4.7, z: POLE_Z }, _p);
  if (_p.visible) {
    const r = 3.4 * _p.s;
    const glow = ctx.createRadialGradient(_p.x, _p.y, 0, _p.x, _p.y, r);
    glow.addColorStop(0, 'rgba(255, 180, 84, 0.34)');
    glow.addColorStop(0.4, 'rgba(255, 150, 60, 0.12)');
    glow.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(_p.x - r, _p.y - r, r * 2, r * 2);
    // the lamp itself
    ctx.fillStyle = '#ffd9a0';
    ctx.beginPath();
    ctx.ellipse(_p.x, _p.y, 0.16 * _p.s, 0.07 * _p.s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawGround(ctx: CanvasRenderingContext2D, cam: Camera): void {
  // asphalt slab
  projectedPath(ctx, cam, [
    { x: -10, y: 0, z: 2.45 },
    { x: -10, y: 0, z: -8.5 },
    { x: 10, y: 0, z: -8.5 },
    { x: 10, y: 0, z: 2.45 },
  ]);
  ctx.closePath();
  const ground = ctx.createLinearGradient(0, cam.cy, 0, cam.h);
  ground.addColorStop(0, '#191d27');
  ground.addColorStop(1, '#10131b');
  ctx.fillStyle = ground;
  ctx.fill();

  // pool of floodlight on the asphalt under the hoop
  cam.project({ x: 0, y: 0, z: -4.2 }, _p);
  if (_p.visible) {
    const rx = 4.4 * _p.s;
    const pool = ctx.createRadialGradient(_p.x, _p.y, 0, _p.x, _p.y, rx);
    pool.addColorStop(0, 'rgba(255, 178, 92, 0.17)');
    pool.addColorStop(0.6, 'rgba(255, 168, 80, 0.07)');
    pool.addColorStop(1, 'rgba(255, 168, 80, 0)');
    ctx.save();
    ctx.translate(_p.x, _p.y);
    ctx.scale(1, 0.38); // foreshortened ellipse of light
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawMarkings(ctx, cam);
}

function drawMarkings(ctx: CanvasRenderingContext2D, cam: Camera): void {
  ctx.save();
  ctx.strokeStyle = CHALK;
  cam.project({ x: 0, y: 0, z: -2 }, _p);
  ctx.lineWidth = Math.max(1, 0.03 * (_p.s || 60));

  // the key (lane) from free-throw line to baseline
  for (const sx of [-2.44, 2.44]) {
    projectedPath(ctx, cam, [
      { x: sx, y: 0, z: 0 },
      { x: sx, y: 0, z: BASELINE_Z },
    ]);
    ctx.stroke();
  }

  // free-throw line + circle
  projectedPath(ctx, cam, [
    { x: -2.44, y: 0, z: 0 },
    { x: 2.44, y: 0, z: 0 },
  ]);
  ctx.stroke();
  projectedPath(ctx, cam, circlePoints(0, 0, 1.8, 40));
  ctx.stroke();

  // baseline
  projectedPath(ctx, cam, [
    { x: -7, y: 0, z: BASELINE_Z },
    { x: 7, y: 0, z: BASELINE_Z },
  ]);
  ctx.stroke();

  // restricted-area arc under the rim
  projectedPath(ctx, cam, arcPoints(0, COURT.RIM_CENTER.z, 1.25, -Math.PI / 2, Math.PI / 2, 24));
  ctx.stroke();

  // lane hash marks
  ctx.globalAlpha = 0.7;
  for (const sx of [-2.44, 2.44]) {
    for (const z of [-1.0, -1.9, -2.8, -3.7]) {
      projectedPath(ctx, cam, [
        { x: sx, y: 0, z },
        { x: sx + (sx > 0 ? 0.18 : -0.18), y: 0, z },
      ]);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function circlePoints(cx: number, cz: number, r: number, n: number): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: 0, z: cz + Math.sin(a) * r });
  }
  return pts;
}

function arcPoints(cx: number, cz: number, r: number, a0: number, a1: number, n: number): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * (a1 - a0);
    pts.push({ x: cx + Math.sin(a) * r, y: 0, z: cz + Math.cos(a) * r });
  }
  return pts;
}

export function drawHoopStructure(ctx: CanvasRenderingContext2D, cam: Camera): void {
  // pole
  cam.project({ x: 0, y: 0, z: POLE_Z }, _p);
  cam.project({ x: 0, y: 4.45, z: POLE_Z }, _q);
  if (_p.visible && _q.visible) {
    ctx.strokeStyle = '#1c1f27';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(4, 0.12 * _p.s);
    ctx.beginPath();
    ctx.moveTo(_p.x, _p.y);
    ctx.lineTo(_q.x, _q.y);
    ctx.stroke();
    // amber rim-light along the pole's lit edge
    ctx.strokeStyle = 'rgba(255, 170, 90, 0.25)';
    ctx.lineWidth = Math.max(1.5, 0.03 * _p.s);
    ctx.beginPath();
    ctx.moveTo(_p.x + 0.05 * _p.s, _p.y);
    ctx.lineTo(_q.x + 0.05 * _q.s, _q.y);
    ctx.stroke();
  }

  // arm from pole to backboard
  cam.project({ x: 0, y: 3.75, z: POLE_Z }, _p);
  cam.project({ x: 0, y: 3.45, z: COURT.BOARD_FACE_Z - 0.05 }, _q);
  if (_p.visible && _q.visible) {
    ctx.strokeStyle = '#1c1f27';
    ctx.lineWidth = Math.max(3, 0.08 * _p.s);
    ctx.beginPath();
    ctx.moveTo(_p.x, _p.y);
    ctx.lineTo(_q.x, _q.y);
    ctx.stroke();
  }

  drawBackboard(ctx, cam);
}

function drawBackboard(ctx: CanvasRenderingContext2D, cam: Camera): void {
  const { BOARD_WIDTH: W, BOARD_BOTTOM_Y: B, BOARD_HEIGHT: H, BOARD_FACE_Z: Z } = COURT;
  const corners: Vec3[] = [
    { x: -W / 2, y: B, z: Z },
    { x: -W / 2, y: B + H, z: Z },
    { x: W / 2, y: B + H, z: Z },
    { x: W / 2, y: B, z: Z },
  ];
  projectedPath(ctx, cam, corners);
  ctx.closePath();

  // plexiglass: translucent, catching the floodlight at the top
  cam.project({ x: 0, y: B + H, z: Z }, _p);
  cam.project({ x: 0, y: B, z: Z }, _q);
  const glass = ctx.createLinearGradient(0, _p.y || 0, 0, _q.y || 0);
  glass.addColorStop(0, 'rgba(220, 230, 250, 0.18)');
  glass.addColorStop(1, 'rgba(190, 205, 235, 0.07)');
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.strokeStyle = 'rgba(240, 235, 224, 0.85)';
  ctx.lineWidth = Math.max(1.5, 0.035 * (_p.s || 60));
  ctx.stroke();

  // shooter's square — bottom edge level with the rim
  projectedPath(ctx, cam, [
    { x: -0.295, y: COURT.RIM_CENTER.y, z: Z },
    { x: -0.295, y: COURT.RIM_CENTER.y + 0.457, z: Z },
    { x: 0.295, y: COURT.RIM_CENTER.y + 0.457, z: Z },
    { x: 0.295, y: COURT.RIM_CENTER.y, z: Z },
  ]);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(240, 235, 224, 0.7)';
  ctx.stroke();
}

export interface RimEllipseShape {
  x: number;
  y: number;
  rx: number;
  ry: number;
  s: number;
}

/**
 * The projected rim is an ellipse; we measure it by projecting its center,
 * a side point and the near/far points, then draw it in two halves so the
 * ball can pass *between* them (under the near iron, over the far iron).
 */
export function rimEllipse(cam: Camera): RimEllipseShape {
  const c = COURT.RIM_CENTER;
  const center = cam.project(c);
  cam.project({ x: c.x + COURT.RIM_RADIUS, y: c.y, z: c.z }, _p);
  const rx = Math.abs(_p.x - center.x);
  cam.project({ x: c.x, y: c.y, z: c.z + COURT.RIM_RADIUS }, _p); // near
  cam.project({ x: c.x, y: c.y, z: c.z - COURT.RIM_RADIUS }, _q); // far
  return {
    x: center.x,
    y: (_p.y + _q.y) / 2,
    rx,
    ry: Math.abs(_q.y - _p.y) / 2,
    s: center.s,
  };
}

/** half: 'far' (top arc, behind the ball) or 'near' (bottom arc, in front). */
export function drawRimHalf(ctx: CanvasRenderingContext2D, ellipse: RimEllipseShape, half: 'far' | 'near'): void {
  const lw = Math.max(2, 0.036 * ellipse.s);
  ctx.save();
  ctx.strokeStyle = '#ff5d2e';
  ctx.lineWidth = lw;
  ctx.shadowColor = 'rgba(255, 93, 46, 0.6)';
  ctx.shadowBlur = lw * 1.5;
  ctx.beginPath();
  // Looking UP at the rim from below: the far iron projects to the LOWER
  // arc (0→π in canvas angles) and the near iron to the upper arc (π→2π).
  if (half === 'far') ctx.ellipse(ellipse.x, ellipse.y, ellipse.rx, ellipse.ry, 0, 0, Math.PI);
  else ctx.ellipse(ellipse.x, ellipse.y, ellipse.rx, ellipse.ry, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Net strands, split by depth so strands behind the ball render first.
 * @param half — strands with anchor z beyond/before the rim center
 */
export function drawNet(ctx: CanvasRenderingContext2D, cam: Camera, net: Net, half: 'far' | 'near'): void {
  const rimZ = COURT.RIM_CENTER.z;
  ctx.save();
  ctx.strokeStyle = 'rgba(244, 240, 232, 0.65)';
  ctx.lineWidth = Math.max(1, 0.012 * (cam.project(COURT.RIM_CENTER, _p).s || 60));
  for (let s = 0; s < net.strands; s++) {
    const anchor = net.node(s, 0).pos;
    const isFar = anchor.z < rimZ;
    if ((half === 'far') !== isFar) continue;
    const next = (s + 1) % net.strands;
    ctx.beginPath();
    for (let k = 0; k < net.rings - 1; k++) {
      // diamond mesh: cross to the neighbour strand one ring down and back
      const a = net.node(s, k).pos;
      const b = net.node(next, k + 1).pos;
      const c2 = net.node(next, k).pos;
      const d2 = net.node(s, k + 1).pos;
      cam.project(a, _p);
      cam.project(b, _q);
      if (_p.visible && _q.visible) { ctx.moveTo(_p.x, _p.y); ctx.lineTo(_q.x, _q.y); }
      cam.project(c2, _p);
      cam.project(d2, _q);
      if (_p.visible && _q.visible) { ctx.moveTo(_p.x, _p.y); ctx.lineTo(_q.x, _q.y); }
    }
    ctx.stroke();
  }
  ctx.restore();
}
