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
    this.campaign = new CampaignManager(this);
    this.network = new NetworkManager(this);
    this.playerWins = 0;
    this.aiWins = 0;
    this.aiTurnTimeouts = []; // Track AI turn timeouts
    this.isProcessingTurn = false; // Flag to prevent multiple attacks

    // Keyboard navigation state
    this.keyboard = {
      active: false,           // Whether keyboard nav is engaged
      layerIndex: 0,           // Current layer (0-3 maps to LAYERS array)
      cellIndex: 0,            // Current cell (0-15 for 4x4 grid)
      side: 'opponent'         // Which side boards we're navigating ('player' or 'opponent')
    };

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
  // Show powerup notification
  this.showPowerupNotification(powerupType, false);

  // In online mode, notify opponent of powerup selection
  if (this.gameState.gameMode === 'online' && this.network.isConnected) {
    this.network.send({
      type: 'POWERUP_USED',
      powerup: powerupType
    });
  }

  switch(powerupType) {
    case 'BlackBox':
      this.activateBlackBox();
      break;
    case 'KryptonLaser':
      this.activateKryptonLaser();
      break;
    case 'CannonBall':
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

    // Play placement sound
    this.sound.playSound('place');

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
          game.animations.playExplosion(cell);
          game.animations.playScreenShake(false);
        } else {
          cell.classList.add('miss');
          cell.textContent = 'O';
          game.sound.playSound('miss');
          game.animations.playSplash(cell);
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

      // Play sound and animation for each cell
      if (result.hit) {
        hitCount++;
        if (result.sunk) {
          sunkCount++;
          this.sound.playSound('sunk');
          this.animations.playSunkAnimation(
            this.gameState.ships.opponent[result.shipType].positions,
            'opponentSeaBoard'
          );
        } else {
          this.sound.playSound('hit');
        }
        this.animations.playExplosion(
          document.querySelector(`#opponentSeaBoard .cell[data-index="${targetIndex}"]`)
        );
        this.animations.playScreenShake(false);
      } else {
        this.sound.playSound('miss');
        this.animations.playSplash(
          document.querySelector(`#opponentSeaBoard .cell[data-index="${targetIndex}"]`)
        );
      }
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
    if (this.gameState.phase === 'gameOver') {
      this.isProcessingTurn = false;
      return;
    }
    this.activatePowerupForAI(selectedPowerup);
    // After powerup is used, allow player to take their turn
    this.isProcessingTurn = false;
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
      // AI uses Krypton Laser immediately - attacks same position across all layers
      this.aiUseKryptonLaser();
      break;
    case 'CannonBall':
      // AI uses cannon ball on sea layer
      this.aiUseCannonBall();
      break;
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

aiUseKryptonLaser() {
  // AI targets a position across all 4 layers
  // Find the best position to attack - pick a layer with known hits or random
  const boardSize = GAME_CONSTANTS.BOARD_SIZE;
  let targetIndex = -1;

  // Try to find a strategic position - look for unattacked positions
  const allUnattacked = [];
  for (let i = 0; i < boardSize * boardSize; i++) {
    // Check if this position has unattacked cells in any layer
    let hasUnattacked = false;
    for (const layer of GAME_CONSTANTS.LAYERS) {
      if (!this.ai.attackedPositions[layer].has(i)) {
        hasUnattacked = true;
        break;
      }
    }
    if (hasUnattacked) {
      allUnattacked.push(i);
    }
  }

  if (allUnattacked.length > 0) {
    targetIndex = allUnattacked[Math.floor(Math.random() * allUnattacked.length)];
  } else {
    targetIndex = Math.floor(Math.random() * boardSize * boardSize);
  }

  // Attack the same position across all layers
  let hitCount = 0;
  let sunkCount = 0;
  const results = [];

  GAME_CONSTANTS.LAYERS.forEach(layer => {
    const boardId = `player${layer}Board`;

    // Skip if already attacked
    if (this.ai.attackedPositions[layer].has(targetIndex)) {
      return;
    }

    const result = this.gameState.processAttack(boardId, targetIndex, layer);
    results.push(result);

    // Update AI's knowledge
    if (result.hit) {
      this.ai.recordHit(layer, targetIndex);
      hitCount++;
      if (result.sunk) {
        sunkCount++;
        this.sound.playSound('sunk');
        this.animations.playSunkAnimation(
          this.gameState.ships.player[result.shipType].positions,
          boardId
        );
      }
    } else {
      this.ai.recordMiss(layer, targetIndex);
    }

    // Update the board visually
    this.ui.updateBoard({
      boardId: boardId,
      index: targetIndex,
      hit: result.hit,
      sunk: result.sunk,
      shipType: result.shipType
    });
  });

  // Update commentary
  if (hitCount > 0) {
    let message = `AI used Krypton Laser and hit ${hitCount} target${hitCount > 1 ? 's' : ''}`;
    if (sunkCount > 0) {
      message += ` and destroyed ${sunkCount} ship${sunkCount > 1 ? 's' : ''}`;
    }
    message += "!";
    this.ui.updateCommentary(message);
  } else {
    this.ui.updateCommentary("AI used Krypton Laser but missed all targets!");
  }

  this.ui.updateScoreBoard();

  // Check for game over
  for (const result of results) {
    if (result.gameOver && result.gameOver.isOver) {
      this.sound.playSound('defeat');
      this.aiWins++;
      this.ui.updateScoreBoard();
      this.gameState.phase = 'gameOver';
      this.isProcessingTurn = false;
      this.ui.showGameOver(result.gameOver);
      return;
    }
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
  let sunkCount = 0;
  const results = [];

  for (let r = adjustedRow; r < adjustedRow + 2; r++) {
    for (let c = adjustedCol; c < adjustedCol + 2; c++) {
      const attackIndex = r * boardSize + c;

      // Skip if already attacked
      if (this.ai.attackedPositions.Sea.has(attackIndex)) {
        continue;
      }

      const result = this.gameState.processAttack('playerSeaBoard', attackIndex, 'Sea');
      results.push(result);

      // Update AI's knowledge
      if (result.hit) {
        this.ai.recordHit('Sea', attackIndex);
        hitCount++;
        if (result.sunk) {
          sunkCount++;
          this.sound.playSound('sunk');
          this.animations.playSunkAnimation(
            this.gameState.ships.player[result.shipType].positions,
            'playerSeaBoard'
          );
        }
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

  // Update commentary
  if (hitCount > 0) {
    let message = `AI used Cannon Ball and hit ${hitCount} target${hitCount > 1 ? 's' : ''}`;
    if (sunkCount > 0) {
      message += ` and destroyed ${sunkCount} ship${sunkCount > 1 ? 's' : ''}`;
    }
    message += "!";
    this.ui.updateCommentary(message);
  } else {
    this.ui.updateCommentary("AI used Cannon Ball but missed all targets!");
  }

  this.ui.updateScoreBoard();

  // Check for game over after cannonball attack
  for (const result of results) {
    if (result.gameOver && result.gameOver.isOver) {
      this.sound.playSound('defeat');
      this.aiWins++;
      this.ui.updateScoreBoard();
      this.gameState.phase = 'gameOver';
      this.isProcessingTurn = false;
      this.ui.showGameOver(result.gameOver);
      return;
    }
  }
}

  // === Keyboard Navigation ===
  activateKeyboard() {
    if (this.keyboard.active) return;
    this.keyboard.active = true;

    // Determine which side to navigate based on phase
    if (this.gameState.phase === 'setup') {
      // During setup, navigate player boards (or opponent for player 2 in local)
      this.keyboard.side = (this.gameState.gameMode === 'human' && this.gameState.currentPlayer === 2) ? 'opponent' : 'player';
      // Start on the layer of the current ship being placed
      const currentShip = this.gameState.getCurrentShip();
      if (currentShip) {
        const layerName = GAME_CONSTANTS.SHIPS[currentShip].layer;
        this.keyboard.layerIndex = GAME_CONSTANTS.LAYERS.indexOf(layerName);
      }
    } else if (this.gameState.phase === 'combat') {
      // During combat, navigate opponent boards to attack
      if (this.gameState.gameMode === 'human' && this.gameState.currentPlayer === 2) {
        this.keyboard.side = 'player';
      } else {
        this.keyboard.side = 'opponent';
      }
    }

    this.updateKeyboardCursor();
    this.updateKeyboardHint();
  }

  deactivateKeyboard() {
    this.keyboard.active = false;
    // Remove all cursor highlights
    document.querySelectorAll('.cell.keyboard-cursor').forEach(c => c.classList.remove('keyboard-cursor'));
    document.querySelectorAll('.board-section.keyboard-active-layer').forEach(s => s.classList.remove('keyboard-active-layer'));
    document.getElementById('keyboardHint').classList.remove('visible');
  }

  updateKeyboardCursor() {
    // Clear old cursor
    document.querySelectorAll('.cell.keyboard-cursor').forEach(c => c.classList.remove('keyboard-cursor'));
    document.querySelectorAll('.board-section.keyboard-active-layer').forEach(s => s.classList.remove('keyboard-active-layer'));

    if (!this.keyboard.active) return;

    const layer = GAME_CONSTANTS.LAYERS[this.keyboard.layerIndex];
    const boardId = `${this.keyboard.side}${layer}Board`;
    const board = document.getElementById(boardId);
    if (!board) return;

    const cell = board.querySelector(`.cell[data-index="${this.keyboard.cellIndex}"]`);
    if (cell) {
      cell.classList.add('keyboard-cursor');
    }

    // Highlight the active layer label
    const boardSection = board.closest('.board-section');
    if (boardSection) {
      boardSection.classList.add('keyboard-active-layer');
    }
  }

  updateKeyboardHint() {
    const hint = document.getElementById('keyboardHint');
    if (!hint) return;

    if (!this.keyboard.active) {
      hint.classList.remove('visible');
      return;
    }

    hint.classList.add('visible');
    if (this.gameState.phase === 'setup') {
      hint.innerHTML = `<kbd>Arrow Keys</kbd> Move &nbsp; <kbd>1</kbd>-<kbd>4</kbd> Switch Layer &nbsp; <kbd>Space</kbd> Place Ship &nbsp; <kbd>R</kbd> Rotate &nbsp; <kbd>Esc</kbd> Menu`;
    } else if (this.gameState.phase === 'combat') {
      hint.innerHTML = `<kbd>Arrow Keys</kbd> Move &nbsp; <kbd>1</kbd>-<kbd>4</kbd> Switch Layer &nbsp; <kbd>Space</kbd> Attack &nbsp; <kbd>Esc</kbd> Menu`;
    }
  }

  handleKeyboardNav(e) {
    // Don't handle if a menu/overlay is visible
    if (document.getElementById('gameMenu').style.display !== 'none' &&
        document.getElementById('gameMenu').style.display !== '') return false;
    if (document.querySelector('.game-over-overlay')) return false;
    if (document.getElementById('treasureOverlay')) return false;

    // Only during setup or combat
    if (this.gameState.phase !== 'setup' && this.gameState.phase !== 'combat') return false;

    const boardSize = GAME_CONSTANTS.BOARD_SIZE;

    switch (e.key) {
      case 'ArrowUp': {
        e.preventDefault();
        if (!this.keyboard.active) { this.activateKeyboard(); return true; }
        const row = Math.floor(this.keyboard.cellIndex / boardSize);
        if (row > 0) this.keyboard.cellIndex -= boardSize;
        this.updateKeyboardCursor();
        return true;
      }
      case 'ArrowDown': {
        e.preventDefault();
        if (!this.keyboard.active) { this.activateKeyboard(); return true; }
        const row = Math.floor(this.keyboard.cellIndex / boardSize);
        if (row < boardSize - 1) this.keyboard.cellIndex += boardSize;
        this.updateKeyboardCursor();
        return true;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (!this.keyboard.active) { this.activateKeyboard(); return true; }
        const col = this.keyboard.cellIndex % boardSize;
        if (col > 0) this.keyboard.cellIndex -= 1;
        this.updateKeyboardCursor();
        return true;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (!this.keyboard.active) { this.activateKeyboard(); return true; }
        const col = this.keyboard.cellIndex % boardSize;
        if (col < boardSize - 1) this.keyboard.cellIndex += 1;
        this.updateKeyboardCursor();
        return true;
      }
      case '1': case '2': case '3': case '4': {
        if (!this.keyboard.active) { this.activateKeyboard(); }
        const newLayerIndex = parseInt(e.key) - 1;
        this.keyboard.layerIndex = newLayerIndex;
        this.updateKeyboardCursor();
        this.updateKeyboardHint();
        return true;
      }
      case ' ': {
        e.preventDefault();
        if (!this.keyboard.active) { this.activateKeyboard(); return true; }
        this.handleKeyboardAction();
        return true;
      }
      case 'Enter': {
        e.preventDefault();
        if (!this.keyboard.active) { this.activateKeyboard(); return true; }
        this.handleKeyboardAction();
        return true;
      }
      default:
        return false;
    }
  }

  handleKeyboardAction() {
    const layer = GAME_CONSTANTS.LAYERS[this.keyboard.layerIndex];
    const boardId = `${this.keyboard.side}${layer}Board`;
    const board = document.getElementById(boardId);
    if (!board) return;

    const cell = board.querySelector(`.cell[data-index="${this.keyboard.cellIndex}"]`);
    if (!cell) return;

    if (this.gameState.phase === 'setup') {
      // Trigger placement
      this.handleShipPlacement(boardId, this.keyboard.cellIndex, layer);
      // Update cursor to next ship's layer
      const nextShip = this.gameState.getCurrentShip();
      if (nextShip) {
        const nextLayer = GAME_CONSTANTS.SHIPS[nextShip].layer;
        this.keyboard.layerIndex = GAME_CONSTANTS.LAYERS.indexOf(nextLayer);
        this.updateKeyboardCursor();
        this.updateKeyboardHint();
      }
    } else if (this.gameState.phase === 'combat') {
      // Simulate a click on that cell for attack
      cell.click();
    }
  }

  // === Ship Counter ===
  updateShipCounter() {
    const counter = document.getElementById('shipCounter');
    if (!counter) return;

    if (this.gameState.phase !== 'combat' && this.gameState.phase !== 'gameOver') {
      counter.classList.remove('visible');
      return;
    }

    counter.classList.add('visible');

    const playerList = document.getElementById('playerShipsList');
    const opponentList = document.getElementById('opponentShipsList');

    playerList.innerHTML = this.renderShipList(this.gameState.ships.player);
    opponentList.innerHTML = this.renderShipList(this.gameState.ships.opponent);
  }

  renderShipList(ships) {
    return Object.entries(ships).map(([shipType, ship]) => {
      // Skip ships that have no positions (not placed or extra ships like ExtraJet)
      if (ship.positions.length === 0) return '';
      const config = GAME_CONSTANTS.SHIPS[shipType];
      const symbol = config ? config.symbol : (shipType === 'Destroyer' ? '🛥️' : '✈️');
      const name = shipType;
      const status = ship.isSunk ? 'sunk' : 'alive';
      return `<span class="ship-status ${status}" title="${name}"><span class="ship-emoji">${symbol}</span>${name}</span>`;
    }).join('');
  }

  // === Powerup Notification (Online) ===
  showPowerupNotification(powerupType, isOpponent) {
    const powerup = GAME_CONSTANTS.POWERUPS[powerupType];
    if (!powerup) return;

    // Remove existing notification
    document.querySelectorAll('.powerup-notification').forEach(n => n.remove());

    const notif = document.createElement('div');
    notif.className = 'powerup-notification';
    notif.innerHTML = `
      <span class="notif-icon">${powerup.icon}</span>
      <span class="notif-text">${isOpponent ? 'Opponent' : 'You'} activated <span class="notif-name">${powerup.name}</span></span>
    `;
    document.body.appendChild(notif);

    // Auto-remove after animation
    setTimeout(() => notif.remove(), 4000);
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
    document.getElementById('playCampaign').addEventListener('click', () => {
      this.sound.initialize();
      this.campaign.showCampaignMap();
    });

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
      this.network.initialize(roomCode);
      document.getElementById('onlineMenuButtons').classList.add('hidden');
      document.getElementById('hostGameDisplay').classList.remove('hidden');
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

    // Reset keyboard nav and UI elements
    this.deactivateKeyboard();
    document.getElementById('shipCounter').classList.remove('visible');

    this.ui.hideMainMenu();
    this.gameState.reset();
    this.ai.reset(); // Reset AI's targeting state

    // Clean up campaign turn timer if active
    if (this.campaign?.modifierState?.timerInterval) {
      this.campaign.stopTurnTimer();
    }
    // Remove turn timer element
    const turnTimerEl = document.getElementById('turnTimer');
    if (turnTimerEl) turnTimerEl.classList.add('hidden');
    
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
    this.ui.renderFleetDock();

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
      case 'POWERUP_USED':
        // Opponent activated a powerup - show notification
        this.showPowerupNotification(data.powerup, true);
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

      // Show ship counter
      this.updateShipCounter();

      // Deactivate keyboard nav from placement phase
      this.deactivateKeyboard();

      // Clear placement highlights and fleet dock
      document.querySelectorAll('.board-section.placement-active').forEach(section => {
        section.classList.remove('placement-active');
      });
      this.ui.hideFleetDock();
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

    // CRITICAL: Update local ship state for win condition detection
    if (result.hit && result.shipType && this.gameState.ships.opponent[result.shipType]) {
      const ship = this.gameState.ships.opponent[result.shipType];
      // Add the hit position if not already tracked
      if (!ship.hits.includes(result.index)) {
        ship.hits.push(result.index);
      }
      // Mark ship as sunk if result says it's sunk
      if (result.sunk) {
        ship.isSunk = true;
      }
    }

    this.ui.updateBoard(result);
    this.sound.playSound(result.hit ? 'hit' : 'miss');
    if (result.sunk) this.sound.playSound('sunk');

    // Check game over locally as well (in case remote result is incorrect)
    const localGameOver = this.gameState.checkGameOver();
    const isGameOver = result.gameOver.isOver || localGameOver.isOver;

    if (isGameOver) {
       // I won - I destroyed all opponent's ships
       this.gameState.phase = 'gameOver';
       this.isProcessingTurn = false;
       // Adjust winner for online mode display
       const gameOverResult = {
         ...result.gameOver,
         isOver: true,
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
      
      // Update the commentary and fleet dock
      const nextShip = this.gameState.getCurrentShip();
      if (nextShip) {
        const player = this.gameState.gameMode === 'human'
          ? `Player ${this.gameState.currentPlayer}: `
          : '';
        const nextConfig = GAME_CONSTANTS.SHIPS[nextShip];
        const sizeDesc = nextConfig.size === 1 ? '1 cell' : `${nextConfig.size} cells`;
        this.ui.updateCommentary(`${player}Place your ${nextShip} (${sizeDesc}) on the ${nextConfig.layer} board`);
        this.ui.highlightPlacementBoard();
      }
      this.ui.updateFleetDock();

      // Campaign: skip ships removed by mission modifiers
      if (this.campaign?.activeMission) {
        while (this.campaign.shouldSkipShip(this.gameState.getCurrentShip()) && !this.gameState.isPlacementComplete()) {
          this.gameState.currentShipIndex++;
        }
        const campaignNextShip = this.gameState.getCurrentShip();
        if (campaignNextShip && GAME_CONSTANTS.SHIPS[campaignNextShip]) {
          const cnConfig = GAME_CONSTANTS.SHIPS[campaignNextShip];
          const cnSize = cnConfig.size === 1 ? '1 cell' : `${cnConfig.size} cells`;
          this.ui.updateCommentary(`Place your ${campaignNextShip} (${cnSize}) on the ${cnConfig.layer} board`);
          this.ui.highlightPlacementBoard();
          this.ui.updateFleetDock();
        }
      }

      if (this.gameState.isPlacementComplete()) {
        // Hide undo button and fleet dock
        document.getElementById('undoMove').style.display = 'none';
        this.ui.hideFleetDock();
        
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
              const p2Ship = this.gameState.getCurrentShip();
              const p2Config = GAME_CONSTANTS.SHIPS[p2Ship];
              const p2Size = p2Config.size === 1 ? '1 cell' : `${p2Config.size} cells`;
              this.ui.updateCommentary(`Player Two: Place your ${p2Ship} (${p2Size}) on the ${p2Config.layer} board`);
              this.ui.updateGameInfo(`Player Two: Place your ships on your board.`);
              this.ui.highlightPlacementBoard();
              this.ui.renderFleetDock();
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
  // Show phase transition animation, then start combat
  this.sound.playSound('gameStart');
  this.animations.playPhaseTransition('COMBAT', 'Prepare for battle').then(() => {
    this._initCombat();
  });
}

_initCombat() {
  this.gameState.phase = 'combat';
  this.gameState.currentPlayer = 1; // Always start with player 1 in combat

  // Clear placement highlights and fleet dock
  document.querySelectorAll('.board-section.placement-active').forEach(section => {
    section.classList.remove('placement-active');
  });
  this.ui.hideFleetDock();

  if (this.gameState.gameMode === 'ai') {
    const opponentBoards = document.querySelector('.opponent-boards');
    opponentBoards.style.display = 'block';

    this.gameState.ships.opponent = this.gameState.createInitialShips();
    this.gameState.boards.opponent = this.gameState.createEmptyBoards();
    this.placeAIShips();

    // Campaign: apply modifiers after AI ships placed
    if (this.campaign?.activeMission) {
      this.campaign.onCombatStart();
    }

    // Force CSS animations to restart on opponent boards after showing
    setTimeout(() => {
      document.querySelectorAll('.opponent-boards .board').forEach(board => {
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

  // Show ship counter
  this.updateShipCounter();

  // Deactivate keyboard nav from placement phase so it resets for combat
  this.deactivateKeyboard();

  this.ui.updateGameInfo('Combat phase - Attack your opponent\'s board!');

  // Campaign: start turn timer for player's first turn
  if (this.campaign?.activeMission) {
    this.campaign.onPlayerTurnStart();
  }
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
    
    // Don't allow attacking cells already hit/missed (but allow decayed/fogged cells to be visually stale)
    if (cell.classList.contains('hit') || cell.classList.contains('miss')) return;

    // Campaign modifier checks before processing the attack
    if (this.campaign?.activeMission && boardId.includes('opponent')) {
      const check = this.campaign.beforePlayerAttack(index, layer);
      if (check.blocked) {
        this.isProcessingTurn = true;
        if (check.reason === 'shield') {
          this.campaign.handleShieldBlock(cell, check.shipType);
          this.campaign.onPlayerTurnEnd();
          this.handleAITurn();
          return;
        }
        if (check.reason === 'mine') {
          this.campaign.handleMineHit(cell, check.index, check.layer);
          this.campaign.onPlayerTurnEnd();
          this.handleAITurn();
          return;
        }
      }
    }

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

      // In handleAttack (player click), treasure is always found by the clicking player
      // Whether they attack opponent board (AI or human) or player board (human vs human mode)
      if (this.gameState.gameMode === 'human') {
        // Human vs Human mode - current player found treasure
        this.ui.updateCommentary(`Player ${this.gameState.currentPlayer} found a treasure chest!`);
        this.animateCommentaryBox();
        this.ui.showTreasureMenu();
        this.isProcessingTurn = false;
      } else {
        // AI mode - player found treasure on opponent's board
        this.ui.updateCommentary("You found a treasure chest!");
        this.animateCommentaryBox();
        this.ui.showTreasureMenu();
        this.isProcessingTurn = false;
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
    
    // Campaign: track hits and misses for fog/decay modifiers
    if (this.campaign?.activeMission && boardId.includes('opponent')) {
      if (result.hit) {
        this.campaign.afterPlayerHit(layer, index, cell);
        this.campaign.onPlayerHitContinue();
      } else {
        this.campaign.afterPlayerMiss(layer, index, cell);
      }
    }

    // Handle turn switching
    if (this.gameState.gameMode === 'ai') {
      if (!result.hit) {
        // Campaign: process fog/decay on turn end
        if (this.campaign?.activeMission) {
          this.campaign.onPlayerTurnEnd();
        }
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

    // Show AI thinking indicator
    this.animations.showAIThinking('player');
    this.ui.updateCommentary('<span class="ai-thinking">AI is scanning<span class="ai-thinking-dots"><span></span><span></span><span></span></span></span>');
    // Use innerHTML for the animated dots
    const commentaryText = document.getElementById('commentaryText');
    if (commentaryText) commentaryText.innerHTML = '<span class="ai-thinking">AI is scanning<span class="ai-thinking-dots"><span></span><span></span><span></span></span></span>';

    const timeout = setTimeout(() => {
      // Hide AI thinking indicator
      this.animations.hideAIThinking('player');

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
        // Keep isProcessingTurn = true until powerup is fully activated
        setTimeout(() => {
          this.handleAIPowerupSelection();
          // isProcessingTurn will be set to false inside handleAIPowerupSelection after powerup is used
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
        // Campaign: notify player turn is starting
        if (this.campaign?.activeMission) {
          this.campaign.onPlayerTurnStart();
        }
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
      const shipConfig = GAME_CONSTANTS.SHIPS[shipType];
      const sizeDesc = shipConfig.size === 1 ? '1 cell' : `${shipConfig.size} cells`;

      this.ui.updateCommentary(`${player}Place your ${shipType} (${sizeDesc}) on the ${shipConfig.layer} board`);
      this.ui.highlightPlacementBoard();
      this.ui.updateFleetDock();
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

  // Helper: create noise buffer for explosion/impact texture
  createNoiseBuffer(duration) {
    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    return buffer;
  }

  // Helper: play a tone with envelope
  playTone(freq, type, gain, attack, decay, duration) {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  playSound(soundName) {
    if (!this.isInitialized) this.initialize();
    if (!this.audioContext || this.isMuted) return;

    try {
      switch(soundName) {
        case 'hit': this.playHitSound(); break;
        case 'miss': this.playMissSound(); break;
        case 'sunk': this.playSunkSound(); break;
        case 'victory': this.playVictorySound(); break;
        case 'defeat': this.playDefeatSound(); break;
        case 'gameStart': this.playGameStartSound(); break;
        case 'place': this.playPlaceSound(); break;
        case 'rotate': this.playRotateSound(); break;
        default: this.playTone(400, 'sine', 0.1, 0.01, 0.3, 0.4);
      }
    } catch (e) {
      console.warn('Error playing sound:', e);
    }
  }

  playHitSound() {
    const ctx = this.audioContext;
    const t = ctx.currentTime;

    // Explosion noise burst
    const noiseBuffer = this.createNoiseBuffer(0.4);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(4000, t);
    noiseFilter.frequency.exponentialRampToValueAtTime(200, t + 0.4);
    noiseGain.gain.setValueAtTime(0.25, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t);

    // Impact thud (low frequency)
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(150, t);
    thud.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    thudGain.gain.setValueAtTime(0.3, t);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thud.start(t);
    thud.stop(t + 0.35);

    // High crackle
    this.playTone(800, 'sawtooth', 0.08, 0.005, 0.15, 0.2);
  }

  playMissSound() {
    const ctx = this.audioContext;
    const t = ctx.currentTime;

    // Water splash - filtered noise
    const noiseBuffer = this.createNoiseBuffer(0.35);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2500;
    filter.Q.value = 1.5;
    noiseGain.gain.setValueAtTime(0.001, t);
    noiseGain.gain.linearRampToValueAtTime(0.12, t + 0.03);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t);

    // Descending "plop"
    const plop = ctx.createOscillator();
    const plopGain = ctx.createGain();
    plop.type = 'sine';
    plop.frequency.setValueAtTime(600, t);
    plop.frequency.exponentialRampToValueAtTime(150, t + 0.15);
    plopGain.gain.setValueAtTime(0.1, t);
    plopGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    plop.connect(plopGain);
    plopGain.connect(ctx.destination);
    plop.start(t);
    plop.stop(t + 0.25);
  }

  playSunkSound() {
    const ctx = this.audioContext;
    const t = ctx.currentTime;

    // Heavy explosion noise
    const noiseBuffer = this.createNoiseBuffer(1.2);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(5000, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 1.0);
    noiseGain.gain.setValueAtTime(0.3, t);
    noiseGain.gain.setValueAtTime(0.25, t + 0.1);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t);

    // Deep rumble
    const rumble = ctx.createOscillator();
    const rumbleGain = ctx.createGain();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(80, t);
    rumble.frequency.exponentialRampToValueAtTime(25, t + 0.8);
    rumbleGain.gain.setValueAtTime(0.35, t);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    rumble.connect(rumbleGain);
    rumbleGain.connect(ctx.destination);
    rumble.start(t);
    rumble.stop(t + 1.1);

    // Metal creak/groan
    const creak = ctx.createOscillator();
    const creakGain = ctx.createGain();
    creak.type = 'sawtooth';
    creak.frequency.setValueAtTime(300, t + 0.3);
    creak.frequency.exponentialRampToValueAtTime(60, t + 1.0);
    creakGain.gain.setValueAtTime(0.001, t);
    creakGain.gain.linearRampToValueAtTime(0.06, t + 0.35);
    creakGain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    creak.connect(creakGain);
    creakGain.connect(ctx.destination);
    creak.start(t);
    creak.stop(t + 1.1);
  }

  playVictorySound() {
    if (!this.audioContext || this.isMuted) return;
    const ctx = this.audioContext;
    const t = ctx.currentTime;

    // Triumphant fanfare - multiple harmonized tones
    const notes = [
      { freq: 523, time: 0,    dur: 0.2 },  // C5
      { freq: 659, time: 0.2,  dur: 0.2 },  // E5
      { freq: 784, time: 0.4,  dur: 0.2 },  // G5
      { freq: 1047, time: 0.6, dur: 0.6 },  // C6 (held)
      { freq: 880, time: 0.9,  dur: 0.15 },  // A5
      { freq: 1047, time: 1.05, dur: 0.8 },  // C6 (final)
    ];

    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = n.freq;
      g.gain.setValueAtTime(0.001, t + n.time);
      g.gain.linearRampToValueAtTime(0.12, t + n.time + 0.02);
      g.gain.setValueAtTime(0.1, t + n.time + n.dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.001, t + n.time + n.dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t + n.time);
      osc.stop(t + n.time + n.dur + 0.05);

      // Add harmony an octave lower
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.value = n.freq / 2;
      g2.gain.setValueAtTime(0.001, t + n.time);
      g2.gain.linearRampToValueAtTime(0.06, t + n.time + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.001, t + n.time + n.dur);
      osc2.connect(g2);
      g2.connect(ctx.destination);
      osc2.start(t + n.time);
      osc2.stop(t + n.time + n.dur + 0.05);
    });
  }

  playDefeatSound() {
    if (!this.audioContext || this.isMuted) return;
    const ctx = this.audioContext;
    const t = ctx.currentTime;

    // Descending minor tones
    const notes = [
      { freq: 440, time: 0, dur: 0.4 },
      { freq: 370, time: 0.35, dur: 0.4 },
      { freq: 311, time: 0.7, dur: 0.4 },
      { freq: 262, time: 1.05, dur: 0.8 },
    ];

    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = n.freq;
      g.gain.setValueAtTime(0.001, t + n.time);
      g.gain.linearRampToValueAtTime(0.15, t + n.time + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + n.time + n.dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t + n.time);
      osc.stop(t + n.time + n.dur + 0.05);
    });
  }

  playGameStartSound() {
    if (!this.audioContext || this.isMuted) return;
    const ctx = this.audioContext;
    const t = ctx.currentTime;

    // Ascending power-up sweep
    const sweep = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(200, t);
    sweep.frequency.exponentialRampToValueAtTime(800, t + 0.4);
    sweepGain.gain.setValueAtTime(0.08, t);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    sweep.connect(sweepGain);
    sweepGain.connect(ctx.destination);
    sweep.start(t);
    sweep.stop(t + 0.55);

    // Confirmation chime
    this.playTone(660, 'sine', 0.12, 0.01, 0.25, 0.3);
    setTimeout(() => this.playTone(880, 'sine', 0.1, 0.01, 0.3, 0.35), 150);
  }

  playPlaceSound() {
    this.playTone(440, 'sine', 0.08, 0.005, 0.1, 0.15);
    setTimeout(() => this.playTone(550, 'sine', 0.06, 0.005, 0.08, 0.12), 60);
  }

  playRotateSound() {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(500, t + 0.08);
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
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
      this.playExplosion(cell);
      this.playScreenShake(false);
    } else {
      this.playSplash(cell);
    }
  }

  // --- Explosion effect on hit ---
  playExplosion(cell) {
    cell.style.position = 'relative';

    // Flash
    const flash = document.createElement('div');
    flash.className = 'explosion-flash';
    cell.appendChild(flash);
    setTimeout(() => flash.remove(), 350);

    // Ring
    const ring = document.createElement('div');
    ring.className = 'explosion-ring';
    cell.appendChild(ring);
    setTimeout(() => ring.remove(), 600);

    // Particles
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
      p.style.transform = `translate(-50%, -50%)`;
      container.appendChild(p);

      // Animate with JS for proper radial burst
      requestAnimationFrame(() => {
        p.style.transition = `all ${dur}ms cubic-bezier(0, 0.8, 0.5, 1)`;
        p.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        p.style.opacity = '0';
      });
    }

    // Emoji debris
    for (let i = 0; i < 3; i++) {
      const e = document.createElement('div');
      e.className = 'explosion-particle';
      e.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      e.style.cssText = `font-size:10px;top:50%;left:50%;background:none;width:auto;height:auto;`;
      e.style.transform = `translate(-50%, -50%)`;
      container.appendChild(e);

      const angle = Math.random() * Math.PI * 2;
      const dist = 25 + Math.random() * 25;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;

      requestAnimationFrame(() => {
        e.style.transition = `all 500ms cubic-bezier(0, 0.8, 0.5, 1)`;
        e.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.3)`;
        e.style.opacity = '0';
      });
    }

    setTimeout(() => container.remove(), 700);
  }

  // --- Splash effect on miss ---
  playSplash(cell) {
    cell.style.position = 'relative';

    const container = document.createElement('div');
    container.className = 'miss-splash';
    cell.appendChild(container);

    // Water ring
    const ring = document.createElement('div');
    ring.className = 'splash-ring';
    container.appendChild(ring);

    // Water droplets
    for (let i = 0; i < 6; i++) {
      const drop = document.createElement('div');
      drop.className = 'splash-drop';
      drop.style.cssText = `top:50%;left:50%;`;
      drop.style.transform = `translate(-50%, -50%)`;
      container.appendChild(drop);

      const angle = (Math.PI * 2 * i) / 6;
      const dist = 12 + Math.random() * 15;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 8; // bias upward

      requestAnimationFrame(() => {
        drop.style.transition = `all 400ms cubic-bezier(0.2, 0.8, 0.4, 1)`;
        drop.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        drop.style.opacity = '0';
      });
    }

    setTimeout(() => container.remove(), 500);
  }

  // --- Screen shake ---
  playScreenShake(heavy) {
    const container = document.querySelector('.game-container');
    if (!container) return;

    const cls = heavy ? 'screen-shake-heavy' : 'screen-shake';
    container.classList.remove('screen-shake', 'screen-shake-heavy');
    // Force reflow to restart animation
    void container.offsetWidth;
    container.classList.add(cls);
    const dur = heavy ? 500 : 400;
    setTimeout(() => container.classList.remove(cls), dur);
  }

  // --- Dramatic sunk animation ---
  playSunkAnimation(positions, boardId) {
    // Heavy screen shake for ship destruction
    this.playScreenShake(true);

    positions.forEach((pos, i) => {
      const cell = document.querySelector(`#${boardId} .cell[data-index="${pos}"]`);
      if (!cell) return;

      // Stagger the sinking across cells
      setTimeout(() => {
        cell.classList.add('sinking');
        this.playExplosion(cell);

        // After sink animation, switch to permanent sunk state
        setTimeout(() => {
          cell.classList.remove('sinking');
          cell.classList.add('sunk');
        }, 800);
      }, i * 150);
    });
  }

  // --- Victory confetti ---
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

      // Fade out in last 60 frames
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

  // --- Phase transition ---
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

  // --- AI thinking indicator ---
  showAIThinking(boardSide) {
    // Add scanning line to player boards
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

    // Special case for mines (campaign mode)
    if (cellValue === 'Mine') {
      targetBoards[layer][index] = "miss";
      return {
        hit: false,
        mine: true,
        index,
        layer,
        boardId,
        gameOver: { isOver: false }
      };
    }

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
    // No hits yet - not completed
    if (this.layerState.Sky.hits.length === 0) return false;

    // Regular FighterJet is 1 cell - 1 hit sinks it
    // Check if player has an ExtraJet (from BlackBox powerup)
    try {
      const game = this.game || window.warZonesGame;
      if (game && game.gameState && game.gameState.ships.player['ExtraJet']) {
        const extraJet = game.gameState.ships.player['ExtraJet'];
        if (!extraJet.isSunk && extraJet.positions.length > 0) {
          // ExtraJet exists and isn't sunk yet - need 2 hits total
          return this.layerState.Sky.hits.length >= 2;
        }
      }
    } catch (e) {
      // Fallback - if we can't check, 1 hit is enough
    }

    // No ExtraJet or ExtraJet already sunk - 1 hit completes sky
    return true;
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

  // Update ship counter display
  this.game.updateShipCounter();
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

/* --- Campaign Manager --- */
class CampaignManager {
  constructor(game) {
    this.game = game;
    this.activeMission = null;
    this.modifierState = {};
    this.playerTurnCount = 0;
    this.missions = this._defineMissions();
    this.progress = this._loadProgress();
  }

  _defineMissions() {
    return [
      {
        id: 1, act: 1, actName: "RISING TIDE",
        name: "First Contact",
        subtitle: "Begin your command",
        briefing: "Commander, welcome to the fleet. Intel reports a small enemy patrol in the sector. Engage and destroy all enemy vessels. This is your proving ground — show us what you're made of.",
        difficulty: "Recruit",
        isBoss: false,
        modifiers: [],
        aiConfig: { unpredictability: 0.35, clusterPreference: false },
        starThresholds: { three: 65, two: 45 }
      },
      {
        id: 2, act: 1, actName: "RISING TIDE",
        name: "Fog Bank",
        subtitle: "Trust your instruments",
        briefing: "A dense electromagnetic fog has rolled across the combat zone. Your targeting sensors are degrading — missed shots will fade from your display after 2 turns. Mark your targets carefully, Commander. Memory is your greatest weapon.",
        difficulty: "Recruit",
        isBoss: false,
        modifiers: ['fog_of_war'],
        fogTurns: 2,
        aiConfig: { unpredictability: 0.30, clusterPreference: false },
        starThresholds: { three: 60, two: 40 }
      },
      {
        id: 3, act: 1, actName: "RISING TIDE",
        name: "The Hydra",
        subtitle: "Cut one head, two more appear",
        briefing: "PRIORITY ALERT: You are engaging Commander Hydra's reinforced battle group. Intelligence confirms an additional Destroyer has joined their fleet — that's 6 ships, not 5. The Hydra earned their name by always having more forces than expected. Strike fast, strike true.",
        difficulty: "Dangerous",
        isBoss: true,
        bossTitle: "MINI-BOSS",
        modifiers: ['enemy_reinforcements'],
        extraShips: [{ name: 'Destroyer', size: 2, shape: 'line', layer: 'Sea', symbol: '🛥️' }],
        aiConfig: { unpredictability: 0.18, clusterPreference: true },
        starThresholds: { three: 55, two: 35 }
      },
      {
        id: 4, act: 2, actName: "STORM FRONT",
        name: "Rapid Response",
        subtitle: "Speed is survival",
        briefing: "Enemy forces are executing rapid tactical maneuvers. Command has authorized emergency engagement protocols — you have 10 seconds per attack. Hesitation means defeat. Trust your instincts, Commander.",
        difficulty: "Soldier",
        isBoss: false,
        modifiers: ['turn_timer'],
        turnTimerSeconds: 10,
        aiConfig: { unpredictability: 0.25, clusterPreference: false },
        starThresholds: { three: 60, two: 40 }
      },
      {
        id: 5, act: 2, actName: "STORM FRONT",
        name: "Dark Waters",
        subtitle: "Blind in the deep",
        briefing: "Enemy submarines have deployed deep-sea signal jammers. Your sonar returns in the underwater layer are unreliable — missed pings will vanish from your display. The enemy commander knows these dark waters well. Proceed with extreme caution.",
        difficulty: "Veteran",
        isBoss: false,
        modifiers: ['layer_fog'],
        fogLayers: ['Sub'],
        fogTurns: 2,
        aiConfig: { unpredictability: 0.20, clusterPreference: false },
        starThresholds: { three: 55, two: 35 }
      },
      {
        id: 6, act: 2, actName: "STORM FRONT",
        name: "Minefield",
        subtitle: "Every click could be your last",
        briefing: "WARNING: Naval mines have been detected in the enemy's waters. 3 concealed mines are hidden among their sea grid. Strike a mine and the blast will stun your fleet, giving the enemy a free attack. Choose your targets wisely — or pay the price.",
        difficulty: "Veteran",
        isBoss: false,
        modifiers: ['mines'],
        mineCount: 3,
        aiConfig: { unpredictability: 0.22, clusterPreference: false },
        starThresholds: { three: 55, two: 35 }
      },
      {
        id: 7, act: 2, actName: "STORM FRONT",
        name: "The Kraken",
        subtitle: "Fight the impossible",
        briefing: "CRITICAL ALERT: Your submarine was destroyed in a pre-battle ambush — you fight with only 4 ships. Worse, enemy Commander Kraken has equipped all vessels with experimental deflector shields. The first strike on each enemy ship will be absorbed. You are outgunned and outmatched. The brass says this mission is suicide. Prove them wrong.",
        difficulty: "Dangerous",
        isBoss: true,
        bossTitle: "MINI-BOSS",
        modifiers: ['reduced_fleet', 'shields'],
        removedShips: ['Submarine'],
        aiConfig: { unpredictability: 0.12, clusterPreference: true },
        starThresholds: { three: 50, two: 30 }
      },
      {
        id: 8, act: 3, actName: "OPERATION TRIDENT",
        name: "Phantom Fleet",
        subtitle: "Now you see them...",
        briefing: "The enemy has deployed advanced stealth plating. Your confirmed hits will degrade and fade from your tactical display after 3 turns. You must track your strikes mentally — your instruments cannot be trusted. Discipline and memory are your only allies.",
        difficulty: "Elite",
        isBoss: false,
        modifiers: ['hit_decay'],
        decayTurns: 3,
        aiConfig: { unpredictability: 0.15, clusterPreference: false },
        starThresholds: { three: 50, two: 30 }
      },
      {
        id: 9, act: 3, actName: "OPERATION TRIDENT",
        name: "Iron Curtain",
        subtitle: "Break through their armor",
        briefing: "The enemy's elite guard fleet is equipped with full deflector shield arrays. Every ship in their fleet can absorb one direct hit before taking damage. Your weapons are effective, but you must break through their shields first. Persistence is victory, Commander.",
        difficulty: "Elite",
        isBoss: false,
        modifiers: ['shields'],
        aiConfig: { unpredictability: 0.10, clusterPreference: false },
        starThresholds: { three: 50, two: 30 }
      },
      {
        id: 10, act: 3, actName: "OPERATION TRIDENT",
        name: "The Admiral",
        subtitle: "End this war",
        briefing: "This is it, Commander. Admiral Voss — the architect of this war — commands the most formidable fleet ever assembled. Reinforced with an extra Destroyer. Every ship shielded. Stealth technology rendering your hit data unstable. Sensor fog obscuring your misses. This is the battle that decides everything. There will be no retreat. No reinforcements. Only victory or oblivion. Make every shot count. The world is watching.",
        difficulty: "Legendary",
        isBoss: true,
        bossTitle: "FINAL BOSS",
        modifiers: ['shields', 'hit_decay', 'fog_of_war', 'enemy_reinforcements'],
        extraShips: [{ name: 'Destroyer', size: 2, shape: 'line', layer: 'Sea', symbol: '🛥️' }],
        decayTurns: 4,
        fogTurns: 3,
        aiConfig: { unpredictability: 0.05, clusterPreference: true },
        starThresholds: { three: 45, two: 25 }
      }
    ];
  }

  _loadProgress() {
    try {
      const saved = localStorage.getItem('warZonesCampaign');
      if (saved) return JSON.parse(saved);
    } catch (e) { console.error('Failed to load campaign progress:', e); }
    return { missions: {}, highestUnlocked: 1, totalStars: 0 };
  }

  _saveProgress() {
    try {
      localStorage.setItem('warZonesCampaign', JSON.stringify(this.progress));
    } catch (e) { console.error('Failed to save campaign progress:', e); }
  }

  resetProgress() {
    this.progress = { missions: {}, highestUnlocked: 1, totalStars: 0 };
    this._saveProgress();
  }

  getMission(id) {
    return this.missions.find(m => m.id === id);
  }

  isMissionUnlocked(id) {
    return id <= this.progress.highestUnlocked;
  }

  getMissionStars(id) {
    return this.progress.missions[id]?.stars || 0;
  }

  // ========== UI: Campaign Map ==========
  showCampaignMap() {
    const existing = document.getElementById('campaignOverlay');
    if (existing) existing.remove();

    this.game.ui.hideMainMenu();

    const overlay = document.createElement('div');
    overlay.className = 'campaign-overlay';
    overlay.id = 'campaignOverlay';

    const totalStars = this.progress.totalStars || 0;
    const maxStars = this.missions.length * 3;

    let mapHTML = '';
    let currentAct = 0;

    this.missions.forEach((mission, i) => {
      if (mission.act !== currentAct) {
        currentAct = mission.act;
        mapHTML += `<div class="campaign-act-header"><span class="act-line"></span><span class="act-name">ACT ${currentAct}: ${mission.actName}</span><span class="act-line"></span></div>`;
      }

      const unlocked = this.isMissionUnlocked(mission.id);
      const stars = this.getMissionStars(mission.id);
      const completed = stars > 0;
      const bossClass = mission.isBoss ? (mission.bossTitle === 'FINAL BOSS' ? 'node-final-boss' : 'node-mini-boss') : '';
      const lockedClass = !unlocked ? 'locked' : '';
      const completedClass = completed ? 'completed' : '';

      mapHTML += `
        <div class="campaign-mission-node ${bossClass} ${lockedClass} ${completedClass}" data-mission-id="${mission.id}">
          <div class="mission-node-number">${mission.isBoss ? (mission.bossTitle === 'FINAL BOSS' ? '☠' : '⚔') : mission.id}</div>
          <div class="mission-node-info">
            <div class="mission-node-name">${mission.isBoss ? mission.bossTitle + ': ' : ''}${mission.name}</div>
            <div class="mission-node-subtitle">${mission.subtitle}</div>
            <div class="mission-node-difficulty difficulty-${mission.difficulty.toLowerCase()}">${mission.difficulty}</div>
          </div>
          <div class="mission-node-stars">
            ${unlocked ? this._renderStars(stars) : '<span class="lock-icon">🔒</span>'}
          </div>
        </div>
        ${i < this.missions.length - 1 ? '<div class="campaign-path-connector' + (!this.isMissionUnlocked(this.missions[i + 1].id) ? ' locked' : '') + '"></div>' : ''}
      `;
    });

    overlay.innerHTML = `
      <div class="campaign-content">
        <div class="campaign-header">
          <h1 class="campaign-title">OPERATION TRIDENT</h1>
          <div class="campaign-subtitle">Campaign Mode</div>
          <div class="campaign-star-total">${totalStars} / ${maxStars} Stars</div>
        </div>
        <div class="campaign-map-scroll">
          <div class="campaign-map">
            ${mapHTML}
          </div>
        </div>
        <div class="campaign-buttons">
          <button id="campaignBack" class="menu-button">Back to Menu</button>
          <button id="campaignReset" class="menu-button secondary campaign-reset-btn">Reset Progress</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#campaignBack').addEventListener('click', () => {
      overlay.remove();
      this.game.ui.renderMainMenu();
    });

    overlay.querySelector('#campaignReset').addEventListener('click', () => {
      if (confirm('Reset all campaign progress? This cannot be undone.')) {
        this.resetProgress();
        overlay.remove();
        this.showCampaignMap();
      }
    });

    overlay.querySelectorAll('.campaign-mission-node:not(.locked)').forEach(node => {
      node.style.cursor = 'pointer';
      node.addEventListener('click', () => {
        const missionId = parseInt(node.dataset.missionId);
        this.showBriefing(missionId);
      });
    });
  }

  _renderStars(count) {
    let html = '';
    for (let i = 0; i < 3; i++) {
      html += `<span class="star ${i < count ? 'earned' : 'empty'}">${i < count ? '★' : '☆'}</span>`;
    }
    return html;
  }

  // ========== UI: Mission Briefing ==========
  showBriefing(missionId) {
    const mission = this.getMission(missionId);
    if (!mission) return;

    const existing = document.getElementById('briefingOverlay');
    if (existing) existing.remove();

    const modifierTags = mission.modifiers.map(mod => {
      const labels = {
        'fog_of_war': '🌫️ Fog of War',
        'layer_fog': '🌊 Sonar Jam',
        'turn_timer': '⏱️ Time Pressure',
        'enemy_reinforcements': '🛥️ Reinforcements',
        'shields': '🛡️ Shields',
        'hit_decay': '👻 Hit Decay',
        'mines': '💣 Mines',
        'reduced_fleet': '📉 Reduced Fleet'
      };
      return `<span class="modifier-tag">${labels[mod] || mod}</span>`;
    }).join('');

    const bossClass = mission.isBoss ? (mission.bossTitle === 'FINAL BOSS' ? 'briefing-final-boss' : 'briefing-mini-boss') : '';
    const bestStars = this.getMissionStars(mission.id);
    const bestAccuracy = this.progress.missions[mission.id]?.accuracy || 0;

    const overlay = document.createElement('div');
    overlay.className = 'briefing-overlay';
    overlay.id = 'briefingOverlay';
    overlay.innerHTML = `
      <div class="briefing-content ${bossClass}">
        <div class="briefing-header">
          ${mission.isBoss ? `<div class="briefing-boss-tag">${mission.bossTitle}</div>` : ''}
          <div class="briefing-act">ACT ${mission.act}: ${mission.actName}</div>
          <h2 class="briefing-title">Mission ${mission.id}: ${mission.name}</h2>
          <div class="briefing-subtitle">${mission.subtitle}</div>
          <div class="briefing-difficulty difficulty-${mission.difficulty.toLowerCase()}">${mission.difficulty}</div>
        </div>
        <div class="briefing-text">${mission.briefing}</div>
        ${mission.modifiers.length > 0 ? `
          <div class="briefing-modifiers">
            <div class="modifiers-label">ACTIVE MODIFIERS</div>
            <div class="modifiers-list">${modifierTags}</div>
          </div>
        ` : ''}
        <div class="briefing-best">
          ${bestStars > 0
            ? `<div class="best-score">Best: ${this._renderStars(bestStars)} (${bestAccuracy}% accuracy)</div>`
            : '<div class="best-score">Not yet completed</div>'}
        </div>
        <div class="briefing-buttons">
          <button id="deployBtn" class="menu-button deploy-btn">DEPLOY</button>
          <button id="briefingBack" class="menu-button secondary">Back</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#deployBtn').addEventListener('click', () => {
      overlay.remove();
      const campaignOverlay = document.getElementById('campaignOverlay');
      if (campaignOverlay) campaignOverlay.remove();
      this.launchMission(mission.id);
    });

    overlay.querySelector('#briefingBack').addEventListener('click', () => {
      overlay.remove();
    });
  }

  // ========== Mission Lifecycle ==========
  launchMission(missionId) {
    const mission = this.getMission(missionId);
    if (!mission) return;

    this.activeMission = mission;
    this.playerTurnCount = 0;
    this.modifierState = {};

    if (mission.modifiers.includes('fog_of_war') || mission.modifiers.includes('layer_fog')) {
      this.modifierState.foggedCells = [];
    }
    if (mission.modifiers.includes('hit_decay')) {
      this.modifierState.hitCells = [];
    }
    if (mission.modifiers.includes('turn_timer')) {
      this.modifierState.timerInterval = null;
      this.modifierState.timerSeconds = mission.turnTimerSeconds || 10;
      this.modifierState.timerRemaining = this.modifierState.timerSeconds;
    }
    if (mission.modifiers.includes('shields')) {
      this.modifierState.shieldBroken = {};
    }
    if (mission.modifiers.includes('mines')) {
      this.modifierState.mines = [];
      this.modifierState.mineCount = mission.mineCount || 3;
    }
    if (mission.modifiers.includes('reduced_fleet')) {
      this.modifierState.skippedShips = mission.removedShips || [];
    }

    document.getElementById('player2Name').textContent = mission.isBoss ? mission.name : "Enemy";
    document.getElementById('player2Icon').textContent = mission.isBoss ? '☠️' : '🤖';
    this.game.gameState.gameMode = 'ai';
    this.game.sound.initialize();
    this.game.startNewGame('ai');
  }

  // Called right after AI ships are placed, before combat begins
  onCombatStart() {
    if (!this.activeMission) return;

    const config = this.activeMission.aiConfig;
    if (config.unpredictability !== undefined) {
      this.game.ai.personality.unpredictability = config.unpredictability;
    }
    if (config.clusterPreference !== undefined) {
      this.game.ai.personality.clusterPreference = config.clusterPreference;
    }

    if (this.activeMission.modifiers.includes('enemy_reinforcements') && this.activeMission.extraShips) {
      this._placeExtraShips();
    }

    if (this.activeMission.modifiers.includes('mines')) {
      this._placeMines();
    }

    if (this.activeMission.modifiers.includes('turn_timer')) {
      // Timer will start when player turn begins
    }

    // Show mission active notification
    if (this.activeMission.modifiers.length > 0) {
      const modNames = this.activeMission.modifiers.map(mod => {
        const labels = {
          'fog_of_war': 'FOG OF WAR', 'layer_fog': 'SONAR JAM',
          'turn_timer': 'TIME PRESSURE', 'enemy_reinforcements': 'REINFORCEMENTS',
          'shields': 'DEFLECTOR SHIELDS', 'hit_decay': 'HIT DECAY',
          'mines': 'NAVAL MINES', 'reduced_fleet': 'REDUCED FLEET'
        };
        return labels[mod] || mod;
      });
      setTimeout(() => {
        this.game.ui.updateCommentary(`Mission: ${this.activeMission.name} | ${modNames.join(' + ')}`);
        this.game.animateCommentaryBox();
      }, 1500);
    }
  }

  _placeExtraShips() {
    const gs = this.game.gameState;
    for (const extra of this.activeMission.extraShips) {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 100) {
        const layer = extra.layer;
        const index = Math.floor(Math.random() * (GAME_CONSTANTS.BOARD_SIZE ** 2));
        const rotation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
        const positions = [];
        const boardSize = GAME_CONSTANTS.BOARD_SIZE;
        const row = Math.floor(index / boardSize);
        const col = index % boardSize;

        if (extra.shape === 'line') {
          if (rotation === 'horizontal' && col + extra.size <= boardSize) {
            for (let i = 0; i < extra.size; i++) positions.push(index + i);
          } else if (rotation === 'vertical' && row + extra.size <= boardSize) {
            for (let i = 0; i < extra.size; i++) positions.push(index + (i * boardSize));
          }
        }

        if (positions.length === extra.size && positions.every(pos => gs.boards.opponent[layer][pos] === null)) {
          positions.forEach(pos => { gs.boards.opponent[layer][pos] = extra.name; });
          gs.ships.opponent[extra.name] = { positions, hits: [], isSunk: false };
          placed = true;
        }
        attempts++;
      }
    }
  }

  _placeMines() {
    const gs = this.game.gameState;
    const layer = 'Sea';
    const emptyCells = [];
    for (let i = 0; i < GAME_CONSTANTS.BOARD_SIZE ** 2; i++) {
      if (gs.boards.opponent[layer][i] === null) {
        emptyCells.push(i);
      }
    }
    for (let i = emptyCells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [emptyCells[i], emptyCells[j]] = [emptyCells[j], emptyCells[i]];
    }
    const mineCount = Math.min(this.modifierState.mineCount, emptyCells.length);
    for (let i = 0; i < mineCount; i++) {
      gs.boards.opponent[layer][emptyCells[i]] = 'Mine';
      this.modifierState.mines.push(emptyCells[i]);
    }
  }

  // ========== Modifier Hooks ==========
  beforePlayerAttack(index, layer) {
    if (!this.activeMission) return { blocked: false };
    const gs = this.game.gameState;
    const cellValue = gs.boards.opponent[layer][index];

    // Check for mines
    if (cellValue === 'Mine') {
      return { blocked: true, reason: 'mine', index, layer };
    }

    // Check for shields
    if (this.activeMission.modifiers.includes('shields')) {
      if (cellValue && cellValue !== 'hit' && cellValue !== 'miss' && cellValue !== 'Treasure' && cellValue !== 'Mine') {
        const shipType = cellValue;
        if (!this.modifierState.shieldBroken[shipType]) {
          return { blocked: true, reason: 'shield', shipType, index, layer };
        }
      }
    }

    return { blocked: false };
  }

  handleShieldBlock(cell, shipType) {
    this.modifierState.shieldBroken[shipType] = true;
    cell.classList.add('shield-deflect');
    cell.textContent = '🛡️';
    setTimeout(() => {
      cell.classList.remove('shield-deflect');
      cell.textContent = '';
    }, 1200);
    this.game.sound.playSound('miss');
    this.game.animations.playScreenShake(false);
    this.game.ui.updateCommentary(`${shipType}'s deflector shield absorbed the hit! Shield is now DOWN.`);
    this.game.animateCommentaryBox();
    this.game.gameState.shots.player.total++;
  }

  handleMineHit(cell, index, layer) {
    const gs = this.game.gameState;
    gs.boards.opponent[layer][index] = 'miss';
    this.modifierState.mines = this.modifierState.mines.filter(m => m !== index);
    cell.classList.add('miss', 'mine-exploded');
    cell.textContent = '💣';
    this.game.sound.playSound('sunk');
    this.game.animations.playExplosion(cell);
    this.game.animations.playScreenShake(true);
    gs.shots.player.total++;
    this.game.ui.updateCommentary("MINE! The blast stuns your fleet — enemy gets a bonus attack!");
    this.game.animateCommentaryBox();
  }

  afterPlayerMiss(layer, index, cell) {
    if (!this.activeMission) return;
    const isFogActive = this.activeMission.modifiers.includes('fog_of_war') ||
      (this.activeMission.modifiers.includes('layer_fog') &&
       this.activeMission.fogLayers?.includes(layer));

    if (isFogActive) {
      this.modifierState.foggedCells?.push({
        layer, index, turnPlaced: this.playerTurnCount, cell
      });
    }
  }

  afterPlayerHit(layer, index, cell) {
    if (!this.activeMission) return;
    if (this.activeMission.modifiers.includes('hit_decay')) {
      this.modifierState.hitCells?.push({
        layer, index, turnPlaced: this.playerTurnCount, cell
      });
    }
  }

  onPlayerTurnEnd() {
    if (!this.activeMission) return;
    this.playerTurnCount++;
    this._processFog();
    this._processHitDecay();
    this.stopTurnTimer();
  }

  onPlayerTurnStart() {
    if (!this.activeMission) return;
    if (this.activeMission.modifiers.includes('turn_timer')) {
      this.startTurnTimer();
    }
  }

  onPlayerHitContinue() {
    if (!this.activeMission) return;
    if (this.activeMission.modifiers.includes('turn_timer')) {
      this.resetTurnTimer();
    }
  }

  _processFog() {
    if (!this.modifierState.foggedCells) return;
    const fogTurns = this.activeMission.fogTurns || 2;
    this.modifierState.foggedCells = this.modifierState.foggedCells.filter(entry => {
      if (this.playerTurnCount - entry.turnPlaced >= fogTurns) {
        if (entry.cell && entry.cell.classList.contains('miss')) {
          entry.cell.classList.remove('miss');
          entry.cell.classList.add('fogged');
          entry.cell.textContent = '';
        }
        return false;
      }
      return true;
    });
  }

  _processHitDecay() {
    if (!this.modifierState.hitCells) return;
    const decayTurns = this.activeMission.decayTurns || 3;
    this.modifierState.hitCells = this.modifierState.hitCells.filter(entry => {
      if (this.playerTurnCount - entry.turnPlaced >= decayTurns) {
        if (entry.cell) {
          entry.cell.classList.remove('hit');
          entry.cell.classList.add('decayed');
          entry.cell.textContent = '?';
        }
        return false;
      }
      return true;
    });
  }

  // ========== Turn Timer ==========
  startTurnTimer() {
    this.stopTurnTimer();
    if (!this.activeMission?.modifiers.includes('turn_timer')) return;
    this.modifierState.timerRemaining = this.modifierState.timerSeconds;
    this._showTimerUI();
    this._updateTimerDisplay();
    this.modifierState.timerInterval = setInterval(() => {
      this.modifierState.timerRemaining--;
      this._updateTimerDisplay();
      if (this.modifierState.timerRemaining <= 0) {
        this.stopTurnTimer();
        this._timerExpired();
      }
    }, 1000);
  }

  resetTurnTimer() {
    if (this.modifierState.timerInterval) {
      this.modifierState.timerRemaining = this.modifierState.timerSeconds;
      this._updateTimerDisplay();
    }
  }

  stopTurnTimer() {
    if (this.modifierState.timerInterval) {
      clearInterval(this.modifierState.timerInterval);
      this.modifierState.timerInterval = null;
    }
    this._hideTimerUI();
  }

  _timerExpired() {
    if (this.game.gameState.phase !== 'combat') return;
    if (this.game.isProcessingTurn) return;
    this.game.ui.updateCommentary("TIME'S UP! Turn passes to the enemy!");
    this.game.animateCommentaryBox();
    this.game.animations.playScreenShake(false);
    this.onPlayerTurnEnd();
    this.game.isProcessingTurn = true;
    this.game.handleAITurn();
  }

  _showTimerUI() {
    let timerEl = document.getElementById('turnTimer');
    if (!timerEl) {
      timerEl = document.createElement('div');
      timerEl.id = 'turnTimer';
      timerEl.className = 'turn-timer';
      timerEl.innerHTML = '<div class="turn-timer-bar"></div><span class="turn-timer-text"></span>';
      const commentary = document.getElementById('commentaryBox');
      if (commentary) commentary.after(timerEl);
    }
    timerEl.classList.remove('hidden');
  }

  _hideTimerUI() {
    const timerEl = document.getElementById('turnTimer');
    if (timerEl) timerEl.classList.add('hidden');
  }

  _updateTimerDisplay() {
    const timerEl = document.getElementById('turnTimer');
    if (!timerEl) return;
    const remaining = this.modifierState.timerRemaining;
    const total = this.modifierState.timerSeconds;
    const pct = (remaining / total) * 100;
    const bar = timerEl.querySelector('.turn-timer-bar');
    const text = timerEl.querySelector('.turn-timer-text');
    if (bar) bar.style.width = `${pct}%`;
    if (text) text.textContent = `${remaining}s`;
    timerEl.className = 'turn-timer';
    if (remaining <= 3) timerEl.classList.add('critical');
    else if (remaining <= 5) timerEl.classList.add('warning');
  }

  // ========== Skip Ships (Reduced Fleet) ==========
  shouldSkipShip(shipType) {
    if (!this.activeMission) return false;
    return this.modifierState.skippedShips?.includes(shipType) || false;
  }

  // ========== Mission Completion ==========
  completeMission(won, accuracy) {
    if (!this.activeMission) return null;
    this.stopTurnTimer();
    const mission = this.activeMission;
    let stars = 0;

    if (won) {
      stars = 1;
      if (accuracy >= mission.starThresholds.two) stars = 2;
      if (accuracy >= mission.starThresholds.three) stars = 3;

      const prev = this.progress.missions[mission.id]?.stars || 0;
      if (stars >= prev) {
        this.progress.missions[mission.id] = { stars, accuracy, completed: true };
      }

      if (mission.id >= this.progress.highestUnlocked && mission.id < this.missions.length) {
        this.progress.highestUnlocked = mission.id + 1;
      }

      this.progress.totalStars = Object.values(this.progress.missions)
        .reduce((sum, m) => sum + (m.stars || 0), 0);
      this._saveProgress();
    }

    return { stars, mission };
  }

  // ========== Campaign Game Over (Debriefing) ==========
  showDebriefing(result) {
    const isVictory = result.winner === 'player';
    const mission = this.activeMission;
    if (!mission) return;

    const shotsData = this.game.gameState.shots.player;
    const shots = shotsData.total || 0;
    const hits = shotsData.hits || 0;
    const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : 0;
    const elapsed = this.game.gameState.startTime ? Math.floor((Date.now() - this.game.gameState.startTime) / 1000) : 0;
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const completionResult = this.completeMission(isVictory, accuracy);
    const stars = completionResult?.stars || 0;

    const bossClass = mission.isBoss ? (mission.bossTitle === 'FINAL BOSS' ? 'debrief-final-boss' : 'debrief-mini-boss') : '';
    const hasNext = mission.id < this.missions.length && isVictory;
    const isFinalBossVictory = mission.id === 10 && isVictory;

    const overlay = document.createElement('div');
    overlay.className = `game-over-overlay campaign-debrief ${isVictory ? 'victory-overlay' : 'defeat-overlay'} ${bossClass}`;
    overlay.id = 'gameOverOverlay';

    overlay.innerHTML = `
      <div class="game-over-content campaign-debrief-content">
        <div class="debrief-header">
          ${isFinalBossVictory ? '<div class="final-victory-text">THE WAR IS OVER</div>' : ''}
          <h2>${isVictory ? (mission.isBoss ? 'BOSS DEFEATED' : 'MISSION COMPLETE') : 'MISSION FAILED'}</h2>
          <div class="debrief-mission-name">${mission.isBoss ? mission.bossTitle + ': ' : ''}${mission.name}</div>
        </div>
        ${isVictory ? `
          <div class="debrief-stars">
            <div class="star-display">
              ${[1, 2, 3].map(i => `<span class="debrief-star ${i <= stars ? 'earned' : ''}" style="animation-delay: ${0.3 + i * 0.3}s">${i <= stars ? '★' : '☆'}</span>`).join('')}
            </div>
            <div class="star-label">${stars === 3 ? 'PERFECT' : stars === 2 ? 'GREAT' : 'CLEARED'}</div>
          </div>
        ` : `
          <div class="debrief-defeat-msg">
            ${mission.isBoss ? "The enemy commander proved too strong... this time." : "Regroup and try again, Commander."}
          </div>
        `}
        <div class="stats">
          <p>Shots Fired: ${shots}</p>
          <p>Hits: ${hits}</p>
          <p>Accuracy: <span class="accuracy-value">${accuracy}%</span></p>
          <p>Time: ${timeStr}</p>
        </div>
        ${isFinalBossVictory ? `
          <div class="final-victory-msg">
            Admiral Voss has been defeated. The fleet is saved.<br>
            Your name will echo through the ages, Commander.<br>
            Total Stars: ${this.progress.totalStars} / ${this.missions.length * 3}
          </div>
        ` : ''}
        <div class="game-over-buttons">
          ${hasNext ? `<button id="nextMissionBtn" class="game-over-button campaign-next-btn">Next Mission</button>` : ''}
          <button id="retryMissionBtn" class="game-over-button">${isVictory ? 'Replay' : 'Retry'}</button>
          <button id="campaignMapBtn" class="game-over-button">Campaign Map</button>
        </div>
      </div>
    `;

    const existingOverlay = document.getElementById('gameOverOverlay');
    if (existingOverlay) existingOverlay.remove();
    document.body.appendChild(overlay);

    if (isVictory) {
      this.game.animations.playConfetti(overlay);
    }

    if (hasNext) {
      overlay.querySelector('#nextMissionBtn').addEventListener('click', () => {
        overlay.remove();
        this.launchMission(mission.id + 1);
      });
    }

    overlay.querySelector('#retryMissionBtn').addEventListener('click', () => {
      overlay.remove();
      this.launchMission(mission.id);
    });

    overlay.querySelector('#campaignMapBtn').addEventListener('click', () => {
      overlay.remove();
      this.activeMission = null;
      this.showCampaignMap();
    });
  }

  cleanup() {
    this.stopTurnTimer();
    this.activeMission = null;
    this.modifierState = {};
    this.playerTurnCount = 0;
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
    this.pingInterval = null;
    this.lastPingTime = null;
    this.currentPing = null;
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0/O, 1/I/L
    let code = '';
    for (let i = 0; i < 7; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  updateConnectionUI(status, text) {
    const el = document.getElementById('connectionStatus');
    if (!el) return;

    el.classList.remove('connected', 'connecting', 'disconnected');
    el.classList.add('visible', status);
    el.querySelector('.connection-text').textContent = text;

    const pingEl = el.querySelector('.connection-ping');
    if (this.currentPing !== null && status === 'connected') {
      pingEl.textContent = `${this.currentPing}ms`;
    } else {
      pingEl.textContent = '';
    }
  }

  hideConnectionUI() {
    const el = document.getElementById('connectionStatus');
    if (el) el.classList.remove('visible');
  }

  startPingLoop() {
    this.stopPingLoop();
    this.pingInterval = setInterval(() => {
      if (this.conn && this.conn.open) {
        this.lastPingTime = Date.now();
        this.conn.send({ type: 'PING', timestamp: this.lastPingTime });
      }
    }, 5000);
  }

  stopPingLoop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  handlePing(data) {
    if (data.type === 'PING') {
      // Respond to ping
      this.send({ type: 'PONG', timestamp: data.timestamp });
      return true;
    }
    if (data.type === 'PONG') {
      // Calculate round-trip time
      this.currentPing = Date.now() - data.timestamp;
      this.updateConnectionUI('connected', 'Connected');
      return true;
    }
    return false;
  }

  initialize(customId = null) {
    // Use custom ID if provided (for hosting), otherwise let PeerJS generate one
    const peerId = customId || null;

    this.updateConnectionUI('connecting', 'Connecting...');

    this.peer = new Peer(peerId, {
      debug: 2
    });

    this.peer.on('open', (id) => {
      this.roomCode = id;
      console.log('My peer ID is: ' + id);
      if (this.isHost) {
        this.game.ui.showRoomCode(id);
        this.updateConnectionUI('connecting', 'Waiting for opponent...');
      }
    });

    this.peer.on('connection', (conn) => {
      this.handleConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      const errorMessages = {
        'browser-incompatible': 'Your browser does not support WebRTC.',
        'disconnected': 'Connection to the server was lost.',
        'invalid-id': 'The room code is invalid.',
        'invalid-key': 'API key error. Please try again.',
        'network': 'Network error. Check your internet connection.',
        'peer-unavailable': 'Room not found. Check the room code and try again.',
        'ssl-unavailable': 'Secure connection not available.',
        'server-error': 'Server error. Please try again later.',
        'socket-error': 'Connection error. Please try again.',
        'socket-closed': 'Connection was closed unexpectedly.',
        'unavailable-id': 'Room code already in use. Try again.',
        'webrtc': 'WebRTC error. Please try a different browser.'
      };
      const message = errorMessages[err.type] || `Connection error: ${err.type}`;
      this.updateConnectionUI('disconnected', 'Error');
      this.game.ui.updateCommentary(message);
      setTimeout(() => {
        this.hideConnectionUI();
        this.game.ui.showMainMenu();
      }, 2000);
    });
  }

  connect(remoteId) {
    if (!this.peer) this.initialize();

    // Close existing connection if any
    if (this.conn) {
      this.conn.close();
    }

    this.updateConnectionUI('connecting', 'Joining...');
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
      this.updateConnectionUI('connected', 'Connected');
      this.startPingLoop();
      this.game.onPeerConnected(this.isHost);
    };

    // Set up the 'open' event handler
    this.conn.on('open', handleOpen);

    // Check if the connection is already open (event may have already fired)
    if (this.conn.open) {
      handleOpen();
    }

    this.conn.on('data', (data) => {
      // Handle ping/pong internally
      if (this.handlePing(data)) return;

      console.log('Received data:', data);
      this.game.handlePeerData(data);
    });

    this.conn.on('close', () => {
      console.log('Connection closed');
      this.isConnected = false;
      this.stopPingLoop();
      this.updateConnectionUI('disconnected', 'Disconnected');

      // Only show alert/redirect if game is still in progress
      if (this.game.gameState.phase !== 'gameOver') {
        this.game.ui.updateCommentary('Opponent disconnected!');
        setTimeout(() => {
          this.hideConnectionUI();
          this.game.ui.showMainMenu();
        }, 2000);
      }
    });

    this.conn.on('error', (err) => {
      console.error('Connection error:', err);
      this.updateConnectionUI('disconnected', 'Error');
    });
  }

  send(data) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    } else {
      console.error('Connection not open, cannot send data');
      this.updateConnectionUI('disconnected', 'Disconnected');
    }
  }

  reset() {
    this.stopPingLoop();
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
    this.currentPing = null;
    this.hideConnectionUI();
  }
}

/* --- Initialize Game on DOM Ready --- */
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