import type { Stats } from './scoring.ts';
import type { GameMode } from './game.ts';

const IDS = [
  'menu', 'menuStatus', 'btnCamera', 'btnPointer', 'btnAssist',
  'hud', 'score', 'streak', 'accuracy', 'highScore',
  'message', 'messageMain', 'messageSub',
  'toasts', 'pip', 'pipLabel',
  'btnPause', 'btnMute', 'btnHelp', 'btnSwitchCam', 'btnMirror', 'btnMenu',
  'pauseOverlay', 'btnResume', 'btnQuit',
  'help', 'btnCloseHelp', 'helpCamera', 'helpPointer',
] as const;

type ElementId = (typeof IDS)[number];

type HudElements = Record<ElementId, HTMLElement> & {
  btnCamera: HTMLButtonElement;
  btnAssist: HTMLButtonElement;
  btnMute: HTMLButtonElement;
};

/** Button presses the HUD forwards to main.ts. */
export interface HudCallbacks {
  startCamera: () => void;
  startPointer: () => void;
  quit: () => void;
  pause: () => void;
  resume: () => void;
  toggleMute: () => void;
  toggleAssist: () => void;
  help: () => void;
  closeHelp: () => void;
  switchCamera: () => void;
  toggleMirror: () => void;
}

/**
 * Thin DOM layer: scoreboard, menus, toasts, coaching messages. The HUD
 * never holds game logic — it renders state it's told and forwards button
 * presses to callbacks supplied by main.ts.
 */
export class HUD {
  el: HudElements;
  private _messageTimer = 0;

  constructor() {
    this.el = Object.fromEntries(
      IDS.map((id) => [id, document.getElementById(id)!]),
    ) as HudElements;
  }

  bind(on: HudCallbacks): void {
    const wire = (el: HTMLElement, fn: () => void) =>
      el.addEventListener('click', (e) => { e.preventDefault(); fn(); });
    wire(this.el.btnCamera, on.startCamera);
    wire(this.el.btnPointer, on.startPointer);
    wire(this.el.btnAssist, on.toggleAssist);
    wire(this.el.btnPause, on.pause);
    wire(this.el.btnResume, on.resume);
    wire(this.el.btnQuit, on.quit);
    wire(this.el.btnMute, on.toggleMute);
    wire(this.el.btnHelp, on.help);
    wire(this.el.btnCloseHelp, on.closeHelp);
    wire(this.el.btnSwitchCam, on.switchCamera);
    wire(this.el.btnMirror, on.toggleMirror);
    wire(this.el.btnMenu, on.quit);
  }

  // ── menu ────────────────────────────────────────────────────────────
  showMenu(statusText = ''): void {
    this.el.menu.classList.remove('hidden');
    this.el.hud.classList.add('menu-open');
    this.menuStatus(statusText);
  }

  hideMenu(): void {
    this.el.menu.classList.add('hidden');
    this.el.hud.classList.remove('menu-open');
  }

  menuStatus(text: string, isError = false): void {
    this.el.menuStatus.textContent = text;
    this.el.menuStatus.classList.toggle('error', isError);
  }

  setCameraSupported(ok: boolean, reason = ''): void {
    this.el.btnCamera.disabled = !ok;
    if (!ok) this.el.btnCamera.title = reason;
  }

  setAssist(onState: boolean): void {
    this.el.btnAssist.dataset.on = String(onState);
    this.el.btnAssist.querySelector('.toggle-state')!.textContent = onState ? 'ON' : 'OFF';
  }

  // ── in-game ─────────────────────────────────────────────────────────
  setStats(stats: Stats): void {
    this.el.score.textContent = String(stats.score);
    this.el.streak.textContent = String(stats.streak);
    this.el.accuracy.textContent = `${stats.accuracy}%`;
    this.el.highScore.textContent = String(stats.highScore);
    this.el.streak.parentElement!.classList.toggle('hot', stats.streak >= 3);
  }

  bumpScore(): void {
    this.el.score.classList.remove('bump');
    void this.el.score.offsetWidth; // restart the animation
    this.el.score.classList.add('bump');
  }

  /** Center-screen coaching line; auto-clears unless duration is 0. */
  message(main: string, sub = '', duration = 2400): void {
    this.el.messageMain.textContent = main;
    this.el.messageSub.textContent = sub;
    this.el.message.classList.add('visible');
    window.clearTimeout(this._messageTimer);
    if (duration > 0) {
      this._messageTimer = window.setTimeout(() => this.clearMessage(), duration);
    }
  }

  clearMessage(): void {
    this.el.message.classList.remove('visible');
  }

  toast(text: string, ms = 3200): void {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = text;
    this.el.toasts.append(node);
    window.setTimeout(() => node.classList.add('out'), ms);
    window.setTimeout(() => node.remove(), ms + 400);
  }

  // ── chrome ──────────────────────────────────────────────────────────
  setPlayingChrome(playing: boolean, mode: GameMode | null = null): void {
    this.el.hud.classList.toggle('playing', playing);
    const cam = mode === 'camera';
    this.el.pip.classList.toggle('hidden', !cam || !playing);
    this.el.btnSwitchCam.classList.toggle('hidden', !cam || !playing);
    this.el.btnMirror.classList.toggle('hidden', !cam || !playing);
  }

  setPipLabel(text: string): void {
    this.el.pipLabel.textContent = text;
  }

  setPaused(paused: boolean): void {
    this.el.pauseOverlay.classList.toggle('hidden', !paused);
  }

  setMuted(muted: boolean): void {
    this.el.btnMute.textContent = muted ? '🔇' : '🔊';
    this.el.btnMute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  }

  showHelp(mode: GameMode): void {
    this.el.helpCamera.classList.toggle('hidden', mode === 'pointer');
    this.el.helpPointer.classList.toggle('hidden', mode === 'camera');
    this.el.help.classList.remove('hidden');
  }

  closeHelp(): void {
    this.el.help.classList.add('hidden');
  }
}
