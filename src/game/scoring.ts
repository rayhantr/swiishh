const STORE_KEY = 'swish.stats.v1';

/**
 * Session stats + persistent bests. localStorage access is wrapped so
 * private-browsing modes and blocked storage degrade to session-only stats
 * instead of crashing.
 */
export class Stats {
  score = 0;
  streak = 0;
  bestStreak = 0;
  attempts = 0;
  makes = 0;
  highScore = 0;

  constructor() {
    this.#load();
  }

  registerAttempt(): void {
    this.attempts++;
  }

  registerMake(points: number): boolean {
    this.makes++;
    this.streak++;
    this.score += points;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const isNewHigh = this.score > this.highScore;
    if (isNewHigh) this.highScore = this.score;
    this.#save();
    return isNewHigh;
  }

  registerMiss(): void {
    this.streak = 0;
  }

  get accuracy(): number {
    return this.attempts ? Math.round((this.makes / this.attempts) * 100) : 0;
  }

  #load(): void {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.highScore = data.highScore | 0;
      this.bestStreak = data.bestStreak | 0;
    } catch { /* storage unavailable — session-only stats */ }
  }

  #save(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        highScore: this.highScore,
        bestStreak: this.bestStreak,
      }));
    } catch { /* ignore */ }
  }
}
