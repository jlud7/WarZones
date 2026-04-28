/*
 * GameState + constants module.
 *
 * Dual-mode: when loaded via a <script> tag it installs GAME_CONSTANTS
 * and GameState on the global object so the rest of script.js (loaded
 * as a classic script) can reference them without imports. When loaded
 * by Node (tests), it exposes them via module.exports.
 */
(function (global) {
  'use strict';

  const GAME_CONSTANTS = {
    BOARD_SIZE: 4,
    SHIPS: {
      Spacecraft: { size: 4, shape: 'square', layer: 'Space', symbol: '👽' },
      FighterJet: { size: 1, shape: 'single', layer: 'Sky', symbol: '✈️' },
      Battleship: { size: 3, shape: 'line', layer: 'Sea', symbol: '🚢' },
      Cruiser: { size: 2, shape: 'line', layer: 'Sea', symbol: '🚢' },
      Submarine: { size: 2, shape: 'line', layer: 'Sub', symbol: '⚓' }
    },
    LAYERS: ['Space', 'Sky', 'Sea', 'Sub'],
    // User-facing display names. Internal data still uses the canonical
    // 'Sub' key (don't change that — it's persisted in save state and
    // referenced by AI/network code), but everywhere we surface a layer
    // to the player we read through this map so the underwater zone
    // reads as "DEPTHS" / "Depths" consistently.
    LAYER_DISPLAY: {
      Space: 'SPACE',
      Sky:   'SKY',
      Sea:   'SEA',
      Sub:   'DEPTHS',
    },
    LAYER_DISPLAY_TITLE: {
      Space: 'Space',
      Sky:   'Sky',
      Sea:   'Sea',
      Sub:   'Depths',
    },
    SOUNDS: {
      hit: '🔊',
      miss: '🔊',
      sunk: '🔊',
      place: '🔊',
      rotate: '🔊',
      victory: '🔊',
      defeat: '🔊',
      gameStart: '🔊'
    },
    TREASURE: {
      symbol: '💎',
      image: 'assets/icons/treasure-chest.webp',
      name: 'Treasure Chest',
      chance: 1.00
    },
    POWERUPS: {
      BlackBox: {
        name: 'BLACK BOX',
        description: 'Place an additional jet in your sky layer',
        icon: '<img src="assets/icons/black-box.webp" class="icon-img" alt="">'
      },
      KryptonLaser: {
        name: 'KRYPTON LASER',
        description: 'Attack the same cell position across all four layers',
        icon: '<img src="assets/icons/krypton-laser.webp" class="icon-img" alt="">'
      },
      CannonBall: {
        name: 'CANNON BALL',
        description: 'Attack a 2×2 area on the sea layer',
        icon: '<img src="assets/icons/cannon-ball.webp" class="icon-img" alt="">'
      }
    }
  };

  class GameState {
    constructor() {
      this.reset();
    }

    placeTreasureChests() {
      this.treasureChests.player = [];
      this.treasureChests.opponent = [];

      const subLayer = 'Sub';
      const boardSize = GAME_CONSTANTS.BOARD_SIZE;

      const playerEmptyCells = [];
      for (let i = 0; i < boardSize * boardSize; i++) {
        if (this.boards.player[subLayer][i] === null) {
          playerEmptyCells.push(i);
        }
      }

      if (playerEmptyCells.length > 0) {
        const randomIndex = Math.floor(Math.random() * playerEmptyCells.length);
        const treasurePosition = playerEmptyCells[randomIndex];
        this.boards.player[subLayer][treasurePosition] = 'Treasure';
        this.treasureChests.player.push(treasurePosition);
      }

      // Online: opponent places their own treasure; we learn by attacking.
      if (this.gameMode === 'online') return;

      const opponentEmptyCells = [];
      for (let i = 0; i < boardSize * boardSize; i++) {
        if (this.boards.opponent[subLayer][i] === null) {
          opponentEmptyCells.push(i);
        }
      }

      if (opponentEmptyCells.length > 0) {
        const randomIndex = Math.floor(Math.random() * opponentEmptyCells.length);
        const treasurePosition = opponentEmptyCells[randomIndex];
        this.boards.opponent[subLayer][treasurePosition] = 'Treasure';
        this.treasureChests.opponent.push(treasurePosition);
      }
    }

    reset() {
      this.phase = 'setup';
      this.gameMode = 'ai';
      this.difficulty = 'normal';
      this.currentPlayer = 1;
      this.currentShipIndex = 0;
      this.currentShipRotation = 'horizontal';
      this.startTime = null;
      this.moveHistory = [];
      this.boards = {
        player: this.createEmptyBoards(),
        opponent: this.createEmptyBoards()
      };
      this.ships = {
        player: this.createInitialShips(),
        opponent: this.createInitialShips()
      };
      this.shots = {
        player: { total: 0, hits: 0 },
        opponent: { total: 0, hits: 0 }
      };
      this.treasureChests = {
        player: [],
        opponent: []
      };
      this.activePowerup = null;
      this.pendingPowerup = null;
      this.aiPendingPowerup = null;

      this.opponentReady = false;
      this.myPlayerId = null;
      this.currentTurn = null;
    }

    createEmptyBoards() {
      const boards = {};
      GAME_CONSTANTS.LAYERS.forEach(layer => {
        boards[layer] = Array(GAME_CONSTANTS.BOARD_SIZE ** 2).fill(null);
      });
      return boards;
    }

    createInitialShips() {
      const ships = {};
      Object.keys(GAME_CONSTANTS.SHIPS).forEach(shipType => {
        ships[shipType] = { positions: [], hits: [], isSunk: false };
      });
      return ships;
    }

    isPlacementComplete() {
      return this.currentShipIndex >= Object.keys(GAME_CONSTANTS.SHIPS).length;
    }

    isValidPlacement(boardId, index, layer, shipType) {
      const shipConfig = GAME_CONSTANTS.SHIPS[shipType];
      if (!shipConfig) return false;
      if (layer !== shipConfig.layer) return false;

      const boardSize = GAME_CONSTANTS.BOARD_SIZE;
      if (index < 0 || index >= boardSize * boardSize) return false;

      const positions = this.calculateShipPositions(index, shipType);
      if (positions.length === 0) {
        return false;
      }

      const isPlayer = boardId.includes('player');
      const board = isPlayer ? this.boards.player : this.boards.opponent;

      return positions.every(pos => board[layer][pos] === null);
    }

    calculateShipPositions(startIndex, shipType) {
      if (!shipType) return [];

      const shipConfig = GAME_CONSTANTS.SHIPS[shipType];
      if (!shipConfig) return [];

      const positions = [];
      const boardSize = GAME_CONSTANTS.BOARD_SIZE;
      const row = Math.floor(startIndex / boardSize);
      const col = startIndex % boardSize;

      switch (shipConfig.shape) {
        case 'single':
          positions.push(startIndex);
          break;

        case 'square':
          if (col <= boardSize - 2 && row <= boardSize - 2) {
            positions.push(
              startIndex,
              startIndex + 1,
              startIndex + boardSize,
              startIndex + boardSize + 1
            );
          }
          break;

        case 'line': {
          const size = shipConfig.size;
          if (this.currentShipRotation === 'horizontal') {
            if (col + size <= boardSize) {
              for (let i = 0; i < size; i++) {
                positions.push(startIndex + i);
              }
            }
          } else {
            if (row + size <= boardSize) {
              for (let i = 0; i < size; i++) {
                positions.push(startIndex + (i * boardSize));
              }
            }
          }
          break;
        }
      }

      return positions;
    }

    placeShip(boardId, index, layer) {
      const shipType = this.getCurrentShip();
      if (!this.isValidPlacement(boardId, index, layer, shipType)) {
        return { success: false };
      }

      const positions = this.calculateShipPositions(index, shipType);
      const isPlayer = boardId.includes('player');
      const shipData = isPlayer ? this.ships.player[shipType] : this.ships.opponent[shipType];

      shipData.positions = positions;

      const board = isPlayer ? this.boards.player : this.boards.opponent;
      positions.forEach(pos => {
        board[layer][pos] = shipType;
      });

      this.moveHistory.push({
        type: 'placement',
        shipType,
        positions,
        layer,
        isPlayer,
        player: this.gameMode === 'human' ? this.currentPlayer : undefined
      });

      this.currentShipIndex++;

      return {
        success: true,
        positions,
        shipType,
        layer,
        boardId
      };
    }

    processAttack(boardId, index, layer) {
      const isPlayerAttacking = !boardId.includes('player');
      const targetBoards = isPlayerAttacking ? this.boards.opponent : this.boards.player;
      const targetShips = isPlayerAttacking ? this.ships.opponent : this.ships.player;
      const shots = isPlayerAttacking ? this.shots.player : this.shots.opponent;

      shots.total++;

      const cellValue = targetBoards[layer][index];

      if (cellValue === 'Mine') {
        targetBoards[layer][index] = 'miss';
        return {
          hit: false,
          mine: true,
          index,
          layer,
          boardId,
          gameOver: { isOver: false }
        };
      }

      if (cellValue === 'Treasure') {
        targetBoards[layer][index] = 'hit';
        shots.hits++;

        return {
          hit: true,
          treasure: true,
          index,
          layer,
          boardId,
          gameOver: { isOver: false }
        };
      }

      const hit = cellValue !== null && cellValue !== 'hit' && cellValue !== 'miss';
      let hitShipType = null;

      if (hit) {
        hitShipType = cellValue;
        shots.hits++;

        const ship = targetShips[hitShipType];
        ship.hits.push(index);

        if (ship.hits.length === ship.positions.length) {
          ship.isSunk = true;
        }

        targetBoards[layer][index] = 'hit';
      } else {
        targetBoards[layer][index] = 'miss';
      }

      this.moveHistory.push({
        type: 'attack',
        index,
        layer,
        hit,
        shipType: hitShipType,
        isPlayerAttacking
      });

      const gameOver = this.checkGameOver();

      return {
        hit,
        sunk: hit && targetShips[hitShipType] && targetShips[hitShipType].isSunk,
        shipType: hitShipType,
        index,
        layer,
        boardId,
        gameOver
      };
    }

    checkGameOver() {
      const checkAllSunk = (ships) => {
        const placed = Object.values(ships).filter(ship => ship.positions.length > 0);
        return placed.length > 0 && placed.every(ship => ship.isSunk);
      };

      const playerLost = checkAllSunk(this.ships.player);
      const opponentLost = checkAllSunk(this.ships.opponent);

      if (!playerLost && !opponentLost) {
        return { isOver: false };
      }

      return {
        isOver: true,
        winner: opponentLost ? 'player' : 'opponent',
        mode: this.gameMode
      };
    }

    getCurrentShip() {
      const shipTypes = Object.keys(GAME_CONSTANTS.SHIPS);
      return shipTypes[this.currentShipIndex];
    }

    undoLastMove() {
      const lastMove = this.moveHistory.pop();
      if (!lastMove) return null;

      if (lastMove.type === 'placement') {
        const ships = lastMove.isPlayer ? this.ships.player : this.ships.opponent;
        const boards = lastMove.isPlayer ? this.boards.player : this.boards.opponent;

        ships[lastMove.shipType].positions = [];

        lastMove.positions.forEach(pos => {
          boards[lastMove.layer][pos] = null;
        });

        this.currentShipIndex--;
      } else if (lastMove.type === 'attack') {
        // Undo is placement-only at the UI level; the attack branch is
        // kept for completeness but is not reachable through user input.
        const shots = lastMove.isPlayerAttacking ? this.shots.player : this.shots.opponent;
        const boards = lastMove.isPlayerAttacking ? this.boards.opponent : this.boards.player;

        shots.total--;

        if (lastMove.hit) {
          shots.hits--;
          const ships = lastMove.isPlayerAttacking ? this.ships.opponent : this.ships.player;
          const ship = ships[lastMove.shipType];

          ship.hits = ship.hits.filter(hit => hit !== lastMove.index);
          ship.isSunk = false;

          boards[lastMove.layer][lastMove.index] = lastMove.shipType;
        } else {
          boards[lastMove.layer][lastMove.index] = null;
        }
      }

      return lastMove;
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GAME_CONSTANTS, GameState };
  } else {
    global.GAME_CONSTANTS = GAME_CONSTANTS;
    global.GameState = GameState;
  }
})(typeof window !== 'undefined' ? window : globalThis);
