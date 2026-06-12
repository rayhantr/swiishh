/**
 * Thin DOM layer: scoreboard, menus, toasts, coaching messages. The HUD
 * never holds game logic — it renders state it's told and forwards button
 * presses to callbacks supplied by main.js.
 */
export class HUD {
  constructor() {
    this.el = Object.fromEntries(
      [
        'menu', 'menuStatus', 'btnCamera', 'btnPointer', 'btnAssist',
        'hud', 'score', 'streak', 'accuracy', 'highScore',
        'message', 'messageMain', 'messageSub',
        'toasts', 'pip', 'pipLabel',
        'btnPause', 'btnMute', 'btnHelp', 'btnSwitchCam', 'btnMirror', 'btnMenu',
        'pauseOverlay', 'btnResume', 'btnQuit',
        'help', 'btnCloseHelp', 'helpCamera', 'helpPointer',
      ].map((id) => [id, document.getElementById(id)]),
    );
    this._messageTimer = 0;
  }

  /** @param {Record<string, () => void>} on */
  bind(on) {
    const wire = (el, fn) => el?.addEventListener('click', (e) => { e.preventDefault(); fn(); });
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
  showMenu(statusText = '') {
    this.el.menu.classList.remove('hidden');
    this.el.hud.classList.add('menu-open');
    this.menuStatus(statusText);
  }

  hideMenu() {
    this.el.menu.classList.add('hidden');
    this.el.hud.classList.remove('menu-open');
  }

  menuStatus(text, isError = false) {
    this.el.menuStatus.textContent = text;
    this.el.menuStatus.classList.toggle('error', isError);
  }

  setCameraSupported(ok, reason = '') {
    this.el.btnCamera.disabled = !ok;
    if (!ok) this.el.btnCamera.title = reason;
  }

  setAssist(onState) {
    this.el.btnAssist.dataset.on = onState;
    this.el.btnAssist.querySelector('.toggle-state').textContent = onState ? 'ON' : 'OFF';
  }

  // ── in-game ─────────────────────────────────────────────────────────
  setStats(stats) {
    this.el.score.textContent = stats.score;
    this.el.streak.textContent = stats.streak;
    this.el.accuracy.textContent = `${stats.accuracy}%`;
    this.el.highScore.textContent = stats.highScore;
    this.el.streak.parentElement.classList.toggle('hot', stats.streak >= 3);
  }

  bumpScore() {
    this.el.score.classList.remove('bump');
    void this.el.score.offsetWidth; // restart the animation
    this.el.score.classList.add('bump');
  }

  /** Center-screen coaching line; auto-clears unless duration is 0. */
  message(main, sub = '', duration = 2400) {
    this.el.messageMain.textContent = main;
    this.el.messageSub.textContent = sub;
    this.el.message.classList.add('visible');
    clearTimeout(this._messageTimer);
    if (duration > 0) {
      this._messageTimer = setTimeout(() => this.clearMessage(), duration);
    }
  }

  clearMessage() {
    this.el.message.classList.remove('visible');
  }

  toast(text, ms = 3200) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = text;
    this.el.toasts.append(node);
    setTimeout(() => node.classList.add('out'), ms);
    setTimeout(() => node.remove(), ms + 400);
  }

  // ── chrome ──────────────────────────────────────────────────────────
  setPlayingChrome(playing, mode = null) {
    this.el.hud.classList.toggle('playing', playing);
    const cam = mode === 'camera';
    this.el.pip.classList.toggle('hidden', !cam || !playing);
    this.el.btnSwitchCam.classList.toggle('hidden', !cam || !playing);
    this.el.btnMirror.classList.toggle('hidden', !cam || !playing);
  }

  setPipLabel(text) {
    this.el.pipLabel.textContent = text;
  }

  setPaused(paused) {
    this.el.pauseOverlay.classList.toggle('hidden', !paused);
  }

  setMuted(muted) {
    this.el.btnMute.textContent = muted ? '🔇' : '🔊';
    this.el.btnMute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  }

  showHelp(mode) {
    this.el.helpCamera.classList.toggle('hidden', mode === 'pointer');
    this.el.helpPointer.classList.toggle('hidden', mode === 'camera');
    this.el.help.classList.remove('hidden');
  }

  closeHelp() {
    this.el.help.classList.add('hidden');
  }
}
