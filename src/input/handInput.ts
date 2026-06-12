import { GESTURE } from '../config.ts';
import { Emitter } from '../core/events.ts';

const MP_VERSION = '0.10.14';
// Typed as plain string so tsc treats the import() below as a fully dynamic
// external module (the CDN URL is resolved by the browser, not the compiler).
const MP_ESM: string = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/+esm`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/** Landmark indices (MediaPipe hand model). */
const LM = { WRIST: 0, THUMB_TIP: 4, INDEX_TIP: 8, MIDDLE_MCP: 9, MIDDLE_TIP: 12, RING_TIP: 16, PINKY_TIP: 20 };
const SKELETON: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/** Minimal structural types for the parts of @mediapipe/tasks-vision we use
 *  (the library is CDN-loaded at runtime, so we don't depend on its .d.ts). */
interface Landmark {
  x: number;
  y: number;
  z?: number;
}
interface HandLandmarkerResult {
  landmarks?: Landmark[][];
}
interface HandLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): HandLandmarkerResult;
}

export type CameraFacing = 'user' | 'environment';

export type HandEvent =
  | { present: false }
  | { present: true; x: number; y: number; grab: boolean; grabStrength: number };

export type HandInputEvents = {
  status: string;
  ready: undefined;
  hand: HandEvent;
  error: { code: string; message: string };
};

const dist2d = (a: Landmark, b: Landmark): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Camera + MediaPipe HandLandmarker wrapper.
 *
 * Emits:
 *  'status' string            — human-readable progress for the HUD
 *  'ready'                    — camera streaming and tracker loaded
 *  'hand'  {present, x, y, grab, grabStrength}
 *      x/y are normalized 0..1 (x already mirrored for selfie view)
 *  'error' {code, message}    — code ∈ permission|nocamera|busy|insecure|
 *                               unsupported|loadfail
 *
 * Grabbing uses pinch (thumb↔index) OR a closed fist, both normalized by
 * hand span so it works at any distance from the lens, with hysteresis so
 * tracking jitter can't drop the ball mid-aim.
 */
export class HandInput extends Emitter<HandInputEvents> {
  video: HTMLVideoElement;
  pip: HTMLCanvasElement;
  pipCtx: CanvasRenderingContext2D;
  landmarker: HandLandmarkerLike | null = null;
  stream: MediaStream | null = null;
  facing: CameraFacing = 'user';
  mirror = true;
  running = false;
  private _grabbing = false;
  private _switching = false;
  private _lastTs = 0;
  private _raf = 0;

  constructor(video: HTMLVideoElement, pipCanvas: HTMLCanvasElement) {
    super();
    this.video = video;
    this.pip = pipCanvas;
    this.pipCtx = pipCanvas.getContext('2d')!;
  }

  async start(facing: CameraFacing = this.facing): Promise<boolean> {
    this.facing = facing;

    if (!window.isSecureContext) {
      return this.#fail('insecure', 'Camera needs HTTPS or localhost. Serve the game from a local server (see README).');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return this.#fail('unsupported', 'This browser cannot access cameras. Try Chrome, Edge, Safari or Firefox.');
    }

    try {
      if (!this.landmarker) {
        this.emit('status', 'Loading hand tracker…');
        const { FilesetResolver, HandLandmarker } = await import(MP_ESM);
        const fileset = await FilesetResolver.forVisionTasks(MP_WASM);
        const options = {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 1,
        };
        try {
          this.landmarker = await HandLandmarker.createFromOptions(fileset, options);
        } catch {
          // GPU delegate can fail on older devices / iOS — retry on CPU.
          options.baseOptions.delegate = 'CPU';
          this.landmarker = await HandLandmarker.createFromOptions(fileset, options);
        }
      }
    } catch (err) {
      return this.#fail('loadfail', `Hand tracker failed to load (offline? blocked CDN?): ${(err as Error).message}`);
    }

    this.emit('status', 'Starting camera…');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: facing,
          width: { ideal: GESTURE.VIDEO_WIDTH },
          height: { ideal: GESTURE.VIDEO_HEIGHT },
        },
      });
    } catch (err) {
      const map: Record<string, [string, string]> = {
        NotAllowedError: ['permission', 'Camera permission denied. Allow camera access in the address bar, or play with mouse/touch.'],
        NotFoundError: ['nocamera', 'No camera found on this device.'],
        OverconstrainedError: ['nocamera', 'No camera matches the request — trying the other lens may help.'],
        NotReadableError: ['busy', 'The camera is in use by another app.'],
      };
      const e = err as DOMException;
      const [code, message] = map[e.name] ?? ['unknown', `Camera error: ${e.message}`];
      return this.#fail(code, message);
    }

    // Surface mid-game failures (camera unplugged, permission revoked, OS
    // handed the device to another app).
    this.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (this.running) {
        this.stop();
        this.#fail('busy', 'The camera stopped (unplugged or taken by another app).');
      }
    });

    this.video.srcObject = this.stream;
    // Selfie lens reads mirrored by default; rear lens does not.
    this.mirror = facing === 'user';
    await this.video.play().catch(() => {});
    await new Promise<void>((res) => {
      if (this.video.readyState >= 2) res();
      else this.video.addEventListener('loadeddata', () => res(), { once: true });
    });

    this.running = true;
    this.emit('ready');
    this.emit('status', 'Show your hand to the camera 🖐');
    this.#scheduleDetect();
    return true;
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this._raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /** Toggle front/rear lens; falls back to the working lens on failure. */
  async switchCamera(): Promise<boolean> {
    const previous = this.facing;
    const next: CameraFacing = previous === 'user' ? 'environment' : 'user';
    this.stop();
    this._switching = true;
    let ok = await this.start(next);
    this._switching = false;
    if (!ok) {
      this.emit('status', 'That lens is unavailable — staying on the current one.');
      ok = await this.start(previous);
    }
    return ok;
  }

  setMirror(m: boolean): void {
    this.mirror = m;
  }

  #fail(code: string, message: string): false {
    // During a lens switch, failure is handled by falling back — stay quiet.
    if (!this._switching) this.emit('error', { code, message });
    return false;
  }

  #scheduleDetect(): void {
    const step = () => {
      if (!this.running) return;
      this.#detect();
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  #detect(): void {
    const video = this.video;
    if (!this.landmarker || video.readyState < 2 || !video.videoWidth) return;

    // detectForVideo requires strictly increasing timestamps
    const ts = performance.now();
    if (ts <= this._lastTs) return;
    this._lastTs = ts;

    let result: HandLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(video, ts);
    } catch {
      return; // transient decode hiccup — skip the frame
    }

    const lm = result?.landmarks?.[0];
    if (!lm) {
      this._grabbing = false;
      this.emit('hand', { present: false });
      this.#drawPip(null);
      return;
    }

    // Palm center: average of wrist + finger bases — far more stable than
    // any fingertip while the hand opens/closes.
    const palm = avg([lm[0], lm[5], lm[9], lm[13], lm[17]]);
    const span = dist2d(lm[LM.WRIST], lm[LM.MIDDLE_MCP]) || 1e-6;

    const pinch = dist2d(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / span;
    const curl =
      (dist2d(lm[LM.INDEX_TIP], lm[LM.WRIST]) +
        dist2d(lm[LM.MIDDLE_TIP], lm[LM.WRIST]) +
        dist2d(lm[LM.RING_TIP], lm[LM.WRIST]) +
        dist2d(lm[LM.PINKY_TIP], lm[LM.WRIST])) / (4 * span);

    // Hysteresis: tighter threshold to grab than to release.
    const wantsGrab = pinch < GESTURE.PINCH_GRAB || curl < GESTURE.FIST_GRAB;
    const wantsRelease = pinch > GESTURE.PINCH_RELEASE && curl > GESTURE.FIST_RELEASE;
    if (!this._grabbing && wantsGrab) this._grabbing = true;
    else if (this._grabbing && wantsRelease) this._grabbing = false;

    const grabStrength = Math.max(
      norm(pinch, GESTURE.PINCH_RELEASE, GESTURE.PINCH_GRAB),
      norm(curl, GESTURE.FIST_RELEASE, GESTURE.FIST_GRAB),
    );

    this.emit('hand', {
      present: true,
      x: this.mirror ? 1 - palm.x : palm.x,
      y: palm.y,
      grab: this._grabbing,
      grabStrength,
    });
    this.#drawPip(lm, grabStrength);
  }

  /** Picture-in-picture: camera thumbnail + skeleton + grab meter. */
  #drawPip(lm: Landmark[] | null, grabStrength = 0): void {
    const ctx = this.pipCtx;
    const { width: w, height: h } = this.pip;
    ctx.save();
    if (this.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.video, 0, 0, w, h);
    if (lm) {
      const color = this._grabbing ? '#7ee8c7' : '#ffb454';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [a, b] of SKELETON) {
        ctx.moveTo(lm[a].x * w, lm[a].y * h);
        ctx.lineTo(lm[b].x * w, lm[b].y * h);
      }
      ctx.stroke();
      ctx.fillStyle = color;
      for (const p of lm) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // grab meter along the bottom edge (unmirrored space)
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, h - 5, w, 5);
    ctx.fillStyle = this._grabbing ? '#7ee8c7' : '#ffb454';
    ctx.fillRect(0, h - 5, w * Math.max(0, Math.min(1, grabStrength)), 5);
  }
}

function avg(points: Landmark[]): { x: number; y: number } {
  let x = 0, y = 0;
  for (const p of points) { x += p.x; y += p.y; }
  return { x: x / points.length, y: y / points.length };
}

/** Maps v from [from..to] → 0..1 (works with from > to). */
function norm(v: number, from: number, to: number): number {
  return Math.max(0, Math.min(1, (v - from) / (to - from)));
}
