/*
 * WarZones game controller module.
 *
 * The top-level class that wires GameState, UIController, SoundManager,
 * AnimationManager, GameAI, Statistics, CampaignManager, and
 * NetworkManager together. Owns turn flow, powerup orchestration, online
 * message routing, and keyboard/ship-counter UI. Depends on everything
 * else in lib/ (loaded as classic scripts before this one).
 *
 * Dual-mode loader. Node consumers (future tests) would need to stub the
 * DOM; for now only the browser path is exercised.
 */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const GAME_CONSTANTS = isNode ? require('./game-state.js').GAME_CONSTANTS : global.GAME_CONSTANTS;
  const GameState = isNode ? require('./game-state.js').GameState : global.GameState;
  const UIController = isNode ? require('./ui.js').UIController : global.UIController;
  const SoundManager = isNode ? require('./sound.js').SoundManager : global.SoundManager;
  const AnimationManager = isNode ? require('./animations.js').AnimationManager : global.AnimationManager;
  const GameAI = isNode ? require('./ai.js').GameAI : global.GameAI;
  const Statistics = isNode ? require('./statistics.js').Statistics : global.Statistics;
  const CampaignManager = isNode ? require('./campaign.js').CampaignManager : global.CampaignManager;
  const NetworkManager = isNode ? require('./network.js').NetworkManager : global.NetworkManager;

  class WarZones {
    constructor() {
      this.gameState = new GameState();
      this.ui = new UIController(this);
      this.sound = new SoundManager();
      this.animations = new AnimationManager();
      this.ai = new GameAI(this); // Pass 'this' to GameAI constructor
      this.stats = new Statistics();
      this.campaign = new CampaignManager(this);
      this.network = new NetworkManager(this);
      this.playerWins = 0;
      this.player2Wins = 0;
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
  
      // Online mode: tell the opponent about the new ship so their local
      // ships.opponent tracking stays in sync (needed for win-condition
      // checks and for processAttack to register hits on ExtraJet).
      if (this.gameState.gameMode === 'online' && this.network.isConnected) {
        this.network.send({
          type: 'EXTRA_JET_PLACED',
          position: index
        });
      }
  
      // Update UI
      UIController.paintShipSprite('#playerSkyBoard', 'ExtraJet', [index]);
  
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
  
      // Online mode: send the laser attack to the opponent over the network.
      // Their client will process the attack against their authoritative
      // boards.player state, then reply with a LASER_RESULT message that
      // our handleLaserResult() applies to our local view.
      if (game.gameState.gameMode === 'online') {
        game.ui.updateCommentary('Firing Krypton Laser...');
        game.animateCommentaryBox();
        game.network.send({
          type: 'LASER_ATTACK',
          index: index
        });
        // isProcessingTurn stays true until LASER_RESULT arrives.
        return;
      }
  
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
            game.player2Wins++;
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
  
      // Online mode: send the cannon-ball attack to the opponent and wait
      // for their CANNONBALL_RESULT. Restore the normal handleAttack
      // binding before returning — the monkey-patch below is only needed
      // while local targeting is active.
      if (this.gameState.gameMode === 'online') {
        this.ui.updateCommentary('Firing Cannon Ball...');
        this.animateCommentaryBox();
        this.network.send({
          type: 'CANNONBALL_ATTACK',
          index: index
        });
        // isProcessingTurn stays true until CANNONBALL_RESULT arrives.
        return;
      }
  
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
            this.player2Wins++;
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
  
    // Check if BlackBox is viable (need empty unattacked sky cells on AI's board)
    const canUseBlackBox = this.gameState.boards.opponent.Sky.some(cell => cell === null);
  
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
      } else if (canUseBlackBox) {
        // Few positions - reinforce
        selectedPowerup = 'BlackBox';
      } else {
        // BlackBox not viable, fall back to attack
        selectedPowerup = 'KryptonLaser';
      }
    } else {
      // 30% chance to choose randomly from viable powerups
      const viable = canUseBlackBox ? powerups : powerups.filter(p => p !== 'BlackBox');
      selectedPowerup = viable[Math.floor(Math.random() * viable.length)];
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
  
    // Only consider layers where the player still has ships to hunt. This
    // prevents wasted laser shots on layers stripped by reduced_fleet
    // missions (e.g. Kraken removes the player's Submarine, so the Sub
    // layer has no valid targets).
    const layersToAttack = GAME_CONSTANTS.LAYERS.filter(layer => !this.ai.shipCompleted(layer));
  
    // If every layer is exhausted the game should already be over; bail
    // out defensively rather than firing the laser into empty space.
    if (layersToAttack.length === 0) {
      this.ui.updateCommentary("AI used Krypton Laser but had no valid targets!");
      return;
    }
  
    // Try to find a strategic position - look for unattacked positions
    // in the layers we actually plan to attack.
    const allUnattacked = [];
    for (let i = 0; i < boardSize * boardSize; i++) {
      // Check if this position has unattacked cells in any attackable layer
      let hasUnattacked = false;
      for (const layer of layersToAttack) {
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
  
    // Attack the same position across all attackable layers
    let hitCount = 0;
    let sunkCount = 0;
    const results = [];
  
    layersToAttack.forEach(layer => {
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
          this.ai.recordSunk(layer, result.shipType);
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
        this.player2Wins++;
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
            this.ai.recordSunk('Sea', result.shipType);
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
        this.player2Wins++;
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
  
    _cellCoord(index) {
      const row = Math.floor(index / GAME_CONSTANTS.BOARD_SIZE);
      const col = index % GAME_CONSTANTS.BOARD_SIZE;
      return `${String.fromCharCode(65 + row)}${col + 1}`;
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
        pBoard.setAttribute('role', 'grid');
        pBoard.setAttribute('aria-label', `Your ${layerNames[board.id]} layer`);
        for (let i = 0; i < GAME_CONSTANTS.BOARD_SIZE ** 2; i++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.dataset.index = i;
          cell.dataset.layer = board.id;
          cell.setAttribute('role', 'gridcell');
          cell.setAttribute('aria-label', `${layerNames[board.id]} ${this._cellCoord(i)}`);
  
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
        oBoard.setAttribute('role', 'grid');
        oBoard.setAttribute('aria-label', `Opponent ${layerNames[board.id]} layer`);
        for (let i = 0; i < GAME_CONSTANTS.BOARD_SIZE ** 2; i++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.dataset.index = i;
          cell.dataset.layer = board.id;
          cell.setAttribute('role', 'gridcell');
          cell.setAttribute('aria-label', `Opponent ${layerNames[board.id]} ${this._cellCoord(i)}`);
  
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
      // Wrap each handler in a try/catch so a silent crash (e.g. an
      // unexpected undefined field from Firebase stripping) can't leave
      // isProcessingTurn stuck true and freeze the turn flow.
      try {
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
          case 'EXTRA_JET_PLACED':
            // Opponent used BlackBox and placed an extra jet on their own
            // Sky board. Mirror it in our ships.opponent tracking so we
            // can register hits on it and count it for win conditions.
            this.handleExtraJetPlaced(data);
            break;
          case 'LASER_ATTACK':
            // Opponent fired their Krypton Laser at a position across all
            // four of our layers. Process each attack on our authoritative
            // state and ship the results back.
            this.handleIncomingLaser(data);
            break;
          case 'LASER_RESULT':
            // Our Krypton Laser just finished on the opponent's side —
            // apply the result array to our local view.
            this.handleLaserResult(data);
            break;
          case 'CANNONBALL_ATTACK':
            // Opponent fired their Cannon Ball at a 2×2 area on our Sea
            // board. Process each valid cell and ship the results back.
            this.handleIncomingCannonBall(data);
            break;
          case 'CANNONBALL_RESULT':
            // Our Cannon Ball just finished on the opponent's side — apply
            // the result array to our local view.
            this.handleCannonBallResult(data);
            break;
        }
      } catch (err) {
        console.error('Error handling peer data:', err, 'data:', data);
        // Never leave the click-guard locked if a handler blew up
        this.isProcessingTurn = false;
      }
    }
  
    loadOpponentShips(shipsData) {
        // Firebase RTDB strips empty arrays/objects on write, so by the time
        // the opponent's ships reach us the `hits: []` field has disappeared
        // from every ship. Rehydrate missing fields before using them or a
        // later `ship.hits.includes(...)` call in handleAttackResult() will
        // throw and silently kill the turn flow.
        const normalized = {};
        Object.entries(shipsData || {}).forEach(([shipName, ship]) => {
          normalized[shipName] = {
            positions: Array.isArray(ship?.positions) ? ship.positions.slice() : [],
            hits: Array.isArray(ship?.hits) ? ship.hits.slice() : [],
            isSunk: !!ship?.isSunk
          };
        });
        this.gameState.ships.opponent = normalized;
  
        this.gameState.boards.opponent = this.gameState.createEmptyBoards();
  
        Object.entries(normalized).forEach(([shipName, ship]) => {
           if (!GAME_CONSTANTS.SHIPS[shipName]) return;
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
      const result = data && data.result;
      if (!result) {
        console.warn('handleAttackResult called without a result object', data);
        this.isProcessingTurn = false;
        return;
      }
  
      // Track my hit locally
      if (result.hit) {
        this.gameState.shots.player.hits++;
      }
  
      // Use updateBoard but map boardId to opponent (guard against missing boardId)
      if (typeof result.boardId === 'string') {
        result.boardId = result.boardId.replace('player', 'opponent');
      }
  
      // CRITICAL: Update local ship state for win condition detection.
      // ship.hits may be missing here if Firebase stripped an empty array
      // during SHIPS_READY delivery — defensively re-initialize it.
      if (result.hit && result.shipType && this.gameState.ships.opponent[result.shipType]) {
        const ship = this.gameState.ships.opponent[result.shipType];
        if (!Array.isArray(ship.hits)) ship.hits = [];
        if (!ship.hits.includes(result.index)) {
          ship.hits.push(result.index);
        }
        if (result.sunk) {
          ship.isSunk = true;
        }
      }
  
      this.ui.updateBoard(result);
      this.sound.playSound(result.hit ? 'hit' : 'miss');
      if (result.sunk) this.sound.playSound('sunk');
  
      // Check game over locally as well (in case remote result is incorrect).
      // Guard against missing/weird gameOver object from Firebase round-trip.
      const localGameOver = this.gameState.checkGameOver();
      const remoteIsOver = !!(result.gameOver && result.gameOver.isOver);
      const isGameOver = remoteIsOver || localGameOver.isOver;
  
      if (isGameOver) {
         // I won - I destroyed all opponent's ships
         this.gameState.phase = 'gameOver';
         this.isProcessingTurn = false;
         const gameOverResult = {
           ...(result.gameOver || {}),
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
         this.isProcessingTurn = false;
      } else if (result.hit) {
         // I hit, I get another turn (like AI mode)
         this.ui.updateCommentary(result.sunk ? `You sunk their ${result.shipType}! Attack again!` : "Hit! Attack again!");
         this.animateCommentaryBox();
         // currentTurn stays as myPlayerId
         this.isProcessingTurn = false;
      } else {
         // I missed, switch turn to opponent
         this.gameState.currentTurn = this.gameState.myPlayerId === 1 ? 2 : 1;
         this.ui.updateCommentary("You missed! Opponent's Turn - Wait...");
         this.isProcessingTurn = false;
      }
    }
  
    // ========== Online Powerup Handlers ==========
    // These mirror the AI/human powerup flows but route attacks through the
    // network so both clients stay in sync. Each powerup has an "incoming"
    // handler (opponent fired at me) and, for attack powerups, a "result"
    // handler (my powerup finished on the opponent's side).
  
    /**
     * Opponent placed an ExtraJet (BlackBox powerup). Mirror it in our
     * tracking state so future attacks on that Sky cell register as ship
     * hits and our win-condition check accounts for the extra ship.
     */
    handleExtraJetPlaced(data) {
      const position = data && data.position;
      if (typeof position !== 'number') return;
  
      if (!this.gameState.ships.opponent['ExtraJet']) {
        this.gameState.ships.opponent['ExtraJet'] = {
          positions: [position],
          hits: [],
          isSunk: false
        };
      } else {
        if (!this.gameState.ships.opponent['ExtraJet'].positions.includes(position)) {
          this.gameState.ships.opponent['ExtraJet'].positions.push(position);
        }
      }
      // Mirror on opponent's Sky board so attack-tracking stays consistent
      // (ships are hidden visually in online mode, so nothing visible
      // changes for us).
      this.gameState.boards.opponent.Sky[position] = 'ExtraJet';
  
      this.showPowerupNotification('BlackBox', true);
      this.ui.updateCommentary('Opponent deployed an extra fighter jet!');
      this.animateCommentaryBox();
    }
  
    /**
     * Opponent fired their Krypton Laser at a position across all four of
     * our layers. Process each attack against our authoritative state and
     * ship the results back so they can update their UI.
     */
    handleIncomingLaser(data) {
      const index = data && data.index;
      if (typeof index !== 'number') return;
  
      const results = [];
      GAME_CONSTANTS.LAYERS.forEach((layer) => {
        const cellState = this.gameState.boards.player[layer][index];
        if (cellState === 'hit' || cellState === 'miss') return;
        const boardId = `player${layer}Board`;
        const result = this.gameState.processAttack(boardId, index, layer);
        results.push(result);
        this.ui.updateBoard(result);
        if (result.hit) {
          const cell = document.querySelector(`#${boardId} .cell[data-index="${index}"]`);
          if (cell) this.animations.playExplosion(cell);
        }
      });
  
      this.sound.playSound(results.some(r => r.hit) ? 'hit' : 'miss');
      this.animations.playScreenShake(results.some(r => r.sunk));
      this.ui.updateScoreBoard();
  
      // Send results back to the attacker.
      this.network.send({
        type: 'LASER_RESULT',
        results: results
      });
  
      const hitCount = results.filter(r => r.hit).length;
      const sunkCount = results.filter(r => r.sunk).length;
  
      let msg = hitCount > 0
        ? `Opponent's Krypton Laser hit ${hitCount} target${hitCount !== 1 ? 's' : ''}`
        : "Opponent's Krypton Laser missed all targets!";
      if (sunkCount > 0) msg += ` and sunk ${sunkCount} ship${sunkCount !== 1 ? 's' : ''}!`;
      else if (hitCount > 0) msg += '!';
      this.ui.updateCommentary(msg);
      this.animateCommentaryBox();
  
      // Check game over
      const gameOverResult = results.find(r => r.gameOver && r.gameOver.isOver);
      if (gameOverResult) {
        this.gameState.phase = 'gameOver';
        this.isProcessingTurn = false;
        this.ui.showGameOver({
          ...gameOverResult.gameOver,
          winner: 'opponent',
          mode: 'online'
        });
        return;
      }
  
      // Turn flow: if opponent hit anything, their turn continues (we
      // wait). If they missed everything, the turn comes back to us.
      if (hitCount === 0 && results.length > 0) {
        this.gameState.currentTurn = this.gameState.myPlayerId;
        this.ui.updateCommentary('Your turn!');
      }
    }
  
    /**
     * Our Krypton Laser landed on the opponent's side — they shipped back
     * the per-layer results. Apply them to our local view, update ship
     * tracking, and handle turn flow.
     */
    handleLaserResult(data) {
      const results = data && data.results;
      if (!Array.isArray(results) || results.length === 0) {
        // No valid cells were attacked — nothing to do, release the lock.
        this.isProcessingTurn = false;
        this.ui.updateCommentary('No valid targets for Krypton Laser!');
        return;
      }
  
      let hitCount = 0;
      let sunkCount = 0;
  
      results.forEach((result) => {
        if (!result) return;
        this.gameState.shots.player.total++;
        if (result.hit) {
          this.gameState.shots.player.hits++;
          hitCount++;
          if (result.sunk) sunkCount++;
        }
  
        // Update local opponent ship tracking for win condition.
        if (result.hit && result.shipType && this.gameState.ships.opponent[result.shipType]) {
          const ship = this.gameState.ships.opponent[result.shipType];
          if (!Array.isArray(ship.hits)) ship.hits = [];
          if (!ship.hits.includes(result.index)) ship.hits.push(result.index);
          if (result.sunk) ship.isSunk = true;
        }
  
        // Paint it on our view of the opponent's boards.
        const displayResult = { ...result };
        if (typeof displayResult.boardId === 'string') {
          displayResult.boardId = displayResult.boardId.replace('player', 'opponent');
        }
        this.ui.updateBoard(displayResult);
  
        const cell = document.querySelector(`#${displayResult.boardId} .cell[data-index="${displayResult.index}"]`);
        if (cell) {
          if (result.hit) this.animations.playExplosion(cell);
          else this.animations.playSplash(cell);
        }
      });
  
      if (hitCount > 0) {
        this.sound.playSound('hit');
        this.animations.playScreenShake(sunkCount > 0);
      } else {
        this.sound.playSound('miss');
      }
  
      this.ui.updateScoreBoard();
  
      let msg;
      if (hitCount > 0) {
        msg = `Krypton Laser hit ${hitCount} target${hitCount !== 1 ? 's' : ''}`;
        if (sunkCount > 0) msg += ` and sunk ${sunkCount} ship${sunkCount !== 1 ? 's' : ''}`;
        msg += '! Your turn continues.';
      } else {
        msg = 'Krypton Laser missed all targets! Opponent\'s turn.';
      }
      this.ui.updateCommentary(msg);
      this.animateCommentaryBox();
  
      // Check game over — both remote and locally computed.
      const localGameOver = this.gameState.checkGameOver();
      const remoteGameOver = results.some(r => r && r.gameOver && r.gameOver.isOver);
      if (remoteGameOver || localGameOver.isOver) {
        this.gameState.phase = 'gameOver';
        this.isProcessingTurn = false;
        this.ui.showGameOver({ isOver: true, winner: 'player', mode: 'online' });
        return;
      }
  
      // Turn flow: hit → stay; miss everything → flip to opponent.
      if (hitCount === 0) {
        this.gameState.currentTurn = this.gameState.myPlayerId === 1 ? 2 : 1;
      }
      this.isProcessingTurn = false;
    }
  
    /**
     * Opponent fired their Cannon Ball at a 2×2 area on our Sea board.
     * Process each valid cell and ship the results back.
     */
    handleIncomingCannonBall(data) {
      const index = data && data.index;
      if (typeof index !== 'number') return;
  
      const boardSize = GAME_CONSTANTS.BOARD_SIZE;
      const row = Math.floor(index / boardSize);
      const col = index % boardSize;
  
      const attackPositions = [];
      for (let r = row; r < row + 2 && r < boardSize; r++) {
        for (let c = col; c < col + 2 && c < boardSize; c++) {
          attackPositions.push(r * boardSize + c);
        }
      }
  
      const results = [];
      attackPositions.forEach((targetIndex) => {
        const cellState = this.gameState.boards.player.Sea[targetIndex];
        if (cellState === 'hit' || cellState === 'miss') return;
        const result = this.gameState.processAttack('playerSeaBoard', targetIndex, 'Sea');
        results.push(result);
        this.ui.updateBoard(result);
        if (result.hit) {
          const cell = document.querySelector(`#playerSeaBoard .cell[data-index="${targetIndex}"]`);
          if (cell) this.animations.playExplosion(cell);
        } else {
          const cell = document.querySelector(`#playerSeaBoard .cell[data-index="${targetIndex}"]`);
          if (cell) this.animations.playSplash(cell);
        }
      });
  
      this.sound.playSound(results.some(r => r.hit) ? 'hit' : 'miss');
      this.animations.playScreenShake(results.some(r => r.sunk));
      this.ui.updateScoreBoard();
  
      this.network.send({
        type: 'CANNONBALL_RESULT',
        results: results
      });
  
      const hitCount = results.filter(r => r.hit).length;
      const sunkCount = results.filter(r => r.sunk).length;
  
      let msg;
      if (hitCount > 0) {
        msg = `Opponent's Cannon Ball hit ${hitCount} target${hitCount !== 1 ? 's' : ''}`;
        if (sunkCount > 0) msg += ` and sunk ${sunkCount} ship${sunkCount !== 1 ? 's' : ''}`;
        msg += '!';
      } else if (results.length > 0) {
        msg = "Opponent's Cannon Ball missed all targets!";
      } else {
        msg = "Opponent's Cannon Ball found no valid targets.";
      }
      this.ui.updateCommentary(msg);
      this.animateCommentaryBox();
  
      // Check game over
      const gameOverResult = results.find(r => r.gameOver && r.gameOver.isOver);
      if (gameOverResult) {
        this.gameState.phase = 'gameOver';
        this.isProcessingTurn = false;
        this.ui.showGameOver({
          ...gameOverResult.gameOver,
          winner: 'opponent',
          mode: 'online'
        });
        return;
      }
  
      // Turn flow: if opponent hit anything, their turn continues. If all
      // miss (or no valid cells), turn comes back to us.
      if (hitCount === 0) {
        this.gameState.currentTurn = this.gameState.myPlayerId;
        this.ui.updateCommentary('Your turn!');
      }
    }
  
    /**
     * Our Cannon Ball result from the opponent — apply to local view.
     */
    handleCannonBallResult(data) {
      const results = data && data.results;
      if (!Array.isArray(results) || results.length === 0) {
        this.isProcessingTurn = false;
        this.ui.updateCommentary('No valid targets for Cannon Ball!');
        return;
      }
  
      let hitCount = 0;
      let sunkCount = 0;
  
      results.forEach((result) => {
        if (!result) return;
        this.gameState.shots.player.total++;
        if (result.hit) {
          this.gameState.shots.player.hits++;
          hitCount++;
          if (result.sunk) sunkCount++;
        }
  
        if (result.hit && result.shipType && this.gameState.ships.opponent[result.shipType]) {
          const ship = this.gameState.ships.opponent[result.shipType];
          if (!Array.isArray(ship.hits)) ship.hits = [];
          if (!ship.hits.includes(result.index)) ship.hits.push(result.index);
          if (result.sunk) ship.isSunk = true;
        }
  
        const displayResult = { ...result };
        if (typeof displayResult.boardId === 'string') {
          displayResult.boardId = displayResult.boardId.replace('player', 'opponent');
        }
        this.ui.updateBoard(displayResult);
  
        const cell = document.querySelector(`#${displayResult.boardId} .cell[data-index="${displayResult.index}"]`);
        if (cell) {
          if (result.hit) this.animations.playExplosion(cell);
          else this.animations.playSplash(cell);
        }
      });
  
      if (hitCount > 0) {
        this.sound.playSound('hit');
        this.animations.playScreenShake(sunkCount > 0);
      } else {
        this.sound.playSound('miss');
      }
  
      this.ui.updateScoreBoard();
  
      let msg;
      if (hitCount > 0) {
        msg = `Cannon Ball hit ${hitCount} target${hitCount !== 1 ? 's' : ''}`;
        if (sunkCount > 0) msg += ` and sunk ${sunkCount} ship${sunkCount !== 1 ? 's' : ''}`;
        msg += '! Your turn continues.';
      } else {
        msg = "Cannon Ball missed all targets! Opponent's turn.";
      }
      this.ui.updateCommentary(msg);
      this.animateCommentaryBox();
  
      // Check game over
      const localGameOver = this.gameState.checkGameOver();
      const remoteGameOver = results.some(r => r && r.gameOver && r.gameOver.isOver);
      if (remoteGameOver || localGameOver.isOver) {
        this.gameState.phase = 'gameOver';
        this.isProcessingTurn = false;
        this.ui.showGameOver({ isOver: true, winner: 'player', mode: 'online' });
        return;
      }
  
      // Turn flow
      if (hitCount === 0) {
        this.gameState.currentTurn = this.gameState.myPlayerId === 1 ? 2 : 1;
      }
      this.isProcessingTurn = false;
    }
  
    handleShipPlacement(boardId, index, layer) {
      if (this.gameState.phase !== 'setup') return;
      const result = this.gameState.placeShip(boardId, index, layer);
      
      if (result.success) {
        this.sound.playSound('place');
        document.querySelectorAll(`#${boardId} .cell`).forEach(cell => {
          cell.classList.remove('valid-placement', 'invalid-placement');
        });
        
        UIController.paintShipSprite(`#${boardId}`, result.shipType, result.positions);
        
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
  
      // If a powerup is waiting for a click, let its own handler take it —
      // don't also fire a regular attack. (The non-online branch below has
      // the same guard; this mirrors it for online mode.)
      if (this.gameState.pendingPowerup) return;
  
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
  
          // Lock out further clicks until ATTACK_RESULT comes back; without
          // this a fast player could fire the same ATTACK twice before the
          // opponent responds.
          this.isProcessingTurn = true;
  
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
            setTimeout(() => this.handleAITurn(), 1500);
            return;
          }
          if (check.reason === 'mine') {
            this.campaign.handleMineHit(cell, check.index, check.layer);
            this.campaign.onPlayerTurnEnd();
            setTimeout(() => this.handleAITurn(), 2000);
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
              this.player2Wins++;
            }
          } else {
            // In AI game, player wins
            this.playerWins++;
          }
        } else {
          // AI or Player 2 wins
          this.player2Wins++;
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
            this.ai.recordSunk(layer, aiResult.shipType);
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
            this.player2Wins++;
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
  
  }

  if (isNode) {
    module.exports = { WarZones };
  } else {
    global.WarZones = WarZones;
  }
})(typeof window !== 'undefined' ? window : globalThis);
