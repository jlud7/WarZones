/*
 * SoundManager — all Web Audio synthesis for the game.
 *
 * Self-contained: talks to the Web Audio API and the single #toggleSound
 * button, nothing else. Loaded as a classic <script> in the browser; in
 * Node it returns its class via module.exports (no sounds play server-
 * side, but the module is importable for future tests).
 */
(function (global) {
  'use strict';

  class SoundManager {
    constructor() {
      this.isMuted = false;
      this.audioContext = null;
      this.isInitialized = false;
    }

    initialize() {
      if (this.isInitialized) return;
      try {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) throw new Error('no AudioContext');
        this.audioContext = new Ctx();
        this.isInitialized = true;
      } catch (e) {
        console.warn('Web Audio API not supported');
      }
    }

    /* Noise buffer for explosion / impact texture. */
    createNoiseBuffer(duration) {
      const sampleRate = this.audioContext.sampleRate;
      const length = sampleRate * duration;
      const buffer = this.audioContext.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      return buffer;
    }

    /* Attack/decay single-oscillator tone. */
    playTone(freq, type, gain, attack, decay, duration) {
      const ctx = this.audioContext;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duration);
    }

    playSound(soundName) {
      if (!this.isInitialized) this.initialize();
      if (!this.audioContext || this.isMuted) return;

      try {
        switch (soundName) {
          case 'hit': this.playHitSound(); break;
          case 'miss': this.playMissSound(); break;
          case 'sunk': this.playSunkSound(); break;
          case 'victory': this.playVictorySound(); break;
          case 'defeat': this.playDefeatSound(); break;
          case 'gameStart': this.playGameStartSound(); break;
          case 'place': this.playPlaceSound(); break;
          case 'rotate': this.playRotateSound(); break;
          default: this.playTone(400, 'sine', 0.1, 0.01, 0.3, 0.4);
        }
      } catch (e) {
        console.warn('Error playing sound:', e);
      }
    }

    playHitSound() {
      const ctx = this.audioContext;
      const t = ctx.currentTime;

      // Explosion noise burst.
      const noiseBuffer = this.createNoiseBuffer(0.4);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = ctx.createGain();
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(4000, t);
      noiseFilter.frequency.exponentialRampToValueAtTime(200, t + 0.4);
      noiseGain.gain.setValueAtTime(0.25, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t);

      // Low-frequency impact thud.
      const thud = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(150, t);
      thud.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      thudGain.gain.setValueAtTime(0.3, t);
      thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      thud.connect(thudGain);
      thudGain.connect(ctx.destination);
      thud.start(t);
      thud.stop(t + 0.35);

      // High crackle.
      this.playTone(800, 'sawtooth', 0.08, 0.005, 0.15, 0.2);
    }

    playMissSound() {
      const ctx = this.audioContext;
      const t = ctx.currentTime;

      // Water splash — filtered noise.
      const noiseBuffer = this.createNoiseBuffer(0.35);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2500;
      filter.Q.value = 1.5;
      noiseGain.gain.setValueAtTime(0.001, t);
      noiseGain.gain.linearRampToValueAtTime(0.12, t + 0.03);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t);

      // Descending plop.
      const plop = ctx.createOscillator();
      const plopGain = ctx.createGain();
      plop.type = 'sine';
      plop.frequency.setValueAtTime(600, t);
      plop.frequency.exponentialRampToValueAtTime(150, t + 0.15);
      plopGain.gain.setValueAtTime(0.1, t);
      plopGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      plop.connect(plopGain);
      plopGain.connect(ctx.destination);
      plop.start(t);
      plop.stop(t + 0.25);
    }

    playSunkSound() {
      const ctx = this.audioContext;
      const t = ctx.currentTime;

      // Heavy explosion noise.
      const noiseBuffer = this.createNoiseBuffer(1.2);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(5000, t);
      filter.frequency.exponentialRampToValueAtTime(100, t + 1.0);
      noiseGain.gain.setValueAtTime(0.3, t);
      noiseGain.gain.setValueAtTime(0.25, t + 0.1);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t);

      // Deep rumble.
      const rumble = ctx.createOscillator();
      const rumbleGain = ctx.createGain();
      rumble.type = 'sine';
      rumble.frequency.setValueAtTime(80, t);
      rumble.frequency.exponentialRampToValueAtTime(25, t + 0.8);
      rumbleGain.gain.setValueAtTime(0.35, t);
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      rumble.connect(rumbleGain);
      rumbleGain.connect(ctx.destination);
      rumble.start(t);
      rumble.stop(t + 1.1);

      // Metal creak.
      const creak = ctx.createOscillator();
      const creakGain = ctx.createGain();
      creak.type = 'sawtooth';
      creak.frequency.setValueAtTime(300, t + 0.3);
      creak.frequency.exponentialRampToValueAtTime(60, t + 1.0);
      creakGain.gain.setValueAtTime(0.001, t);
      creakGain.gain.linearRampToValueAtTime(0.06, t + 0.35);
      creakGain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      creak.connect(creakGain);
      creakGain.connect(ctx.destination);
      creak.start(t);
      creak.stop(t + 1.1);
    }

    playVictorySound() {
      if (!this.audioContext || this.isMuted) return;
      const ctx = this.audioContext;
      const t = ctx.currentTime;

      const notes = [
        { freq: 523,  time: 0,    dur: 0.2 },  // C5
        { freq: 659,  time: 0.2,  dur: 0.2 },  // E5
        { freq: 784,  time: 0.4,  dur: 0.2 },  // G5
        { freq: 1047, time: 0.6,  dur: 0.6 },  // C6 held
        { freq: 880,  time: 0.9,  dur: 0.15 }, // A5
        { freq: 1047, time: 1.05, dur: 0.8 }   // C6 final
      ];

      notes.forEach(n => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = n.freq;
        g.gain.setValueAtTime(0.001, t + n.time);
        g.gain.linearRampToValueAtTime(0.12, t + n.time + 0.02);
        g.gain.setValueAtTime(0.1, t + n.time + n.dur * 0.7);
        g.gain.exponentialRampToValueAtTime(0.001, t + n.time + n.dur);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t + n.time);
        osc.stop(t + n.time + n.dur + 0.05);

        // Octave-lower harmony.
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.value = n.freq / 2;
        g2.gain.setValueAtTime(0.001, t + n.time);
        g2.gain.linearRampToValueAtTime(0.06, t + n.time + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.001, t + n.time + n.dur);
        osc2.connect(g2);
        g2.connect(ctx.destination);
        osc2.start(t + n.time);
        osc2.stop(t + n.time + n.dur + 0.05);
      });
    }

    playDefeatSound() {
      if (!this.audioContext || this.isMuted) return;
      const ctx = this.audioContext;
      const t = ctx.currentTime;

      const notes = [
        { freq: 440, time: 0,    dur: 0.4 },
        { freq: 370, time: 0.35, dur: 0.4 },
        { freq: 311, time: 0.7,  dur: 0.4 },
        { freq: 262, time: 1.05, dur: 0.8 }
      ];

      notes.forEach(n => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = n.freq;
        g.gain.setValueAtTime(0.001, t + n.time);
        g.gain.linearRampToValueAtTime(0.15, t + n.time + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + n.time + n.dur);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t + n.time);
        osc.stop(t + n.time + n.dur + 0.05);
      });
    }

    playGameStartSound() {
      if (!this.audioContext || this.isMuted) return;
      const ctx = this.audioContext;
      const t = ctx.currentTime;

      // Ascending power-up sweep.
      const sweep = ctx.createOscillator();
      const sweepGain = ctx.createGain();
      sweep.type = 'sawtooth';
      sweep.frequency.setValueAtTime(200, t);
      sweep.frequency.exponentialRampToValueAtTime(800, t + 0.4);
      sweepGain.gain.setValueAtTime(0.08, t);
      sweepGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      sweep.connect(sweepGain);
      sweepGain.connect(ctx.destination);
      sweep.start(t);
      sweep.stop(t + 0.55);

      // Confirmation chime.
      this.playTone(660, 'sine', 0.12, 0.01, 0.25, 0.3);
      setTimeout(() => this.playTone(880, 'sine', 0.1, 0.01, 0.3, 0.35), 150);
    }

    playPlaceSound() {
      this.playTone(440, 'sine', 0.08, 0.005, 0.1, 0.15);
      setTimeout(() => this.playTone(550, 'sine', 0.06, 0.005, 0.08, 0.12), 60);
    }

    playRotateSound() {
      const ctx = this.audioContext;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.linearRampToValueAtTime(500, t + 0.08);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    }

    toggleSound() {
      this.isMuted = !this.isMuted;
      const btn = document.getElementById('toggleSound');
      if (btn) btn.textContent = this.isMuted ? '🔇' : '🔊';
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SoundManager };
  } else {
    global.SoundManager = SoundManager;
  }
})(typeof window !== 'undefined' ? window : globalThis);
