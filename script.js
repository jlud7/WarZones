/*
 * WarZones bootstrap.
 *
 * Everything else lives under lib/ — this file only wires the DOM-ready
 * handler, global keyboard shortcuts, and mobile touch gestures. The
 * WarZones class itself is in lib/game.js.
 */

document.addEventListener('DOMContentLoaded', () => {
  const game = new WarZones();

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
