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
    }
  
    updateFleetDock() {
      const dock = document.getElementById('fleetDock');
      if (!dock) return;
  
      const currentIndex = this.game.gameState.currentShipIndex;
      const shipTypes = Object.keys(GAME_CONSTANTS.SHIPS);
  
      dock.querySelectorAll('.dock-ship').forEach(el => {
        const index = parseInt(el.dataset.index);
        el.classList.remove('placed', 'current', 'upcoming');
  
        if (index < currentIndex) {
          el.classList.add('placed');
        } else if (index === currentIndex) {
          el.classList.add('current');
        } else {
          el.classList.add('upcoming');
        }
      });
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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UIController };
  } else {
    global.UIController = UIController;
  }
})(typeof window !== 'undefined' ? window : globalThis);
