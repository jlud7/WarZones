/*
 * AnimationManager — DOM-driven particle, confetti, shake, and phase-
 * transition effects. Pure view code: no game state, no state mutation.
 */
(function (global) {
  'use strict';

  class AnimationManager {
    playPlacementAnimation(positions, boardId) {
      positions.forEach(pos => {
        const cell = document.querySelector(`#${boardId} .cell[data-index="${pos}"]`);
        if (cell) {
          cell.style.animation = 'placeShip 0.3s ease-out';
          setTimeout(() => { cell.style.animation = ''; }, 300);
        }
      });
    }

    playAttackAnimation(result) {
      const cell = document.querySelector(`#${result.boardId} .cell[data-index="${result.index}"]`);
      if (!cell) return;

      if (result.hit) {
        this.playExplosion(cell);
        this.playScreenShake(false);
      } else {
        this.playSplash(cell);
      }
    }

    playExplosion(cell) {
      cell.style.position = 'relative';

      const flash = document.createElement('div');
      flash.className = 'explosion-flash';
      cell.appendChild(flash);
      setTimeout(() => flash.remove(), 350);

      const ring = document.createElement('div');
      ring.className = 'explosion-ring';
      cell.appendChild(ring);
      setTimeout(() => ring.remove(), 600);

      const container = document.createElement('div');
      container.className = 'explosion-container';
      cell.appendChild(container);

      const colors = ['#ff5252', '#ff8a65', '#ffd54f', '#fff176', '#ff6e40'];
      const emojis = ['💥', '🔥', '✦', '✧'];

      for (let i = 0; i < 10; i++) {
        const p = document.createElement('div');
        p.className = 'explosion-particle';
        const size = 3 + Math.random() * 5;
        const angle = (Math.PI * 2 * i) / 10 + (Math.random() - 0.5) * 0.5;
        const dist = 20 + Math.random() * 30;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const dur = 300 + Math.random() * 300;

        p.style.cssText = `width:${size}px;height:${size}px;background:${color};top:50%;left:50%;
          box-shadow:0 0 ${size}px ${color};
          animation: none;`;
        p.style.transform = 'translate(-50%, -50%)';
        container.appendChild(p);

        // JS-driven radial burst so each particle moves independently.
        requestAnimationFrame(() => {
          p.style.transition = `all ${dur}ms cubic-bezier(0, 0.8, 0.5, 1)`;
          p.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
          p.style.opacity = '0';
        });
      }

      // Emoji debris.
      for (let i = 0; i < 3; i++) {
        const e = document.createElement('div');
        e.className = 'explosion-particle';
        e.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        e.style.cssText = 'font-size:10px;top:50%;left:50%;background:none;width:auto;height:auto;';
        e.style.transform = 'translate(-50%, -50%)';
        container.appendChild(e);

        const angle = Math.random() * Math.PI * 2;
        const dist = 25 + Math.random() * 25;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;

        requestAnimationFrame(() => {
          e.style.transition = 'all 500ms cubic-bezier(0, 0.8, 0.5, 1)';
          e.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.3)`;
          e.style.opacity = '0';
        });
      }

      setTimeout(() => container.remove(), 700);
    }

    playSplash(cell) {
      cell.style.position = 'relative';

      const container = document.createElement('div');
      container.className = 'miss-splash';
      cell.appendChild(container);

      const ring = document.createElement('div');
      ring.className = 'splash-ring';
      container.appendChild(ring);

      for (let i = 0; i < 6; i++) {
        const drop = document.createElement('div');
        drop.className = 'splash-drop';
        drop.style.cssText = 'top:50%;left:50%;';
        drop.style.transform = 'translate(-50%, -50%)';
        container.appendChild(drop);

        const angle = (Math.PI * 2 * i) / 6;
        const dist = 12 + Math.random() * 15;
        const dx = Math.cos(angle) * dist;
        // Upward bias so droplets arc like a real splash.
        const dy = Math.sin(angle) * dist - 8;

        requestAnimationFrame(() => {
          drop.style.transition = 'all 400ms cubic-bezier(0.2, 0.8, 0.4, 1)';
          drop.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
          drop.style.opacity = '0';
        });
      }

      setTimeout(() => container.remove(), 500);
    }

    playScreenShake(heavy) {
      const container = document.querySelector('.game-container');
      if (!container) return;

      const cls = heavy ? 'screen-shake-heavy' : 'screen-shake';
      container.classList.remove('screen-shake', 'screen-shake-heavy');
      // Force reflow so the animation restarts cleanly.
      void container.offsetWidth;
      container.classList.add(cls);
      const dur = heavy ? 500 : 400;
      setTimeout(() => container.classList.remove(cls), dur);
    }

    playSunkAnimation(positions, boardId) {
      this.playScreenShake(true);

      positions.forEach((pos, i) => {
        const cell = document.querySelector(`#${boardId} .cell[data-index="${pos}"]`);
        if (!cell) return;

        setTimeout(() => {
          cell.classList.add('sinking');
          this.playExplosion(cell);

          setTimeout(() => {
            cell.classList.remove('sinking');
            cell.classList.add('sunk');
          }, 800);
        }, i * 150);
      });
    }

    playConfetti(container) {
      const canvas = document.createElement('canvas');
      canvas.className = 'confetti-canvas';
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      container.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      const colors = ['#ffd700', '#ff6b35', '#00c853', '#6ab7ff', '#ff5252', '#e040fb', '#ffffff'];
      const particles = [];

      for (let i = 0; i < 120; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: -20 - Math.random() * canvas.height * 0.5,
          w: 6 + Math.random() * 6,
          h: 4 + Math.random() * 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          vx: (Math.random() - 0.5) * 4,
          vy: 2 + Math.random() * 4,
          rotation: Math.random() * 360,
          rotSpeed: (Math.random() - 0.5) * 12,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpeed: 0.03 + Math.random() * 0.05
        });
      }

      let frame = 0;
      const maxFrames = 240; // ~4 seconds at 60fps

      const animate = () => {
        if (frame >= maxFrames) {
          canvas.remove();
          return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const alpha = frame > maxFrames - 60 ? (maxFrames - frame) / 60 : 1;
        ctx.globalAlpha = alpha;

        particles.forEach(p => {
          p.x += p.vx + Math.sin(p.wobble) * 0.8;
          p.y += p.vy;
          p.rotation += p.rotSpeed;
          p.wobble += p.wobbleSpeed;
          p.vy += 0.02; // gravity

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        });

        frame++;
        requestAnimationFrame(animate);
      };

      animate();
    }

    playPhaseTransition(title, subtitle) {
      return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'phase-transition-overlay';
        overlay.innerHTML = `
          <div class="phase-transition-text">${title}</div>
          <div class="phase-transition-sub">${subtitle}</div>
        `;
        document.body.appendChild(overlay);

        setTimeout(() => {
          overlay.classList.add('exit');
          setTimeout(() => {
            overlay.remove();
            resolve();
          }, 400);
        }, 1400);
      });
    }

    showAIThinking(boardSide) {
      document.querySelectorAll(`.${boardSide}-boards .board`).forEach(board => {
        board.classList.add('ai-scanning');
        board.style.position = 'relative';
      });
    }

    hideAIThinking(boardSide) {
      document.querySelectorAll(`.${boardSide}-boards .board`).forEach(board => {
        board.classList.remove('ai-scanning');
      });
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AnimationManager };
  } else {
    global.AnimationManager = AnimationManager;
  }
})(typeof window !== 'undefined' ? window : globalThis);
