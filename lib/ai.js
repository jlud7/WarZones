/*
 * GameAI module.
 *
 * Probability-map-driven AI targeting for the four-layer board. Retains
 * layer-specific hunt state (Space 2×2 square detection, Sea/Sub linear
 * orientation), a randomized "personality" per game, and shipCompleted()
 * logic that can fall back to the global warZonesGame reference.
 *
 * Dual-mode loader: global assignment for <script> loading, module.exports
 * for Node (if ever tested directly).
 */
(function (global) {
  'use strict';

  const GAME_CONSTANTS = (typeof module !== 'undefined' && module.exports)
    ? require('./game-state.js').GAME_CONSTANTS
    : global.GAME_CONSTANTS;

  class GameAI {
    constructor(game) {
      this.game = game; // Store reference to the game instance
      this.layerState = {
        Space: { hits: [], foundOrientation: null, possiblePositions: [] },
        Sky: { hits: [], attacked: [] },
        Sea: { hits: [], foundOrientation: null, foundShip: null, possiblePositions: [] },
        Sub: { hits: [], foundOrientation: null, possiblePositions: [] }
      };
      
      // Board size cache
      this.boardSize = GAME_CONSTANTS.BOARD_SIZE;
      
      // Track already attacked positions for each layer
      this.attackedPositions = {
        Space: new Set(),
        Sky: new Set(),
        Sea: new Set(),
        Sub: new Set()
      };
      
      // Random starting patterns
      this.skyPattern = this.generateRandomPattern();
      
      // Track which ships have been sunk per layer
      this.sunkShips = {
        Space: [],
        Sky: [],
        Sea: [],
        Sub: []
      };
  
      // Randomize AI "personality"
      this.personality = this._defaultPersonality();

      // Tracks the most recent attack so personality dials that key off
      // the previous shot (huntPersistence, etc.) have something to read.
      this.lastAttack = null;

      // Probability maps for better initial targeting
      this.probabilityMaps = this.initProbabilityMaps();
    }

    _defaultPersonality() {
      return {
        // How often AI breaks optimal pattern (0-1)
        unpredictability: 0.15 + Math.random() * 0.2,
        // Preference for edges vs center
        edgePreference: Math.random() > 0.5 ? 'edge' : 'center',
        // Does AI sometimes target in clusters
        clusterPreference: Math.random() > 0.7,
        // 0..1, chance to KEEP a hunt going after a miss. 1 = never give up.
        huntPersistence: 1.0,
        // Per-layer score multipliers applied in getStrategyBasedMove.
        layerBias: { Space: 1.0, Sky: 1.0, Sea: 1.0, Sub: 1.0 },
        // 'adaptive' = current heuristic, 'aggressive' = laser, 'defensive' = blackbox, 'random'.
        powerupStrategy: 'adaptive',
        // Random seed for this game
        seed: Math.floor(Math.random() * 1000)
      };
    }
  
    reset() {
      this.layerState = {
        Space: { hits: [], foundOrientation: null, possiblePositions: [] },
        Sky: { hits: [], attacked: [] },
        Sea: { hits: [], foundOrientation: null, foundShip: null, possiblePositions: [] },
        Sub: { hits: [], foundOrientation: null, possiblePositions: [] }
      };
      this.attackedPositions = {
        Space: new Set(),
        Sky: new Set(),
        Sea: new Set(),
        Sub: new Set()
      };
      this.sunkShips = {
        Space: [],
        Sky: [],
        Sea: [],
        Sub: []
      };
  
      // Generate new random patterns for next game
      this.skyPattern = this.generateRandomPattern();

      // New personality for the AI
      this.personality = this._defaultPersonality();
      this.lastAttack = null;

      // Refresh probability maps for the new game
      this.probabilityMaps = this.initProbabilityMaps();
    }

    // Apply a campaign mission's aiConfig on top of the default personality.
    // Shallow-merges scalars and bools; for layerBias, merges per-layer keys
    // so a mission can override just one layer without zeroing the rest.
    applyConfig(config) {
      if (!config) return;
      for (const key of Object.keys(config)) {
        if (key === 'layerBias' && config.layerBias) {
          this.personality.layerBias = {
            ...this.personality.layerBias,
            ...config.layerBias,
          };
        } else {
          this.personality[key] = config[key];
        }
      }
    }
    
    // Generate a randomized pattern for targeting Sky layer
    generateRandomPattern() {
      const patterns = [
        // Standard checkerboard
        (r, c) => (r + c) % 2 === 0,
        // Inverted checkerboard
        (r, c) => (r + c) % 2 === 1,
        // Diagonal lines pattern
        (r, c) => (r + c) % 3 === 0,
        // Custom X pattern
        (r, c) => (r === c) || (r === this.boardSize - 1 - c),
        // Random seeded pattern
        (r, c) => ((r * 3 + c * 7 + this.personality.seed) % 4 < 2)
      ];
      
      // Select a random pattern
      return patterns[Math.floor(Math.random() * patterns.length)];
    }
    
    initProbabilityMaps() {
      // Create initial probability maps for each layer
      const maps = {};
      const size = this.boardSize;
      
      // Initialize maps with value 1
      GAME_CONSTANTS.LAYERS.forEach(layer => {
        maps[layer] = Array(size * size).fill(1);
      });
      
      // Enhance Space layer based on AI personality
      if (this.personality.edgePreference === 'edge') {
        // Prefer corners for the spacecraft
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            // Higher probability for corners and edges
            const isCorner = (r === 0 || r === size-2) && (c === 0 || c === size-2);
            const isEdge = r === 0 || r === size-2 || c === 0 || c === size-2;
            
            if (r < size-1 && c < size-1) { // Only valid spacecraft positions
              if (isCorner) {
                maps.Space[r * size + c] += 3;
              } else if (isEdge) {
                maps.Space[r * size + c] += 2;
              } else {
                maps.Space[r * size + c] += 1;
              }
            }
          }
        }
      } else {
        // Prefer center for the spacecraft
        for (let r = 0; r < size-1; r++) {
          for (let c = 0; c < size-1; c++) {
            // Calculate distance from center (for a 4x4 board, center is around 1.5, 1.5)
            const centerR = (size - 2) / 2;
            const centerC = (size - 2) / 2;
            const distFromCenter = Math.sqrt(Math.pow(r - centerR, 2) + Math.pow(c - centerC, 2));
            
            // Closer to center gets higher probability
            maps.Space[r * size + c] += Math.max(1, 3 - Math.floor(distFromCenter));
          }
        }
      }
      
      // For Sky layer, use the random pattern
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (this.skyPattern(r, c)) {
            maps.Sky[r * size + c] += 2;
          }
        }
      }
      
      // Apply a slight randomness to all maps to break predictability
      for (const layer in maps) {
        for (let i = 0; i < maps[layer].length; i++) {
          // Add small random variations (±1)
          maps[layer][i] += Math.floor(Math.random() * 3) - 1;
          // Ensure minimum value of 1
          maps[layer][i] = Math.max(1, maps[layer][i]);
        }
      }
      
      return maps;
    }
    
    calculateMove(gameBoard) {
      const move = this._calculateMoveInternal(gameBoard);

      // Two failure cases the inner logic can produce that would otherwise
      // surface as the "AI could not determine a valid move" warning and
      // freeze the AI:
      //   1. move is null/undefined (a hunt handler bailed out — e.g.
      //      handleSeaLayerLogic with hits.length===1 and every cardinal
      //      neighbor already attacked or off-board, which is much more
      //      likely under clusterPreference + Sea layerBias).
      //   2. move targets a layer that's already fully sunk (stale state).
      // In either case, redirect to any remaining attackable layer.
      const needsFallback = !move || this.shipCompleted(move.layer);
      if (needsFallback) {
        for (const layer of GAME_CONSTANTS.LAYERS) {
          if (this.shipCompleted(layer)) continue;
          const fallbackMoves = this.getAvailableMoves(gameBoard, layer);
          if (fallbackMoves.length > 0) {
            const idx = fallbackMoves[Math.floor(Math.random() * fallbackMoves.length)];
            return { layer, index: idx };
          }
        }
      }
      return move;
    }
  
    _calculateMoveInternal(gameBoard) {
      // First priority: continue attacking a ship we've already hit
      if (this.layerState.Space.hits.length > 0 && !this.shipCompleted('Space')) {
        return this.handleSpaceLayerLogic(gameBoard);
      }
  
      if (this.layerState.Sea.hits.length > 0 && !this.shipCompleted('Sea')) {
        return this.handleSeaLayerLogic(gameBoard);
      }
  
      if (this.layerState.Sub.hits.length > 0 && !this.shipCompleted('Sub')) {
        return this.handleSubLayerLogic(gameBoard);
      }
  
      // Next priority: attack Sky layer if we haven't completed it
      if (!this.shipCompleted('Sky') && this.layerState.Sky.hits.length > 0) {
        const skyMove = this.getOptimalSkyMove(gameBoard);
        if (skyMove !== null) {
          return { layer: 'Sky', index: skyMove };
        }
      }
  
      // Sometimes make a random move to simulate human unpredictability
      if (Math.random() < this.personality.unpredictability) {
        const availableLayers = GAME_CONSTANTS.LAYERS.filter(layer =>
          !this.shipCompleted(layer));
  
        if (availableLayers.length > 0) {
          const randomLayer = availableLayers[Math.floor(Math.random() * availableLayers.length)];
          const availableMoves = this.getAvailableMoves(gameBoard, randomLayer);
  
          if (availableMoves.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableMoves.length);
            return { layer: randomLayer, index: availableMoves[randomIndex] };
          }
        }
      }
  
      // Choose a layer based on weighted probability of finding a ship
      return this.getStrategyBasedMove(gameBoard);
    }
    
    getOptimalSkyMove(gameBoard) {
      // Use the random pattern for Sky targeting
      const availableMoves = [];
      const priorityMoves = [];
      
      for (let r = 0; r < this.boardSize; r++) {
        for (let c = 0; c < this.boardSize; c++) {
          const index = r * this.boardSize + c;
          
          if (this.isCellAvailable(gameBoard.Sky[index]) && !this.attackedPositions.Sky.has(index)) {
            availableMoves.push(index);
            
            // If cell matches our pattern, prioritize it
            if (this.skyPattern(r, c)) {
              priorityMoves.push(index);
            }
          }
        }
      }
      
      // Occasional break from the pattern to simulate human behavior
      if (Math.random() < this.personality.unpredictability && availableMoves.length > 0) {
        return availableMoves[Math.floor(Math.random() * availableMoves.length)];
      }
      
      // First try pattern positions
      if (priorityMoves.length > 0) {
        // Randomize which priority position we select
        return priorityMoves[Math.floor(Math.random() * priorityMoves.length)];
      }
      
      // If no priority positions available, use any available move
      if (availableMoves.length > 0) {
        return availableMoves[Math.floor(Math.random() * availableMoves.length)];
      }
      
      return null;
    }
    
    getStrategyBasedMove(gameBoard) {
      // Calculate which layer to target based on remaining ships and probability
      const layerScores = {};
      const shipCountRemaining = {
        Space: this.shipCompleted('Space') ? 0 : 1,
        Sky: this.shipCompleted('Sky') ? 0 : 1,
        Sea: this.getSeaLayerShipsRemaining(),
        Sub: this.shipCompleted('Sub') ? 0 : 1
      };
      
      // Calculate a score for each layer based on ship density and attacks left
      GAME_CONSTANTS.LAYERS.forEach(layer => {
        if (shipCountRemaining[layer] === 0 || this.shipCompleted(layer)) {
          layerScores[layer] = 0;
        } else {
          const totalCells = this.boardSize * this.boardSize;
          const attackedCells = this.attackedPositions[layer].size;
          const remainingCells = totalCells - attackedCells;
          
          if (remainingCells === 0) {
            layerScores[layer] = 0;
          } else {
            // Calculate density of remaining ships to remaining spaces
            layerScores[layer] = (shipCountRemaining[layer] / remainingCells) * 100;
            
            // Boost score for layers with larger ships
            if (layer === 'Space') layerScores[layer] *= 1.3 + (Math.random() * 0.4);
            if (layer === 'Sea') layerScores[layer] *= 1.1 + (Math.random() * 0.2);

            // Personality layerBias: lets mission configs nudge the AI
            // toward (or away from) specific zones. Default 1.0 = no change.
            const bias = this.personality.layerBias && this.personality.layerBias[layer];
            if (typeof bias === 'number') layerScores[layer] *= bias;

            // Add some randomness to make AI less predictable
            layerScores[layer] *= 0.8 + (Math.random() * 0.4);
          }
        }
      });
      
      // Select the layer with highest score (with randomness)
      let targetLayer = null;
      let highestScore = -1;
      
      // Occasionally choose a random layer regardless of score
      if (Math.random() < this.personality.unpredictability) {
        const availableLayers = GAME_CONSTANTS.LAYERS.filter(layer => 
          !this.shipCompleted(layer) && this.getAvailableMoves(gameBoard, layer).length > 0);
        
        if (availableLayers.length > 0) {
          targetLayer = availableLayers[Math.floor(Math.random() * availableLayers.length)];
        }
      } else {
        // Otherwise make a weighted random choice based on scores
        const totalScore = Object.values(layerScores).reduce((sum, score) => sum + score, 0);
        
        if (totalScore > 0) {
          const randomValue = Math.random() * totalScore;
          let cumulativeScore = 0;
          
          for (const layer in layerScores) {
            cumulativeScore += layerScores[layer];
            if (randomValue <= cumulativeScore) {
              targetLayer = layer;
              break;
            }
          }
        }
        
        // Fallback if weighted random didn't work
        if (!targetLayer) {
          Object.keys(layerScores).forEach(layer => {
            if (layerScores[layer] > highestScore) {
              highestScore = layerScores[layer];
              targetLayer = layer;
            }
          });
        }
      }
      
      // If no valid layer found, choose randomly from available layers
      if (targetLayer === null || highestScore === 0) {
        const availableLayers = GAME_CONSTANTS.LAYERS.filter(layer => 
          !this.shipCompleted(layer) && this.getAvailableMoves(gameBoard, layer).length > 0);
        
        if (availableLayers.length === 0) return null;
        targetLayer = availableLayers[Math.floor(Math.random() * availableLayers.length)];
      }
      
      // Get the best move for the selected layer
      return this.getBestMoveForLayer(gameBoard, targetLayer);
    }
    
    getSeaLayerShipsRemaining() {
      // Sea layer has 2 ships: Battleship (size 3) and Cruiser (size 2)
      let totalSeaShips = 2;
  
      // Use sunk ship tracking for accurate count
      const sunkOnSea = (this.sunkShips && this.sunkShips.Sea) ? this.sunkShips.Sea.length : 0;
      let shipsRemaining = totalSeaShips - sunkOnSea;
  
      // If we're currently hunting a ship (have unsunk hits), that ship is partially found
      if (this.layerState.Sea.hits.length > 0 && shipsRemaining > 0) {
        shipsRemaining--;
      }
  
      return Math.max(0, shipsRemaining);
    }
    
    arePositionsConsecutive(positions) {
      if (positions.length < 2) return true;
      
      // Check if horizontal
      let isHorizontal = true;
      const row = Math.floor(positions[0] / this.boardSize);
      
      for (let i = 1; i < positions.length; i++) {
        const currentRow = Math.floor(positions[i] / this.boardSize);
        if (currentRow !== row) {
          isHorizontal = false;
          break;
        }
      }
      
      if (isHorizontal) {
        // Sort by column
        const cols = positions.map(pos => pos % this.boardSize).sort((a, b) => a - b);
        for (let i = 1; i < cols.length; i++) {
          if (cols[i] !== cols[i-1] + 1) return false;
        }
        return true;
      }
      
      // Check if vertical
      const col = positions[0] % this.boardSize;
      for (let i = 1; i < positions.length; i++) {
        if (positions[i] % this.boardSize !== col) return false;
      }
      
      // Sort by row
      const rows = positions.map(pos => Math.floor(pos / this.boardSize)).sort((a, b) => a - b);
      for (let i = 1; i < rows.length; i++) {
        if (rows[i] !== rows[i-1] + 1) return false;
      }
      
      return true;
    }
    
    getBestMoveForLayer(gameBoard, layer) {
      const availableMoves = this.getAvailableMoves(gameBoard, layer);
      if (availableMoves.length === 0) return null;
      
      // If AI is in clustering mode and there are previous attacks
      if (this.personality.clusterPreference && this.attackedPositions[layer].size > 0) {
        // 25% chance to target near previous attacks (even misses) to simulate clustering behavior
        if (Math.random() < 0.25) {
          const previousAttacks = Array.from(this.attackedPositions[layer]);
          const randomPreviousAttack = previousAttacks[Math.floor(Math.random() * previousAttacks.length)];
          const nearbyMove = this.getNearbyMove(gameBoard, randomPreviousAttack, layer);
          if (nearbyMove !== null) {
            return { layer, index: nearbyMove };
          }
        }
      }
      
      // Use probability map to weight the selection
      const moveScores = availableMoves.map(index => {
        return {
          index,
          score: this.probabilityMaps[layer][index] * (0.8 + Math.random() * 0.4) // Add randomness to score
        };
      });
      
      // Sort by score, highest first
      moveScores.sort((a, b) => b.score - a.score);
      
      // Human-like behavior: sometimes pick from top options, not always the very best
      const topCount = Math.min(
        Math.max(3, Math.floor(moveScores.length * 0.3)), // Take top 30% of moves but at least 3
        moveScores.length
      );
      
      // Weighted random selection from top moves
      const totalTopScore = moveScores.slice(0, topCount).reduce((sum, move) => sum + move.score, 0);
      let cumulativeScore = 0;
      const randomValue = Math.random() * totalTopScore;
      
      for (let i = 0; i < topCount; i++) {
        cumulativeScore += moveScores[i].score;
        if (randomValue <= cumulativeScore) {
          return { layer, index: moveScores[i].index };
        }
      }
      
      // Fallback to best move if weighted selection fails
      return { layer, index: moveScores[0].index };
    }
    
    getNearbyMove(gameBoard, centerIndex, layer) {
      const row = Math.floor(centerIndex / this.boardSize);
      const col = centerIndex % this.boardSize;
      const maxDistance = 2; // Look up to 2 cells away
      
      const candidateMoves = [];
      
      // Check cells within distance
      for (let r = Math.max(0, row - maxDistance); r <= Math.min(this.boardSize - 1, row + maxDistance); r++) {
        for (let c = Math.max(0, col - maxDistance); c <= Math.min(this.boardSize - 1, col + maxDistance); c++) {
          const index = r * this.boardSize + c;
          
          // Skip the center cell itself
          if (index === centerIndex) continue;
          
          // Calculate Manhattan distance to center
          const distance = Math.abs(r - row) + Math.abs(c - col);
          
          if (distance <= maxDistance && 
              this.isCellAvailable(gameBoard[layer][index]) && 
              !this.attackedPositions[layer].has(index)) {
            
            // Closer cells are more likely to be chosen
            for (let i = 0; i < (maxDistance - distance + 1); i++) {
              candidateMoves.push(index);
            }
          }
        }
      }
      
      if (candidateMoves.length > 0) {
        return candidateMoves[Math.floor(Math.random() * candidateMoves.length)];
      }
      
      return null;
    }
    
    handleSpaceLayerLogic(gameBoard) {
      const hits = this.layerState.Space.hits;
      
      if (hits.length === 1) {
        // With one hit, try adjacent cells to find the 2x2 ship pattern
        // We prioritize diagonals for the 2x2 square ship
        return this.getSpaceSecondMove(gameBoard, hits[0]);
      } else if (hits.length === 2) {
        // With two hits, determine possible positions for a 2x2 square
        return this.getSpaceThirdMove(gameBoard, hits);
      } else if (hits.length === 3) {
        // With three hits, target the fourth position to complete the square
        return this.getSpaceFourthMove(gameBoard, hits);
      }
      
      return null;
    }
    
    getSpaceSecondMove(gameBoard, firstHit) {
      const possibleMoves = [];
      const row = Math.floor(firstHit / this.boardSize);
      const col = firstHit % this.boardSize;
      
      // Check the four corners of a potential 2x2 square
      const corners = [
        { r: row-1, c: col-1 }, // top-left
        { r: row-1, c: col },   // top
        { r: row, c: col-1 },   // left
        { r: row, c: col }      // current (we need to check other corners)
      ];
      
      corners.forEach(corner => {
        // For each corner, check if a valid 2x2 square can be formed
        if (corner.r >= 0 && corner.r < this.boardSize-1 && 
            corner.c >= 0 && corner.c < this.boardSize-1) {
          
          // Get the indices of the four positions in this potential square
          const squarePositions = [
            corner.r * this.boardSize + corner.c,             // top-left
            corner.r * this.boardSize + (corner.c + 1),       // top-right
            (corner.r + 1) * this.boardSize + corner.c,       // bottom-left
            (corner.r + 1) * this.boardSize + (corner.c + 1)  // bottom-right
          ];
          
          // If our hit is one of these positions, check the other three
          if (squarePositions.includes(firstHit)) {
            // Check if other positions are available
            const otherPositions = squarePositions.filter(pos => pos !== firstHit);
            otherPositions.forEach(pos => {
              if (this.isCellAvailable(gameBoard.Space[pos]) && !this.attackedPositions.Space.has(pos)) {
                possibleMoves.push(pos);
              }
            });
          }
        }
      });
      
      if (possibleMoves.length > 0) {
        return { 
          layer: 'Space', 
          index: possibleMoves[Math.floor(Math.random() * possibleMoves.length)] 
        };
      }
      
      // If we couldn't find any valid moves based on the square pattern,
      // try adjacent cells as a fallback
      return this.getAdjacentMove(gameBoard, firstHit, 'Space');
    }
    
    getSpaceThirdMove(gameBoard, hits) {
      // Given two hits, determine what corners they occupy in a potential 2x2 square
      const hit1 = hits[0];
      const hit2 = hits[1];
      
      // Check all possible 2x2 squares that could contain both hits
      const row1 = Math.floor(hit1 / this.boardSize);
      const col1 = hit1 % this.boardSize;
      const row2 = Math.floor(hit2 / this.boardSize);
      const col2 = hit2 % this.boardSize;
      
      // If the hits are in the same row and adjacent
      if (row1 === row2 && Math.abs(col1 - col2) === 1) {
        const minCol = Math.min(col1, col2);
        
        // Try the row above
        if (row1 > 0) {
          const pos1 = (row1-1) * this.boardSize + minCol;
          const pos2 = (row1-1) * this.boardSize + minCol + 1;
          
          if (this.isCellAvailable(gameBoard.Space[pos1]) && !this.attackedPositions.Space.has(pos1)) {
            return { layer: 'Space', index: pos1 };
          }
          if (this.isCellAvailable(gameBoard.Space[pos2]) && !this.attackedPositions.Space.has(pos2)) {
            return { layer: 'Space', index: pos2 };
          }
        }
        
        // Try the row below
        if (row1 < this.boardSize-1) {
          const pos1 = (row1+1) * this.boardSize + minCol;
          const pos2 = (row1+1) * this.boardSize + minCol + 1;
          
          if (this.isCellAvailable(gameBoard.Space[pos1]) && !this.attackedPositions.Space.has(pos1)) {
            return { layer: 'Space', index: pos1 };
          }
          if (this.isCellAvailable(gameBoard.Space[pos2]) && !this.attackedPositions.Space.has(pos2)) {
            return { layer: 'Space', index: pos2 };
          }
        }
      }
      
      // If the hits are in the same column and adjacent
      if (col1 === col2 && Math.abs(row1 - row2) === 1) {
        const minRow = Math.min(row1, row2);
        
        // Try the column to the left
        if (col1 > 0) {
          const pos1 = minRow * this.boardSize + (col1-1);
          const pos2 = (minRow+1) * this.boardSize + (col1-1);
          
          if (this.isCellAvailable(gameBoard.Space[pos1]) && !this.attackedPositions.Space.has(pos1)) {
            return { layer: 'Space', index: pos1 };
          }
          if (this.isCellAvailable(gameBoard.Space[pos2]) && !this.attackedPositions.Space.has(pos2)) {
            return { layer: 'Space', index: pos2 };
          }
        }
        
        // Try the column to the right
        if (col1 < this.boardSize-1) {
          const pos1 = minRow * this.boardSize + (col1+1);
          const pos2 = (minRow+1) * this.boardSize + (col1+1);
          
          if (this.isCellAvailable(gameBoard.Space[pos1]) && !this.attackedPositions.Space.has(pos1)) {
            return { layer: 'Space', index: pos1 };
          }
          if (this.isCellAvailable(gameBoard.Space[pos2]) && !this.attackedPositions.Space.has(pos2)) {
            return { layer: 'Space', index: pos2 };
          }
        }
      }
      
      // If the hits are diagonal to each other
      if (Math.abs(row1 - row2) === 1 && Math.abs(col1 - col2) === 1) {
        // Get the other two corners of the square
        const pos1 = row1 * this.boardSize + col2;
        const pos2 = row2 * this.boardSize + col1;
        
        if (this.isCellAvailable(gameBoard.Space[pos1]) && !this.attackedPositions.Space.has(pos1)) {
          return { layer: 'Space', index: pos1 };
        }
        if (this.isCellAvailable(gameBoard.Space[pos2]) && !this.attackedPositions.Space.has(pos2)) {
          return { layer: 'Space', index: pos2 };
        }
      }
      
      // Fallback - try any adjacent cell to either hit
      const adjacentToHit1 = this.getAdjacentMove(gameBoard, hit1, 'Space');
      if (adjacentToHit1) return adjacentToHit1;
      
      const adjacentToHit2 = this.getAdjacentMove(gameBoard, hit2, 'Space');
      return adjacentToHit2;
    }
    
    getSpaceFourthMove(gameBoard, hits) {
      // With three hits, we should be able to determine the complete 2x2 square
      // Find the missing corner
      const corners = this.getPotentialSquareFromThreeHits(hits);
      
      for (const corner of corners) {
        if (!hits.includes(corner) && 
            this.isCellAvailable(gameBoard.Space[corner]) && 
            !this.attackedPositions.Space.has(corner)) {
          return { layer: 'Space', index: corner };
        }
      }
      
      // Fallback - pick any cell adjacent to a hit
      return this.getAdjacentMove(gameBoard, hits[0], 'Space');
    }
    
    getPotentialSquareFromThreeHits(hits) {
      // Find minimum and maximum row and column
      const rows = hits.map(pos => Math.floor(pos / this.boardSize));
      const cols = hits.map(pos => pos % this.boardSize);
      
      const minRow = Math.min(...rows);
      const maxRow = Math.max(...rows);
      const minCol = Math.min(...cols);
      const maxCol = Math.max(...cols);
      
      // If the hits form an L shape, they must be part of a 2x2 square
      // Return all four corners of the potential square
      const corners = [
        minRow * this.boardSize + minCol,
        minRow * this.boardSize + maxCol,
        maxRow * this.boardSize + minCol,
        maxRow * this.boardSize + maxCol
      ];
      
      return corners;
    }
    
    handleSeaLayerLogic(gameBoard) {
      const hits = this.layerState.Sea.hits;
      
      if (hits.length === 1) {
        // With one hit, try adjacent cells - prioritize horizontal and vertical
        return this.getLinearAdjacentMove(gameBoard, hits[0], 'Sea');
      }
      
      if (hits.length >= 2) {
        // With two or more hits, determine orientation if not already known
        if (!this.layerState.Sea.foundOrientation) {
          this.layerState.Sea.foundOrientation = this.determineOrientation(hits[0], hits[1]);
        }
        
        // If we have an orientation, target next position in the line
        if (this.layerState.Sea.foundOrientation) {
          const lineMove = this.getNextLineMove(gameBoard, hits, this.layerState.Sea.foundOrientation, 'Sea');
          if (lineMove) return lineMove;
        }
        
        // If no orientation was found or no valid move in that direction
        // Try adjacent to any hit
        for (const hit of hits) {
          const adjacentMove = this.getLinearAdjacentMove(gameBoard, hit, 'Sea');
          if (adjacentMove) return adjacentMove;
        }
      }
      
      // If we've exhausted directed targeting, try probability-based targeting
      return this.getBestMoveForLayer(gameBoard, 'Sea');
    }
    
    handleSubLayerLogic(gameBoard) {
      const hits = this.layerState.Sub.hits;
      
      if (hits.length === 1) {
        // With one hit, try adjacent cells
        return this.getLinearAdjacentMove(gameBoard, hits[0], 'Sub');
      }
      
      // With multiple hits, try to find the next position in line
      if (hits.length >= 2) {
        if (!this.layerState.Sub.foundOrientation) {
          this.layerState.Sub.foundOrientation = this.determineOrientation(hits[0], hits[1]);
        }
        
        const lineMove = this.getNextLineMove(gameBoard, hits, this.layerState.Sub.foundOrientation, 'Sub');
        if (lineMove) return lineMove;
      }
      
      // If no targeted move found, use probability-based targeting
      return this.getBestMoveForLayer(gameBoard, 'Sub');
    }
    
    getLinearAdjacentMove(gameBoard, pos, layer) {
      // Prioritize horizontal and vertical directions for line ships
      const row = Math.floor(pos / this.boardSize);
      const col = pos % this.boardSize;
      
      // Check in order: horizontal (left/right) then vertical (up/down)
      const directions = [
        {dr: 0, dc: -1}, // left
        {dr: 0, dc: 1},  // right
        {dr: -1, dc: 0}, // up
        {dr: 1, dc: 0}   // down
      ];
      
      // Randomize direction order for unpredictability
      this.shuffleArray(directions);
      
      for (const {dr, dc} of directions) {
        const newRow = row + dr;
        const newCol = col + dc;
        const newIndex = newRow * this.boardSize + newCol;
        
        if (this.isValidPosition(newRow, newCol) && 
            this.isCellAvailable(gameBoard[layer][newIndex]) && 
            !this.attackedPositions[layer].has(newIndex)) {
          return { layer, index: newIndex };
        }
      }
      
      return null;
    }
    
    getAdjacentMove(gameBoard, pos, layer) {
      const row = Math.floor(pos / this.boardSize);
      const col = pos % this.boardSize;
      
      // Check all 8 surrounding directions
      const directions = [
        {dr: -1, dc: 0}, // up
        {dr: 1, dc: 0},  // down
        {dr: 0, dc: -1}, // left
        {dr: 0, dc: 1},  // right
        {dr: -1, dc: -1}, // up-left
        {dr: -1, dc: 1},  // up-right
        {dr: 1, dc: -1},  // down-left
        {dr: 1, dc: 1}    // down-right
      ];
      
      // Randomize direction order
      this.shuffleArray(directions);
      
      for (const {dr, dc} of directions) {
        const newRow = row + dr;
        const newCol = col + dc;
        const newIndex = newRow * this.boardSize + newCol;
        
        if (this.isValidPosition(newRow, newCol) && 
            this.isCellAvailable(gameBoard[layer][newIndex]) && 
            !this.attackedPositions[layer].has(newIndex)) {
          return { layer, index: newIndex };
        }
      }
      
      return null;
    }
    
    getNextLineMove(gameBoard, hits, orientation, layer) {
      // Sort hits to find the ends of the current line
      const sorted = [...hits].sort((a, b) => a - b);
      
      if (orientation === 'horizontal') {
        const row = Math.floor(sorted[0] / this.boardSize);
        const leftCol = (sorted[0] % this.boardSize) - 1;
        const rightCol = (sorted[sorted.length - 1] % this.boardSize) + 1;
        
        const moves = [];
        
        // Try left
        if (leftCol >= 0) {
          const leftIndex = row * this.boardSize + leftCol;
          if (this.isCellAvailable(gameBoard[layer][leftIndex]) && 
              !this.attackedPositions[layer].has(leftIndex)) {
            moves.push(leftIndex);
          }
        }
        
        // Try right
        if (rightCol < this.boardSize) {
          const rightIndex = row * this.boardSize + rightCol;
          if (this.isCellAvailable(gameBoard[layer][rightIndex]) && 
              !this.attackedPositions[layer].has(rightIndex)) {
            moves.push(rightIndex);
          }
        }
        
        return moves.length > 0 ?
          { layer, index: moves[Math.floor(Math.random() * moves.length)] } : null;
      } else {
        // Vertical orientation
        const col = sorted[0] % this.boardSize;
        const topRow = Math.floor(sorted[0] / this.boardSize) - 1;
        const bottomRow = Math.floor(sorted[sorted.length - 1] / this.boardSize) + 1;
        
        const moves = [];
        
        // Try top
        if (topRow >= 0) {
          const topIndex = topRow * this.boardSize + col;
          if (this.isCellAvailable(gameBoard[layer][topIndex]) && 
              !this.attackedPositions[layer].has(topIndex)) {
            moves.push(topIndex);
          }
        }
        
        // Try bottom
        if (bottomRow < this.boardSize) {
          const bottomIndex = bottomRow * this.boardSize + col;
          if (this.isCellAvailable(gameBoard[layer][bottomIndex]) && 
              !this.attackedPositions[layer].has(bottomIndex)) {
            moves.push(bottomIndex);
          }
        }
        
        return moves.length > 0 ?
          { layer, index: moves[Math.floor(Math.random() * moves.length)] } : null;
      }
    }
    
    determineOrientation(pos1, pos2) {
      const row1 = Math.floor(pos1 / this.boardSize);
      const row2 = Math.floor(pos2 / this.boardSize);
      const col1 = pos1 % this.boardSize;
      const col2 = pos2 % this.boardSize;
      
      if (row1 === row2) {
        return 'horizontal';
      } else if (col1 === col2) {
        return 'vertical';
      }
      
      return null; // Diagonal or not adjacent
    }
    
    isValidPosition(row, col) {
      return row >= 0 && row < this.boardSize && col >= 0 && col < this.boardSize;
    }
    
    getAvailableMoves(gameBoard, layer) {
      return gameBoard[layer]
        .map((cell, index) => {
          if (this.isCellAvailable(cell) && !this.attackedPositions[layer].has(index)) {
            return index;
          }
          return -1;
        })
        .filter(index => index !== -1);
    }
    
  shipCompleted(layer) {
    // Primary check: inspect the actual player ship state so that sinking a
    // ship (which clears this.layerState[layer].hits) doesn't cause the AI to
    // think the layer is still in play.
    try {
      const game = this.game || window.warZonesGame;
      if (game && game.gameState && game.gameState.ships && game.gameState.ships.player) {
        const playerShips = game.gameState.ships.player;
        const shipsInLayer = [];
        for (const shipType in playerShips) {
          const ship = playerShips[shipType];
          if (!ship || !ship.positions || ship.positions.length === 0) continue;
          let shipLayer = GAME_CONSTANTS.SHIPS[shipType] && GAME_CONSTANTS.SHIPS[shipType].layer;
          if (!shipLayer && shipType === 'ExtraJet') shipLayer = 'Sky';
          if (shipLayer === layer) shipsInLayer.push(ship);
        }
        // No ships placed on this layer at all → treat as completed so AI
        // doesn't waste attacks there (covers reduced_fleet missions).
        if (shipsInLayer.length === 0) return true;
        return shipsInLayer.every(ship => ship.isSunk);
      }
    } catch (e) {
      // Fall through to legacy logic.
    }
  
    // Fallback: use sunkShips tracking + current hunt state. This is
    // reliable after recordSunk() clears layerState[layer].hits because it
    // keeps a cumulative record of sinks per layer.
    const defaultShipsPerLayer = {
      Space: 1,  // Spacecraft
      Sky: 1,    // FighterJet (ExtraJet handled in primary check only)
      Sea: 2,    // Battleship + Cruiser
      Sub: 1     // Submarine
    };
    const expected = defaultShipsPerLayer[layer] || 0;
    const sunkCount = (this.sunkShips && this.sunkShips[layer]) ? this.sunkShips[layer].length : 0;
    if (sunkCount >= expected) return true;
  
    // Not all ships confirmed sunk yet — if we're still hunting an
    // unfinished ship (hits present), keep hunting; otherwise fall back to
    // the old hit-count heuristic so we don't regress vs. pre-fix behavior.
    if (this.layerState[layer] && this.layerState[layer].hits.length > 0) return false;
    const requiredHits = { Space: 4, Sky: 1, Sea: 5, Sub: 2 };
    return (this.layerState[layer]?.hits.length || 0) >= requiredHits[layer];
  }
    
  // Add this to the recordHit method in GameAI
  recordHit(layer, index) {
    this.lastAttack = { layer, index, hit: true };
    this.attackedPositions[layer].add(index);
    
    // Check if this is a treasure chest hit
    if (layer === 'Sub') {
      // Instead of using the game object directly, use the isATreasureHit method
      const isTreasure = this.isATreasureHit(index, layer);
      if (isTreasure) {
        // Don't add treasure hits to the ship hit count.
        return;
      }
    }
    
    // Only add to hits if it's not a treasure
    this.layerState[layer].hits.push(index);
    
    // Special handling for Sky layer to track both types of jets
    if (layer === 'Sky') {
      // Instead of using the game object directly, just track that we found a jet
      this.layerState.Sky.foundJet = true;
      
      // If this is a second hit in Sky layer, mark it as a second jet
      if (this.layerState.Sky.hits.length > 1) {
        this.layerState.Sky.foundSecondJet = true;
      }
    }
    
    // Update probability maps - reduce probability around the hit
    this.updateProbabilityMap(layer, index, true);
    
    // Add some randomization to probability maps after a hit
    this.addNoiseToMap(layer);
  }
    
  isATreasureHit(index, layer) {
    // Check if this index is in the player's treasure chest positions
    if (layer === 'Sub') {
      try {
        // Instead of accessing window.game, use the game instance passed to the AI
        const game = this.game || window.warZonesGame; // Fallback to global reference if available
        if (game && game.gameState && game.gameState.treasureChests) {
          return game.gameState.treasureChests.player.includes(index);
        }
        // If no game instance is available, return false as fallback
        return false;
      } catch (e) {
        console.error("Error checking treasure position:", e);
        return false;
      }
    }
    return false;
  }
    
    recordMiss(layer, index) {
      this.lastAttack = { layer, index, hit: false };
      this.attackedPositions[layer].add(index);

      // Update probability maps - reduce probability at the miss
      this.updateProbabilityMap(layer, index, false);

      // huntPersistence < 1: a miss while we're hunting an unsunk ship has a
      // chance to "lose the trail" — clear our hit memory for this layer so
      // the AI re-explores instead of methodically finishing the kill. This
      // is the single dial that turns sharp AI into rookie-flavored AI.
      const hp = this.personality.huntPersistence;
      if (typeof hp === 'number' && hp < 1
          && this.layerState[layer]
          && this.layerState[layer].hits.length > 0
          && Math.random() > hp) {
        this.layerState[layer].hits = [];
        this.layerState[layer].foundOrientation = null;
        if (this.layerState[layer].possiblePositions) {
          this.layerState[layer].possiblePositions = [];
        }
        if (layer === 'Sea') this.layerState.Sea.foundShip = null;
      }
    }
  
    recordSunk(layer, shipType) {
      this.lastAttack = { layer, index: this.lastAttack?.index, hit: true, sunk: true, shipType };
      // Track the sunk ship
      if (!this.sunkShips[layer]) this.sunkShips[layer] = [];
      this.sunkShips[layer].push(shipType);
  
      // Reset hunting state for this layer so the AI can start fresh
      // looking for the next ship (e.g., after sinking Battleship, hunt Cruiser)
      if (this.layerState[layer]) {
        this.layerState[layer].hits = [];
        this.layerState[layer].foundOrientation = null;
        if (this.layerState[layer].possiblePositions) {
          this.layerState[layer].possiblePositions = [];
        }
        if (layer === 'Sea') {
          this.layerState.Sea.foundShip = null;
        }
      }
    }
  
    updateProbabilityMap(layer, index, isHit) {
      const row = Math.floor(index / this.boardSize);
      const col = index % this.boardSize;
      
      // Set probability to 0 for the attacked cell
      this.probabilityMaps[layer][index] = 0;
      
      if (isHit) {
        // If it's a hit, increase probability for adjacent cells
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            // Skip diagonal and center (which is the hit position)
            if ((dr === 0 && dc === 0) || (dr !== 0 && dc !== 0)) continue;
            
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (this.isValidPosition(newRow, newCol)) {
              const newIndex = newRow * this.boardSize + newCol;
              // Increase probability if not already attacked
              if (!this.attackedPositions[layer].has(newIndex)) {
                this.probabilityMaps[layer][newIndex] += 2;
              }
            }
          }
        }
      } else {
        // If it's a miss, slightly decrease probability for adjacent cells
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (this.isValidPosition(newRow, newCol)) {
              const newIndex = newRow * this.boardSize + newCol;
              // Only decrease if not already 0
              if (this.probabilityMaps[layer][newIndex] > 0) {
                this.probabilityMaps[layer][newIndex] = Math.max(1, this.probabilityMaps[layer][newIndex] - 1);
              }
            }
          }
        }
      }
    }
    
    addNoiseToMap(layer) {
      // Add small noise to probability map to make AI less predictable
      for (let i = 0; i < this.probabilityMaps[layer].length; i++) {
        if (!this.attackedPositions[layer].has(i) && this.probabilityMaps[layer][i] > 0) {
          // Add ±1 random noise
          this.probabilityMaps[layer][i] += Math.floor(Math.random() * 3) - 1;
          // Ensure minimum value of 1
          this.probabilityMaps[layer][i] = Math.max(1, this.probabilityMaps[layer][i]);
        }
      }
    }
    
    shuffleArray(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }
    
    isCellAvailable(cellValue) {
      return cellValue !== "hit" && cellValue !== "miss";
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameAI };
  } else {
    global.GameAI = GameAI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
