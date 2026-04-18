/*
 * Statistics — persistent lifetime stats in localStorage.
 * The lifetime-stats view is not currently rendered in the UI, but the
 * counters are kept up to date for when it is.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'warZonesStats';

  class Statistics {
    constructor() {
      this.stats = this.loadStats();
    }

    loadStats() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.warn('Could not read stats from localStorage:', e);
      }
      return {
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
      this.stats.hitAccuracy = this.stats.totalShots === 0
        ? 0
        : ((this.stats.hits / this.stats.totalShots) * 100).toFixed(1);

      if (gameResult.winner === 'player' && gameResult.time < this.stats.quickestWin) {
        this.stats.quickestWin = gameResult.time;
      }

      this.stats.timePlayed += gameResult.time;
      this.saveStats();
    }

    saveStats() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stats));
      } catch (e) {
        console.warn('Could not write stats to localStorage:', e);
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Statistics };
  } else {
    global.Statistics = Statistics;
  }
})(typeof window !== 'undefined' ? window : globalThis);
