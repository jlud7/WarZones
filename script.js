/* --- Constants --- */
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
  // Add directly after SOUNDS in GAME_CONSTANTS
TREASURE: {
  symbol: '💎',
  name: 'Treasure Chest',
  chance: 1.00 // 100% chance of having a treasure in a sub-sea cell
},
POWERUPS: {
  BlackBox: {
    name: 'BLACK BOX',
    description: 'Place an additional jet in your sky layer',
    icon: '✈️'
  },
  KryptonLaser: {
    name: 'KRYPTON LASER',
    description: 'Attack the same cell position across all four layers',
    icon: '🔫'
  },
  CannonBall: {  // Renamed from SonarPulse
    name: 'CANNON BALL',
    description: 'Attack a 2×2 area on the sea layer',
    icon: '💣'
  }
}
};

class WarZones {
  constructor() {
    this.gameState = new GameState();
    this.ui = new UIController(this);
    this.sound = new SoundManager();
    this.animations = new AnimationManager();
    this.ai = new GameAI(this); // Pass 'this' to GameAI constructor
    this.stats = new Statistics();
    this.tutorial = new Tutorial();
    this.network = new NetworkManager(this);
    this.playerWins = 0;
    this.aiWins = 0;
    this.aiTurnTimeouts = []; // Track AI turn timeouts
    this.isProcessingTurn = false; // Flag to prevent multiple attacks

    // Also set a global reference that can be used as fallback
    window.warZonesGame = this;

    this.initialize();
  }

  initialize() {
    this.setupEventListeners();
    this.loadSavedGame();
    this.ui.renderMainMenu();
    this.createGameBoards();
  }
  
activatePowerup(powerupType) {
  switch(powerupType) {
    case 'BlackBox':
      this.activateBlackBox();
      break;
    case 'KryptonLaser':
      this.activateKryptonLaser();
      break;
    case 'CannonBall':  // Changed from SonarPulse
      this.activateCannonBall();
      break;
  }
}

activateBlackBox() {
  // Place an additional jet in sky layer
  this.gameState.pendingPowerup = 'BlackBox';
  this.ui.updateCommentary("BLACK BOX activated! Click on your sky layer to place an additional jet.");
  
  // Add visual highlight to player sky board
  const playerSkyBoard = document.getElementById('playerSkyBoard');
  playerSkyBoard.classList.add('powerup-target-board');
  
  const placeJet = (e) => {
    if (!e.target.classList.contains('cell')) return;
    if (e.target.classList.contains('ship') || e.target.classList.contains('hit') || e.target.classList.contains('miss')) {
      this.ui.updateCommentary("Cannot place jet there. Select an empty cell.");
      return;
    }
    
    const index = parseInt(e.target.dataset.index);
    
    // Add extra jet
    this.gameState.boards.player.Sky[index] = 'ExtraJet';
    
    // Add to player ships
    if (!this.gameState.ships.player['ExtraJet']) {
      this.gameState.ships.player['ExtraJet'] = { 
        positions: [index], 
        hits: [], 
        isSunk: false 
      };
    } else {
      this.gameState.ships.player['ExtraJet'].positions.push(index);
    }
    
    // Update UI
    e.target.classList.add('ship');
    e.target.textContent = GAME_CONSTANTS.SHIPS.FighterJet.symbol;
    
    // Cleanup
    playerSkyBoard.removeEventListener('click', placeJet);
    playerSkyBoard.classList.remove('powerup-target-board');
    this.gameState.pendingPowerup = null;
    
    this.ui.updateCommentary("Extra jet placed! Your turn continues.");
  };
  
  playerSkyBoard.addEventListener('click', placeJet);
  
  // Add hover effect for cells
  const enhanceCellHover = (e) => {
    if (!e.target.classList.contains('cell')) return;
    if (e.target.classList.contains('ship') || e.target.classList.contains('hit') || e.target.classList.contains('miss')) return;
    
    e.target.classList.add('blackbox-target');
  };
  
  const removeCellHover = (e) => {
    if (!e.target.classList.contains('cell')) return;
    e.target.classList.remove('blackbox-target');
  };
  
  playerSkyBoard.addEventListener('mouseover', enhanceCellHover);
  playerSkyBoard.addEventListener('mouseout', removeCellHover);
  
  // Clean up hover listeners when jet is placed
  const originalRemoveEventListener = playerSkyBoard.removeEventListener.bind(playerSkyBoard);
  playerSkyBoard.removeEventListener = function(type, listener) {
    originalRemoveEventListener(type, listener);
    if (type === 'click' && listener === placeJet) {
      playerSkyBoard.removeEventListener('mouseover', enhanceCellHover);
      playerSkyBoard.removeEventListener('mouseout', removeCellHover);
      // Restore original method
      playerSkyBoard.removeEventListener = originalRemoveEventListener;
    }
  };
}

activateKryptonLaser() {
  console.log("Activating Krypton Laser PowerUp");
  
  // Set the pending powerup state - this should make handleAttack ignore normal attacks
  this.gameState.pendingPowerup = 'KryptonLaser';
  
  this.ui.updateCommentary(
    "KRYPTON LASER activated! Click on ANY cell in ANY opponent layer to attack the same position across all layers."
  );

  // Clear any existing laser-target highlights
  document.querySelectorAll('.opponent-boards .cell.laser-target')
    .forEach(cell => cell.classList.remove('laser-target'));

  const game = this;
  
  // Define hover handler
  function handleMouseEnter(event) {
    if (!event.target.classList.contains('cell')) return;
    
    // Get index of the hovered cell
    const index = parseInt(event.target.dataset.index);
    
    // Clear any existing highlights first
    document.querySelectorAll('.opponent-boards .cell.laser-target')
      .forEach(cell => cell.classList.remove('laser-target'));
    
    // Highlight the same position across all layers
    GAME_CONSTANTS.LAYERS.forEach(layer => {
      const cell = document.querySelector(`#opponent${layer}Board .cell[data-index="${index}"]`);
      if (cell) {
        cell.classList.add('laser-target');
      }
    });
  }
  
  // Define mouse leave handler to clear highlights when mouse leaves cell
  function handleMouseLeave(event) {
    if (!event.target.classList.contains('cell')) return;
    
    // Remove highlights from this cell
    event.target.classList.remove('laser-target');
  }
  
  // Define mouse leave handler for the entire opponent boards section
  function handleBoardsLeave() {
    // Clear all highlights when mouse leaves the opponent boards area
    document.querySelectorAll('.opponent-boards .cell.laser-target')
      .forEach(cell => cell.classList.remove('laser-target'));
  }
  
  // Define click handler
  function handleClick(event) {
    if (!event.target.classList.contains('cell')) return;
    if (game.isProcessingTurn) return; // Prevent multiple rapid clicks
    
    // Set processing flag
    game.isProcessingTurn = true;
    
    // Get the target index from the clicked cell
    const index = parseInt(event.target.dataset.index);
    
    // Remove event listeners
    removeEventListeners();
    
    // Process the actual attack on all four layers
    processKryptonLaserAttack(index);
  }
  
  // Function to remove all event listeners
  function removeEventListeners() {
    // Clear all laser highlights
    document.querySelectorAll('.opponent-boards .cell.laser-target')
      .forEach(cell => cell.classList.remove('laser-target'));
    
    // Remove event listeners from cells
    document.querySelectorAll('.opponent-boards .cell').forEach(cell => {
      cell.removeEventListener('mouseenter', handleMouseEnter);
      cell.removeEventListener('mouseleave', handleMouseLeave);
      cell.removeEventListener('click', handleClick);
    });
    
    // Remove the board-level listener
    document.querySelector('.opponent-boards').removeEventListener('mouseleave', handleBoardsLeave);
    
    // Reset pendingPowerup
    game.gameState.pendingPowerup = null;
  }
  
  // Function to perform the attack on all layers
  function processKryptonLaserAttack(index) {
    console.log(`Processing Krypton Laser attack at index ${index}`);
    
    const results = [];
    let hitCount = 0;
    let sunkCount = 0;
    let attackedCount = 0;
    
    // Process attacks on each layer at the same position
    GAME_CONSTANTS.LAYERS.forEach(layer => {
      const boardId = `opponent${layer}Board`;
      const cell = document.querySelector(`#${boardId} .cell[data-index="${index}"]`);
      
      // Only attack if cell exists and hasn't been attacked yet
      if (cell && !cell.classList.contains('hit') && !cell.classList.contains('miss')) {
        attackedCount++;
        
        // Process attack through game state
        const result = game.gameState.processAttack(boardId, index, layer);
        results.push(result);
        
        // Update UI based on result
        if (result.hit) {
          hitCount++;
          cell.classList.remove('ship');
          cell.classList.add('hit');
          cell.textContent = '💥';
          
          if (result.sunk) {
            sunkCount++;
            game.ui.animateSunkShip(result.shipType, boardId);
            game.sound.playSound('sunk');
          } else {
            game.sound.playSound('hit');
          }
        } else {
          cell.classList.add('miss');
          cell.textContent = 'O';
          game.sound.playSound('miss');
        }
      }
    });
    
    console.log(`Krypton Laser results: ${hitCount} hits, ${sunkCount} sunk, ${attackedCount} cells attacked`);
    
    // Update scoreboard
    game.ui.updateScoreBoard();
    
    // Check for game over
    for (const result of results) {
      if (result.gameOver && result.gameOver.isOver) {
        game.sound.playSound(result.gameOver.winner === 'player' ? 'victory' : 'defeat');
        
        if (result.gameOver.winner === 'player') {
          game.playerWins++;
        } else {
          game.aiWins++;
        }
        
        game.ui.updateScoreBoard();
        game.gameState.phase = 'gameOver';
        game.isProcessingTurn = false;
        game.ui.showGameOver(result.gameOver);
        return; // Exit if game is over
      }
    }
    
    // Handle turn based on results
    if (hitCount > 0) {
      // Hit something - player gets another turn
      if (sunkCount > 0) {
        game.ui.updateCommentary(`Krypton Laser hit ${hitCount} target(s) and sunk ${sunkCount} ship(s)! Your turn continues.`);
      } else {
        game.ui.updateCommentary(`Krypton Laser hit ${hitCount} target(s)! Your turn continues.`);
      }
      
      // Reset processing flag to allow player to continue
      game.isProcessingTurn = false;
      
    } else if (attackedCount > 0) {
      // We attacked cells but missed all targets
      game.ui.updateCommentary("Krypton Laser missed all targets! AI's turn now.");
      
      // Switch to AI turn
      if (game.gameState.gameMode === 'ai') {
        setTimeout(() => {
          if (game.gameState.phase !== 'gameOver') {
            game.handleAITurn();
          }
        }, 500);
      } else {
        game.isProcessingTurn = false;
      }
    } else {
      // No valid targets
      game.ui.updateCommentary("No valid targets for Krypton Laser!");
      game.isProcessingTurn = false;
    }
    
    // Animate commentary box
    game.animateCommentaryBox();
  }
  
  // Attach event listeners to opponent cells
  document.querySelectorAll('.opponent-boards .cell').forEach(cell => {
    cell.addEventListener('mouseenter', handleMouseEnter);
    cell.addEventListener('mouseleave', handleMouseLeave);
    cell.addEventListener('click', handleClick);
  });
  
  // Add board-level leave listener to handle mouse leaving the entire area
  document.querySelector('.opponent-boards').addEventListener('mouseleave', handleBoardsLeave);
  
  // Console log for debugging
  console.log("Krypton Laser event handlers attached - ready for laser attack");
}
  
// Replace the entire activateCannonBall method with this fixed version
activateCannonBall() {
  // Attack a 2×2 area on sea layer only
  this.gameState.pendingPowerup = 'CannonBall';
  this.ui.updateCommentary("CANNON BALL activated! Click on opponent's sea board to attack a 2×2 area.");
  
  // Only attach listener to sea board
  const opponentSeaBoard = document.querySelector('#opponentSeaBoard');
  
  // Define hover function so we can remove it later
  const cannonHover = (e) => {
    if (!e.target.classList.contains('cell')) return;
    
    // Remove existing highlights
    document.querySelectorAll('#opponentSeaBoard .cell.cannon-target').forEach(cell => {
      cell.classList.remove('cannon-target');
    });
    
    // Get this cell's index and compute row/col
    const index = parseInt(e.target.dataset.index);
    const row = Math.floor(index / GAME_CONSTANTS.BOARD_SIZE);
    const col = index % GAME_CONSTANTS.BOARD_SIZE;
    
    // Highlight 2×2 area
    for (let r = row; r < row + 2 && r < GAME_CONSTANTS.BOARD_SIZE; r++) {
      for (let c = col; c < col + 2 && c < GAME_CONSTANTS.BOARD_SIZE; c++) {
        const targetIndex = r * GAME_CONSTANTS.BOARD_SIZE + c;
        const targetCell = document.querySelector(`#opponentSeaBoard .cell[data-index="${targetIndex}"]`);
        if (targetCell) {
          targetCell.classList.add('cannon-target');
        }
      }
    }
  };
  
  // Define mouseout function
  const cannonOut = () => {
    document.querySelectorAll('#opponentSeaBoard .cell.cannon-target').forEach(cell => {
      cell.classList.remove('cannon-target');
    });
  };
  
  // Add hover events
  opponentSeaBoard.addEventListener('mouseover', cannonHover);
  opponentSeaBoard.addEventListener('mouseout', cannonOut);
  
  // Define cleanup function to properly remove all event handlers
  const cleanupEventHandlers = () => {
    opponentSeaBoard.removeEventListener('mouseover', cannonHover);
    opponentSeaBoard.removeEventListener('mouseout', cannonOut);
    opponentSeaBoard.removeEventListener('click', cannonAttack);
    
    document.querySelectorAll('#opponentSeaBoard .cell.cannon-target').forEach(cell => {
      cell.classList.remove('cannon-target');
    });
  };
  
  // Handle the attack
  const cannonAttack = (e) => {
    if (!e.target.classList.contains('cell')) return;
    
    // Don't allow attack if already processing a turn
    if (this.isProcessingTurn) return;
    
    // Set the processing flag
    this.isProcessingTurn = true;
    
    // IMPORTANT: Store the fact that we're using a cannonball
    const isUsingCannonball = true;
    
    // Immediately clear the pendingPowerup flag to prevent recursive activation
    this.gameState.pendingPowerup = null;
    
    // Clean up hover events immediately
    cleanupEventHandlers();
    
    // Get the target area (2×2 grid)
    const index = parseInt(e.target.dataset.index);
    const row = Math.floor(index / GAME_CONSTANTS.BOARD_SIZE);
    const col = index % GAME_CONSTANTS.BOARD_SIZE;
    
    // Create an array to track all attack positions
    const attackPositions = [];
    for (let r = row; r < row + 2 && r < GAME_CONSTANTS.BOARD_SIZE; r++) {
      for (let c = col; c < col + 2 && c < GAME_CONSTANTS.BOARD_SIZE; c++) {
        const targetIndex = r * GAME_CONSTANTS.BOARD_SIZE + c;
        attackPositions.push(targetIndex);
      }
    }
    
    // Separate valid attack positions (cells that haven't been attacked yet)
    const validAttackPositions = attackPositions.filter(targetIndex => {
      const targetCell = document.querySelector(`#opponentSeaBoard .cell[data-index="${targetIndex}"]`);
      return targetCell && !targetCell.classList.contains('hit') && !targetCell.classList.contains('miss');
    });
    
    // Track results and hit statistics 
    const results = [];
    let hitCount = 0;
    let sunkCount = 0;
    let attackedCellCount = 0;
    
    // Now process each valid attack position
    for (const targetIndex of validAttackPositions) {
      const result = this.gameState.processAttack('opponentSeaBoard', targetIndex, 'Sea');
      results.push(result);
      
      // Update the board visually
      this.ui.updateBoard(result);
      
      // Count hits and sunk ships
      if (result.hit) hitCount++;
      if (result.sunk) sunkCount++;
      attackedCellCount++;
    }
    
    // Update scoreboard
    this.ui.updateScoreBoard();
    
    // Update commentary based on results - with the correct count
    if (hitCount > 0) {
      let message = `Cannon Ball hit ${hitCount} target${hitCount > 1 ? 's' : ''}`;
      if (sunkCount > 0) {
        message += ` and destroyed ${sunkCount} ship${sunkCount > 1 ? 's' : ''}`;
      }
      message += "! Your turn continues.";
      this.ui.updateCommentary(message);
      this.animateCommentaryBox();
    } else if (attackedCellCount > 0) {
      this.ui.updateCommentary(`Cannon Ball missed all ${attackedCellCount} targets! AI's turn now.`);
      this.animateCommentaryBox();
    } else {
      // If no cells were valid to attack
      this.ui.updateCommentary("No valid targets for Cannon Ball! Your turn continues.");
      this.animateCommentaryBox();
      this.isProcessingTurn = false;
      return;
    }
    
    // Check for game over
    for (const result of results) {
      if (result.gameOver && result.gameOver.isOver) {
        this.sound.playSound(result.gameOver.winner === 'player' ? 'victory' : 'defeat');
        
        if (result.gameOver.winner === 'player') {
          this.playerWins++;
        } else {
          this.aiWins++;
        }
        
        this.ui.updateScoreBoard();
        this.gameState.phase = 'gameOver';
        this.isProcessingTurn = false;
        this.ui.showGameOver(result.gameOver);
        return;
      }
    }
    
    // Handle turn switching
    if (this.gameState.gameMode === 'ai') {
      if (hitCount === 0 && attackedCellCount > 0) {
        // No hits and we actually attacked cells, so it's AI's turn
        setTimeout(() => {
          this.handleAITurn();
        }, 500);
      } else {
        // Player hit something or no valid cells were attacked, so they get another turn
        this.isProcessingTurn = false;
      }
    } else {
      // Human vs Human mode
      if (hitCount === 0 && attackedCellCount > 0) {
        // Switch players on miss only if we actually attacked
        this.gameState.currentPlayer = this.gameState.currentPlayer === 1 ? 2 : 1;
        this.updateUIForPlayerTurn();
      }
      // Reset processing flag
      this.isProcessingTurn = false;
    }
  };
  
  // Add click event for attack
  opponentSeaBoard.addEventListener('click', cannonAttack);
  
  // Also add a listener for the handleAttack method to prevent it from firing when cannonball is active
  const originalHandleAttack = this.handleAttack;
  this.handleAttack = (e) => {
    // If we have a pending cannonball powerup, don't process regular attacks
    if (this.gameState.pendingPowerup === 'CannonBall') {
      return;
    }
    originalHandleAttack.call(this, e);
  };
  
  // Restore original handleAttack when cannonball is used or deactivated
  const resetHandleAttack = () => {
    this.handleAttack = originalHandleAttack;
  };
  
  // Add an event listener to reset everything if user clicks elsewhere
  const handleDocumentClick = (e) => {
    // If the click is outside the sea board and not on a menu
    if (!e.target.closest('#opponentSeaBoard') && 
        !e.target.closest('.treasure-content') && 
        this.gameState.pendingPowerup === 'CannonBall') {
      
      cleanupEventHandlers();
      resetHandleAttack();
      this.gameState.pendingPowerup = null;
      document.removeEventListener('click', handleDocumentClick);
      this.ui.updateCommentary("Cannonball cancelled. Attack normally.");
    }
  };
  
  // Listen for clicks outside the sea board to cancel the cannonball
  document.addEventListener('click', handleDocumentClick);
  
  // Make sure to restore handleAttack after cannonball is used
  const originalRemoveEventListener = opponentSeaBoard.removeEventListener.bind(opponentSeaBoard);
  opponentSeaBoard.removeEventListener = function(type, listener) {
    originalRemoveEventListener(type, listener);
    if (type === 'click' && listener === cannonAttack) {
      resetHandleAttack();
    }
  };
}
  
handleAIPowerupSelection() {
  // Determine which powerup the AI should choose based on game state
  const powerups = ['BlackBox', 'KryptonLaser', 'CannonBall'];
  let selectedPowerup;
  
  // Count undiscovered ships in player's boards
  let undiscoveredShips = 0;
  let totalPositions = 0;
  
  Object.keys(this.gameState.ships.player).forEach(shipType => {
    const ship = this.gameState.ships.player[shipType];
    if (!ship.isSunk && ship.positions.length > 0) {
      undiscoveredShips++;
      totalPositions += ship.positions.length - ship.hits.length;
    }
  });
  
  // AI strategy:
  // If many undiscovered ships - prioritize CannonBall (intel gathering)
  // If few ships but many positions left - prioritize KryptonLaser (attack)
  // If fewer positions left - prioritize BlackBox (reinforcement)
  
  if (Math.random() < 0.7) {
    // 70% chance to make a strategic choice
    if (undiscoveredShips >= 3) {
      // Many ships left - get intel
      selectedPowerup = 'CannonBall';
    } else if (totalPositions >= 5) {
      // Many positions to hit - use laser
      selectedPowerup = 'KryptonLaser';
    } else {
      // Few positions - reinforce
      selectedPowerup = 'BlackBox';
    }
  } else {
    // 30% chance to choose randomly
    selectedPowerup = powerups[Math.floor(Math.random() * powerups.length)];
  }
  
  // Visual feedback about AI's choice
  const powerup = GAME_CONSTANTS.POWERUPS[selectedPowerup];
  this.ui.updateCommentary(`AI selected ${powerup.name}!`);
  
  // Create a simple overlay to show AI's powerup selection
  const overlay = document.createElement('div');
  overlay.className = 'ai-powerup-overlay';
  overlay.innerHTML = `
    <div class="ai-powerup-content">
      <h3>AI Selects Powerup</h3>
      <div class="selected-powerup">
        <div class="powerup-icon">${powerup.icon}</div>
        <div class="powerup-name">${powerup.name}</div>
        <div class="powerup-desc">${powerup.description}</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Remove overlay after a delay
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 500);
  }, 2000);
  
  // Activate the selected powerup for AI after the overlay is shown
  setTimeout(() => {
    this.activatePowerupForAI(selectedPowerup);
  }, 2500);
}
  
  // Add this method to UIController class
showAIPowerupSelection(powerupType) {
  const powerup = GAME_CONSTANTS.POWERUPS[powerupType];
  
  const overlay = document.createElement('div');
  overlay.className = 'ai-powerup-overlay';
  overlay.innerHTML = `
    <div class="ai-powerup-content">
      <h3>AI Selects Powerup</h3>
      <div class="selected-powerup">
        <div class="powerup-icon">${powerup.icon}</div>
        <div class="powerup-name">${powerup.name}</div>
        <div class="powerup-desc">${powerup.description}</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Update commentary
  this.updateCommentary(`AI selected ${powerup.name}!`);
  
  // Remove overlay after a delay
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 500);
  }, 2000);
}

activatePowerup(powerupType) {
  switch(powerupType) {
    case 'BlackBox':
      this.activateBlackBox();
      break;
    case 'KryptonLaser':
      this.activateKryptonLaser();
      break;
    case 'CannonBall':  // Changed from SonarPulse
      this.activateCannonBall();
      break;
  }
}

  activatePowerupForAI(powerupType) {
  switch(powerupType) {
    case 'BlackBox':
      // AI adds extra jet to their sky layer
      this.aiAddExtraJet();
      break;
    case 'KryptonLaser':
      // AI will use laser attack on next turn
      this.gameState.aiPendingPowerup = 'KryptonLaser';
      this.ui.updateCommentary("AI will use Krypton Laser on its next attack!");
      break;
    case 'CannonBall':  // Changed from SonarPulse
      // AI uses cannon ball on sea layer
      this.aiUseCannonBall();
      break;
  }
  
  // Continue game - AI's turn is over
  if (this.gameState.gameMode === 'ai') {
    // Player's turn
  }
}
  
aiAddExtraJet() {
  // Find an empty spot in sky layer
  const skyLayer = 'Sky';
  const emptySpots = [];
  
  for (let i = 0; i < this.gameState.boards.opponent[skyLayer].length; i++) {
    if (this.gameState.boards.opponent[skyLayer][i] === null) {
      emptySpots.push(i);
    }
  }
  
  if (emptySpots.length > 0) {
    // Select random empty spot
    const position = emptySpots[Math.floor(Math.random() * emptySpots.length)];
    this.gameState.boards.opponent[skyLayer][position] = 'ExtraJet';
    
    // Add to opponent ships
    if (!this.gameState.ships.opponent['ExtraJet']) {
      this.gameState.ships.opponent['ExtraJet'] = { 
        positions: [position], 
        hits: [], 
        isSunk: false 
      };
    } else {
      this.gameState.ships.opponent['ExtraJet'].positions.push(position);
    }
    
    this.ui.updateCommentary("AI added an extra jet to their sky layer!");
  }
}

aiUseCannonBall() {
  // AI targets a 2×2 area on the sea layer
  const moveInfo = this.ai.calculateMove(this.gameState.boards.player);
  let targetPosition = moveInfo && moveInfo.layer === 'Sea' 
    ? moveInfo.index 
    : Math.floor(Math.random() * 16); // Random position if no good sea move
  
  // Find a good spot for 2×2 attack (ensure it fits on board)
  const boardSize = GAME_CONSTANTS.BOARD_SIZE;
  const row = Math.floor(targetPosition / boardSize);
  const col = targetPosition % boardSize;
  
  // Make sure we don't exceed board boundaries
  const adjustedRow = row + 1 < boardSize ? row : row - 1;
  const adjustedCol = col + 1 < boardSize ? col : col - 1;
  
  // Attack 2×2 area
  let hitCount = 0;
  
  for (let r = adjustedRow; r < adjustedRow + 2; r++) {
    for (let c = adjustedCol; c < adjustedCol + 2; c++) {
      const attackIndex = r * boardSize + c;
      
      // Skip if already attacked
      if (this.ai.attackedPositions.Sea.has(attackIndex)) {
        continue;
      }
      
      const result = this.gameState.processAttack('playerSeaBoard', attackIndex, 'Sea');
      
      // Update AI's knowledge
      if (result.hit) {
        this.ai.recordHit('Sea', attackIndex);
        hitCount++;
      } else {
        this.ai.recordMiss('Sea', attackIndex);
      }
      
      // Update the board
      this.ui.updateBoard({
        boardId: 'playerSeaBoard',
        index: attackIndex,
        hit: result.hit,
        sunk: result.sunk,
        shipType: result.shipType
      });
    }
  }
  
  this.ui.updateCommentary(`AI used Cannon Ball on your Sea layer, hitting ${hitCount} targets!`);
}

  createGameBoards() {
    const boards = GAME_CONSTANTS.LAYERS.map(layer => ({ id: layer, name: layer }));
    const playerBoardContainer = document.querySelector('.player-boards .boards-wrapper');
    const opponentBoardContainer = document.querySelector('.opponent-boards .boards-wrapper');
    playerBoardContainer.innerHTML = '';
    opponentBoardContainer.innerHTML = '';

    // Layer label names
    const layerNames = {
      'Space': 'SPACE',
      'Sky': 'SKY',
      'Sea': 'SEA',
      'Sub': 'UNDERWATER'
    };

    boards.forEach(board => {
      // Create player board section with label
      const pBoardSection = document.createElement('div');
      pBoardSection.className = 'board-section';

      const pLayerLabel = document.createElement('div');
      pLayerLabel.className = 'layer-label';
      pLayerLabel.textContent = layerNames[board.id];
      pBoardSection.appendChild(pLayerLabel);

      const pBoard = document.createElement('div');
      pBoard.className = 'board';
      pBoard.id = `player${board.id}Board`;
      pBoard.dataset.layer = board.id;
      for (let i = 0; i < GAME_CONSTANTS.BOARD_SIZE ** 2; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;
        cell.dataset.layer = board.id;

        // Add hover event listeners to each cell
        cell.addEventListener('mouseover', (e) => {
          if (this.gameState.phase === 'setup') {
            this.ui.handleBoardMouseMove(pBoard, cell);
          }
        });

        cell.addEventListener('mouseleave', () => {
          if (this.gameState.phase === 'setup') {
            pBoard.querySelectorAll('.cell').forEach(c => {
              c.classList.remove('valid-placement', 'invalid-placement');
            });
          }
        });

        pBoard.appendChild(cell);
      }
      pBoardSection.appendChild(pBoard);
      playerBoardContainer.appendChild(pBoardSection);

      // Create opponent board section with label
      const oBoardSection = document.createElement('div');
      oBoardSection.className = 'board-section';

      const oLayerLabel = document.createElement('div');
      oLayerLabel.className = 'layer-label';
      oLayerLabel.textContent = layerNames[board.id];
      oBoardSection.appendChild(oLayerLabel);

      const oBoard = document.createElement('div');
      oBoard.className = 'board';
      oBoard.id = `opponent${board.id}Board`;
      oBoard.dataset.layer = board.id;
      for (let i = 0; i < GAME_CONSTANTS.BOARD_SIZE ** 2; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;
        cell.dataset.layer = board.id;

        // Add hover event listeners to each cell
        cell.addEventListener('mouseover', (e) => {
          if (this.gameState.phase === 'setup') {
            this.ui.handleBoardMouseMove(oBoard, cell);
          }
        });

        cell.addEventListener('mouseleave', () => {
          if (this.gameState.phase === 'setup') {
            oBoard.querySelectorAll('.cell').forEach(c => {
              c.classList.remove('valid-placement', 'invalid-placement');
            });
          }
        });

        oBoard.appendChild(cell);
      }
      oBoardSection.appendChild(oBoard);
      opponentBoardContainer.appendChild(oBoardSection);
    });

    // Add click listeners to cells
    document.querySelectorAll('.cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        if (this.gameState.phase === 'setup') {
          const boardId = e.target.closest('.board').id;
          if (this.gameState.gameMode === 'ai' && !boardId.includes('player')) return;
          if (this.gameState.gameMode === 'human') {
            if (this.gameState.currentPlayer === 1 && !boardId.includes('player')) return;
            if (this.gameState.currentPlayer === 2 && !boardId.includes('opponent')) return;
          }
          const index = parseInt(e.target.dataset.index);
          const layer = e.target.dataset.layer;
          this.handleShipPlacement(boardId, index, layer);
        } else if (this.gameState.phase === 'combat') {
          this.handleAttack(e);
        }
      });
    });
  }

  setupEventListeners() {
    document.getElementById('playVsAI').addEventListener('click', () => {
      this.sound.initialize();
      this.gameState.gameMode = 'ai';
      document.getElementById('player2Name').textContent = "AI";
      document.getElementById('player2Icon').textContent = "🤖";
      this.startNewGame('ai');
    });
    
    document.getElementById('playVsHuman').addEventListener('click', () => {
      this.sound.initialize();
      this.gameState.gameMode = 'human';
      document.getElementById('player2Name').textContent = "Player 2";
      document.getElementById('player2Icon').textContent = "👤";
      this.startNewGame('human');
    });

    // Online Play Listeners
    document.getElementById('playOnline').addEventListener('click', () => {
      document.getElementById('mainMenuButtons').classList.add('hidden');
      document.getElementById('onlineMenuButtons').classList.remove('hidden');
    });

    document.getElementById('hostGame').addEventListener('click', () => {
      this.sound.initialize();
      this.network.isHost = true;
      const roomCode = this.network.generateRoomCode();

      // Show the room code immediately, don't wait for PeerJS connection
      this.ui.showRoomCode(roomCode);
      document.getElementById('onlineMenuButtons').classList.add('hidden');
      document.getElementById('hostGameDisplay').classList.remove('hidden');

      // Initialize PeerJS with the room code
      this.network.initialize(roomCode);
    });

    document.getElementById('joinGame').addEventListener('click', () => {
      this.sound.initialize();
      this.network.isHost = false;
      document.getElementById('onlineMenuButtons').classList.add('hidden');
      document.getElementById('joinGameInput').classList.remove('hidden');
    });

    document.getElementById('connectBtn').addEventListener('click', () => {
      const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
      if (code) {
        this.network.connect(code);
      } else {
        alert("Please enter a room code");
      }
    });

    document.getElementById('backToMain').addEventListener('click', () => {
      document.getElementById('onlineMenuButtons').classList.add('hidden');
      document.getElementById('mainMenuButtons').classList.remove('hidden');
    });

    document.getElementById('backToOnline').addEventListener('click', () => {
      document.getElementById('joinGameInput').classList.add('hidden');
      document.getElementById('onlineMenuButtons').classList.remove('hidden');
    });

    document.getElementById('cancelHost').addEventListener('click', () => {
      this.network.reset();
      document.getElementById('hostGameDisplay').classList.add('hidden');
      document.getElementById('onlineMenuButtons').classList.remove('hidden');
    });

    // Allow clicking the room code to copy it
    document.getElementById('roomCodeDisplay').addEventListener('click', (e) => {
      const code = e.target.textContent;
      if (code && code !== '...') {
        navigator.clipboard.writeText(code).then(() => {
          this.ui.updateCommentary("Room code copied to clipboard!");
        });
      }
    });
    
    document.getElementById('orientationButton').addEventListener('click', () => this.rotateShip());
    document.getElementById('toggleSound').addEventListener('click', () => this.sound.toggleSound());
    document.getElementById('resetGame').addEventListener('click', () => this.startNewGame('ai'));
    document.getElementById('newGameHuman').addEventListener('click', () => this.startNewGame('human'));
    document.getElementById('undoMove').addEventListener('click', () => this.undoPlacement());
    
    // How to Play buttons
    document.getElementById('howToPlay').addEventListener('click', () => this.showHowToPlay());
    document.getElementById('helpButton').addEventListener('click', () => this.showHowToPlay());
  }

  showHowToPlay() {
    const overlay = document.createElement('div');
    overlay.className = 'how-to-play-overlay';
    overlay.id = 'howToPlayOverlay';
    
    overlay.innerHTML = `
      <div class="how-to-play-content">
        <button class="close-button" id="closeHowToPlay">✕</button>
        
        <h1>🎯 WAR ZONES</h1>
        <p class="subtitle">Multi-Dimensional Naval Combat</p>
        
        <div class="how-to-play-sections">
          
          <section class="htp-section">
            <h2>🌍 The Battlefield</h2>
            <p>War Zones is fought across <strong>four vertical layers</strong>, each representing a different domain of warfare:</p>
            <div class="layers-grid">
              <div class="layer-item">
                <span class="layer-icon">🌌</span>
                <span class="layer-name">SPACE</span>
                <span class="layer-desc">Orbital domain</span>
              </div>
              <div class="layer-item">
                <span class="layer-icon">☁️</span>
                <span class="layer-name">SKY</span>
                <span class="layer-desc">Aerial combat</span>
              </div>
              <div class="layer-item">
                <span class="layer-icon">🌊</span>
                <span class="layer-name">SEA</span>
                <span class="layer-desc">Surface warfare</span>
              </div>
              <div class="layer-item">
                <span class="layer-icon">🔵</span>
                <span class="layer-name">SUB</span>
                <span class="layer-desc">Underwater ops</span>
              </div>
            </div>
          </section>
          
          <section class="htp-section">
            <h2>🚢 Your Fleet</h2>
            <p>Place these <strong>5 ships</strong> across the battlefield layers:</p>
            <div class="ships-grid">
              <div class="ship-item">
                <span class="ship-icon">👽</span>
                <div class="ship-info">
                  <span class="ship-name">Spacecraft</span>
                  <span class="ship-details">2×2 square • Space Layer</span>
                </div>
              </div>
              <div class="ship-item">
                <span class="ship-icon">✈️</span>
                <div class="ship-info">
                  <span class="ship-name">Fighter Jet</span>
                  <span class="ship-details">1 cell • Sky Layer</span>
                </div>
              </div>
              <div class="ship-item">
                <span class="ship-icon">🚢</span>
                <div class="ship-info">
                  <span class="ship-name">Battleship</span>
                  <span class="ship-details">3 cells in a line • Sea Layer</span>
                </div>
              </div>
              <div class="ship-item">
                <span class="ship-icon">🚢</span>
                <div class="ship-info">
                  <span class="ship-name">Cruiser</span>
                  <span class="ship-details">2 cells in a line • Sea Layer</span>
                </div>
              </div>
              <div class="ship-item">
                <span class="ship-icon">⚓</span>
                <div class="ship-info">
                  <span class="ship-name">Submarine</span>
                  <span class="ship-details">2 cells in a line • Sub Layer</span>
                </div>
              </div>
            </div>
            <p class="tip">💡 Press <kbd>R</kbd> to rotate ships during placement</p>
          </section>
          
          <section class="htp-section">
            <h2>⚔️ Combat Rules</h2>
            <div class="rules-list">
              <div class="rule-item">
                <span class="rule-icon">🎯</span>
                <span>Click on opponent's grid cells to attack</span>
              </div>
              <div class="rule-item">
                <span class="rule-icon">🔥</span>
                <span><strong>HIT?</strong> Attack again! Keep firing until you miss</span>
              </div>
              <div class="rule-item">
                <span class="rule-icon">💨</span>
                <span><strong>MISS?</strong> Turn passes to your opponent</span>
              </div>
              <div class="rule-item">
                <span class="rule-icon">💀</span>
                <span>Destroy all enemy ships to win!</span>
              </div>
            </div>
          </section>
          
          <section class="htp-section treasure-section">
            <h2>💎 Treasure Chests</h2>
            <p>Hidden in the <strong>Sub layer</strong> is a treasure chest! Find your opponent's treasure to unlock a powerful ability:</p>
            <div class="powerups-grid">
              <div class="powerup-item">
                <span class="powerup-icon">✈️</span>
                <div class="powerup-info">
                  <span class="powerup-name">BLACK BOX</span>
                  <span class="powerup-desc">Deploy an extra fighter jet to your Sky layer</span>
                </div>
              </div>
              <div class="powerup-item">
                <span class="powerup-icon">🔫</span>
                <div class="powerup-info">
                  <span class="powerup-name">KRYPTON LASER</span>
                  <span class="powerup-desc">Strike one position across ALL four layers simultaneously</span>
                </div>
              </div>
              <div class="powerup-item">
                <span class="powerup-icon">💣</span>
                <div class="powerup-info">
                  <span class="powerup-name">CANNON BALL</span>
                  <span class="powerup-desc">Bombard a 2×2 area on the Sea layer</span>
                </div>
              </div>
            </div>
          </section>
          
        </div>
        
        <button class="got-it-button" id="gotItButton">Got it!</button>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Close button handlers
    const closeOverlay = () => overlay.remove();
    document.getElementById('closeHowToPlay').addEventListener('click', closeOverlay);
    document.getElementById('gotItButton').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });
  }

// Fix 3: Modify startNewGame to clear all AI timeouts
startNewGame(mode) {
    // Clear all AI turn timeouts
    this.aiTurnTimeouts.forEach(timeout => clearTimeout(timeout));
    this.aiTurnTimeouts = [];
    
    // Reset turn processing flag
    this.isProcessingTurn = false;
    
    this.ui.hideMainMenu();
    this.gameState.reset();
    this.ai.reset(); // Reset AI's targeting state
    
    // Reset UI state
    document.querySelector('.player-boards').classList.add('active');
    document.querySelector('.opponent-boards').classList.remove('active');
    document.querySelectorAll('.player-score')[0].classList.add('active');
    document.querySelectorAll('.player-score')[1].classList.remove('active');
    
    if (mode === 'human') {
      this.gameState.gameMode = 'human';
      this.gameState.currentPlayer = 1;
      document.querySelector('.player-boards').style.display = 'block';
      document.querySelector('.opponent-boards').style.display = 'block';
      document.getElementById('undoMove').style.display = 'inline-block';
      // Update title for player 2's board
      document.getElementById('opponentTitle').textContent = "Player 2";
      this.uiUpdateForHumanPlacement();
    } else if (mode === 'online') {
      this.gameState.gameMode = 'online';
      this.gameState.currentPlayer = 1; // Local player is always 1 during setup
      document.querySelector('.player-boards').style.display = 'block';
      document.querySelector('.opponent-boards').style.display = 'block';
      document.getElementById('undoMove').style.display = 'inline-block';
      document.getElementById('opponentTitle').textContent = "Opponent";
      document.getElementById('player2Name').textContent = "Opponent";
      document.getElementById('player2Icon').textContent = "👤";
      
      // In online mode, we just set up our own ships first
      this.uiUpdateForOnlinePlacement();
    } else {
      this.gameState.gameMode = 'ai';
      document.querySelector('.player-boards').style.display = 'block';
      document.querySelector('.opponent-boards').style.display = 'none';
      document.getElementById('undoMove').style.display = 'inline-block';
      // Update title for AI's board
      document.getElementById('opponentTitle').textContent = "AI";
    }
    
    this.ui.clearBoards();
    this.createGameBoards();
    this.sound.playSound('gameStart');
    this.ui.updateScoreBoard();
    
    const message = mode === 'ai' 
      ? 'Place your ships on your board.'
      : 'Player One: Place your ships on your board.';
    
    this.ui.updateGameInfo(message);
    this.ui.updateCommentary(message);
    this.ui.highlightPlacementBoard();

    this.animateCommentaryBox();
    this.startGameTimer();
  }

  animateCommentaryBox() {
    const commentaryBox = document.getElementById('commentaryBox');
    commentaryBox.classList.add('highlight');
    setTimeout(() => {
      commentaryBox.classList.remove('highlight');
    }, 1000);
  }

  uiUpdateForOnlinePlacement() {
    this.ui.hideShips('opponent');
    this.ui.showShips('player');
  }

  onPeerConnected(isHost) {
    this.ui.hideMainMenu();
    this.startNewGame('online');
    this.gameState.myPlayerId = isHost ? 1 : 2;
    this.gameState.currentTurn = 1; // Host always starts
    this.ui.updateCommentary(isHost ? "Opponent connected! Place your ships." : "Connected to host! Place your ships.");
  }

  handlePeerData(data) {
    console.log('Processing peer data:', data);
    switch(data.type) {
      case 'SHIPS_READY':
        this.gameState.opponentReady = true;
        this.loadOpponentShips(data.ships);
        
        if (this.gameState.isPlacementComplete()) {
           this.startOnlineCombat();
        } else {
           this.ui.updateCommentary("Opponent is ready. Finish placing your ships!");
        }
        break;
      case 'ATTACK':
        this.handleIncomingAttack(data);
        break;
      case 'ATTACK_RESULT':
        this.handleAttackResult(data);
        break;
    }
  }

  loadOpponentShips(shipsData) {
      this.gameState.ships.opponent = shipsData;
      // Reconstruct board grid from ships for opponent (so we can check hits later if needed, though we rely on them mostly)
      // Actually, we should probably trust the result they send back, but keeping state synced is good.
      // However, we CANNOT put the ships on the board visibly.
      
      this.gameState.boards.opponent = this.gameState.createEmptyBoards();
      
      Object.entries(shipsData).forEach(([shipName, ship]) => {
         const layer = GAME_CONSTANTS.SHIPS[shipName].layer;
         ship.positions.forEach(pos => {
             this.gameState.boards.opponent[layer][pos] = shipName;
         });
      });
  }

  startOnlineCombat() {
      this.gameState.phase = 'combat';
      this.ui.updateGameInfo('Combat phase - Game Started!');
      
      // Place treasure chest on my board (opponent has their own)
      this.gameState.placeTreasureChests();
      
      const isMyTurn = this.gameState.currentTurn === this.gameState.myPlayerId;
      this.ui.updateCommentary(isMyTurn ? "Your Turn! Attack!" : "Opponent's Turn - Wait...");
      
      // Clear placement highlights
      document.querySelectorAll('.board-section.placement-active').forEach(section => {
        section.classList.remove('placement-active');
      });
  }

  handleIncomingAttack(data) {
    // Opponent attacked me
    const { index, layer } = data;
    const boardId = `player${layer}Board`;
    
    // Process attack on my board
    const result = this.gameState.processAttack(boardId, index, layer);
    
    // Update my UI
    this.ui.updateBoard(result);
    this.sound.playSound(result.hit ? 'hit' : 'miss');
    if (result.sunk) this.sound.playSound('sunk');
    
    // Send result back - only switch turn if they missed (like AI mode)
    this.network.send({
      type: 'ATTACK_RESULT',
      result: result,
      turnChange: !result.hit // Only switch turn on miss
    });
    
    // Check game over
    if (result.gameOver.isOver) {
       // I lost - opponent destroyed all my ships
       this.gameState.phase = 'gameOver';
       this.isProcessingTurn = false;
       // Adjust winner for online mode display
       const gameOverResult = {
         ...result.gameOver,
         winner: 'opponent', // Opponent won
         mode: 'online'
       };
       this.ui.showGameOver(gameOverResult);
    } else if (!result.hit) {
       // Only switch turn to me if opponent missed
       this.gameState.currentTurn = this.gameState.myPlayerId;
       this.ui.updateCommentary("Your Turn! Attack!");
    } else {
       // Opponent hit, they get another turn
       this.ui.updateCommentary(result.treasure ? "Opponent found a treasure!" : "Opponent hit! They attack again...");
    }
  }

  handleAttackResult(data) {
    // I attacked, here is the result
    const result = data.result;
    
    // Track my hit locally
    if (result.hit) {
      this.gameState.shots.player.hits++;
    }
    
    // Use updateBoard but map boardId to opponent
    result.boardId = result.boardId.replace('player', 'opponent'); // Transform ID
    
    this.ui.updateBoard(result);
    this.sound.playSound(result.hit ? 'hit' : 'miss');
    if (result.sunk) this.sound.playSound('sunk');
    
    if (result.gameOver.isOver) {
       // I won - I destroyed all opponent's ships
       this.gameState.phase = 'gameOver';
       this.isProcessingTurn = false;
       // Adjust winner for online mode display
       const gameOverResult = {
         ...result.gameOver,
         winner: 'player', // I won
         mode: 'online'
       };
       this.ui.showGameOver(gameOverResult);
    } else if (result.treasure) {
       // I found a treasure chest! Show powerup menu
       this.ui.updateCommentary("You found a treasure chest!");
       this.animateCommentaryBox();
       this.ui.showTreasureMenu();
       // Turn stays with me after selecting powerup
    } else if (result.hit) {
       // I hit, I get another turn (like AI mode)
       this.ui.updateCommentary(result.sunk ? `You sunk their ${result.shipType}! Attack again!` : "Hit! Attack again!");
       this.animateCommentaryBox();
       // currentTurn stays as myPlayerId
    } else {
       // I missed, switch turn to opponent
       this.gameState.currentTurn = this.gameState.myPlayerId === 1 ? 2 : 1;
       this.ui.updateCommentary("You missed! Opponent's Turn - Wait...");
    }
  }

  handleShipPlacement(boardId, index, layer) {
    if (this.gameState.phase !== 'setup') return;
    const result = this.gameState.placeShip(boardId, index, layer);
    
    if (result.success) {
      this.sound.playSound('place');
      document.querySelectorAll(`#${boardId} .cell`).forEach(cell => {
        cell.classList.remove('valid-placement', 'invalid-placement');
      });
      
      result.positions.forEach(pos => {
        const cell = document.querySelector(`#${boardId} .cell[data-index="${pos}"]`);
        if (cell) {
          cell.classList.add('ship');
          cell.textContent = GAME_CONSTANTS.SHIPS[result.shipType].symbol;
        }
      });
      
      // Update the commentary
      const nextShip = this.gameState.getCurrentShip();
      if (nextShip) {
        const player = this.gameState.gameMode === 'human'
          ? `Player ${this.gameState.currentPlayer}: `
          : '';
        this.ui.updateCommentary(`${player}Place your ${nextShip}`);
        this.ui.highlightPlacementBoard();
      }
      
      if (this.gameState.isPlacementComplete()) {
        // Hide undo button
        document.getElementById('undoMove').style.display = 'none';
        
        if (this.gameState.gameMode === 'online') {
           this.ui.updateCommentary("Waiting for opponent...");
           // Send ships to opponent
           this.network.send({
             type: 'SHIPS_READY',
             ships: this.gameState.ships.player
           });
           
           if (this.gameState.opponentReady) {
              this.startOnlineCombat();
           }
           return;
        }
        
        setTimeout(() => {
          if (this.gameState.gameMode === 'human') {
            if (this.gameState.currentPlayer === 1) {
              // Switch to player 2 setup
              this.ui.hideShips('player');
              this.gameState.currentShipIndex = 0;
              this.gameState.phase = 'setup';
              this.gameState.currentPlayer = 2;
              
              // Update UI for player 2
              document.querySelector('.player-boards').classList.remove('active');
              document.querySelector('.opponent-boards').classList.add('active');
              document.querySelectorAll('.player-score')[0].classList.remove('active');
              document.querySelectorAll('.player-score')[1].classList.add('active');
              
              // Update commentary for player two's setup
              this.ui.updateCommentary(`Player Two: Place your ${this.gameState.getCurrentShip()} on your board.`);
              this.ui.updateGameInfo(`Player Two: Place your ships on your board.`);
              this.ui.highlightPlacementBoard();
              this.animateCommentaryBox();
              
              document.getElementById('undoMove').style.display = 'inline-block';
            } else {
              // Both players have placed ships, start combat
              this.ui.hideShips('player');
              this.ui.hideShips('opponent');
              this.startCombatPhase();
              
              // Update UI for combat
              document.querySelector('.player-boards').classList.add('active');
              document.querySelector('.opponent-boards').classList.remove('active');
              document.querySelectorAll('.player-score')[0].classList.add('active');
              document.querySelectorAll('.player-score')[1].classList.remove('active');
              
              // Update commentary for combat
              this.ui.updateCommentary('Combat phase - Player 1, attack your opponent\'s board!');
              this.animateCommentaryBox();
            }
          } else {
            // AI game - player has placed all ships
            this.startCombatPhase();
            this.ui.updateCommentary('Combat phase - Attack your opponent\'s board!');
            this.animateCommentaryBox();
          }
        }, 500);
      }
    }
  }

startCombatPhase() {
  this.gameState.phase = 'combat';
  this.gameState.currentPlayer = 1; // Always start with player 1 in combat

  // Clear placement highlights
  document.querySelectorAll('.board-section.placement-active').forEach(section => {
    section.classList.remove('placement-active');
  });

  if (this.gameState.gameMode === 'ai') {
    const opponentBoards = document.querySelector('.opponent-boards');
    opponentBoards.style.display = 'block';

    this.gameState.ships.opponent = this.gameState.createInitialShips();
    this.gameState.boards.opponent = this.gameState.createEmptyBoards();
    this.placeAIShips();

    // Force CSS animations to restart on opponent boards after showing
    // Animations on ::before elements don't always restart after display:none
    // Do this after a brief delay to ensure boards are fully rendered
    setTimeout(() => {
      document.querySelectorAll('.opponent-boards .board').forEach(board => {
        // Trigger reflow by cloning and replacing the element
        const clone = board.cloneNode(true);
        board.parentNode.replaceChild(clone, board);
      });

      // Re-attach click listeners after cloning
      document.querySelectorAll('.opponent-boards .cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
          if (this.gameState.phase === 'combat') {
            this.handleAttack(e);
          }
        });
      });
    }, 100);
  }
  
  // Place treasure chests AFTER AI ships are placed
  this.gameState.placeTreasureChests();
  
  this.ui.updateGameInfo('Combat phase - Attack your opponent\'s board!');
}

  placeAIShips() {
    Object.keys(GAME_CONSTANTS.SHIPS).forEach(shipType => {
      const shipConfig = GAME_CONSTANTS.SHIPS[shipType];
      let placed = false;
      let attempts = 0;
      const maxAttempts = 100;
      
      while (!placed && attempts < maxAttempts) {
        const layer = shipConfig.layer;
        const index = Math.floor(Math.random() * (GAME_CONSTANTS.BOARD_SIZE ** 2));
        this.gameState.currentShipRotation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
        const positions = this.gameState.calculateShipPositions(index, shipType);
        
        if (positions.length > 0 && positions.every(pos => !this.gameState.boards.opponent[layer][pos])) {
          positions.forEach(pos => {
            this.gameState.boards.opponent[layer][pos] = shipType;
          });
          this.gameState.ships.opponent[shipType].positions = positions;
          placed = true;
        }
        attempts++;
      }
      
      if (!placed) {
        console.error(`Failed to place AI ship: ${shipType}`);
      }
    });
  }

  rotateShip() {
    if (this.gameState.phase === 'setup') {
      this.gameState.currentShipRotation = this.gameState.currentShipRotation === 'horizontal' ? 'vertical' : 'horizontal';
      this.sound.playSound('rotate');
      
      // Update the orientation button to show current orientation
      const orientationText = document.querySelector('#orientationButton .button-text');
      orientationText.textContent = `Ship: ${this.gameState.currentShipRotation}`;
    }
  }

  handleAttack(e) {
    // Early exit if not in combat phase or already processing a turn
    if (this.gameState.phase !== 'combat' || this.isProcessingTurn) return;

    // Online mode logic
    if (this.gameState.gameMode === 'online') {
        if (this.gameState.currentTurn !== this.gameState.myPlayerId) {
            this.ui.updateCommentary("It's not your turn!");
            return;
        }
        // Only allow clicking opponent board
        if (!e.target.closest('.opponent-boards')) return;
        
        const index = parseInt(e.target.dataset.index);
        const layer = e.target.closest('.board').dataset.layer;
        
        if (e.target.classList.contains('hit') || e.target.classList.contains('miss')) return;

        // Track my shot locally
        this.gameState.shots.player.total++;
        
        this.network.send({
           type: 'ATTACK',
           index: index,
           layer: layer
        });
        return;
    }
    
    const cell = e.target;
    const boardId = cell.closest('.board').id;
    
    // *** IMPORTANT ADDITION: Don't process normal attacks if a powerup is pending ***
    if (this.gameState.pendingPowerup) {
        console.log("Pending powerup detected, skipping normal attack");
        return;
    }
    
    // Validate correct player is attacking the correct board
    if (this.gameState.gameMode === 'human') {
      // For PvP, player 1 attacks opponent board, player 2 attacks player board
      if (this.gameState.currentPlayer === 1 && !boardId.includes('opponent')) return;
      if (this.gameState.currentPlayer === 2 && !boardId.includes('player')) return;
    } else {
      // For AI game, player only attacks opponent board
      if (!boardId.includes('opponent')) return;
    }
    
    const index = parseInt(cell.dataset.index);
    const layer = cell.dataset.layer;
    
    // Don't allow attacking cells already hit/missed
    if (cell.classList.contains('hit') || cell.classList.contains('miss')) return;

    // Set the turn processing flag to prevent multiple attacks
    this.isProcessingTurn = true;

    const result = this.gameState.processAttack(boardId, index, layer);
    
    // Handle treasure chest discovery
    if (result.treasure) {
    this.sound.playSound('hit');
    this.ui.updateBoard({
      boardId: result.boardId,
      index: result.index,
      hit: true,
      treasure: true
    });

    if (boardId.includes('opponent')) {
      // Player found a treasure chest.
      this.ui.updateCommentary("You found a treasure chest!");
      this.animateCommentaryBox();
      this.ui.showTreasureMenu();
      this.isProcessingTurn = false; // Let the player choose a power-up.
    } else {
      // AI found a treasure chest.
      this.ui.updateCommentary("AI found a treasure chest!");
      this.animateCommentaryBox();
      setTimeout(() => {
        this.handleAIPowerupSelection();
        // After AI selects its power-up, continue its turn:
        setTimeout(() => {
          if (this.gameState.phase !== 'gameOver') {
            this.handleAITurn();
          }
        }, 1500);
        this.isProcessingTurn = false;
      }, 1500);
    }
    return;
  }
    
    this.sound.playSound(result.hit ? 'hit' : 'miss');
    this.ui.updateBoard(result);

    // Update commentary with ship-specific messaging
    if (result.hit) {
      if (result.sunk) {
        // Ship destroyed message
        if (this.gameState.gameMode === 'ai') {
          this.ui.updateCommentary(`You destroyed AI's ${result.shipType}!`);
        } else if (this.gameState.gameMode === 'human') {
          this.ui.updateCommentary(`Player ${this.gameState.currentPlayer} destroyed a ${result.shipType}!`);
        }
      } else {
        // Ship hit message
        if (this.gameState.gameMode === 'ai') {
          this.ui.updateCommentary(`You hit AI's ${result.shipType}! Attack again.`);
        } else if (this.gameState.gameMode === 'human') {
          this.ui.updateCommentary(`Player ${this.gameState.currentPlayer} hit a ${result.shipType}! Attack again.`);
        }
      }
      this.animateCommentaryBox();
    } else {
      // Miss message
      if (this.gameState.gameMode === 'ai') {
        this.ui.updateCommentary("You missed! AI's turn.");
      } else if (this.gameState.gameMode === 'human') {
        this.ui.updateCommentary(`Player ${this.gameState.currentPlayer} missed!`);
      }
    }

    // Handle ship sunk animation
    if (result.sunk) {
      this.sound.playSound('sunk');
      const shipPositions = boardId.includes('player') 
        ? this.gameState.ships.player[result.shipType].positions
        : this.gameState.ships.opponent[result.shipType].positions;
        
      this.animations.playSunkAnimation(shipPositions, boardId);
    }
    
    // Check for game over
    if (result.gameOver.isOver) {
      this.sound.playSound(result.gameOver.winner === 'player' ? 'victory' : 'defeat');
      
      if (result.gameOver.winner === 'player') {
        if (this.gameState.gameMode === 'human') {
          // In PvP, the current player is the winner
          if (this.gameState.currentPlayer === 1) {
            this.playerWins++;
          } else {
            this.aiWins++; // Player 2 wins are tracked in aiWins variable
          }
        } else {
          // In AI game, player wins
          this.playerWins++;
        }
      } else {
        // AI or Player 2 wins
        this.aiWins++;
      }
      
      this.ui.updateScoreBoard();
      
      // Set game state to gameOver to prevent further moves
      this.gameState.phase = 'gameOver';
      this.isProcessingTurn = false;
      
      this.ui.showGameOver(result.gameOver);
      return;
    }
    
    // Handle turn switching
    if (this.gameState.gameMode === 'ai') {
      if (!result.hit) {
        // If player misses, AI gets a turn
        this.handleAITurn();
        // Note: isProcessingTurn will be reset at the end of AI's turn
      } else {
        // If player hits, they get another turn - reset processing flag
        this.isProcessingTurn = false;
        this.ui.updateGameInfo(`Hit! Attack again!`);
      }
    } else if (this.gameState.gameMode === 'human') {
      if (!result.hit) {
        // Switch players on miss
        this.gameState.currentPlayer = this.gameState.currentPlayer === 1 ? 2 : 1;
        
        // Update UI to show current player
        this.updateUIForPlayerTurn();
        
        this.ui.updateGameInfo(`Miss! It's Player ${this.gameState.currentPlayer}'s turn.`);
      } else {
        // Continue turn on hit in PvP mode
        this.ui.updateGameInfo(`Hit! Player ${this.gameState.currentPlayer}, attack again!`);
      }
      
      // Reset the processing flag for human vs human mode
      this.isProcessingTurn = false;
    }
  }
  
  updateUIForPlayerTurn() {
    if (this.gameState.currentPlayer === 1) {
      document.querySelector('.player-boards').classList.add('active');
      document.querySelector('.opponent-boards').classList.remove('active');
      document.querySelectorAll('.player-score')[0].classList.add('active');
      document.querySelectorAll('.player-score')[1].classList.remove('active');
    } else {
      document.querySelector('.player-boards').classList.remove('active');
      document.querySelector('.opponent-boards').classList.add('active');
      document.querySelectorAll('.player-score')[0].classList.remove('active');
      document.querySelectorAll('.player-score')[1].classList.add('active');
    }
  }
  
handleAITurn() {
    // Clear any existing AI timeouts first to prevent multiple AI turns
    this.aiTurnTimeouts.forEach(timeout => clearTimeout(timeout));
    this.aiTurnTimeouts = [];
    
    // Ensure isProcessingTurn is true during AI's turn
    this.isProcessingTurn = true;
    
    const timeout = setTimeout(() => {
      // Exit early if game is already over
      if (this.gameState.phase === 'gameOver') {
        this.isProcessingTurn = false;
        return;
      }
      
      // Get AI move with improved targeting logic
      const aiMove = this.ai.calculateMove(this.gameState.boards.player);
      
      if (!aiMove) {
        console.log("AI could not determine a valid move.");
        this.isProcessingTurn = false;
        return;
      }
      
      const layer = aiMove.layer;
      const boardId = `player${layer}Board`;
      const aiResult = this.gameState.processAttack(boardId, aiMove.index, layer);
      
      // Handle treasure find by AI
      if (aiResult.treasure) {
        this.sound.playSound('hit');
        this.ui.updateBoard({
          boardId: aiResult.boardId,
          index: aiResult.index,
          hit: true,
          treasure: true
        });
        
        this.ui.updateCommentary("AI found a treasure chest!");
        this.animateCommentaryBox();
        
        // AI selects a power-up based on game state
        setTimeout(() => {
          this.handleAIPowerupSelection();
          // AI's turn ends after selecting powerup
          this.isProcessingTurn = false;
        }, 1500);
        
        return;
      }
      
      // Update AI's memory of the move
      if (aiResult.hit) {
        this.ai.recordHit(layer, aiMove.index);
        
        if (aiResult.sunk) {
          this.ui.updateCommentary(`AI destroyed your ${aiResult.shipType}!`);
        } else {
          this.ui.updateCommentary(`AI hit your ${aiResult.shipType}!`);
        }
        this.animateCommentaryBox();
      } else {
        this.ai.recordMiss(layer, aiMove.index);
        this.ui.updateCommentary("AI missed! Your turn.");
      }
      
      // Update board with AI move
      this.ui.updateBoard({
        boardId,
        index: aiMove.index,
        hit: aiResult.hit,
        sunk: aiResult.sunk,
        shipType: aiResult.shipType
      });
      
      this.sound.playSound(aiResult.hit ? 'hit' : 'miss');
      this.ui.updateScoreBoard();
      
      // Handle ship sunk animation
      if (aiResult.sunk) {
        this.sound.playSound('sunk');
        this.animations.playSunkAnimation(
          this.gameState.ships.player[aiResult.shipType].positions,
          boardId
        );
      }
      
      // Check for game over
      if (aiResult.gameOver.isOver) {
        this.sound.playSound(aiResult.gameOver.winner === 'player' ? 'victory' : 'defeat');
        
        if (aiResult.gameOver.winner === 'player') {
          this.playerWins++;
        } else {
          this.aiWins++;
        }
        
        this.ui.updateScoreBoard();
        
        // Set game state to gameOver to prevent further moves
        this.gameState.phase = 'gameOver';
        
        this.ui.showGameOver(aiResult.gameOver);
        this.isProcessingTurn = false;
        return;
      }
      
      // AI gets another turn if it hits, otherwise reset the processing flag
      if (aiResult.hit) {
        this.handleAITurn();
        // Note: isProcessingTurn remains true and will be reset after the recursive AI turn
      } else {
        // AI's turn is over, reset the processing flag
        this.isProcessingTurn = false;
      }
    }, 1000);
    
    // Store the timeout ID so we can clear it if needed
    this.aiTurnTimeouts.push(timeout);
  }
  
  uiUpdateForHumanPlacement() {
    this.gameState.currentShipIndex = 0;
    this.gameState.currentPlayer = 1;
    this.ui.updateGameInfo('Player One: Place your ships on your board.');
  }

  undoPlacement() {
    if (this.gameState.phase !== 'setup') return;
    
    const result = this.gameState.undoLastMove();
    if (result) {
      this.sound.playSound('undo');
      
      // Clear and recreate board
      this.ui.clearBoards();
      this.createGameBoards();
      
      // Redisplay ships that should still be visible
      const side = this.gameState.gameMode === 'human'
        ? (this.gameState.currentPlayer === 1 ? 'player' : 'opponent')
        : 'player';
      
      this.ui.redisplayShips(side);
      
      // Update commentary for current ship
      const shipType = this.gameState.getCurrentShip();
      const player = this.gameState.gameMode === 'human'
        ? `Player ${this.gameState.currentPlayer}: `
        : '';

      this.ui.updateCommentary(`${player}Place your ${shipType}`);
      this.ui.highlightPlacementBoard();
      this.ui.updateScoreBoard();
    }
  }

  startGameTimer() {
    clearInterval(this.gameTimerInterval);
    this.gameState.startTime = Date.now();
    
    this.gameTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.gameState.startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      document.getElementById('gameTimer').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
  }

  loadSavedGame() {
    const savedState = localStorage.getItem('warZonesGameState');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        this.gameState.loadState(state);
      } catch (error) {
        console.error('Error loading saved game:', error);
      }
    }
  }
}

/* --- Sound Manager --- */
class SoundManager {
  constructor() {
    this.sounds = {};
    this.isMuted = false;
    this.audioContext = null;
    this.isInitialized = false;
  }
  
  initialize() {
    if (this.isInitialized) return;
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio API not supported');
    }
  }
  
  playSound(soundName) {
    if (!this.isInitialized) {
      this.initialize();
    }
    
    if (!this.audioContext || this.isMuted) return;
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Different sound profiles for different game actions
      switch(soundName) {
        case 'hit': 
          oscillator.frequency.value = 500;
          gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5);
          break;
        case 'miss': 
          oscillator.frequency.value = 200;
          gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);
          break;
        case 'sunk': 
          oscillator.frequency.value = 150;
          gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.8);
          break;
        case 'victory':
          this.playVictorySound();
          return;
        case 'gameStart':
          this.playGameStartSound();
          return;
        default: 
          oscillator.frequency.value = 400;
          gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5);
      }
      
      oscillator.start();
      setTimeout(() => oscillator.stop(), 500);
    } catch (e) {
      console.warn('Error playing sound:', e);
    }
  }
  
  playVictorySound() {
    if (!this.audioContext || this.isMuted) return;
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Victory fanfare
      oscillator.frequency.value = 440;
      gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
      oscillator.start();
      
      setTimeout(() => {
        oscillator.frequency.value = 554;
      }, 200);
      
      setTimeout(() => {
        oscillator.frequency.value = 659;
      }, 400);
      
      setTimeout(() => {
        oscillator.frequency.value = 880;
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 1);
      }, 600);
      
      setTimeout(() => oscillator.stop(), 1500);
    } catch (e) {
      console.warn('Error playing victory sound:', e);
    }
  }
  
  playGameStartSound() {
    if (!this.audioContext || this.isMuted) return;
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Game start sound
      oscillator.frequency.value = 330;
      gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
      oscillator.start();
      
      setTimeout(() => {
        oscillator.frequency.value = 440;
      }, 150);
      
      setTimeout(() => {
        oscillator.frequency.value = 550;
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5);
      }, 300);
      
      setTimeout(() => oscillator.stop(), 800);
    } catch (e) {
      console.warn('Error playing game start sound:', e);
    }
  }
  
  toggleSound() {
    this.isMuted = !this.isMuted;
    document.getElementById('toggleSound').textContent = this.isMuted ? '🔇' : '🔊';
  }
}

/* --- Animation Manager --- */
class AnimationManager {
  playPlacementAnimation(positions, boardId) {
    positions.forEach(pos => {
      const cell = document.querySelector(`#${boardId} .cell[data-index="${pos}"]`);
      if (cell) {
        cell.style.animation = 'placeShip 0.3s ease-out';
        setTimeout(() => cell.style.animation = '', 300);
      }
    });
  }
  
  playAttackAnimation(result) {
    const cell = document.querySelector(`#${result.boardId} .cell[data-index="${result.index}"]`);
    if (!cell) return;
    
    if (result.hit) {
      this.playHitAnimation(cell);
    } else {
      this.playMissAnimation(cell);
    }
  }
  
  playHitAnimation(cell) {
    cell.style.animation = 'hitEffect 0.5s ease-out';
    setTimeout(() => cell.style.animation = '', 500);
  }
  
  playMissAnimation(cell) {
    cell.style.animation = 'missEffect 0.5s ease-out';
    setTimeout(() => cell.style.animation = '', 500);
  }
  
  playSunkAnimation(positions, boardId) {
    positions.forEach(pos => {
      const cell = document.querySelector(`#${boardId} .cell[data-index="${pos}"]`);
      if (cell) {
        cell.classList.add('sunk');
      }
    });
  }
}

/* --- Statistics Manager --- */
class Statistics {
  constructor() {
    this.stats = this.loadStats();
  }
  
  loadStats() {
    const savedStats = localStorage.getItem('warZonesStats');
    return savedStats ? JSON.parse(savedStats) : {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      hitAccuracy: 0,
      totalShots: 0,
      hits: 0,
      quickestWin: Infinity,
      timePlayed: 0
    };
  }
  
  updateStats(gameResult) {
    this.stats.gamesPlayed++;
    
    if (gameResult.winner === 'player') {
      this.stats.wins++;
    } else {
      this.stats.losses++;
    }
    
    this.stats.totalShots += gameResult.shots;
    this.stats.hits += gameResult.hits;
    this.stats.hitAccuracy = ((this.stats.hits / this.stats.totalShots) * 100).toFixed(1);
    
    if (gameResult.winner === 'player' && gameResult.time < this.stats.quickestWin) {
      this.stats.quickestWin = gameResult.time;
    }
    
    this.stats.timePlayed += gameResult.time;
    this.saveStats();
  }
  
  saveStats() {
    localStorage.setItem('warZonesStats', JSON.stringify(this.stats));
  }
}

/* --- Game State Management --- */
class GameState {
  constructor() {
    this.reset();
  }
  
placeTreasureChests() {
  // Clear any existing treasure chests
  this.treasureChests.player = [];
  this.treasureChests.opponent = [];
  
  const subLayer = 'Sub';
  const boardSize = GAME_CONSTANTS.BOARD_SIZE;
  
  // Get all empty cells in player's sub board
  const playerEmptyCells = [];
  for (let i = 0; i < boardSize * boardSize; i++) {
    if (this.boards.player[subLayer][i] === null) {
      playerEmptyCells.push(i);
    }
  }
  
  // Place exactly one treasure chest in player's board if there are empty cells
  if (playerEmptyCells.length > 0) {
    const randomIndex = Math.floor(Math.random() * playerEmptyCells.length);
    const treasurePosition = playerEmptyCells[randomIndex];
    this.boards.player[subLayer][treasurePosition] = 'Treasure';
    this.treasureChests.player.push(treasurePosition);
    console.log(`Treasure chest placed on PLAYER's Sub board at index: ${treasurePosition}`);
  }
  
  // In online mode, don't place treasure on opponent's board - they place their own
  // We'll discover it when we attack and they send back the result
  if (this.gameMode === 'online') return;
  
  // Get all empty cells in opponent's sub board (for AI/local modes)
  const opponentEmptyCells = [];
  for (let i = 0; i < boardSize * boardSize; i++) {
    if (this.boards.opponent[subLayer][i] === null) {
      opponentEmptyCells.push(i);
    }
  }
  
  // Place exactly one treasure chest in opponent's board if there are empty cells
  if (opponentEmptyCells.length > 0) {
    const randomIndex = Math.floor(Math.random() * opponentEmptyCells.length);
    const treasurePosition = opponentEmptyCells[randomIndex];
    this.boards.opponent[subLayer][treasurePosition] = 'Treasure';
    this.treasureChests.opponent.push(treasurePosition);
    console.log(`Treasure chest placed on OPPONENT's Sub board at index: ${treasurePosition}`);
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
      player: [],     // Track positions of player's treasure chests
      opponent: []    // Track positions of opponent's treasure chests
    };
    this.activePowerup = null;
    this.pendingPowerup = null;
    this.aiPendingPowerup = null;
    
    // Online multiplayer state
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
    if (layer !== shipConfig.layer) return false;
    
    const positions = this.calculateShipPositions(index, shipType);
    if (positions.length === 0) {
      return false;
    }
    
    // Check if all positions are empty
    const isPlayer = boardId.includes('player');
    const board = isPlayer ? this.boards.player : this.boards.opponent;
    
    return positions.every(pos => board[layer][pos] === null);
  }
  
  calculateShipPositions(startIndex, shipType) {
    if (!shipType) return [];
    
    const shipConfig = GAME_CONSTANTS.SHIPS[shipType];
    const positions = [];
    const boardSize = GAME_CONSTANTS.BOARD_SIZE;
    const row = Math.floor(startIndex / boardSize);
    const col = startIndex % boardSize;

    if (!shipConfig) return [];

    switch(shipConfig.shape) {
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

      case 'line':
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
    
    // Store ship positions
    shipData.positions = positions;
    
    // Mark board cells with ship type
    const board = isPlayer ? this.boards.player : this.boards.opponent;
    positions.forEach(pos => {
      board[layer][pos] = shipType;
    });
    
    // Record move for undo functionality
    this.moveHistory.push({
      type: 'placement',
      shipType,
      positions,
      layer,
      isPlayer,
      player: this.gameMode === 'human' ? this.currentPlayer : undefined
    });
    
    // Move to next ship
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

    // Special case for treasure chest
    if (cellValue === 'Treasure') {
      targetBoards[layer][index] = "hit";
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
    
    const hit = cellValue !== null && cellValue !== "hit" && cellValue !== "miss";
    let hitShipType = null;
    
    if (hit) {
      hitShipType = cellValue;
      shots.hits++;
      
      const ship = targetShips[hitShipType];
      ship.hits.push(index);
      
      if (ship.hits.length === ship.positions.length) {
        ship.isSunk = true;
      }
      
      targetBoards[layer][index] = "hit";
    } else {
      targetBoards[layer][index] = "miss";
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
      return Object.values(ships).every(ship => 
        ship.positions.length > 0 && ship.isSunk
      );
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
      const shots = lastMove.isPlayerAttacking ? this.shots.player : this.shots.opponent;
      const boards = lastMove.isPlayerAttacking ? this.boards.opponent : this.boards.player;
      
      shots.total--;
      
      if (lastMove.hit) {
        shots.hits--;
        const ships = lastMove.isPlayerAttacking ? this.ships.opponent : this.ships.player;
        const ship = ships[lastMove.shipType];
        
        ship.hits = ship.hits.filter(hit => hit !== lastMove.index);
        ship.isSunk = false;
        
        // Restore the ship type in the cell
        boards[lastMove.layer][lastMove.index] = lastMove.shipType;
      } else {
        // Clear the miss
        boards[lastMove.layer][lastMove.index] = null;
      }
    }
    
    return lastMove;
  }
  
  saveState() {
    return {
      boards: this.boards,
      ships: this.ships,
      shots: this.shots,
      currentShipIndex: this.currentShipIndex,
      phase: this.phase,
      gameMode: this.gameMode,
      moveHistory: this.moveHistory
    };
  }
  
  loadState(state) {
    Object.assign(this, state);
  }
}

/* --- Game AI --- */
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
    
    // Randomize AI "personality"
    this.personality = {
      // How often AI breaks optimal pattern (0-1)
      unpredictability: 0.15 + Math.random() * 0.2,
      // Preference for edges vs center
      edgePreference: Math.random() > 0.5 ? 'edge' : 'center',
      // Does AI sometimes target in clusters
      clusterPreference: Math.random() > 0.7,
      // Random seed for this game
      seed: Math.floor(Math.random() * 1000)
    };
    
    // Probability maps for better initial targeting
    this.probabilityMaps = this.initProbabilityMaps();
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
    
    // Generate new random patterns for next game
    this.skyPattern = this.generateRandomPattern();
    
    // New personality for the AI
    this.personality = {
      unpredictability: 0.15 + Math.random() * 0.2,
      edgePreference: Math.random() > 0.5 ? 'edge' : 'center',
      clusterPreference: Math.random() > 0.7,
      seed: Math.floor(Math.random() * 1000)
    };
    
    // Refresh probability maps for the new game
    this.probabilityMaps = this.initProbabilityMaps();
  }
  
  // Add to GameAI class
recordShipDetection(layer, index) {
  // When sonar detects a ship, update the AI's probability maps
  if (this.probabilityMaps[layer]) {
    this.probabilityMaps[layer][index] += 3;
    
    // Increase probability for adjacent cells
    const row = Math.floor(index / this.boardSize);
    const col = index % this.boardSize;
    
    // Check horizontal and vertical adjacent cells
    const directions = [
      {dr: -1, dc: 0}, // up
      {dr: 1, dc: 0},  // down
      {dr: 0, dc: -1}, // left
      {dr: 0, dc: 1},  // right
    ];
    
    for (const {dr, dc} of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      
      if (this.isValidPosition(newRow, newCol)) {
        const newIndex = newRow * this.boardSize + newCol;
        this.probabilityMaps[layer][newIndex] += 2;
      }
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
    
    // Next priority: attack Sky layer if we haven't found the fighter jet
    // In calculateMove, add this logic before checking other layers
    if (this.layerState.Sky.hits.length > 0 && (!this.layerState.Sky.foundSecondJet || this.layerState.Sky.hits.length < 2)) {
      // Always check for a second jet if we've only found one
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
      Space: this.layerState.Space.hits.length > 0 ? 0 : 1,
      Sky: this.layerState.Sky.hits.length > 0 ? 0 : 1,
      Sea: this.getSeaLayerShipsRemaining(),
      Sub: this.layerState.Sub.hits.length >= 2 ? 0 : 1
    };
    
    // Calculate a score for each layer based on ship density and attacks left
    GAME_CONSTANTS.LAYERS.forEach(layer => {
      if (shipCountRemaining[layer] === 0) {
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
    let shipsRemaining = 2;
    
    // If we're currently hunting a ship, count as 1 ship
    if (this.layerState.Sea.hits.length > 0) {
      shipsRemaining--;
      
      // If a ship is sunk (3 consecutive hits), we've found the Battleship
      if (this.layerState.Sea.hits.length >= 3) {
        // If we've found 3 consecutive hits and they're all in one line
        // then we likely have found the Battleship
        const hits = this.layerState.Sea.hits.slice().sort((a, b) => a - b);
        
        if (this.arePositionsConsecutive(hits)) {
          shipsRemaining = 0;
        }
      }
    }
    
    return shipsRemaining;
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
  if (layer === 'Sky') {
    // Check if we've found all jets in the sky layer
    // Count regular FighterJet
    const regularJet = this.layerState.Sky.hits.some(index => {
      // Access boards directly from gameState, not through this.game
      const boards = this.attackedPositions.Sky;
      return boards.has(index) && boards.size > 0;
    });
      
    // Count ExtraJet positions - look for any cells with ExtraJet
    const allSkyPositions = [];
    for (let i = 0; i < this.boardSize * this.boardSize; i++) {
      allSkyPositions.push(i);
    }
    
    // Consider all possible positions and check if we've found jets
    const allPositionsChecked = allSkyPositions.every(pos => 
      this.attackedPositions.Sky.has(pos));
      
    // Return true only if we've hit at least one jet AND checked all positions
    // or if the regular jet is hit and no other jets exist
    return regularJet && (this.layerState.Sky.hits.length >= 2 || allPositionsChecked);
  }
  
  // For other layers, use standard logic but exclude treasure chests
  const requiredHits = {
    Space: 4,  // 2x2 square ship
    Sky: 1,    // Single cell ship (handled above)
    Sea: 5,    // 3-cell + 2-cell ships
    Sub: 2     // 2-cell ship
  };
  
  // Count actual ship hits (not treasure chests)
  const shipHits = this.layerState[layer].hits.length;
  
  return shipHits >= requiredHits[layer];
}
  
// Add this to the recordHit method in GameAI
recordHit(layer, index) {
  this.attackedPositions[layer].add(index);
  
  // Check if this is a treasure chest hit
  if (layer === 'Sub') {
    // Instead of using the game object directly, use the isATreasureHit method
    const isTreasure = this.isATreasureHit(index, layer);
    if (isTreasure) {
      // Don't add treasure hits to the ship hit count
      console.log("AI found a treasure, not counting as ship hit");
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
    this.attackedPositions[layer].add(index);
    
    // Update probability maps - reduce probability at the miss
    this.updateProbabilityMap(layer, index, false);
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

/* --- UI Controller --- */
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
  const overlay = document.createElement('div');
  overlay.className = 'game-over-overlay';
  overlay.id = 'treasureOverlay';
  overlay.innerHTML = `
    <div class="treasure-content">
      <h2>Treasure Found!</h2>
      <p>Choose one power-up:</p>
      
      <div class="powerup-options">
        <div class="powerup-option" data-powerup="BlackBox">
          <div class="powerup-icon">${GAME_CONSTANTS.POWERUPS.BlackBox.icon}</div>
          <div class="powerup-name">${GAME_CONSTANTS.POWERUPS.BlackBox.name}</div>
          <div class="powerup-desc">${GAME_CONSTANTS.POWERUPS.BlackBox.description}</div>
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
    // Change emoji to treasure chest instead of explosion
    cell.classList.add('hit', 'treasure');
    cell.textContent = '💎'; // Use treasure chest emoji
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
}

showSonarEffect(side, layer, centerIndex) {
  const prefix = side === 'player' ? 'player' : 'opponent';
  const boardId = `${prefix}${layer}Board`;
  const board = document.getElementById(boardId);
  const boardSize = GAME_CONSTANTS.BOARD_SIZE;
  
  // Get center position
  const row = Math.floor(centerIndex / boardSize);
  const col = centerIndex % boardSize;
  
  // Calculate 2x2 area positions
  const positions = [];
  for (let r = row; r < row + 2 && r < boardSize; r++) {
    for (let c = col; c < col + 2 && c < boardSize; c++) {
      positions.push(r * boardSize + c);
    }
  }
  
  // Show ships in that area if they exist
  positions.forEach(pos => {
    const cell = board.querySelector(`.cell[data-index="${pos}"]`);
    if (!cell) return;
    
    // Get ship at this position
    const cellValue = side === 'player' ? 
      this.game.gameState.boards.player[layer][pos] : 
      this.game.gameState.boards.opponent[layer][pos];
    
    if (cellValue && cellValue !== 'hit' && cellValue !== 'miss' && cellValue !== 'Treasure') {
      // Highlight cell to show ship presence without revealing exact type
      cell.classList.add('sonar-detected');
      
      // If AI is scanning player's board, also reveal to AI
      if (side === 'player') {
        this.game.ai.recordShipDetection(layer, pos);
      }
    } else {
      // No ship here
      cell.classList.add('sonar-scanned');
    }
  });
  
  // Remove effect after a few seconds
  setTimeout(() => {
    board.querySelectorAll('.sonar-detected, .sonar-scanned').forEach(cell => {
      cell.classList.remove('sonar-detected', 'sonar-scanned');
    });
  }, 3000);
}
  
  showRoomCode(code) {
    document.getElementById('roomCodeDisplay').textContent = code;
    document.getElementById('roomCodeDisplay').title = "Click to copy";
    this.updateCommentary("Waiting for opponent... Share this code!");
  }

  renderMainMenu() {
    document.getElementById('gameMenu').style.display = 'flex';
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
      }
    }
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
    document.getElementById('player2Wins').textContent = this.game.aiWins;
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
    this.updateCommentary(`Place your ${shipType}`);

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
  const isVictory = result.winner === 'player';
  let winnerText;
  if (result.mode === 'human') {
    winnerText = isVictory ? `Player ${this.game.gameState.currentPlayer} Wins!` : 'Defeat!';
  } else if (result.mode === 'online') {
    winnerText = isVictory ? 'Victory!' : 'Defeat!';
  } else {
    winnerText = isVictory ? 'Victory!' : 'Defeat!';
  }
    
  // Get shots data - for online mode, always show the local player's stats
  // For other modes, show the winner's stats
  const statsKey = result.mode === 'online' ? 'player' : result.winner;
  const shotsData = this.game.gameState.shots[statsKey] || { total: 0, hits: 0 };
  const shots = typeof shotsData.total === 'number' ? shotsData.total : 0;
  const hits = typeof shotsData.hits === 'number' ? shotsData.hits : 0;
  const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : 0;
  
  console.log('Game Over Stats:', { statsKey, shotsData, shots, hits, accuracy });
  
  const overlay = document.createElement('div');
  overlay.className = 'game-over-overlay';
  overlay.id = 'gameOverOverlay';
  overlay.innerHTML = `
    <div class="game-over-content">
      <h2>${winnerText}</h2>
      
      <div class="stats">
        <p>Shots Fired: ${shots}</p>
        <p>Hits: ${hits}</p>
        <p>Accuracy: <span class="accuracy-value">${accuracy}%</span></p>
      </div>
      
      <div class="game-over-buttons">
        <button id="newGameBtn" class="game-over-button">New Game</button>
        <button id="mainMenuBtn" class="game-over-button">Main Menu</button>
      </div>
    </div>
  `;
  
  // Make sure we don't add multiple game over overlays
  const existingOverlay = document.getElementById('gameOverOverlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
  
  document.body.appendChild(overlay);
  
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
      const positions = ships[shipType].positions;
      
      positions.forEach(pos => {
        const selector = `#${prefix}${config.layer}Board .cell[data-index="${pos}"]`;
        const cell = document.querySelector(selector);
        
        if (cell) {
          cell.classList.add('ship');
          cell.textContent = config.symbol;
        }
      });
    });
  }
}

/* --- Tutorial System --- */
class Tutorial {
  constructor() {
    this.steps = [
      { title: 'Welcome to War Zones!', content: 'Learn how to play in this quick tutorial.', highlight: null },
      { title: 'Game Layers', content: 'The game has 4 layers: Space, Sky, Sea, and Submarine. Each layer hosts different types of ships.', highlight: '.layer-container' },
      { title: 'Ship Placement', content: 'Place your ships by clicking on the proper board. Use the rotation button to change orientation. (Remember: Fighter Jet goes on the Sky board!)', highlight: '#orientationButton' },
      { title: 'Combat Phase', content: 'Attack your opponent by clicking cells on their board. Hit all ships to win!', highlight: '.opponent-boards' }
    ];
    this.currentStep = 0;
  }
  
  start() {
    this.currentStep = 0;
    this.showStep();
  }
  
  showStep() {
    const step = this.steps[this.currentStep];
    const overlay = document.createElement('div');
    overlay.className = 'tutorial-overlay';
    overlay.innerHTML = `
      <div class="tutorial-content">
        <h3>${step.title}</h3>
        <p>${step.content}</p>
        <div class="tutorial-controls">
          <button ${this.currentStep === 0 ? 'disabled' : ''} id="prevStep">Previous</button>
          <button id="nextStep">${this.currentStep === this.steps.length - 1 ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    if (step.highlight) {
      const element = document.querySelector(step.highlight);
      if (element) element.classList.add('tutorial-highlight');
    }
    
    this.setupTutorialControls(overlay);
  }
  
  setupTutorialControls(overlay) {
    overlay.querySelector('#prevStep')?.addEventListener('click', () => {
      this.currentStep--;
      overlay.remove();
      this.showStep();
    });
    
    overlay.querySelector('#nextStep').addEventListener('click', () => {
      if (this.currentStep === this.steps.length - 1) {
        overlay.remove();
        return;
      }
      
      this.currentStep++;
      overlay.remove();
      this.showStep();
    });
  }
}

/* --- Network Manager --- */
class NetworkManager {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomCode = null;
    this.isConnected = false;
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0/O, 1/I/L
    let code = '';
    for (let i = 0; i < 7; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  initialize(customId = null) {
    // Store the room code immediately (don't wait for PeerJS)
    if (customId) {
      this.roomCode = customId;
    }

    // Use custom ID if provided (for hosting), otherwise let PeerJS generate one
    const peerId = customId || null;

    this.peer = new Peer(peerId, {
      debug: 2
    });

    this.peer.on('open', (id) => {
      // Update room code with PeerJS-confirmed ID (should match customId if provided)
      if (!this.roomCode) {
        this.roomCode = id;
      }
      console.log('PeerJS connected with ID: ' + id);
    });

    this.peer.on('connection', (conn) => {
      this.handleConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      // Provide more helpful error messages
      let errorMessage = 'Connection error: ';
      switch (err.type) {
        case 'browser-incompatible':
          errorMessage += 'Your browser does not support WebRTC.';
          break;
        case 'disconnected':
          errorMessage += 'Connection to server lost. Please try again.';
          break;
        case 'network':
          errorMessage += 'Network error. Check your internet connection.';
          break;
        case 'peer-unavailable':
          errorMessage += 'Could not connect to that room code. Make sure it\'s correct.';
          break;
        case 'server-error':
          errorMessage += 'Server error. Please try again later.';
          break;
        case 'socket-error':
          errorMessage += 'Connection failed. Please try again.';
          break;
        case 'socket-closed':
          errorMessage += 'Connection closed unexpectedly.';
          break;
        case 'unavailable-id':
          errorMessage += 'That room code is already in use. Please try again.';
          // Generate a new code and retry for hosts
          if (this.isHost) {
            const newCode = this.generateRoomCode();
            this.game.ui.showRoomCode(newCode);
            console.log('Retrying with new room code:', newCode);
            this.peer.destroy();
            this.peer = null;
            this.initialize(newCode); // Recursively initialize with new code
            return; // Don't show alert or return to menu
          }
          break;
        default:
          errorMessage += err.type || 'Unknown error';
      }
      alert(errorMessage);
      this.game.ui.showMainMenu();
    });
  }

  connect(remoteId) {
    if (!this.peer) this.initialize();
    
    // Close existing connection if any
    if (this.conn) {
      this.conn.close();
    }

    console.log('Connecting to ' + remoteId);
    const conn = this.peer.connect(remoteId);
    this.handleConnection(conn);
  }

  handleConnection(conn) {
    this.conn = conn;
    
    const handleOpen = () => {
      // Prevent double-calling if already connected
      if (this.isConnected) return;
      
      console.log('Connected to: ' + conn.peer);
      this.isConnected = true;
      this.game.onPeerConnected(this.isHost);
    };
    
    // Set up the 'open' event handler
    this.conn.on('open', handleOpen);
    
    // Check if the connection is already open (event may have already fired)
    if (this.conn.open) {
      handleOpen();
    }

    this.conn.on('data', (data) => {
      console.log('Received data:', data);
      this.game.handlePeerData(data);
    });

    this.conn.on('close', () => {
      console.log('Connection closed');
      this.isConnected = false;
      alert('Connection lost!');
      this.game.ui.showMainMenu();
    });
    
    this.conn.on('error', (err) => {
      console.error('Connection error:', err);
    });
  }

  send(data) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    } else {
      console.error('Connection not open, cannot send data');
    }
  }
  
  reset() {
    if (this.conn) {
      this.conn.close();
    }
    if (this.peer) {
      this.peer.destroy();
    }
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomCode = null;
    this.isConnected = false;
  }
}

/* --- Initialize Game on DOM Ready --- */
document.addEventListener('DOMContentLoaded', () => {
  const game = new WarZones();

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'r':
      case 'R':
        game.rotateShip();
        break;
      case 'z':
      case 'Z':
        if (e.ctrlKey || e.metaKey) {
          game.undoPlacement();
        }
        break;
      case 'Escape':
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
    
    const touchEndX = e.touches[0].clientX;
    const deltaX = touchEndX - touchStartX;
    
    if (Math.abs(deltaX) > 50) {
      game.rotateShip();
    }
    
    touchStartX = null;
    touchStartY = null;
  });
});

// Helper functions
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function calculateAccuracy(hits, total) {
  return total === 0 ? 0 : Math.round((hits / total) * 100);
}