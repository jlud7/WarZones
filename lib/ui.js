/*
 * UIController module.
 *
 * DOM rendering and user interaction: boards, scoreboard, fleet dock,
 * commentary, treasure menu, game-over overlay, hover/placement
 * highlights. Depends on GAME_CONSTANTS (from lib/game-state.js) and
 * the game instance for state access. Dual-mode loader.
 */
(function (global) {
  'use strict';

  const GAME_CONSTANTS = (typeof module !== 'undefined' && module.exports)
    ? require('./game-state.js').GAME_CONSTANTS
    : global.GAME_CONSTANTS;

  // Display labels for each layer. Internally the underwater zone is
  // 'Sub' (matches the GAME_CONSTANTS key), but it's surfaced to the
  // player as "DEPTHS" — keep the user-facing copy consistent with the
  // gutter label in the boards layout.
  const LAYER_DISPLAY = {
    Space: 'SPACE',
    Sky: 'SKY',
    Sea: 'SEA',
    Sub: 'DEPTHS',
  };

  class UIController {
    constructor(game) {
      this.game = game;
      this.setupUI();
    }
    
    setupUI() {
      this.gameInfo = document.createElement('div');
      this.gameInfo.id = 'gameInfo';
      this.gameInfo.className = 'commentary-box';
      document.getElementById('commentaryBox').after(this.gameInfo);

      this.setupBoardHoverEffects();

      // Drag-to-place placement (Pointer Events; works for mouse, touch,
      // pen). Lives in its own controller so the placement glue stays out
      // of the rest of the UI.
      this.dragController = new DragController(this.game);
      this.dragController.setup();
    }
    
  showTreasureMenu() {
    // Check if BlackBox is usable - need at least one empty cell in player's sky board
    const skyBoard = this.game.gameState.boards.player.Sky;
    const hasEmptySkyCell = skyBoard.some((cell, i) => {
      if (cell !== null) return false; // occupied by ship or extra jet
      // Also check if the cell was attacked (hit/miss)
      const cellEl = document.querySelector(`#playerSkyBoard .cell[data-index="${i}"]`);
      return cellEl && !cellEl.classList.contains('hit') && !cellEl.classList.contains('miss');
    });
  
    const blackBoxDisabled = !hasEmptySkyCell;
  
    const overlay = document.createElement('div');
    overlay.className = 'game-over-overlay';
    overlay.id = 'treasureOverlay';
    overlay.innerHTML = `
      <div class="treasure-content">
        <h2>Treasure Found!</h2>
        <p>Choose one power-up:</p>
  
        <div class="powerup-options">
          <div class="powerup-option${blackBoxDisabled ? ' powerup-disabled' : ''}" data-powerup="BlackBox">
            <div class="powerup-icon">${GAME_CONSTANTS.POWERUPS.BlackBox.icon}</div>
            <div class="powerup-name">${GAME_CONSTANTS.POWERUPS.BlackBox.name}</div>
            <div class="powerup-desc">${blackBoxDisabled ? 'No empty sky squares available' : GAME_CONSTANTS.POWERUPS.BlackBox.description}</div>
          </div>
  
          <div class="powerup-option" data-powerup="KryptonLaser">
            <div class="powerup-icon">${GAME_CONSTANTS.POWERUPS.KryptonLaser.icon}</div>
            <div class="powerup-name">${GAME_CONSTANTS.POWERUPS.KryptonLaser.name}</div>
            <div class="powerup-desc">${GAME_CONSTANTS.POWERUPS.KryptonLaser.description}</div>
          </div>
  
          <div class="powerup-option" data-powerup="CannonBall">
            <div class="powerup-icon">${GAME_CONSTANTS.POWERUPS.CannonBall.icon}</div>
            <div class="powerup-name">${GAME_CONSTANTS.POWERUPS.CannonBall.name}</div>
            <div class="powerup-desc">${GAME_CONSTANTS.POWERUPS.CannonBall.description}</div>
          </div>
        </div>
      </div>
    `;
  
    document.body.appendChild(overlay);
  
    // Add event listeners to power-up options
    overlay.querySelectorAll('.powerup-option').forEach(option => {
      if (option.classList.contains('powerup-disabled')) return; // Skip disabled options
      option.addEventListener('click', () => {
        const powerupType = option.dataset.powerup;
        this.game.activatePowerup(powerupType);
        overlay.remove();
      });
    });
  }
    
  updateBoard(result) {
    const { boardId, index, hit, treasure, sunk, shipType } = result;
    const cell = document.querySelector(`#${boardId} .cell[data-index="${index}"]`);
    if (!cell) return;
    
    if (treasure) {
      // Reveal treasure: show the chest sprite (with emoji fallback).
      cell.classList.add('hit', 'treasure');
      cell.innerHTML = '<img src="assets/icons/treasure-chest.webp" class="cell-sprite" alt="💎">';
      return; // Early return to avoid further processing
    } else if (hit) {
      // Handle hit
      cell.classList.remove('ship');
      cell.classList.add('hit');
      cell.textContent = '💥';
      
      if (boardId.includes('player')) {
        cell.style.backgroundColor = 'rgba(255, 82, 82, 0.3)';
      }
      
      if (sunk) {
        this.animateSunkShip(shipType, boardId);
      }
    } else {
      // Handle miss
      cell.classList.add('miss');
      cell.textContent = 'O';
    }
    
    // Play animation
    this.game.animations.playAttackAnimation(result);
  
    // Update scoreboard with latest hits/misses
    this.updateScoreBoard();
  
    // Update ship counter display
    this.game.updateShipCounter();
  }
  
    showRoomCode(code) {
      document.getElementById('roomCodeDisplay').textContent = code;
      document.getElementById('roomCodeDisplay').title = "Click to copy";
      this.updateCommentary("Waiting for opponent... Share this code!");
    }
  
    renderMainMenu() {
      // Clean up campaign state if active
      if (this.game.campaign?.activeMission) {
        this.game.campaign.cleanup();
      }
      document.getElementById('gameMenu').style.display = 'flex';
      document.getElementById('shipCounter').classList.remove('visible');
      document.getElementById('keyboardHint').classList.remove('visible');
      this.hideFleetDock();
      // Reset online menu state to main buttons
      document.getElementById('mainMenuButtons').classList.remove('hidden');
      document.getElementById('onlineMenuButtons').classList.add('hidden');
      document.getElementById('joinGameInput').classList.add('hidden');
      document.getElementById('hostGameDisplay').classList.add('hidden');
    }
    
    hideMainMenu() {
      document.getElementById('gameMenu').style.display = 'none';
    }
    
    updateGameInfo(message, type = 'info') {
      this.gameInfo.textContent = message;
      this.gameInfo.className = `commentary-box ${type}`;
    }
    
    updateCommentary(message) {
      const commentaryBox = document.getElementById('commentaryText');
      if (commentaryBox) commentaryBox.textContent = message;
    }
  
    highlightPlacementBoard() {
      // Remove existing highlights
      document.querySelectorAll('.board-section.placement-active').forEach(section => {
        section.classList.remove('placement-active');
      });
  
      // Only highlight during setup phase
      if (this.game.gameState.phase !== 'setup') return;
  
      // Get current ship being placed
      const shipType = this.game.gameState.getCurrentShip();
      if (!shipType) return;
  
      // Get the layer for this ship
      const shipConfig = GAME_CONSTANTS.SHIPS[shipType];
      if (!shipConfig) return;
  
      const layer = shipConfig.layer;
  
      // Determine which board to highlight (player or opponent)
      const boardPrefix = this.game.gameState.gameMode === 'human' && this.game.gameState.currentPlayer === 2
        ? 'opponent'
        : 'player';
  
      // Find and highlight the appropriate board section
      const boardId = `${boardPrefix}${layer}Board`;
      const board = document.getElementById(boardId);
  
      if (board) {
        const boardSection = board.closest('.board-section');
        if (boardSection) {
          boardSection.classList.add('placement-active');
          // Bring the relevant zone into view if it's offscreen — most
          // useful on mobile where the four boards stack vertically and
          // span more than one viewport height. `nearest` skips scrolling
          // when the section is already visible, so this is a no-op on
          // desktop. `scroll-margin-top/bottom` (in style.css) keeps it
          // clear of the sticky header and fixed bottom controls.
          boardSection.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }
  
    // === Fleet Dock ===
    renderFleetDock() {
      const dock = document.getElementById('fleetDock');
      const container = document.getElementById('fleetDockShips');
      if (!dock || !container) return;
  
      const shipTypes = Object.keys(GAME_CONSTANTS.SHIPS);
      container.innerHTML = '';
  
      shipTypes.forEach((shipType, index) => {
        const config = GAME_CONSTANTS.SHIPS[shipType];
        const el = document.createElement('div');
        el.className = 'dock-ship upcoming';
        el.dataset.ship = shipType;
        el.dataset.layer = config.layer;
        el.dataset.index = index;
  
        // Build the mini shape grid
        const shapeEl = document.createElement('div');
        const shapeClass = `dock-ship-shape shape-${config.shape}`;
        const sizeClass = config.shape === 'line' ? ` size-${config.size}` : '';
        shapeEl.className = shapeClass + sizeClass;
  
        for (let i = 0; i < config.size; i++) {
          const cell = document.createElement('div');
          cell.className = 'dock-ship-cell';
          shapeEl.appendChild(cell);
        }
  
        // Ship name
        const nameEl = document.createElement('div');
        nameEl.className = 'dock-ship-name';
        nameEl.textContent = shipType;
  
        // Layer label
        const layerEl = document.createElement('div');
        layerEl.className = 'dock-ship-layer';
        layerEl.textContent = config.layer;
  
        el.appendChild(shapeEl);
        el.appendChild(nameEl);
        el.appendChild(layerEl);
        container.appendChild(el);
      });
  
      dock.classList.remove('hidden');
      this.updateFleetDock();
      if (this.dragController) this.dragController.showHintIfNeeded();
    }
  
    updateFleetDock() {
      const dock = document.getElementById('fleetDock');
      if (!dock) return;
  
      const currentIndex = this.game.gameState.currentShipIndex;
      const shipTypes = Object.keys(GAME_CONSTANTS.SHIPS);
  
      dock.querySelectorAll('.dock-ship').forEach(el => {
        const index = parseInt(el.dataset.index);
        el.classList.remove('placed', 'current', 'upcoming', 'drag-hint');

        if (index < currentIndex) {
          el.classList.add('placed');
        } else if (index === currentIndex) {
          el.classList.add('current');
        } else {
          el.classList.add('upcoming');
        }
      });

      if (this.dragController) this.dragController.showHintIfNeeded();
    }
  
    hideFleetDock() {
      const dock = document.getElementById('fleetDock');
      if (dock) dock.classList.add('hidden');
    }
  
    clearBoards() {
      document.querySelectorAll('.board').forEach(board => board.innerHTML = '');
    }
    
    updateScoreBoard() {
      const playerShots = this.game.gameState.shots.player;
      const opponentShots = this.game.gameState.shots.opponent;
      
      // Update player 1 stats
      document.querySelector('#winCounter .player-score:first-child .stats-row').innerHTML = `
        <span class="hits">Hits: ${playerShots.hits}</span>
        <span class="accuracy">Acc: ${playerShots.total
          ? Math.round((playerShots.hits / playerShots.total) * 100)
          : 0}%</span>
      `;
      
      // Update player 2/AI stats
      document.querySelector('#winCounter .player-score:last-child .stats-row').innerHTML = `
        <span class="hits">Hits: ${opponentShots.hits}</span>
        <span class="accuracy">Acc: ${opponentShots.total
          ? Math.round((opponentShots.hits / opponentShots.total) * 100)
          : 0}%</span>
      `;
      
      // Update win counts
      document.getElementById('player1Wins').textContent = this.game.playerWins;
      document.getElementById('player2Wins').textContent = this.game.player2Wins;
    }
    
    setupBoardHoverEffects() {
      const boards = document.querySelectorAll('.board');
      boards.forEach(board => {
        board.addEventListener('mousemove', (e) => {
          if (e.target.classList.contains('cell')) {
            this.handleBoardMouseMove(board, e.target);
          }
        });
        
        board.addEventListener('mouseleave', () => {
          board.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('valid-placement', 'invalid-placement');
          });
        });
      });
    }
    
    handleBoardMouseMove(board, cell) {
      if (this.game.gameState.phase !== 'setup') return;
      // While a drag is in flight, the DragController owns the preview;
      // don't double-paint via legacy mouse hover.
      if (document.body.classList.contains('drag-active')) return;

      const index = parseInt(cell.dataset.index);
      const layer = cell.dataset.layer;
      const boardId = board.id;
      const shipType = this.game.gameState.getCurrentShip();
      
      if (!shipType) return;
    
      // Update commentary with current ship being placed
      const config = GAME_CONSTANTS.SHIPS[shipType];
      const sizeDesc = config.size === 1 ? '1 cell' : `${config.size} cells`;
      this.updateCommentary(`Place your ${shipType} (${sizeDesc}) on the ${config.layer} board`);
  
      // Clear all previous highlights on this board only
      board.querySelectorAll('.cell').forEach(c => {
          c.classList.remove('valid-placement', 'invalid-placement');
      });
  
      // Check if we should handle this board
      if (this.game.gameState.gameMode === 'human') {
          if (this.game.gameState.currentPlayer === 1 && !boardId.includes('player')) return;
          if (this.game.gameState.currentPlayer === 2 && !boardId.includes('opponent')) return;
      } else if (!boardId.includes('player')) return;
  
      // Get the positions for the current ship
      const positions = this.game.gameState.calculateShipPositions(index, shipType);
      if (positions.length === 0) return;
  
      // Check if the placement would be valid
      const isValid = this.game.gameState.isValidPlacement(boardId, index, layer, shipType);
  
      // Add appropriate highlight class to all affected cells
      positions.forEach(pos => {
          const targetCell = board.querySelector(`.cell[data-index="${pos}"]`);
          if (targetCell) {
              targetCell.classList.add(isValid ? 'valid-placement' : 'invalid-placement');
          }
      });
    }
    
    animateSunkShip(shipType, boardId) {
      const side = boardId.includes('player') ? 'player' : 'opponent';
      const positions = this.game.gameState.ships[side][shipType].positions;
      
      positions.forEach(pos => {
        const cell = document.querySelector(`#${boardId} .cell[data-index="${pos}"]`);
        if (cell) {
          cell.classList.add('sunk');
        }
      });
    }
    
  showGameOver(result) {
    // Campaign: show campaign debriefing instead of normal game over
    if (this.game.campaign?.activeMission) {
      this.game.campaign.showDebriefing(result);
      return;
    }
  
    const isVictory = result.winner === 'player';
    let winnerText;
    if (result.mode === 'human') {
      winnerText = isVictory ? `Player ${this.game.gameState.currentPlayer} Wins!` : 'Defeat!';
    } else if (result.mode === 'online') {
      winnerText = isVictory ? 'Victory!' : 'Defeat!';
    } else {
      winnerText = isVictory ? 'Victory!' : 'Defeat!';
    }
  
    // Calculate game duration
    const elapsed = this.game.gameState.startTime ? Math.floor((Date.now() - this.game.gameState.startTime) / 1000) : 0;
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
    // Count sunk ships
    const opponentShips = this.game.gameState.ships.opponent;
    const playerShips = this.game.gameState.ships.player;
    const opponentSunk = Object.values(opponentShips).filter(s => s.isSunk && s.positions.length > 0).length;
    const playerSunk = Object.values(playerShips).filter(s => s.isSunk && s.positions.length > 0).length;
  
    // Get shots data
    const statsKey = result.mode === 'online' ? 'player' : result.winner;
    const shotsData = this.game.gameState.shots[statsKey] || { total: 0, hits: 0 };
    const shots = typeof shotsData.total === 'number' ? shotsData.total : 0;
    const hits = typeof shotsData.hits === 'number' ? shotsData.hits : 0;
    const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : 0;
  
    const overlay = document.createElement('div');
    overlay.className = `game-over-overlay ${isVictory ? 'victory-overlay' : 'defeat-overlay'}`;
    overlay.id = 'gameOverOverlay';
    overlay.innerHTML = `
      <div class="game-over-content">
        <h2>${winnerText}</h2>
  
        <div class="stats">
          <p>Shots Fired: ${shots}</p>
          <p>Hits: ${hits}</p>
          <p>Accuracy: <span class="accuracy-value">${accuracy}%</span></p>
          <p>Ships Destroyed: ${isVictory ? opponentSunk : playerSunk}</p>
          <p>Time: ${timeStr}</p>
        </div>
  
        <div class="game-over-buttons">
          <button id="newGameBtn" class="game-over-button">New Game</button>
          <button id="mainMenuBtn" class="game-over-button">Main Menu</button>
        </div>
      </div>
    `;
  
    // Make sure we don't add multiple game over overlays
    const existingOverlay = document.getElementById('gameOverOverlay');
    if (existingOverlay) existingOverlay.remove();
  
    document.body.appendChild(overlay);
  
    // Play confetti for victory
    if (isVictory) {
      this.game.animations.playConfetti(overlay);
    }
  
    // Ensure game state is set to 'gameOver'
    this.game.gameState.phase = 'gameOver';
  
    overlay.querySelector('#newGameBtn').addEventListener('click', () => {
      this.game.startNewGame(this.game.gameState.gameMode);
      overlay.remove();
    });
  
    overlay.querySelector('#mainMenuBtn').addEventListener('click', () => {
      this.renderMainMenu();
      overlay.remove();
    });
  }
    
  hideShips(side) {
    const selector = side === 'player' ?
      ".player-boards .board .cell.ship" :
      ".opponent-boards .board .cell.ship";

    document.querySelectorAll(selector).forEach(cell => {
      cell.textContent = '';
      delete cell.dataset.ship;
      cell.style.removeProperty('--ship-bg-size');
      cell.style.removeProperty('--ship-bg-pos');
      cell.style.removeProperty('--ship-rotate');
      // Remove the 'ship' class to hide the blue background
      cell.classList.remove('ship');
      cell.classList.add('hidden-ship');
    });
  }

    redisplayShips(side) {
      const prefix = side === 'player' ? 'player' : 'opponent';
      const ships = this.game.gameState.ships[side];

      Object.keys(ships).forEach(shipType => {
        const config = GAME_CONSTANTS.SHIPS[shipType];
        if (!config) return; // e.g. ExtraJet is placed directly, not via this path
        const positions = ships[shipType].positions;
        if (positions.length === 0) return;
        const boardSelector = `#${prefix}${config.layer}Board`;
        UIController.paintShipSprite(boardSelector, shipType, positions);
      });
    }

    /* Paint a ship's sprite across its cells. Ship sprites are drawn with
       their long axis horizontal; for vertically-placed ships we rotate the
       rendering 90° CW and slice along the (pre-rotation) horizontal axis. */
    static paintShipSprite(boardSelector, shipType, positions) {
      const B = GAME_CONSTANTS.BOARD_SIZE;
      const rows = positions.map(p => Math.floor(p / B));
      const cols = positions.map(p => p % B);
      const minRow = Math.min(...rows);
      const minCol = Math.min(...cols);
      const shipW = Math.max(...cols) - minCol + 1;
      const shipH = Math.max(...rows) - minRow + 1;
      const isSingle = shipW === 1 && shipH === 1;
      const isHorizontal = shipW > 1 && shipH === 1;
      const isVertical = shipW === 1 && shipH > 1;
      // Square ships (e.g. Spacecraft 2x2) fall through to the else branch.

      positions.forEach((pos, i) => {
        const cell = document.querySelector(`${boardSelector} .cell[data-index="${pos}"]`);
        if (!cell) return;
        const idxCol = cols[i] - minCol;
        const idxRow = rows[i] - minRow;

        let sizeCss, posCss, rotateCss;
        if (isSingle) {
          sizeCss = 'contain';
          posCss = 'center';
          rotateCss = '0deg';
        } else if (isHorizontal) {
          sizeCss = `${shipW * 100}% 100%`;
          posCss = `${(idxCol / (shipW - 1)) * 100}% 50%`;
          rotateCss = '0deg';
        } else if (isVertical) {
          // Pre-rotation: sprite spans a horizontal strip; each vertical cell
          // becomes one slice along that strip. After rotation 90° CW, the
          // sprite reads top-to-bottom as the ship faces.
          sizeCss = `${shipH * 100}% 100%`;
          posCss = `${(idxRow / (shipH - 1)) * 100}% 50%`;
          rotateCss = '90deg';
        } else {
          sizeCss = `${shipW * 100}% ${shipH * 100}%`;
          posCss = `${(idxCol / (shipW - 1)) * 100}% ${(idxRow / (shipH - 1)) * 100}%`;
          rotateCss = '0deg';
        }

        cell.classList.add('ship');
        cell.dataset.ship = shipType;
        cell.style.setProperty('--ship-bg-size', sizeCss);
        cell.style.setProperty('--ship-bg-pos', posCss);
        cell.style.setProperty('--ship-rotate', rotateCss);
        // No textContent — the sprite is the sole visual; emoji fallback
        // removed to avoid a brief flash before the PNG paints.
      });
    }
  }

  /*
   * DragController — drag-to-place ship placement.
   *
   * Works on mouse, touch, and pen via Pointer Events. The "current" ship
   * in the fleet dock is the only draggable element; pointerdown on it
   * spawns a ghost ship that follows the pointer. As the ghost crosses
   * board cells the controller calls into GameState to validate the
   * footprint, paints the same .valid-placement / .invalid-placement
   * classes the existing hover preview uses, and auto-highlights the
   * board section beneath the ghost. Releasing on a valid spot calls
   * Game.handleShipPlacement(); releasing anywhere else snaps the ghost
   * back to the dock.
   *
   * Touch design choices:
   *  - The ghost is offset ~90px above the touch point so the user's
   *    finger doesn't occlude the cells they're targeting.
   *  - Hit-testing uses the ghost's center, not the finger's position —
   *    "the ship lands where you SEE it" matches user expectations.
   *  - The drop-target cell pulses extra-hard so it's still visible
   *    under a fingertip.
   *  - A floating ↻ button next to the ghost rotates the ship; on touch
   *    the user taps it with a second finger (different pointerId)
   *    without ending the drag.
   *  - touch-action: none on the dock ship + body.drag-active prevents
   *    the page from scrolling while the user is dragging.
   *  - navigator.vibrate(...) gives a small haptic blip on rotate /
   *    successful placement.
   */
  class DragController {
    constructor(game) {
      this.game = game;
      this.active = null;
      this._onPointerMove = this._onPointerMove.bind(this);
      this._onPointerUp = this._onPointerUp.bind(this);
      this._onPointerCancel = this._onPointerCancel.bind(this);
      this._onRotateBtnDown = this._onRotateBtnDown.bind(this);
    }

    get gs() { return this.game.gameState; }
    get ui() { return this.game.ui; }

    setup() {
      const dock = document.getElementById('fleetDock');
      if (!dock) return;
      // Event delegation: any pointerdown on the *current* dock ship
      // starts a drag. Re-renders of the dock don't need to re-bind.
      dock.addEventListener('pointerdown', (e) => this._onDockPointerDown(e));
    }

    _onDockPointerDown(e) {
      // Only primary button (mouse) / first touch.
      if (e.button !== undefined && e.button !== 0) return;
      if (this.gs.phase !== 'setup') return;
      if (this.active) return;
      const dockShip = e.target.closest('.dock-ship.current');
      if (!dockShip) return;
      e.preventDefault();
      this._startDrag(e, dockShip);
    }

    _startDrag(e, dockShip) {
      const shipType = dockShip.dataset.ship;
      if (!shipType) return;

      const config = GAME_CONSTANTS.SHIPS[shipType];
      const layer = config.layer;

      const isTouch = e.pointerType === 'touch';

      const { ghost, grid, zone, rotateBtn, hint } = this._buildGhost(shipType, layer, isTouch);
      // The grid must be in the DOM before _fillGhostGrid runs, because
      // UIController.paintShipSprite uses document.querySelector to find
      // each cell. Append first, *then* fill — otherwise the very first
      // drag renders empty cells and the sprite only appears after the
      // first rotation (which re-fills against an in-DOM grid).
      document.body.appendChild(ghost);
      // The floating rotate button is only useful on touch (a second
      // finger can tap it). On desktop the mouse has only one pointer
      // and is captured by the drag, so the button would be unreachable
      // mid-drag — show a "press R" hint near the ghost instead.
      if (isTouch) document.body.appendChild(rotateBtn);
      else if (hint) document.body.appendChild(hint);
      this._fillGhostGrid(grid, shipType);
      document.body.classList.add('drag-active');
      dockShip.classList.add('dragging');
      dockShip.classList.remove('drag-hint');

      try { localStorage.setItem('warzones-drag-seen', '1'); } catch (_) {}

      // Capture so the source element keeps receiving move/up events even
      // if the pointer leaves it. Other pointers (a second finger on the
      // rotate button) still go to their own targets — capture is per-id.
      try { dockShip.setPointerCapture(e.pointerId); } catch (_) {}

      this.active = {
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        sourceEl: dockShip,
        ghost,
        grid,
        zone,
        rotateBtn,
        hint,
        shipType,
        layer,
        currentBoard: null,
        currentBoardId: null,
        currentLayer: layer,
        currentCellIndex: null,
        valid: false,
        offsetY: isTouch ? -90 : 0,
        lastX: e.clientX,
        lastY: e.clientY,
      };

      dockShip.addEventListener('pointermove', this._onPointerMove);
      dockShip.addEventListener('pointerup', this._onPointerUp);
      dockShip.addEventListener('pointercancel', this._onPointerCancel);
      // Only desktop ghosts have a touch-rotate button to wire up.
      if (isTouch) rotateBtn.addEventListener('pointerdown', this._onRotateBtnDown);

      this._positionGhost(e.clientX, e.clientY);
      this._positionRotateBtn();
      this._updatePreview();
    }

    _buildGhost(shipType, layer, isTouch) {
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.dataset.layer = layer;
      ghost.setAttribute('aria-hidden', 'true');

      const zone = document.createElement('div');
      zone.className = 'drag-ghost-zone';
      zone.textContent = `Place on ${LAYER_DISPLAY[layer] || layer.toUpperCase()}`;
      ghost.appendChild(zone);

      const grid = document.createElement('div');
      grid.className = 'drag-ghost-grid';
      ghost.appendChild(grid);
      // grid is filled after the ghost is in the DOM — see _startDrag.

      const rotateBtn = document.createElement('button');
      rotateBtn.type = 'button';
      rotateBtn.className = 'drag-rotate-btn';
      rotateBtn.setAttribute('aria-label', 'Rotate ship');
      rotateBtn.textContent = '↻';

      // Desktop hint: the floating rotate button can't be tapped during
      // a mouse drag (single pointer is captured), so show a small "R"
      // chip near the ghost. Built unconditionally; only added to the
      // DOM by _startDrag when pointerType !== 'touch'.
      let hint = null;
      if (!isTouch) {
        hint = document.createElement('div');
        hint.className = 'drag-rotate-hint';
        hint.setAttribute('aria-hidden', 'true');
        hint.innerHTML = 'Press <kbd>R</kbd> to rotate';
      }

      return { ghost, grid, zone, rotateBtn, hint };
    }

    _fillGhostGrid(grid, shipType) {
      const config = GAME_CONSTANTS.SHIPS[shipType];
      let cols = 1, rows = 1;
      if (config.shape === 'square') {
        cols = 2; rows = 2;
      } else if (config.shape === 'line') {
        if (this.gs.currentShipRotation === 'horizontal') {
          cols = config.size; rows = 1;
        } else {
          cols = 1; rows = config.size;
        }
      }
      grid.style.gridTemplateColumns = `repeat(${cols}, var(--ghost-cell-size))`;
      grid.style.gridTemplateRows = `repeat(${rows}, var(--ghost-cell-size))`;
      grid.innerHTML = '';

      // Build virtual positions in board-coordinate space so we can reuse
      // UIController.paintShipSprite to slice the ship sprite across the
      // ghost cells exactly the way the real placed ship will look.
      const B = GAME_CONSTANTS.BOARD_SIZE;
      const positions = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * B + c;
          const cell = document.createElement('div');
          cell.className = 'cell drag-ghost-cell';
          cell.dataset.index = String(idx);
          grid.appendChild(cell);
          positions.push(idx);
        }
      }
      // paintShipSprite queries `${selector} .cell[data-index="N"]` —
      // give the grid a temporary id, paint, then clear so a snap-back
      // ghost still in the DOM can't collide with a fresh drag's grid.
      grid.id = 'dragGhostGrid';
      UIController.paintShipSprite('#dragGhostGrid', shipType, positions);
      grid.removeAttribute('id');
    }

    _positionGhost(clientX, clientY) {
      if (!this.active) return;
      const { ghost, offsetY } = this.active;
      const rect = ghost.getBoundingClientRect();
      let x = clientX - rect.width / 2;
      let y = clientY - rect.height / 2 + offsetY;
      // Clamp on-screen so the ghost is always visible — important on
      // mobile where the dock sits at the top of the viewport and a
      // raw -90px offset would otherwise push the ghost off-screen at
      // the start of every drag.
      const pad = 8;
      x = Math.max(pad, Math.min(x, window.innerWidth - rect.width - pad));
      y = Math.max(pad, Math.min(y, window.innerHeight - rect.height - pad));
      ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      this.active.lastX = clientX;
      this.active.lastY = clientY;
    }

    _positionRotateBtn() {
      if (!this.active) return;
      const { ghost, rotateBtn, hint, pointerType } = this.active;
      const rect = ghost.getBoundingClientRect();
      const gridRect = this.active.grid.getBoundingClientRect();
      const GAP = 8;
      const y = gridRect.top + gridRect.height / 2;

      if (pointerType === 'touch' && rotateBtn.parentElement) {
        // Default to the *left* of the ghost — most users drag with
        // their right thumb, so the rotate button on the left is
        // reachable with the left thumb without crossing fingers.
        // Falls back to the right side only if the left would clip.
        const BTN = 44;
        let x = rect.left - BTN - GAP;
        if (x < 4) x = rect.right + GAP;
        rotateBtn.style.left = `${x}px`;
        rotateBtn.style.top = `${y - BTN / 2}px`;
        rotateBtn.style.transform = 'rotate(0deg)';
      } else if (hint && hint.parentElement) {
        // Desktop: the "press R" chip sits to the right of the ghost so
        // the user's mouse cursor (typically near the ghost grid) doesn't
        // overlap it. Falls back to the left if it would clip the right
        // edge.
        const hintRect = hint.getBoundingClientRect();
        let x = rect.right + GAP;
        if (x + hintRect.width > window.innerWidth - 4) {
          x = rect.left - hintRect.width - GAP;
        }
        hint.style.left = `${x}px`;
        hint.style.top = `${y - hintRect.height / 2}px`;
      }
    }

    _onPointerMove(e) {
      if (!this.active || e.pointerId !== this.active.pointerId) return;
      e.preventDefault();
      this._positionGhost(e.clientX, e.clientY);
      this._positionRotateBtn();
      this._updatePreview();
    }

    _updatePreview() {
      if (!this.active) return;
      const { ghost, grid, shipType } = this.active;

      // Hit-test the ghost's *center*, not the pointer's position. That
      // way the ship lands where the user sees it, not where their
      // finger is hidden under it.
      const ghostRect = ghost.getBoundingClientRect();
      const probeX = ghostRect.left + ghostRect.width / 2;
      const probeY = ghostRect.top + ghostRect.height / 2;
      const hit = document.elementFromPoint(probeX, probeY);
      const cellEl = hit && hit.classList.contains('cell') ? hit : null;

      this._clearPreview();

      let valid = false;
      let board = null;
      let boardId = null;
      let cellIndex = null;
      let cellLayer = null;

      if (cellEl) {
        board = cellEl.closest('.board');
        if (board && this._isOurBoard(board.id)) {
          boardId = board.id;
          cellLayer = cellEl.dataset.layer;
          cellIndex = parseInt(cellEl.dataset.index, 10);
          valid = this.gs.isValidPlacement(boardId, cellIndex, cellLayer, shipType);
          const positions = this.gs.calculateShipPositions(cellIndex, shipType);
          if (positions.length > 0) {
            positions.forEach(pos => {
              const c = board.querySelector(`.cell[data-index="${pos}"]`);
              if (c) {
                c.classList.add(valid ? 'valid-placement' : 'invalid-placement');
                if (pos === cellIndex) c.classList.add('drop-target');
              }
            });
          } else {
            // Footprint runs off-board; flag the anchor cell as invalid.
            cellEl.classList.add('invalid-placement', 'drop-target');
          }
        } else if (board) {
          // Hovering a non-ours board (rare in AI mode) — show invalid.
          cellEl.classList.add('invalid-placement', 'drop-target');
        }
      }

      // The gold pulsing ring stays pinned to the ship's *intended* zone
      // for the entire drag — moving it around as the user hovers other
      // layers makes the destination ambiguous. The cells under the
      // pointer still light up green/red so the user gets per-cell
      // feedback; the ring just answers "which zone should this go in?"
      // and that answer never changes mid-drag.
      this.ui.highlightPlacementBoard();

      grid.classList.toggle('valid', !!valid);
      grid.classList.toggle('invalid', !!cellEl && !valid);

      this.active.currentBoard = board;
      this.active.currentBoardId = boardId;
      this.active.currentLayer = cellLayer || GAME_CONSTANTS.SHIPS[shipType].layer;
      this.active.currentCellIndex = cellIndex;
      this.active.valid = valid;
    }

    _isOurBoard(boardId) {
      if (!boardId) return false;
      const isPlayerBoard = boardId.includes('player');
      if (this.gs.gameMode === 'human') {
        return this.gs.currentPlayer === 1 ? isPlayerBoard : !isPlayerBoard;
      }
      return isPlayerBoard;
    }

    _clearPreview() {
      document.querySelectorAll(
        '.cell.valid-placement, .cell.invalid-placement, .cell.drop-target'
      ).forEach(c => {
        c.classList.remove('valid-placement', 'invalid-placement', 'drop-target');
      });
    }

    _onPointerUp(e) {
      if (!this.active || e.pointerId !== this.active.pointerId) return;
      e.preventDefault();
      const { valid, currentBoardId, currentCellIndex, currentLayer } = this.active;
      if (valid && currentBoardId != null && currentCellIndex != null) {
        this._haptic(15);
        this._endDrag(false);
        this.game.handleShipPlacement(currentBoardId, currentCellIndex, currentLayer);
      } else {
        this._endDrag(true);
      }
    }

    _onPointerCancel(e) {
      if (!this.active || e.pointerId !== this.active.pointerId) return;
      this._endDrag(true);
    }

    _onRotateBtnDown(e) {
      if (!this.active) return;
      // The drag pointer drives placement; a *different* pointer (second
      // finger, or a desktop click that isn't the drag) handles rotation.
      if (e.pointerId === this.active.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      this._haptic(10);
      this.game.rotateShip();
      // Quick spin animation as visual feedback.
      const btn = this.active.rotateBtn;
      btn.style.transition = 'transform 280ms ease';
      btn.style.transform = 'rotate(360deg)';
      setTimeout(() => {
        if (this.active && this.active.rotateBtn === btn) {
          btn.style.transition = 'none';
          btn.style.transform = 'rotate(0deg)';
        }
      }, 300);
    }

    /* Called by Game.rotateShip() so the ghost shape matches the new
       orientation immediately, even mid-drag. */
    refreshOrientation() {
      if (!this.active) return;
      this._fillGhostGrid(this.active.grid, this.active.shipType);
      this._positionGhost(this.active.lastX, this.active.lastY);
      this._positionRotateBtn();
      this._updatePreview();
    }

    _haptic(ms) {
      if (!this.active || this.active.pointerType !== 'touch') return;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(ms); } catch (_) {}
      }
    }

    cancel() {
      if (this.active) this._endDrag(true);
    }

    _endDrag(snapBack) {
      if (!this.active) return;
      const { sourceEl, ghost, rotateBtn, hint, pointerId, pointerType } = this.active;

      sourceEl.removeEventListener('pointermove', this._onPointerMove);
      sourceEl.removeEventListener('pointerup', this._onPointerUp);
      sourceEl.removeEventListener('pointercancel', this._onPointerCancel);
      if (pointerType === 'touch') rotateBtn.removeEventListener('pointerdown', this._onRotateBtnDown);
      try { sourceEl.releasePointerCapture(pointerId); } catch (_) {}

      sourceEl.classList.remove('dragging');
      document.body.classList.remove('drag-active');
      this._clearPreview();

      if (snapBack) {
        const srcRect = sourceEl.getBoundingClientRect();
        const ghostRect = ghost.getBoundingClientRect();
        const targetX = srcRect.left + srcRect.width / 2 - ghostRect.width / 2;
        const targetY = srcRect.top + srcRect.height / 2 - ghostRect.height / 2;
        ghost.classList.add('snapping');
        ghost.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) scale(0.5)`;
      }
      // Hide the floating helpers immediately — no need to animate.
      if (rotateBtn.parentElement) rotateBtn.style.opacity = '0';
      if (hint && hint.parentElement) hint.style.opacity = '0';

      const cleanup = () => {
        ghost.remove();
        rotateBtn.remove();
        if (hint) hint.remove();
      };
      if (snapBack) setTimeout(cleanup, 320); else cleanup();

      this.active = null;
    }

    showHintIfNeeded() {
      let seen = false;
      try { seen = localStorage.getItem('warzones-drag-seen') === '1'; } catch (_) {}
      if (seen) return;
      const cur = document.querySelector('.dock-ship.current');
      if (cur) cur.classList.add('drag-hint');
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UIController, DragController };
  } else {
    global.UIController = UIController;
    global.DragController = DragController;
  }
})(typeof window !== 'undefined' ? window : globalThis);
