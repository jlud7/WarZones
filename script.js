/*
 * WarZones bootstrap.
 *
 * Everything else lives under lib/ — this file only wires the DOM-ready
 * handler, global keyboard shortcuts, and mobile touch gestures. The
 * WarZones class itself is in lib/game.js.
 */

document.addEventListener('DOMContentLoaded', () => {
  const game = new WarZones();

  // Mobile battle-UI: keep ATTACKING/STANDBY chips, turn pill, and the
  // combat CTA in sync with the existing .player-score.active toggle.
  // Decoupled from game.js via a MutationObserver so we don't have to
  // patch each spot that flips the .active class.
  setupMobileBattleHud(game);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Let keyboard navigation handle arrow keys, 1-4, space, enter first
    if (game.handleKeyboardNav(e)) return;

    switch (e.key) {
      case 'r':
      case 'R':
        game.rotateShip();
        // Update keyboard cursor in case layer changed after rotation
        if (game.keyboard.active) game.updateKeyboardCursor();
        break;
      case 'z':
      case 'Z':
        if (e.ctrlKey || e.metaKey) {
          game.undoPlacement();
        }
        break;
      case 'Escape':
        // If keyboard nav is active, deactivate it first
        if (game.keyboard.active) {
          game.deactivateKeyboard();
          return;
        }
        const menu = document.getElementById('gameMenu');
        menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
        break;
    }
  });

  // Touch gestures for mobile
  let touchStartX = 0, touchStartY = 0;

  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  });

  document.addEventListener('touchmove', (e) => {
    if (!touchStartX || !touchStartY) return;
    if (game.gameState.phase !== 'setup') return;

    // Only treat as a rotate gesture if the swipe originated on the
    // active placement board — otherwise let the page scroll normally.
    const target = e.target.closest('.board');
    if (!target || !target.id.startsWith('player')) return;

    const touchEndX = e.touches[0].clientX;
    const touchEndY = e.touches[0].clientY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Require the gesture to be dominantly horizontal, so vertical
    // scrolls don't accidentally rotate.
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      game.rotateShip();
      touchStartX = null;
      touchStartY = null;
    }
  });
});

function setupMobileBattleHud(game) {
  const cards = document.querySelectorAll('#winCounter .player-score');
  if (cards.length !== 2) return;

  const turnNum = document.getElementById('turnPillNum');
  const cta = document.getElementById('combatCta');

  let turnCount = 0;
  let lastActiveIdx = -1;

  function syncHud() {
    const phase = game.gameState && game.gameState.phase;
    const activeIdx = cards[0].classList.contains('active') ? 0 : 1;

    // Chip text mirrors the .active state.
    cards.forEach((card, i) => {
      const chip = card.querySelector('.player-chip');
      if (!chip) return;
      chip.textContent = i === activeIdx ? 'ATTACKING' : 'STANDBY';
    });

    // Turn counter increments on each active-player change during combat.
    if (phase === 'combat' && activeIdx !== lastActiveIdx) {
      turnCount += 1;
      lastActiveIdx = activeIdx;
      if (turnNum) turnNum.textContent = String(turnCount).padStart(2, '0');
    }
    if (phase !== 'combat') {
      // Reset between games.
      turnCount = 0;
      lastActiveIdx = -1;
      if (turnNum) turnNum.textContent = '01';
    }

    // Combat CTA — only meaningful in combat phase.
    if (cta) {
      if (phase !== 'combat') {
        cta.classList.add('hidden');
      } else {
        cta.classList.remove('hidden');
        const youAreActive = activeIdx === 0;
        cta.classList.toggle('opponent-turn', !youAreActive);
        const title = cta.querySelector('.cta-title');
        const sub = cta.querySelector('.cta-sub');
        if (title) title.textContent = youAreActive ? 'Your Turn' : 'Enemy Turn';
        if (sub) sub.textContent = youAreActive
          ? '— tap enemy board to attack'
          : '— hold position';
      }
    }
  }

  const observer = new MutationObserver(syncHud);
  cards.forEach(card => {
    observer.observe(card, { attributes: true, attributeFilter: ['class'] });
  });

  // Phase transitions don't always change .active, so also poll briefly
  // around expected transitions. Cheap: a single rAF on each cell click.
  document.addEventListener('click', () => {
    requestAnimationFrame(syncHud);
  }, { capture: true });

  syncHud();
}
