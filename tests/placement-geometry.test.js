'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { GAME_CONSTANTS, GameState } = require('../lib/game-state.js');

/*
 * Geometry-focused tests for calculateShipPositions. The drag-to-place
 * preview, the static hover preview, the keyboard cursor, and the
 * placement validator all use this same function — bugs here surface
 * everywhere at once. Boards are 4x4; ship indices match the SHIPS map.
 */

const B = GAME_CONSTANTS.BOARD_SIZE;
const idx = (r, c) => r * B + c;

test('single-cell ship: anchor is the only position', () => {
  const s = new GameState();
  const p = s.calculateShipPositions(idx(2, 3), 'FighterJet');
  assert.deepEqual(p, [idx(2, 3)]);
});

test('square ship: 2x2 block at the anchor (top-left corner)', () => {
  const s = new GameState();
  const p = s.calculateShipPositions(idx(1, 1), 'Spacecraft');
  assert.deepEqual(p.sort((a, b) => a - b), [idx(1, 1), idx(1, 2), idx(2, 1), idx(2, 2)]);
});

test('square ship: anchor in the rightmost column has no valid footprint', () => {
  const s = new GameState();
  // Anchor at col=3 means col+1 is off-board → invalid (empty positions).
  assert.deepEqual(s.calculateShipPositions(idx(0, 3), 'Spacecraft'), []);
});

test('square ship: anchor in the bottom row has no valid footprint', () => {
  const s = new GameState();
  assert.deepEqual(s.calculateShipPositions(idx(3, 0), 'Spacecraft'), []);
});

test('horizontal line ship: anchor near the right edge that fits exactly', () => {
  const s = new GameState();
  s.currentShipRotation = 'horizontal';
  // Battleship is size 3: col=1 occupies cols 1..3, fits exactly.
  const p = s.calculateShipPositions(idx(2, 1), 'Battleship');
  assert.deepEqual(p, [idx(2, 1), idx(2, 2), idx(2, 3)]);
});

test('horizontal line ship: anchor that pushes ship off-board returns empty', () => {
  const s = new GameState();
  s.currentShipRotation = 'horizontal';
  // col=2 + size 3 = 5 > 4 → off-board.
  assert.deepEqual(s.calculateShipPositions(idx(2, 2), 'Battleship'), []);
});

test('vertical line ship: rotation flips the orientation correctly', () => {
  const s = new GameState();
  s.currentShipRotation = 'vertical';
  // Cruiser is size 2 → rows 0..1 starting at (0,2).
  const p = s.calculateShipPositions(idx(0, 2), 'Cruiser');
  assert.deepEqual(p, [idx(0, 2), idx(1, 2)]);
});

test('vertical line ship: anchor that pushes ship off the bottom returns empty', () => {
  const s = new GameState();
  s.currentShipRotation = 'vertical';
  // Battleship size 3 from row 2 needs rows 2,3,4 → 4 is off-board.
  assert.deepEqual(s.calculateShipPositions(idx(2, 0), 'Battleship'), []);
});

test('isValidPlacement rejects the same layer when occupied', () => {
  const s = new GameState();
  s.currentShipIndex = 0;
  s.currentShipRotation = 'horizontal';
  assert.equal(s.placeShip('playerBoard', idx(0, 0), 'Space').success, true);
  // Spacecraft now occupies (0,0),(0,1),(1,0),(1,1). Try to place
  // FighterJet (Sky) at (0,0) — different layer, should be fine.
  assert.equal(s.isValidPlacement('playerBoard', idx(0, 0), 'Sky', 'FighterJet'), true);
  // But FighterJet on Space at the same anchor is wrong-layer.
  assert.equal(s.isValidPlacement('playerBoard', idx(0, 0), 'Space', 'FighterJet'), false);
});

test('rotation changes valid positions for line ships consistently', () => {
  const s = new GameState();
  // Anchor at (3, 0). Horizontal Battleship needs cols 0..2 in row 3 → fits.
  s.currentShipRotation = 'horizontal';
  assert.equal(s.calculateShipPositions(idx(3, 0), 'Battleship').length, 3);
  // Vertical at the same anchor needs rows 3..5 → off-board.
  s.currentShipRotation = 'vertical';
  assert.deepEqual(s.calculateShipPositions(idx(3, 0), 'Battleship'), []);
});

test('LAYER_DISPLAY map: every internal layer has a user-facing name', () => {
  // The DEPTHS rename hinges on this map being complete and matching
  // the LAYERS list — a typo here would silently fall through to the
  // raw key in the UI, which is exactly the bug the rename fixed.
  for (const layer of GAME_CONSTANTS.LAYERS) {
    assert.ok(GAME_CONSTANTS.LAYER_DISPLAY[layer], `LAYER_DISPLAY missing key: ${layer}`);
    assert.ok(GAME_CONSTANTS.LAYER_DISPLAY_TITLE[layer], `LAYER_DISPLAY_TITLE missing key: ${layer}`);
  }
  // Specifically: the underwater zone reads as DEPTHS / Depths now.
  assert.equal(GAME_CONSTANTS.LAYER_DISPLAY.Sub, 'DEPTHS');
  assert.equal(GAME_CONSTANTS.LAYER_DISPLAY_TITLE.Sub, 'Depths');
});

test('phase setter updates the underlying _phase value', () => {
  // The setter also writes a body.phase-{name} class but that's a DOM
  // side-effect — here we just confirm the value round-trips.
  const s = new GameState();
  s.phase = 'combat';
  assert.equal(s.phase, 'combat');
  s.phase = 'gameOver';
  assert.equal(s.phase, 'gameOver');
});
