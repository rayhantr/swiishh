/**
 * All sound is synthesized with WebAudio — no binary assets in the repo.
 * The AudioContext is created lazily on the first user gesture (autoplay
 * policy), and every call is safe to make before that happens.
 */

declare global {
  interface Window {
    /** Legacy Safari prefix. */
    webkitAudioContext?: typeof AudioContext;
  }
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;

  /** Call from any user-gesture handler; no-op if already running. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  // The `!` assertions in the private helpers are safe: every public sound
  // method bails out first when the context doesn't exist yet.
  #env(gainValue: number, duration: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gainValue, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    g.connect(this.master!);
    return g;
  }

  #noise(duration: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  /** Hollow rubber thump; pitch and volume scale with impact speed. */
  bounce(intensity = 0.5): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const k = Math.min(1, intensity);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110 + 50 * k, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.12);
    osc.connect(this.#env(0.5 * k + 0.08, 0.18));
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** Metallic clank: inharmonic partials through a highpass. */
  rim(intensity = 0.6): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const k = Math.min(1, intensity);
    for (const [freq, gain] of [[652, 0.22], [1083, 0.13], [1721, 0.07]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq * (0.98 + 0.04 * Math.random());
      osc.connect(this.#env(gain * k, 0.32));
      osc.start(t);
      osc.stop(t + 0.35);
    }
  }

  /** Backboard: a flat wooden/acrylic slap. */
  board(intensity = 0.6): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const k = Math.min(1, intensity);
    const noise = this.#noise(0.09);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 1.2;
    noise.connect(filter);
    filter.connect(this.#env(0.55 * k, 0.1));
    noise.start(t);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(95, t + 0.07);
    osc.connect(this.#env(0.3 * k, 0.1));
    osc.start(t);
    osc.stop(t + 0.12);
  }

  /** Cords brushing the ball — bandpassed noise swell. */
  swish(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const noise = this.#noise(0.3);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2600, t);
    filter.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    filter.Q.value = 0.9;
    noise.connect(filter);
    filter.connect(this.#env(0.5, 0.3));
    noise.start(t);
  }

  /** Two-note score chime, brighter for a clean swish. */
  score(swish: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = swish ? [660, 990] : [523, 784];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.3);
      g.connect(this.master!);
      osc.connect(g);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.32);
    });
  }

  /** Soft UI tick. */
  ui(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.connect(this.#env(0.07, 0.07));
    osc.start(t);
    osc.stop(t + 0.08);
  }
}
