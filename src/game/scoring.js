const STORE_KEY = 'swish.stats.v1';

/**
 * Session stats + persistent bests. localStorage access is wrapped so
 * private-browsing modes and blocked storage degrade to session-only stats
 * instead of crashing.
 */
export class Stats {
  constructor() {
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.attempts = 0;
    this.makes = 0;
    this.highScore = 0;
    this.#load();
  }

  registerAttempt() {
    this.attempts++;
  }

  registerMake(points) {
    this.makes++;
    this.streak++;
    this.score += points;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const isNewHigh = this.score > this.highScore;
    if (isNewHigh) this.highScore = this.score;
    this.#save();
    return isNewHigh;
  }

  registerMiss() {
    this.streak = 0;
  }

  get accuracy() {
    return this.attempts ? Math.round((this.makes / this.attempts) * 100) : 0;
  }

  #load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.highScore = data.highScore | 0;
      this.bestStreak = data.bestStreak | 0;
    } catch { /* storage unavailable — session-only stats */ }
  }

  #save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        highScore: this.highScore,
        bestStreak: this.bestStreak,
      }));
    } catch { /* ignore */ }
  }
}
