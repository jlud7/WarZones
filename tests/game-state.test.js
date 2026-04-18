'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { GAME_CONSTANTS, GameState } = require('../lib/game-state.js');

/*
 * Tests for the pure rules engine in lib/game-state.js. These exercise
 * placement validity, attack resolution, win detection, and the
 * treasure/mine special cases. Randomness is confined to
 * placeTreasureChests, which is not exercised here.
 */

const PLAYER_BOARD = 'playerBoard';
const OPPONENT_BOARD = 'opponentBoard';

/*
 * Place every ship in a deterministic valid layout. The placement queue
 * (currentShipIndex) is shared between player and opponent, so we reset
 * it before each fleet; in real play the opponent's ships are placed by
 * the AI through a separate path that bypasses the queue.
 */
function placeFullPlayerFleet(state) {
  state.currentShipIndex = 0;
  state.currentShipRotation = 'horizontal';
  // Queue order: Spacecraft (square, Space), FighterJet (single, Sky),
  // Battleship (line 3, Sea), Cruiser (line 2, Sea), Submarine (line 2, Sub).
  assert.equal(state.placeShip(PLAYER_BOARD, 0, 'Space').success, true);
  assert.equal(state.placeShip(PLAYER_BOARD, 5, 'Sky').success, true);
  assert.equal(state.placeShip(PLAYER_BOARD, 0, 'Sea').success, true);
  assert.equal(state.placeShip(PLAYER_BOARD, 8, 'Sea').success, true);
  assert.equal(state.placeShip(PLAYER_BOARD, 0, 'Sub').success, true);
}

function placeFullOpponentFleet(state) {
  state.currentShipIndex = 0;
  state.currentShipRotation = 'horizontal';
  assert.equal(state.placeShip(OPPONENT_BOARD, 0, 'Space').success, true);
  assert.equal(state.placeShip(OPPONENT_BOARD, 5, 'Sky').success, true);
  assert.equal(state.placeShip(OPPONENT_BOARD, 0, 'Sea').success, true);
  assert.equal(state.placeShip(OPPONENT_BOARD, 8, 'Sea').success, true);
  assert.equal(state.placeShip(OPPONENT_BOARD, 0, 'Sub').success, true);
}

test('constructor produces a setup-phase, empty game', () => {
  const s = new GameState();
  assert.equal(s.phase, 'setup');
  assert.equal(s.currentShipIndex, 0);
  assert.equal(s.moveHistory.length, 0);
  for (const layer of GAME_CONSTANTS.LAYERS) {
    assert.deepEqual(s.boards.player[layer], Array(16).fill(null));
    assert.deepEqual(s.boards.opponent[layer], Array(16).fill(null));
  }
  for (const shipType of Object.keys(GAME_CONSTANTS.SHIPS)) {
    assert.deepEqual(s.ships.player[shipType], { positions: [], hits: [], isSunk: false });
  }
});

test('calculateShipPositions: single ship returns its index', () => {
  const s = new GameState();
  assert.deepEqual(s.calculateShipPositions(5, 'FighterJet'), [5]);
});

test('calculateShipPositions: horizontal line respects board edge', () => {
  const s = new GameState();
  s.currentShipRotation = 'horizontal';
  // Battleship size 3 starting at col 0 of row 0 → 0,1,2.
  assert.deepEqual(s.calculateShipPositions(0, 'Battleship'), [0, 1, 2]);
  // Same ship starting at col 2 would overflow (needs cols 2,3,4) → [].
  assert.deepEqual(s.calculateShipPositions(2, 'Battleship'), []);
});

test('calculateShipPositions: vertical line respects board edge', () => {
  const s = new GameState();
  s.currentShipRotation = 'vertical';
  // Battleship from (row 0, col 0) down → indices 0, 4, 8.
  assert.deepEqual(s.calculateShipPositions(0, 'Battleship'), [0, 4, 8]);
  // From row 2 col 0 would need rows 2,3,4 → overflows → [].
  assert.deepEqual(s.calculateShipPositions(8, 'Battleship'), []);
});

test('calculateShipPositions: square ship stays inside bounds', () => {
  const s = new GameState();
  // Spacecraft 2×2 square at (row 0, col 0) → 0,1,4,5.
  assert.deepEqual(s.calculateShipPositions(0, 'Spacecraft'), [0, 1, 4, 5]);
  // At (row 3, col 3) would overflow → [].
  assert.deepEqual(s.calculateShipPositions(15, 'Spacecraft'), []);
});

test('calculateShipPositions: unknown ship type returns []', () => {
  const s = new GameState();
  assert.deepEqual(s.calculateShipPositions(0, 'Battlecruiser'), []);
});

test('isValidPlacement: rejects wrong layer', () => {
  const s = new GameState();
  // Battleship belongs in Sea, not Space.
  assert.equal(s.isValidPlacement(PLAYER_BOARD, 0, 'Space', 'Battleship'), false);
});

test('isValidPlacement: rejects overlap with existing ship', () => {
  const s = new GameState();
  s.currentShipRotation = 'horizontal';
  // Fast-forward past Spacecraft and FighterJet so Battleship is up.
  s.currentShipIndex = 2;
  assert.equal(s.placeShip(PLAYER_BOARD, 0, 'Sea').success, true);
  // Cruiser (next ship) overlapping at 1 would hit an occupied cell.
  assert.equal(s.isValidPlacement(PLAYER_BOARD, 1, 'Sea', 'Cruiser'), false);
});

test('isValidPlacement: rejects off-board first cell', () => {
  const s = new GameState();
  // Index 99 is off the 4×4 board; must be rejected before any indexing.
  assert.equal(s.isValidPlacement(PLAYER_BOARD, 99, 'Space', 'Spacecraft'), false);
});

test('placeShip advances the ship queue in order', () => {
  const s = new GameState();
  const queue = Object.keys(GAME_CONSTANTS.SHIPS);
  assert.equal(s.getCurrentShip(), queue[0]);
  s.placeShip(PLAYER_BOARD, 0, 'Space');
  assert.equal(s.getCurrentShip(), queue[1]);
});

test('placeShip returns failure for an invalid placement', () => {
  const s = new GameState();
  const res = s.placeShip(PLAYER_BOARD, 0, 'Sky'); // Spacecraft is first; Sky is wrong layer.
  assert.equal(res.success, false);
  assert.equal(s.currentShipIndex, 0);
});

test('isPlacementComplete flips when every ship is placed', () => {
  const s = new GameState();
  assert.equal(s.isPlacementComplete(), false);
  placeFullPlayerFleet(s);
  assert.equal(s.isPlacementComplete(), true);
});

test('processAttack: miss on an empty opponent cell', () => {
  const s = new GameState();
  placeFullOpponentFleet(s);
  // Attack an empty opponent Space cell (index 2 is unoccupied; ship fills 0,1,4,5).
  const res = s.processAttack(OPPONENT_BOARD, 2, 'Space');
  assert.equal(res.hit, false);
  assert.equal(res.sunk, false);
  assert.equal(s.boards.opponent.Space[2], 'miss');
  assert.equal(s.shots.player.total, 1);
  assert.equal(s.shots.player.hits, 0);
});

test('processAttack: hit marks the cell and records a hit on the ship', () => {
  const s = new GameState();
  placeFullOpponentFleet(s);
  const res = s.processAttack(OPPONENT_BOARD, 5, 'Sky'); // FighterJet at 5.
  assert.equal(res.hit, true);
  assert.equal(res.sunk, true); // Single-cell ship sinks in one hit.
  assert.equal(res.shipType, 'FighterJet');
  assert.equal(s.boards.opponent.Sky[5], 'hit');
  assert.equal(s.ships.opponent.FighterJet.isSunk, true);
  assert.equal(s.shots.player.hits, 1);
});

test('processAttack: ship only sinks after its final cell is hit', () => {
  const s = new GameState();
  placeFullOpponentFleet(s);
  // Battleship occupies Sea 0,1,2.
  const first = s.processAttack(OPPONENT_BOARD, 0, 'Sea');
  assert.equal(first.hit, true);
  assert.equal(first.sunk, false);
  const second = s.processAttack(OPPONENT_BOARD, 1, 'Sea');
  assert.equal(second.sunk, false);
  const third = s.processAttack(OPPONENT_BOARD, 2, 'Sea');
  assert.equal(third.sunk, true);
  assert.equal(s.ships.opponent.Battleship.isSunk, true);
});

test('processAttack: treasure chest is a hit with treasure=true', () => {
  const s = new GameState();
  // Hand-place a treasure on the opponent Sub board; no ship here.
  s.boards.opponent.Sub[3] = 'Treasure';
  const res = s.processAttack(OPPONENT_BOARD, 3, 'Sub');
  assert.equal(res.hit, true);
  assert.equal(res.treasure, true);
  assert.equal(s.boards.opponent.Sub[3], 'hit');
  assert.equal(s.shots.player.hits, 1);
});

test('processAttack: mine is a miss with mine=true', () => {
  const s = new GameState();
  // Mines are only used in campaign mode; the engine just needs to
  // recognise the cell value and resolve it as a miss.
  s.boards.opponent.Sea[7] = 'Mine';
  const res = s.processAttack(OPPONENT_BOARD, 7, 'Sea');
  assert.equal(res.hit, false);
  assert.equal(res.mine, true);
  assert.equal(s.boards.opponent.Sea[7], 'miss');
  // Mine hits should NOT increment the shooter's hit count.
  assert.equal(s.shots.player.hits, 0);
});

test('checkGameOver: not over when ships remain', () => {
  const s = new GameState();
  placeFullPlayerFleet(s);
  placeFullOpponentFleet(s);
  const res = s.checkGameOver();
  assert.equal(res.isOver, false);
});

test('checkGameOver: player wins when every opponent ship is sunk', () => {
  const s = new GameState();
  placeFullPlayerFleet(s);
  placeFullOpponentFleet(s);

  // Sink every opponent ship by attacking each of their positions.
  for (const shipType of Object.keys(GAME_CONSTANTS.SHIPS)) {
    const ship = s.ships.opponent[shipType];
    const layer = GAME_CONSTANTS.SHIPS[shipType].layer;
    for (const pos of ship.positions) {
      s.processAttack(OPPONENT_BOARD, pos, layer);
    }
  }

  const res = s.checkGameOver();
  assert.equal(res.isOver, true);
  assert.equal(res.winner, 'player');
});

test('checkGameOver: ignores unplaced ships', () => {
  const s = new GameState();
  // Place a single ship on each side, sink the opponent's — should still win
  // even though other ships in the roster were never placed.
  assert.equal(s.placeShip(PLAYER_BOARD, 0, 'Space').success, true);
  // Fast-forward the placement cursor so we can place an opponent ship too.
  s.currentShipIndex = 0;
  assert.equal(s.placeShip(OPPONENT_BOARD, 0, 'Space').success, true);

  for (const pos of s.ships.opponent.Spacecraft.positions) {
    s.processAttack(OPPONENT_BOARD, pos, 'Space');
  }

  const res = s.checkGameOver();
  assert.equal(res.isOver, true);
  assert.equal(res.winner, 'player');
});

test('undoLastMove: placement undo frees the cells and rewinds the queue', () => {
  const s = new GameState();
  assert.equal(s.placeShip(PLAYER_BOARD, 0, 'Space').success, true);
  assert.equal(s.currentShipIndex, 1);
  const undone = s.undoLastMove();
  assert.equal(undone.type, 'placement');
  assert.equal(s.currentShipIndex, 0);
  for (const pos of [0, 1, 4, 5]) {
    assert.equal(s.boards.player.Space[pos], null);
  }
  assert.deepEqual(s.ships.player.Spacecraft.positions, []);
});

test('undoLastMove: returns null on an empty history', () => {
  const s = new GameState();
  assert.equal(s.undoLastMove(), null);
});
