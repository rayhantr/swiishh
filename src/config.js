/**
 * ─────────────────────────────────────────────────────────────────────────
 *  GLOBAL TUNING FILE — every gameplay-affecting constant lives here.
 *
 *  Units are SI (meters, kilograms, seconds, radians) unless noted.
 *  Court & ball dimensions follow FIBA/NBA regulation specs.
 *  See README.md → "Physics" for the reasoning behind each value.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const PHYSICS = {
  GRAVITY: -9.81,            // m/s²
  AIR_DENSITY: 1.225,        // kg/m³ (sea level)
  FIXED_DT: 1 / 240,         // physics step — small enough the rim tube never tunnels
  MAX_FRAME_DT: 0.1,         // clamp huge frame gaps (tab switches) before stepping
};

export const BALL = {
  RADIUS: 0.121,             // size-7 ball (men's regulation), m
  MASS: 0.624,               // kg
  DRAG_COEF: 0.47,           // Cd of a sphere
  MAGNUS_MAX_CL: 0.45,       // cap on the lift coefficient from spin
  SPIN_AIR_DECAY: 0.12,      // exponential spin decay in flight, s⁻¹
  REST_SPEED: 0.22,          // m/s — slower than this on the floor → ball sleeps
};

/** Restitution & friction per surface. Floor value matches the NBA
 *  inflation rule (6 ft drop → 49–54 in rebound ⇒ e ≈ 0.82). */
export const SURFACES = {
  FLOOR: { restitution: 0.86, friction: 0.40 },
  RIM:   { restitution: 0.42, friction: 0.30 },
  BOARD: { restitution: 0.62, friction: 0.25 },
};

/** Free-throw line is the origin (z = 0); the hoop is in −z. */
export const COURT = {
  RIM_CENTER: { x: 0, y: 3.048, z: -4.191 }, // 10 ft high, 4.191 m from FT line
  RIM_RADIUS: 0.2286,        // 18 in inner diameter
  RIM_TUBE_RADIUS: 0.018,    // rim steel tube radius
  BOARD_FACE_Z: -4.572,      // backboard face: 15 ft from the FT line
  BOARD_WIDTH: 1.829,        // 6 ft
  BOARD_HEIGHT: 1.067,       // 3.5 ft
  BOARD_BOTTOM_Y: 2.90,
  FLOOR_Y: 0,
  OUT_OF_BOUNDS: { x: 8, zNear: 5, zFar: -9 },
};

export const NET = {
  STRANDS: 10,               // verlet strands around the rim
  RINGS: 5,                  // nodes per strand (incl. the pinned rim node)
  DEPTH: 0.42,               // m, hanging length
  BOTTOM_RADIUS_SCALE: 0.55, // net tapers to 55 % of rim radius
  ITERATIONS: 3,             // constraint solver passes
  GRAVITY: -5,               // softer than world gravity → cloth-like sway
  DAMPING: 0.90,             // verlet velocity retention per step
  BALL_DRAG: 3.2,            // s⁻¹ velocity damping while the ball is inside the net cone
};

/** Where a held ball can be moved, in world space. Input (0..1) maps here. */
export const HOLD = {
  X_RANGE: 1.25,             // hand at screen edge ⇒ ball at ±1.25 m
  Y_MIN: 0.65,
  Y_MAX: 2.75,
  Z: 0.15,                   // hold plane sits just past the FT line
  SMOOTHING: 16,             // exponential follow rate, s⁻¹ (higher = snappier)
  VELOCITY_WINDOW_MS: 90,    // width of each velocity probe window
  FLICK_RECENCY_MS: 170,     // peak search only trusts probes ending this
                             // recently — compensates pinch-open detection
                             // latency without resurrecting old aim motion
};

/** Mapping from release-flick velocity (m/s in the hold plane) → launch. */
export const THROW = {
  GAIN_UP: 1.05,             // vertical launch per unit of upward flick
  GAIN_SIDE: 0.95,           // lateral launch per unit of sideways flick
  FWD_BASE: 1.1,             // m/s toward the hoop, always present on release
  FWD_FROM_FLICK: 0.62,      // extra forward speed per unit of upward flick
  MIN_UP_FLICK: 0.6,         // softer flicks than this just drop the ball
  MAX_SPEED: 11.5,           // overall launch speed clamp
  BACKSPIN_BASE: 7,          // rad/s
  BACKSPIN_FROM_FLICK: 0.9,  // extra backspin per unit of upward flick
  BACKSPIN_MAX: 18,
  SIDESPIN_FROM_SIDE: 0.8,   // sideways flicks add side spin (curves the ball)
};

/** Aim assist: on release, forward/lateral velocity is blended toward the
 *  no-drag ballistic solution for the player's chosen arc (vertical speed is
 *  never assisted — arc is always honest). 0 = raw physics, 1 = aimbot. */
export const ASSIST = {
  CAMERA: 0.55,              // hand tracking is noisy → more help
  POINTER: 0.25,
};

export const GESTURE = {
  PINCH_GRAB: 0.38,          // pinch dist / hand span below this → grab
  PINCH_RELEASE: 0.56,       // …above this → release (hysteresis gap)
  FIST_GRAB: 0.95,           // avg fingertip→wrist / hand span below this → grab
  FIST_RELEASE: 1.25,
  LOST_HAND_DROP_MS: 450,    // hand off-camera this long while holding → drop ball
  VIDEO_WIDTH: 640,          // capture resolution (keep small: tracking is the cost)
  VIDEO_HEIGHT: 480,
};

export const GAME = {
  POINTS_CLEAN: 3,           // swish — nothing but net
  POINTS_RATTLED: 2,         // off the rim or board
  RESPAWN_DELAY_MS: 1100,
  SHOT_TIMEOUT_MS: 7000,     // safety: a live shot resolves as a miss after this
  IDLE_BOB_HZ: 0.6,          // resting ball gently floats
  IDLE_BOB_AMP: 0.05,
};

export const RENDER = {
  CAM_POS: { x: 0, y: 1.78, z: 2.55 },  // virtual camera behind the shooter
  HORIZON: 0.52,             // principal point as a fraction of canvas height
  TRAIL_LENGTH: 22,
  MAX_DPR: 2,                // cap devicePixelRatio for performance
};

/** `?debug` in the URL overlays physics/FPS info. Guarded so the physics
 *  modules stay importable from Node (tests/simulate.mjs). */
export const DEBUG =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('debug');
