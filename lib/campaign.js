/*
 * CampaignManager module.
 *
 * 10-mission, 3-act single-player campaign. Loads/saves progress via
 * localStorage, composes AI "personality" + board modifiers (fog, decay,
 * shields, mines, reduced fleet, timer, reinforcements), and renders the
 * campaign map, briefing, and debriefing overlays. Depends on
 * GAME_CONSTANTS and the game instance. Dual-mode loader.
 */
(function (global) {
  'use strict';

  const GAME_CONSTANTS = (typeof module !== 'undefined' && module.exports)
    ? require('./game-state.js').GAME_CONSTANTS
    : global.GAME_CONSTANTS;

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
          enemyName: "Lt. Mercer",
          portrait: "assets/portraits/enemy-1.webp",
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
          enemyName: "Cmdr. Haze",
          portrait: "assets/portraits/enemy-2.webp",
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
          enemyName: "The Hydra",
          portrait: "assets/portraits/enemy-3.webp",
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
          enemyName: "Capt. Volt",
          portrait: "assets/portraits/enemy-4.webp",
          briefing: "Enemy forces are executing rapid tactical maneuvers. Command has authorized emergency engagement protocols — you have 5 seconds per attack. Hesitation means defeat. Trust your instincts, Commander.",
          difficulty: "Soldier",
          isBoss: false,
          modifiers: ['turn_timer'],
          turnTimerSeconds: 5,
          aiConfig: { unpredictability: 0.25, clusterPreference: false },
          starThresholds: { three: 60, two: 40 }
        },
        {
          id: 5, act: 2, actName: "STORM FRONT",
          name: "Dark Waters",
          subtitle: "Blind in the deep",
          enemyName: "Capt. Abyssal",
          portrait: "assets/portraits/enemy-5.webp",
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
          enemyName: "Sgt. Cinder",
          portrait: "assets/portraits/enemy-6.webp",
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
          enemyName: "The Kraken",
          portrait: "assets/portraits/enemy-7.webp",
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
          enemyName: "Cmdr. Specter",
          portrait: "assets/portraits/enemy-8.webp",
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
          enemyName: "Gen. Bastion",
          portrait: "assets/portraits/enemy-9.webp",
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
          enemyName: "Admiral Voss",
          portrait: "assets/portraits/enemy-10.webp",
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

      // Boustrophedon (snake) layout: each act is a single horizontal row,
      // and consecutive acts alternate direction so the path just rises
      // straight up between them. Reads as three clean chapters stacked.
      //   Act 1 (bottom): left  → right
      //   Act 2 (middle): right → left
      //   Act 3 (top):    left  → right
      const NODE_COORDS = [
        { x: 20, y: 85 }, //  1 First Contact          (Act 1 · L)
        { x: 50, y: 85 }, //  2 Fog Bank               (Act 1 · mid)
        { x: 80, y: 85 }, //  3 The Hydra, mini-boss   (Act 1 · R)
        { x: 80, y: 55 }, //  4 Rapid Response         (Act 2 · R — stacks above Hydra)
        { x: 58, y: 55 }, //  5 Dark Waters            (Act 2)
        { x: 37, y: 55 }, //  6 Minefield              (Act 2)
        { x: 15, y: 55 }, //  7 The Kraken, mini-boss  (Act 2 · L)
        { x: 15, y: 22 }, //  8 Phantom Fleet          (Act 3 · L — stacks above Kraken)
        { x: 50, y: 22 }, //  9 Iron Curtain           (Act 3)
        { x: 80, y: 22 }, // 10 The Admiral, final     (Act 3 · R — top-right finale)
      ];

      // "Current" mission = the frontier unlocked mission (progression tip).
      const currentId = this.progress.highestUnlocked || 1;

      // Build node HTML
      const nodesHTML = this.missions.map((mission, i) => {
        const unlocked = this.isMissionUnlocked(mission.id);
        const stars = this.getMissionStars(mission.id);
        const completed = stars > 0;
        const isCurrent = unlocked && mission.id === currentId;
        const bossClass = mission.isBoss
          ? (mission.bossTitle === 'FINAL BOSS' ? 'node-final-boss' : 'node-mini-boss')
          : '';
        const lockedClass = !unlocked ? 'locked' : '';
        const completedClass = completed ? 'completed' : '';
        const currentClass = isCurrent ? 'current' : '';
        const coord = NODE_COORDS[i] || { x: 50, y: 50 };

        let badge = '';
        if (!unlocked) badge = '<span class="map-node-badge">🔒</span>';
        else if (completed) badge = '<span class="map-node-badge">✓</span>';

        const portraitEl = mission.portrait
          ? `<img class="mission-node-portrait map-node-portrait" src="${mission.portrait}" alt="${mission.enemyName}">`
          : `<div class="map-node-portrait" style="display:flex;align-items:center;justify-content:center;">${mission.id}</div>`;

        // Prefix every mission with its number so the campaign order reads
        // as an explicit "1 → 10" sequence starting at the bottom.
        const displayName = mission.isBoss
          ? (mission.bossTitle === 'FINAL BOSS' ? `★ ${mission.id} · ` : `${mission.id} · `) + mission.name
          : `${mission.id} · ${mission.name}`;

        // A "BEGIN" prompt pinned to mission 1 when the player hasn't started
        // yet. Disappears as soon as they complete any mission.
        const beginPrompt = (mission.id === 1 && this.progress.totalStars === 0)
          ? '<div class="map-node-begin-prompt">▼ BEGIN</div>'
          : '';

        return `
          <div class="map-node act-${mission.act} ${bossClass} ${lockedClass} ${completedClass} ${currentClass}"
               data-mission-id="${mission.id}"
               data-act="${mission.act}"
               style="--x:${coord.x}%;--y:${coord.y}%">
            ${beginPrompt}
            <div class="map-node-portrait-wrap">
              ${portraitEl}
              ${badge}
            </div>
            <div class="map-node-label">
              <span class="name">${displayName}</span>
              ${unlocked ? `<span class="stars">${this._renderStars(stars)}</span>` : ''}
            </div>
          </div>
        `;
      }).join('');

      // Build SVG path segments connecting consecutive missions. Each segment
      // gets locked/unlocked class so completed territory reads as a bright
      // traversable trail and future missions read as faint scout lines.
      const pathSegments = [];
      for (let i = 0; i < NODE_COORDS.length - 1; i++) {
        const a = NODE_COORDS[i];
        const b = NODE_COORDS[i + 1];
        const unlocked = this.isMissionUnlocked(this.missions[i + 1].id);
        pathSegments.push(
          `<line class="path-segment ${unlocked ? 'unlocked' : 'locked'}"
                 x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`
        );
      }

      // Act bands: tinted horizontal regions behind each act's missions with
      // a centered chapter heading floating at the band's top edge.
      const actMeta = {};
      this.missions.forEach((m, i) => {
        if (!actMeta[m.act]) actMeta[m.act] = { name: m.actName, ys: [] };
        actMeta[m.act].ys.push(NODE_COORDS[i].y);
      });
      const PAD = 10; // vertical padding above/below each act's row so the
                      // band reads as a chapter panel rather than a thin stripe.
      const actBands = Object.entries(actMeta).map(([act, meta]) => {
        const top = Math.max(0, Math.min(...meta.ys) - PAD);
        const bot = Math.min(100, Math.max(...meta.ys) + PAD);
        const height = bot - top;
        return `
          <div class="act-band" data-act="${act}" style="top:${top}%;height:${height}%"></div>
          <div class="act-chapter" data-act="${act}" style="top:${top}%">
            <span class="act-chapter-num">ACT ${act}</span>
            <span class="act-chapter-name">${meta.name}</span>
          </div>
        `;
      }).join('');

      overlay.innerHTML = `
        <div class="campaign-content">
          <div class="campaign-header">
            <h1 class="campaign-title">OPERATION TRIDENT</h1>
            <div class="campaign-subtitle">Campaign Mode</div>
            <div class="campaign-star-total">${totalStars} / ${maxStars} Stars</div>
          </div>
          <div class="campaign-world-map">
            ${actBands}
            <svg class="campaign-paths" viewBox="0 0 100 100" preserveAspectRatio="none">
              ${pathSegments.join('')}
            </svg>
            ${nodesHTML}
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
  
      overlay.querySelectorAll('.map-node:not(.locked)').forEach(node => {
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
      const portraitHTML = mission.portrait
        ? `<div class="briefing-portrait-wrap"><img class="briefing-portrait" src="${mission.portrait}" alt="${mission.enemyName}"><div class="briefing-enemy-name">${mission.enemyName}</div></div>`
        : '';
  
      overlay.innerHTML = `
        <div class="briefing-content ${bossClass}">
          <div class="briefing-header">
            ${mission.isBoss ? `<div class="briefing-boss-tag">${mission.bossTitle}</div>` : ''}
            ${portraitHTML}
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
  
      document.getElementById('player2Name').textContent = mission.enemyName || (mission.isBoss ? mission.name : "Enemy");
      const iconEl = document.getElementById('player2Icon');
      if (mission.portrait) {
        iconEl.innerHTML = `<img class="combat-portrait" src="${mission.portrait}" alt="${mission.enemyName}" onerror="this.replaceWith(document.createTextNode('${mission.isBoss ? '☠️' : '🤖'}'))">`;
      } else {
        iconEl.textContent = mission.isBoss ? '☠️' : '🤖';
      }
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
      cell.innerHTML = '<img src="assets/icons/mine.webp" class="cell-sprite" alt="💣">';
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
  
      // Snap the bar to full width immediately with no transition so the
      // timer starts visually full the instant the player's turn begins
      // (previously it animated from 0% → 100% over 1s which felt clunky).
      const timerEl = document.getElementById('turnTimer');
      if (timerEl) {
        const bar = timerEl.querySelector('.turn-timer-bar');
        if (bar) {
          bar.style.transition = 'none';
          bar.style.width = '100%';
          // Force reflow so the no-transition width takes effect before
          // the normal transition is re-enabled by _updateTimerDisplay.
          void bar.offsetWidth;
          bar.style.transition = '';
        }
      }
  
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
        // Snap back to full width without animation.
        const timerEl = document.getElementById('turnTimer');
        if (timerEl) {
          const bar = timerEl.querySelector('.turn-timer-bar');
          if (bar) {
            bar.style.transition = 'none';
            bar.style.width = '100%';
            void bar.offsetWidth;
            bar.style.transition = '';
          }
        }
        this._updateTimerDisplay();
      }
    }
  
    stopTurnTimer() {
      if (this.modifierState.timerInterval) {
        clearInterval(this.modifierState.timerInterval);
        this.modifierState.timerInterval = null;
      }
      this._pauseTimerUI();
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
  
    _pauseTimerUI() {
      const timerEl = document.getElementById('turnTimer');
      if (!timerEl) return;
      timerEl.className = 'turn-timer paused';
      const bar = timerEl.querySelector('.turn-timer-bar');
      const text = timerEl.querySelector('.turn-timer-text');
      if (bar) bar.style.width = '0%';
      if (text) text.textContent = '';
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
      this.stopTurnTimer();
      this._hideTimerUI();
  
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
  
      const debriefPortrait = mission.portrait
        ? `<img class="debrief-portrait ${isVictory ? 'defeated' : ''}" src="${mission.portrait}" alt="${mission.enemyName}">`
        : '';
  
      overlay.innerHTML = `
        <div class="game-over-content campaign-debrief-content">
          <div class="debrief-header">
            ${isFinalBossVictory ? '<div class="final-victory-text">THE WAR IS OVER</div>' : ''}
            ${debriefPortrait}
            <h2>${isVictory ? (mission.isBoss ? 'BOSS DEFEATED' : 'MISSION COMPLETE') : 'MISSION FAILED'}</h2>
            <div class="debrief-mission-name">${mission.enemyName || mission.name}</div>
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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CampaignManager };
  } else {
    global.CampaignManager = CampaignManager;
  }
})(typeof window !== 'undefined' ? window : globalThis);
