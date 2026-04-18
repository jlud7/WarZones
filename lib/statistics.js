/*
 * Statistics module.
 *
 * Cumulative per-user stats persisted to localStorage under
 * `warZonesStats`. Dual-mode loader.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'warZonesStats';

  class Statistics {
    constructor() {
      this.stats = this.loadStats();
    }

    loadStats() {
      const hasStorage = typeof localStorage !== 'undefined';
      const savedStats = hasStorage ? localStorage.getItem(STORAGE_KEY) : null;
      return savedStats ? JSON.parse(savedStats) : {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        hitAccuracy: 0,
        totalShots: 0,
        hits: 0,
        quickestWin: Infinity,
        timePlayed: 0
      };
    }

    updateStats(gameResult) {
      this.stats.gamesPlayed++;

      if (gameResult.winner === 'player') {
        this.stats.wins++;
      } else {
        this.stats.losses++;
      }

      this.stats.totalShots += gameResult.shots;
      this.stats.hits += gameResult.hits;
      this.stats.hitAccuracy = ((this.stats.hits / this.stats.totalShots) * 100).toFixed(1);

      if (gameResult.winner === 'player' && gameResult.time < this.stats.quickestWin) {
        this.stats.quickestWin = gameResult.time;
      }

      this.stats.timePlayed += gameResult.time;
      this.saveStats();
    }

    saveStats() {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stats));
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Statistics };
  } else {
    global.Statistics = Statistics;
  }
})(typeof window !== 'undefined' ? window : globalThis);
