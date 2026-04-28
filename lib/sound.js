/*
 * SoundManager module.
 *
 * All in-game sound effects are synthesized at runtime via the Web Audio
 * API — no audio files to ship, no decode latency, and the parameters
 * are right here if a sound needs tuning. Every effect routes through a
 * shared master chain (gain → compressor → destination) so overlapping
 * sounds don't clip. Dual-mode loader: <script> tag installs
 * SoundManager on the global object; Node uses module.exports.
 */
(function (global) {
  'use strict';

  class SoundManager {
    constructor() {
      this.isMuted = false;
      this.audioContext = null;
      this.master = null;
      this.isInitialized = false;
    }

    initialize() {
      if (this.isInitialized) return;
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = this.audioContext;

        // Master chain — compressor catches transient peaks when several
        // effects overlap (e.g. hit + sunk on the same frame), which used
        // to clip and produce a hard click on phone speakers.
        this.master = ctx.createGain();
        this.master.gain.value = 0.9;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.knee.value = 10;
        comp.ratio.value = 6;
        comp.attack.value = 0.003;
        comp.release.value = 0.18;
        this.master.connect(comp);
        comp.connect(ctx.destination);

        this.isInitialized = true;
      } catch (e) {
        console.warn('Web Audio API not supported');
      }
    }

    // ----- helpers -----------------------------------------------------

    _now() { return this.audioContext.currentTime; }

    _connect(node) { node.connect(this.master); return node; }

    _noiseBuffer(duration) {
      const sr = this.audioContext.sampleRate;
      const len = Math.max(1, Math.floor(sr * duration));
      const buf = this.audioContext.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    /* Filtered noise burst with an exponential gain envelope. Used as
       the "body" of explosions, splashes, and crackles. */
    _noise({ start = 0, duration = 0.3, gain = 0.2,
             filterType = 'lowpass', freq = 4000, freqEnd = null,
             q = 1 }) {
      const ctx = this.audioContext;
      const t = this._now() + start;
      const buf = this._noiseBuffer(duration);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(freq, t);
      if (freqEnd != null) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + duration);
      }
      filter.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);
      src.connect(filter);
      filter.connect(g);
      this._connect(g);
      src.start(t);
      src.stop(t + duration + 0.05);
    }

    /* Single oscillator with optional pitch glide and vibrato. The
       vibrato is implemented as a second oscillator routed through a
       gain into the main oscillator's detune param — gives victory /
       sunk creak sounds more organic character. */
    _tone({ start = 0, duration = 0.25, gain = 0.15,
            type = 'sine', freq = 440, freqEnd = null,
            attack = 0.005, vibratoHz = 0, vibratoCents = 0 }) {
      const ctx = this.audioContext;
      const t = this._now() + start;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (freqEnd != null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + duration);
      }
      const g = ctx.createGain();
      // Exponential attack/decay sounds more natural than linear.
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(g);
      this._connect(g);
      osc.start(t);
      osc.stop(t + duration + 0.05);

      if (vibratoHz > 0 && vibratoCents > 0) {
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = vibratoHz;
        lfoGain.gain.value = vibratoCents;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);
        lfo.start(t);
        lfo.stop(t + duration + 0.05);
      }
    }

    // ----- public API --------------------------------------------------

    playSound(soundName) {
      if (!this.isInitialized) this.initialize();
      if (!this.audioContext || this.isMuted) return;

      try {
        switch (soundName) {
          case 'hit':       this.playHitSound(); break;
          case 'miss':      this.playMissSound(); break;
          case 'sunk':      this.playSunkSound(); break;
          case 'victory':   this.playVictorySound(); break;
          case 'defeat':    this.playDefeatSound(); break;
          case 'gameStart': this.playGameStartSound(); break;
          case 'place':     this.playPlaceSound(); break;
          case 'rotate':    this.playRotateSound(); break;
          case 'treasure':  this.playTreasureSound(); break;
          case 'powerup':   this.playPowerupSound(); break;
          case 'undo':      this.playUndoSound(); break;
          default:          this._tone({ freq: 400, type: 'sine', gain: 0.1, duration: 0.3 });
        }
      } catch (e) {
        console.warn('Error playing sound:', e);
      }
    }

    /* Hit — incoming whoosh, sharp transient, low body, crackle, sparkle.
       Layered so it reads as a real impact instead of a flat tone. */
    playHitSound() {
      // Whoosh-in (descending pitch — projectile arrives)
      this._tone({ type: 'sawtooth', freq: 1400, freqEnd: 220, gain: 0.07, attack: 0.005, duration: 0.08 });
      // Sharp transient at impact (very short bandpassed noise click)
      this._noise({ start: 0.07, duration: 0.05, gain: 0.36, filterType: 'bandpass', freq: 2400, q: 1.4 });
      // Low boom — the "weight" of the explosion
      this._tone({ start: 0.07, type: 'sine', freq: 140, freqEnd: 35, gain: 0.42, attack: 0.008, duration: 0.42 });
      // Crackling debris (hi-pass noise tail)
      this._noise({ start: 0.07, duration: 0.32, gain: 0.18, filterType: 'highpass', freq: 2500, freqEnd: 600 });
      // Sparkle layer (high transient bleeps)
      this._tone({ start: 0.05, type: 'square', freq: 1900, freqEnd: 700, gain: 0.05, attack: 0.005, duration: 0.13 });
    }

    /* Miss — soft whoosh, splash, descending plop, a few bubble pops.
       Lower energy than the hit so misses feel obviously different. */
    playMissSound() {
      this._tone({ type: 'sine', freq: 900, freqEnd: 320, gain: 0.05, attack: 0.005, duration: 0.07 });
      this._noise({ start: 0.05, duration: 0.34, gain: 0.18, filterType: 'bandpass', freq: 1700, q: 0.9 });
      this._tone({ start: 0.05, type: 'sine', freq: 720, freqEnd: 170, gain: 0.13, attack: 0.005, duration: 0.18 });
      // Bubble pops scattered randomly — small, quick blips.
      for (let i = 0; i < 4; i++) {
        const at = 0.1 + Math.random() * 0.28;
        const f = 520 + Math.random() * 720;
        this._tone({ start: at, type: 'sine', freq: f, freqEnd: f * 0.6, gain: 0.05, attack: 0.002, duration: 0.05 });
      }
    }

    /* Sunk — large multi-stage explosion: initial blast, secondary
       boom, sub rumble, twisting metal groan, water rush tail. */
    playSunkSound() {
      // Initial flash — full-spectrum noise with sweeping low-pass
      this._noise({ duration: 0.18, gain: 0.32, filterType: 'lowpass', freq: 6000, freqEnd: 800 });
      // Secondary boom 100ms later (gives it a "chained explosion" feel)
      this._noise({ start: 0.1, duration: 0.5, gain: 0.28, filterType: 'lowpass', freq: 3000, freqEnd: 200 });
      // Sub rumble — long low sine sweep
      this._tone({ type: 'sine', freq: 90, freqEnd: 26, gain: 0.4, attack: 0.01, duration: 1.0 });
      // Metal groan — detuned sawtooth pair, slow downward sweep
      this._tone({ start: 0.25, type: 'sawtooth', freq: 320, freqEnd: 70, gain: 0.07, attack: 0.05, duration: 0.85, vibratoHz: 6, vibratoCents: 18 });
      this._tone({ start: 0.28, type: 'sawtooth', freq: 305, freqEnd: 65, gain: 0.05, attack: 0.05, duration: 0.85 });
      // Water rush tail — high-pass noise washing out
      this._noise({ start: 0.55, duration: 0.7, gain: 0.14, filterType: 'highpass', freq: 1200, freqEnd: 3000 });
    }

    /* Victory — triumphant fanfare. C-major arpeggio into a held C6
       with vibrato, octave bass underneath, then a final flourish. */
    playVictorySound() {
      // Arpeggio (C, E, G, C)
      const notes = [
        { freq: 523.25, at: 0.00, dur: 0.18 }, // C5
        { freq: 659.25, at: 0.16, dur: 0.18 }, // E5
        { freq: 784.00, at: 0.32, dur: 0.18 }, // G5
        { freq: 1046.5, at: 0.50, dur: 0.55 }, // C6 held
      ];
      notes.forEach((n, i) => {
        const isHeld = i === notes.length - 1;
        // Square = brassy, harmonic-rich.
        this._tone({ start: n.at, type: 'square', freq: n.freq, gain: 0.12, attack: 0.012, duration: n.dur,
                     vibratoHz: isHeld ? 5.5 : 0, vibratoCents: isHeld ? 12 : 0 });
        // Octave-down triangle harmonics — adds body without muddying.
        this._tone({ start: n.at, type: 'triangle', freq: n.freq / 2, gain: 0.07, attack: 0.012, duration: n.dur });
      });

      // Final flourish — quick run-up to E6 then resolve back to C6.
      this._tone({ start: 1.05, type: 'square', freq: 1318.5, gain: 0.10, attack: 0.005, duration: 0.10 });
      this._tone({ start: 1.18, type: 'square', freq: 1568.0, gain: 0.10, attack: 0.005, duration: 0.10 });
      this._tone({ start: 1.30, type: 'square', freq: 1046.5, gain: 0.13, attack: 0.005, duration: 0.55, vibratoHz: 5.5, vibratoCents: 14 });
      this._tone({ start: 1.30, type: 'triangle', freq: 523.25, gain: 0.09, attack: 0.01, duration: 0.55 });
      // Cymbal-like tail: high-pass noise.
      this._noise({ start: 1.30, duration: 0.6, gain: 0.05, filterType: 'highpass', freq: 4000, freqEnd: 8000 });
    }

    /* Defeat — somber descending minor, low drone underneath, distant
       rumble. Reads as "loss" without sounding accidental or buggy. */
    playDefeatSound() {
      // Descending minor sequence A4 → F4 → D4 → A3 (held).
      const notes = [
        { freq: 440.00, at: 0.00, dur: 0.42 },
        { freq: 369.99, at: 0.38, dur: 0.42 },
        { freq: 293.66, at: 0.78, dur: 0.42 },
        { freq: 220.00, at: 1.18, dur: 0.95 },
      ];
      notes.forEach((n, i) => {
        const isFinal = i === notes.length - 1;
        this._tone({ start: n.at, type: 'triangle', freq: n.freq, gain: 0.15, attack: 0.025, duration: n.dur,
                     vibratoHz: isFinal ? 4 : 0, vibratoCents: isFinal ? 8 : 0 });
        // Sine sub one octave down — adds a heavy, hollow feel.
        this._tone({ start: n.at, type: 'sine', freq: n.freq / 2, gain: 0.08, attack: 0.025, duration: n.dur });
      });
      // Distant rumble underneath the whole sequence.
      this._noise({ start: 0, duration: 2.1, gain: 0.05, filterType: 'lowpass', freq: 200, freqEnd: 80 });
    }

    /* Game start — tactical "system online" cue: power-up sweep into a
       two-note confirmation chime. Same shape as before but cleaner. */
    playGameStartSound() {
      this._tone({ type: 'sawtooth', freq: 200, freqEnd: 800, gain: 0.08, attack: 0.005, duration: 0.45 });
      this._tone({ start: 0.18, type: 'sine', freq: 660, gain: 0.13, attack: 0.005, duration: 0.28 });
      this._tone({ start: 0.34, type: 'sine', freq: 880, gain: 0.11, attack: 0.005, duration: 0.32 });
      // Subtle high sparkle for the "tactical" feel.
      this._noise({ start: 0.18, duration: 0.4, gain: 0.04, filterType: 'highpass', freq: 5000, freqEnd: 7000 });
    }

    /* Place — short metallic clamp / chunk. Two-stage: brief filtered
       noise click + a low body tone. */
    playPlaceSound() {
      this._noise({ duration: 0.04, gain: 0.18, filterType: 'highpass', freq: 4000, q: 1 });
      this._tone({ type: 'sine', freq: 220, freqEnd: 110, gain: 0.18, attack: 0.005, duration: 0.18 });
      this._tone({ start: 0.06, type: 'sine', freq: 540, gain: 0.07, attack: 0.005, duration: 0.12 });
    }

    /* Rotate — quick servo whir. Sawtooth sweep with a hint of FM. */
    playRotateSound() {
      this._tone({ type: 'sawtooth', freq: 280, freqEnd: 520, gain: 0.06, attack: 0.005, duration: 0.10, vibratoHz: 30, vibratoCents: 12 });
      this._tone({ start: 0.04, type: 'sine', freq: 700, gain: 0.04, attack: 0.005, duration: 0.08 });
    }

    /* Treasure — magical chime: arpeggiated bell-like sines tracing a
       major-7 chord with a glittery noise tail. Gives the treasure
       reveal the "good news" feel that sharing the hit-sound did not. */
    playTreasureSound() {
      const notes = [659.25, 880.00, 1046.5, 1318.5]; // E5 A5 C6 E6
      notes.forEach((f, i) => {
        this._tone({ start: i * 0.07, type: 'sine', freq: f, gain: 0.13, attack: 0.005, duration: 0.55 });
        // Octave shimmer one octave up at quarter volume.
        this._tone({ start: i * 0.07, type: 'sine', freq: f * 2, gain: 0.04, attack: 0.005, duration: 0.45 });
      });
      this._noise({ start: 0.05, duration: 0.7, gain: 0.04, filterType: 'highpass', freq: 5500, freqEnd: 9000 });
    }

    /* Power-up activated — rising whoosh + dramatic sting. */
    playPowerupSound() {
      this._tone({ type: 'sawtooth', freq: 180, freqEnd: 1400, gain: 0.07, attack: 0.005, duration: 0.32 });
      this._tone({ start: 0.28, type: 'square', freq: 880, gain: 0.10, attack: 0.005, duration: 0.18 });
      this._noise({ start: 0, duration: 0.32, gain: 0.06, filterType: 'highpass', freq: 3000, freqEnd: 6000 });
    }

    /* Undo — reverse "place": low click + ascending blip. */
    playUndoSound() {
      this._tone({ type: 'sine', freq: 480, freqEnd: 720, gain: 0.10, attack: 0.005, duration: 0.12 });
      this._tone({ start: 0.04, type: 'sine', freq: 240, gain: 0.06, attack: 0.005, duration: 0.10 });
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
