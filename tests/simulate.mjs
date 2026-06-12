/**
 * Headless physics validation — run with `node tests/simulate.mjs`.
 *
 * The physics modules are DOM-free on purpose so the exact code that ships
 * can be simulated here. This harness:
 *   1. sanity-checks floor restitution against the NBA inflation rule,
 *   2. sweeps flick strengths with NO assist and verifies a make window exists,
 *   3. sweeps with camera-level assist and verifies the window is comfortable,
 *   4. verifies off-center flicks miss (assist must not be an aimbot).
 *
 * Exits non-zero on failure, so it works as a CI gate.
 */
import { PHYSICS, COURT } from '../src/config.js';
import { World } from '../src/physics/world.js';
import { computeLaunch } from '../src/game/throwModel.js';
import { v3 } from '../src/core/math.js';

const RELEASE = v3(0, 2.0, 0.15); // typical release point of a held ball

function simulateShot(flick, assist) {
  const world = new World();
  world.ball.reset(RELEASE);
  const { vel, spin } = computeLaunch(flick, RELEASE, assist);
  world.launch(vel, spin);

  let outcome = null;
  let swish = false;
  let rim = false;
  let peak = 0;
  world.on('score', (e) => { outcome = 'score'; swish = e.swish; });
  world.on('miss', () => { outcome ??= 'miss'; });
  world.on('rim', () => { rim = true; });

  const maxSteps = 10 / PHYSICS.FIXED_DT;
  for (let i = 0; i < maxSteps && !outcome; i++) {
    world.step(PHYSICS.FIXED_DT);
    peak = Math.max(peak, world.ball.pos.y);
  }
  return { outcome, swish, rim, peak, vel };
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// ── 1. floor restitution ────────────────────────────────────────────────
{
  const world = new World();
  world.ball.reset(v3(0, 1.829 + world.ball.radius, 1.5)); // 6 ft drop
  world.ball.held = false;
  let peakAfterBounce = 0;
  let bounced = false;
  world.on('bounce', () => { bounced = true; });
  for (let i = 0; i < 3 / PHYSICS.FIXED_DT; i++) {
    world.step(PHYSICS.FIXED_DT);
    if (bounced) peakAfterBounce = Math.max(peakAfterBounce, world.ball.pos.y - world.ball.radius);
  }
  const inches = peakAfterBounce / 0.0254;
  console.log('\nFloor restitution (NBA rule: 6 ft drop rebounds 49–54 in):');
  check('rebound height in range', inches > 45 && inches < 58, `${inches.toFixed(1)} in`);
}

// ── 2. raw physics sweep (assist = 0) ───────────────────────────────────
{
  console.log('\nRaw flick sweep, no assist (flick m/s → outcome):');
  const makes = [];
  for (let f = 4.0; f <= 7.6; f += 0.2) {
    const r = simulateShot({ x: 0, y: f }, 0);
    const tag = r.outcome === 'score' ? (r.swish ? 'SWISH' : 'score') : r.outcome;
    console.log(`    flick ${f.toFixed(1)} → ${tag}  (peak ${r.peak.toFixed(2)} m)`);
    if (r.outcome === 'score') makes.push(f);
  }
  check('a make window exists without assist', makes.length >= 2,
    makes.length ? `${makes[0].toFixed(1)}–${makes.at(-1).toFixed(1)} m/s` : 'none');
}

// ── 3. camera-assist sweep ──────────────────────────────────────────────
{
  // "Reasonable" = arcs whose peak actually clears the rim (~5.6+ m/s);
  // flatter flicks are SUPPOSED to miss short — that's the skill loop.
  console.log('\nAssisted sweep (assist = 0.55, flicks 5.6–7.2 m/s):');
  let makes = 0, total = 0;
  for (let f = 5.6; f <= 7.2; f += 0.2) {
    total++;
    const r = simulateShot({ x: 0, y: f }, 0.55);
    console.log(`    flick ${f.toFixed(1)} → ${r.outcome === 'score' ? (r.swish ? 'SWISH' : 'score') : r.outcome}`);
    if (r.outcome === 'score') makes++;
  }
  check('assist makes most reasonable flicks', makes / total >= 0.6, `${makes}/${total} made`);
}

// ── 4. assist must not rescue bad aim ───────────────────────────────────
{
  const wild = simulateShot({ x: 3.5, y: 6.0 }, 0.55);
  check('hard sideways flick still misses with assist', wild.outcome !== 'score',
    `outcome: ${wild.outcome}`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll physics checks passed.');
process.exit(failures ? 1 : 0);
