# 🏀 SWISH — hand-tracked streetball

A free-throw basketball game you play by **pinching and flicking your hand in front of your laptop or phone camera**. Midnight-blacktop vibes, regulation-spec court, and a ball that flies on real aerodynamics — drag, Magnus lift from backspin, spin-coupled bounces.

No build step. No npm install. No binary assets. Open it from any static server and play.

```
pinch (or fist) ──▶ grab the ball
move your hand ──▶ aim
flick up + open ──▶ shoot
```

No camera? No problem — there's a full **mouse & touch mode** (press the ball, drag, flick up).

---

## Quick start

Camera access requires a **secure context** (HTTPS or `localhost`), so open the folder through any static server rather than double-clicking `index.html`:

```sh
# any one of these, from the repo root:
npm start                      # zero-dep server bundled in tools/serve.mjs, port 3000
npx serve -l 3000 .
python -m http.server 3000
```

Then visit **http://localhost:3000**, click **Play with camera**, and allow camera access.

> **Playing from a phone:** the page must be served over HTTPS to use the camera (e.g. GitHub Pages, `netlify deploy`, or a tunnel like `npx localtunnel`). Prop the phone up, sit back ~arm's length, and play with the front camera. Mouse & touch mode works anywhere, no HTTPS needed.

### Verify the physics

```sh
npm test          # = node tests/simulate.mjs
```

Runs the exact shipped physics headlessly: checks floor restitution against the NBA ball-inflation rule, sweeps flick strengths to prove a no-assist make window exists, and confirms aim assist can't rescue wild shots. Works as a CI gate.

---

## How it's played (all the inputs)

| | Camera mode | Mouse & touch mode |
|---|---|---|
| Grab | Pinch (thumb+index) **or** close your fist | Press on the ball |
| Aim | Move your hand — ball follows | Drag |
| Shoot | Flick upward and open your hand | Flick upward and release |
| Power | Flick speed | Flick speed |

**Scoring:** +3 swish (nothing but net), +2 off the rim/glass. Streaks, accuracy, and high score (persisted in `localStorage`) live on the LED scoreboard.

**Keyboard:** `P`/`Esc` pause · `M` mute · `R` new ball · `H` help.

**Camera extras:** switch front/back lens (📱), mirror toggle, live picture-in-picture with the tracked hand skeleton and a grab-strength meter.

**Aim assist** (menu toggle): hand tracking is noisy, so by default the launch's forward/lateral speed is partially blended toward the ballistic solution *for the arc you chose*. Your arc and flick are never faked — flat shots still die on the front iron, hard sideways flicks still miss. Turn it off for raw physics.

---

## Edge cases covered

- **No camera / permission denied / camera busy / no `getUserMedia`** → specific, human error message + one-tap fallback to pointer mode.
- **Insecure context** (opened over `http://` on a LAN) → camera button disabled with an explanation; pointer mode still works.
- **MediaPipe CDN unreachable** (offline) → graceful error, pointer mode unaffected.
- **GPU delegate unsupported** (older devices/iOS) → automatic retry on CPU.
- **Release detected late** (fast hands motion-blur; the pinch classifier lags the real release) → flick velocity is the *peak* over the recent history, not the velocity at the release event, so throws never read as fumbles.
- **Hand flicks out of the frame mid-throw** → counted as the throw it was; only a slow drift out of frame drops the ball (after a grace period, with a toast).
- **Tracking jitter** → grab/release thresholds have hysteresis; flick probes are 90 ms wide so single-frame noise can't spike the power.
- **Tab hidden** → auto-pause; the fixed-timestep loop clamps frame gaps so physics never explodes after a stall.
- **Ball stuck / rolled away** → auto-respawn on rest, out-of-bounds, or a 7 s shot timeout; `R` forces a new ball.
- **Weak release** → the ball just slips out of your hand (not counted as an attempt).
- **Autoplay policy** → all audio is synthesized and unlocked on first user gesture.
- **Private browsing / blocked storage** → stats degrade to session-only instead of crashing.
- **Resize / rotate / high-DPI** → projection and canvas rebuild on the fly (DPR capped at 2 for perf).
- **Reduced motion** preference → HUD animations are disabled.

---

## Physics

Everything is SI units on a regulation court, tuned in [`src/config.js`](src/config.js) and validated by [`tests/simulate.mjs`](tests/simulate.mjs).

| Quantity | Value | Source |
|---|---|---|
| Rim height / Ø | 3.048 m / 0.457 m | FIBA/NBA |
| Free-throw distance | 4.191 m to rim center | FIBA/NBA |
| Backboard | 1.829 × 1.067 m, face 4.572 m from FT line | FIBA/NBA |
| Ball | r = 0.121 m, m = 0.624 kg (size 7) | FIBA |
| Drag | quadratic, C_d = 0.47, ρ = 1.225 kg/m³ | sphere |
| Magnus lift | C_l = min(0.45, 1/(2 + v/rω)) | empirical fit |
| Floor bounce | e = 0.86 → 6 ft drop rebounds ~49 in | NBA inflation rule |
| Inertia | hollow sphere, I = ⅔mr² | ball is a shell |

**Integration:** semi-implicit Euler at a fixed **240 Hz** (decoupled from the render rate via an accumulator). At peak launch speed the ball moves ~5 cm per step against a 14 cm rim-contact envelope, so the rim torus can't tunnel; the thin backboard plane additionally checks the previous-position crossing.

**Collisions** ([`src/physics/colliders.js`](src/physics/colliders.js)): impulse-based with restitution + Coulomb friction that **couples velocity and spin** through the hollow-sphere inertia — backspin checks up off the floor, grabs the rim, and climbs the glass, like a real ball. The rim is an exact torus test (closest point on the rim circle vs. sphere).

**Net** ([`src/physics/net.js`](src/physics/net.js)): 10 verlet strands × 5 rings with stretch-only rope constraints in a diamond mesh. The ball pushes the cords; a drag cone below the rim stands in for the cords slowing the ball (one-way coupling = unconditionally stable).

**The throw** ([`src/game/throwModel.js`](src/game/throwModel.js), [`src/game/flickMeter.js`](src/game/flickMeter.js)): your flick is measured in the hold plane in m/s — as the peak 90 ms window ending near the release, which compensates for the tracker reporting "hand opened" tens of milliseconds late. Upward flick sets arc *and* adds forward power and backspin; sideways flick aims and adds sidespin (which genuinely curves the flight). A regulation free throw needs ~7 m/s at ~52° — the make window in the simulation sits exactly there.

**Scoring detection:** the ball center must cross the rim plane downward inside the ring (interpolated between substeps); swish = no rim/board contact during the live shot.

---

## Repo tour

```
index.html              shell + HUD markup (menus, scoreboard, help)
styles/main.css         all styling — "midnight blacktop" theme tokens at the top
src/
  config.js             ⚙ every tunable constant, documented with units
  main.js               composition root: wiring, mode flows, shortcuts
  core/                 math (vec3), event emitter, fixed-timestep loop
  physics/              ball, colliders, net, world  ← DOM-free, Node-importable
  game/                 game state machine, throw model, stats, HUD bridge
  input/                handInput (MediaPipe), pointerInput (mouse/touch)
  render/               pinhole camera, court art, ball/effects, renderer
  audio/                WebAudio-synthesized SFX (no sound files)
tests/simulate.mjs      headless physics validation (npm test)
```

Design rules the codebase follows:

- **Physics is DOM-free** so it runs in Node — that's what makes `npm test` honest.
- **Modules talk through a tiny event emitter**; input devices and the game know nothing about each other's internals. Adding a new controller (gamepad? keyboard-aim?) means emitting `down/move/up`-style events and ~20 lines in `main.js`.
- **Every magic number lives in `config.js`** with units and rationale.
- **No allocations in hot loops** — vec3 scratch registers are reused.
- The only runtime dependency, `@mediapipe/tasks-vision`, is version-pinned and loaded from CDN *only when camera mode is chosen*.

## Tuning cheatsheet

| I want to… | Touch this |
|---|---|
| Make shots easier/harder | `ASSIST.CAMERA` / `ASSIST.POINTER`, `THROW.FWD_FROM_FLICK` |
| Change throw feel | `THROW.*`, `HOLD.SMOOTHING`, `HOLD.VELOCITY_WINDOW_MS` |
| Bouncier/deader surfaces | `SURFACES.*` |
| Stickier/looser grab gesture | `GESTURE.PINCH_*`, `GESTURE.FIST_*` |
| Throws dropping / phantom throws | `THROW.MIN_UP_FLICK`, `HOLD.FLICK_RECENCY_MS` |
| Move the camera/view | `RENDER.CAM_POS`, `RENDER.HORIZON` |
| Debug overlay (FPS, ball state) | append `?debug` to the URL |

After touching physics or `THROW.*`, run `npm test` — the sweep printout shows exactly how the make window moved.

## Troubleshooting

- **"Camera needs HTTPS or localhost"** — serve the folder (`npm start`); don't open `index.html` directly, and don't use a bare LAN IP over http.
- **Hand not detected** — more light, palm toward the lens, hand fully in frame, ~50–80 cm away. The PiP label tells you what the tracker sees.
- **Ball releases while aiming** — exaggerate the pinch; the grab meter at the bottom of the PiP shows how solidly you're holding.
- **Ball drops instead of throwing** — flick and open your hand in one motion (don't stop, then open). It's fine to flick right out of the frame — that still counts as a throw.
- **Choppy on an old laptop** — close other tabs using the camera/GPU; tracking is the heavy part, the game itself is cheap. The GPU→CPU fallback is automatic.
- **Shots feel impossible** — that's regulation physics 🙂 keep aim assist on, and aim for a high arc (~52°).

## License

[MIT](LICENSE) © Rayhan
