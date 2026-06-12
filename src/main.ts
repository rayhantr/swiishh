/**
 * Composition root: builds every subsystem, wires events between them, and
 * owns the top-level flows (menu → mode select → play, error fallbacks,
 * pause, keyboard shortcuts). No gameplay logic lives here.
 */
import { Loop } from './core/loop.ts';
import { World } from './physics/world.ts';
import { Renderer } from './render/renderer.ts';
import { HandInput } from './input/handInput.ts';
import { PointerInput } from './input/pointerInput.ts';
import { AudioEngine } from './audio/sounds.ts';
import { HUD } from './game/hud.ts';
import { Game } from './game/game.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const video = document.getElementById('cam') as HTMLVideoElement;
const pipCanvas = document.getElementById('pipCanvas') as HTMLCanvasElement;

const world = new World();
const renderer = new Renderer(canvas);
const audio = new AudioEngine();
const hud = new HUD();
const game = new Game({ world, renderer, hud, audio });

let handInput: HandInput | null = null;   // created on demand — MediaPipe only loads if used
let pointerInput: PointerInput | null = null;

// ── capability gating ─────────────────────────────────────────────────────
if (!window.isSecureContext) {
  hud.setCameraSupported(false, 'Camera needs HTTPS or localhost');
  hud.menuStatus('Camera mode needs HTTPS or localhost — serve locally (see README). Mouse & touch still work.', true);
} else if (!navigator.mediaDevices?.getUserMedia) {
  hud.setCameraSupported(false, 'No camera API in this browser');
  hud.menuStatus('This browser has no camera API — mouse & touch still work.', true);
}

// ── mode flows ────────────────────────────────────────────────────────────
async function startCamera(): Promise<void> {
  audio.unlock();
  hud.el.btnCamera.disabled = true;
  hud.menuStatus('');

  if (!handInput) {
    handInput = new HandInput(video, pipCanvas);
    handInput.on('status', (text) => {
      hud.menuStatus(text);
      hud.setPipLabel(text);
    });
    handInput.on('hand', (e) => {
      hud.setPipLabel(e.present ? (e.grab ? 'holding 🤏' : 'tracking 🖐') : 'show your hand');
      game.onHand(e);
    });
    handInput.on('error', ({ message }) => {
      hud.el.btnCamera.disabled = false;
      if (game.playing && game.mode === 'camera') {
        // mid-game failure (camera unplugged, permission revoked)
        game.quit();
        hud.showMenu('');
      }
      hud.menuStatus(`${message}`, true);
      hud.toast('Tip: mouse & touch mode always works');
    });
  }

  const ok = await handInput.start();
  hud.el.btnCamera.disabled = false;
  if (!ok) return;

  detachPointer();
  hud.hideMenu();
  game.begin('camera');
}

function startPointer(): void {
  audio.unlock();
  handInput?.stop();
  if (!pointerInput) {
    pointerInput = new PointerInput(canvas);
    pointerInput.on('down', (p) => game.onPointerDown(p));
    pointerInput.on('move', (p) => game.onPointerMove(p));
    pointerInput.on('up', () => game.onPointerUp());
  }
  pointerInput.attach();
  hud.hideMenu();
  game.begin('pointer');
}

function detachPointer(): void {
  pointerInput?.detach();
}

function quitToMenu(): void {
  game.quit();
  handInput?.stop();
  detachPointer();
  hud.setPaused(false);
  hud.showMenu('');
}

// ── HUD wiring ────────────────────────────────────────────────────────────
let muted = false;
try { muted = localStorage.getItem('swish.muted') === '1'; } catch { /* ignore */ }
audio.setMuted(muted);
hud.setMuted(muted);

hud.bind({
  startCamera,
  startPointer,
  quit: quitToMenu,
  pause: () => game.setPaused(true),
  resume: () => game.setPaused(false),
  toggleMute: () => {
    muted = !muted;
    audio.setMuted(muted);
    hud.setMuted(muted);
    try { localStorage.setItem('swish.muted', muted ? '1' : '0'); } catch { /* ignore */ }
  },
  toggleAssist: () => {
    const on = game.toggleAssist();
    hud.toast(on ? 'Aim assist on' : 'Aim assist off — raw physics');
  },
  help: () => hud.showHelp(game.mode ?? 'camera'),
  closeHelp: () => hud.closeHelp(),
  switchCamera: async () => {
    hud.setPipLabel('switching…');
    await handInput?.switchCamera();
  },
  toggleMirror: () => {
    if (!handInput) return;
    handInput.setMirror(!handInput.mirror);
    hud.toast(handInput.mirror ? 'Mirrored view' : 'Unmirrored view');
  },
});

hud.setAssist(true);

// ── keyboard shortcuts ────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  switch (e.key.toLowerCase()) {
    case 'escape':
    case 'p':
      if (game.playing) game.setPaused(!game.paused);
      break;
    case 'm':
      hud.el.btnMute.click();
      break;
    case 'r': // rescue a stuck ball
      if (game.playing && game.phase !== 'held') game.respawn();
      break;
    case 'h':
      if (hud.el.help.classList.contains('hidden')) hud.showHelp(game.mode ?? 'camera');
      else hud.closeHelp();
      break;
  }
});

// ── lifecycle: auto-pause when the tab hides ──────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.playing && !game.paused) game.setPaused(true);
});

// ── error surfacing (anything unexpected becomes a visible toast) ─────────
window.addEventListener('error', (e) => {
  hud.toast(`Error: ${e.message}`, 6000);
});
window.addEventListener('unhandledrejection', (e) => {
  hud.toast(`Error: ${e.reason?.message ?? e.reason}`, 6000);
});

// ── go ────────────────────────────────────────────────────────────────────
const loop = new Loop({
  update: (dt) => {
    if (!game.playing || game.paused) return;
    game.update(dt);
    world.step(dt);
  },
  render: (dt) => renderer.render(world, game.view, dt),
});

// Deep links: ?mode=pointer or ?mode=camera skip the menu.
const autoMode = new URLSearchParams(location.search).get('mode');
if (autoMode === 'pointer') startPointer();
else if (autoMode === 'camera') startCamera();
else hud.showMenu('');

loop.start();
