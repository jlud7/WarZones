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
          briefing: "Commander, welcome to the fleet. Intel reports Lt. Mercer's patrol in the sector — he's a fresh recruit, sloppy on the trigger. Mercer often loses the trail after a missed shot, so press the moment he wavers. Engage, destroy, and prove you belong on the bridge.",
          difficulty: "Recruit",
          isBoss: false,
          signature: 'rookie_mistakes',
          modifiers: ['signature_rookie'],
          aiConfig: {
            unpredictability: 0.35,
            clusterPreference: false,
            // 65% chance to keep a hunt after a miss — Mercer routinely
            // loses the trail and re-explores. Defining flavor of a recruit.
            huntPersistence: 0.65,
            powerupStrategy: 'random',
          },
          starThresholds: { three: 65, two: 45 }
        },
        {
          id: 2, act: 1, actName: "RISING TIDE",
          name: "Fog Bank",
          subtitle: "Trust your instruments",
          enemyName: "Cmdr. Haze",
          portrait: "assets/portraits/enemy-2.webp",
          briefing: "Cmdr. Haze fights in weather of his own making. Missed shots fade from your display after 4 turns — and every third turn, Haze rolls in a thicker bank that obscures your earlier misses ahead of schedule. Your most recent shot will always register; everything older is fair game for the fog. The board you can see is never the board you have.",
          difficulty: "Recruit",
          isBoss: false,
          modifiers: ['fog_of_war', 'signature_thickening_fog'],
          signature: 'thickening_fog',
          fogTurns: 4,
          thickeningFogInterval: 3,
          aiConfig: {
            unpredictability: 0.30,
            clusterPreference: false,
            huntPersistence: 0.85,
            powerupStrategy: 'adaptive',
          },
          starThresholds: { three: 60, two: 40 }
        },
        {
          id: 3, act: 1, actName: "RISING TIDE",
          name: "The Hydra",
          subtitle: "Cut one head, two more appear",
          enemyName: "The Hydra",
          portrait: "assets/portraits/enemy-3.webp",
          briefing: "PRIORITY ALERT: Commander Hydra's battle group sails with an extra Destroyer — six ships, not five. And Hydra earns the name: the first ship you sink, she will regrow. One of its cells will flip back to whole, and you will have to sink it twice. Strike fast, strike clean — choose your first kill carefully.",
          difficulty: "Dangerous",
          isBoss: true,
          bossTitle: "MINI-BOSS",
          modifiers: ['enemy_reinforcements', 'signature_regrowth'],
          signature: 'regrowth',
          extraShips: [{ name: 'Destroyer', size: 2, shape: 'line', layer: 'Sea', symbol: '🛥️' }],
          aiConfig: {
            unpredictability: 0.18,
            clusterPreference: true,
            huntPersistence: 1.0,
            layerBias: { Sea: 1.3 },
            powerupStrategy: 'aggressive',
          },
          starThresholds: { three: 55, two: 35 }
        },
        {
          id: 4, act: 2, actName: "STORM FRONT",
          name: "Rapid Response",
          subtitle: "Speed is survival",
          enemyName: "Capt. Volt",
          portrait: "assets/portraits/enemy-4.webp",
          briefing: "Capt. Volt fires faster than command can authorize. You have 5 seconds per attack. Worse: every third Volt turn she double-taps — fires twice in a single round, hit or miss. Hesitate and the round goes to her on the clock. Trust your instincts, Commander.",
          difficulty: "Soldier",
          isBoss: false,
          modifiers: ['turn_timer', 'signature_double_tap'],
          signature: 'double_tap',
          turnTimerSeconds: 5,
          doubleTapInterval: 3,
          aiConfig: {
            unpredictability: 0.20,
            clusterPreference: false,
            huntPersistence: 0.95,
            powerupStrategy: 'aggressive',
          },
          starThresholds: { three: 60, two: 40 }
        },
        {
          id: 5, act: 2, actName: "STORM FRONT",
          name: "Dark Waters",
          subtitle: "Trust nothing in the deep",
          enemyName: "Capt. Abyssal",
          portrait: "assets/portraits/enemy-5.webp",
          briefing: "Capt. Abyssal fights with shadows. She has seeded two acoustic decoys in the depths layer — they will register as confirmed hits when you strike them, then dissolve into misses on the next turn. Every hit you celebrate down there might already be a lie. Verify before you commit.",
          difficulty: "Veteran",
          isBoss: false,
          modifiers: ['signature_decoy_echoes'],
          signature: 'decoy_echoes',
          decoyCount: 2,
          decoyLayer: 'Sub',
          aiConfig: {
            unpredictability: 0.18,
            clusterPreference: false,
            huntPersistence: 1.0,
            layerBias: { Sub: 1.4, Sea: 1.2 },
            powerupStrategy: 'adaptive',
          },
          starThresholds: { three: 55, two: 35 }
        },
        {
          id: 6, act: 2, actName: "STORM FRONT",
          name: "Minefield",
          subtitle: "Every click could be your last",
          enemyName: "Sgt. Cinder",
          portrait: "assets/portraits/enemy-6.webp",
          briefing: "Sgt. Cinder doesn't just lay mines — he restocks them. Three mines are hidden in the enemy's sea grid at the start. Every time he sinks one of your ships, two more mines drop into his unattacked waters. Greedy aggression mints new traps. Pace yourself, Commander.",
          difficulty: "Veteran",
          isBoss: false,
          modifiers: ['mines', 'signature_live_demolitions'],
          signature: 'live_demolitions',
          mineCount: 3,
          minesPerSink: 2,
          aiConfig: {
            unpredictability: 0.20,
            clusterPreference: false,
            huntPersistence: 1.0,
            powerupStrategy: 'aggressive',
          },
          starThresholds: { three: 55, two: 35 }
        },
        {
          id: 7, act: 2, actName: "STORM FRONT",
          name: "The Kraken",
          subtitle: "It does not stay broken",
          enemyName: "The Kraken",
          portrait: "assets/portraits/enemy-7.webp",
          briefing: "CRITICAL ALERT: Your submarine was lost to a pre-battle ambush — you fight with four ships. The Kraken's vessels carry deflector shields that absorb the first hit, and worse: any shield you break regrows after four of your turns unless you've sunk that ship. This is a race. Finish what you start.",
          difficulty: "Dangerous",
          isBoss: true,
          bossTitle: "MINI-BOSS",
          modifiers: ['reduced_fleet', 'shields', 'signature_recharging_shields'],
          signature: 'recharging_shields',
          removedShips: ['Submarine'],
          shieldRechargeTurns: 4,
          aiConfig: {
            unpredictability: 0.10,
            clusterPreference: true,
            huntPersistence: 1.0,
            layerBias: { Sea: 1.2, Space: 1.1 },
            powerupStrategy: 'aggressive',
          },
          starThresholds: { three: 50, two: 30 }
        },
        {
          id: 8, act: 3, actName: "OPERATION TRIDENT",
          name: "Phantom Fleet",
          subtitle: "Now you see them...",
          enemyName: "Cmdr. Specter",
          portrait: "assets/portraits/enemy-8.webp",
          briefing: "Cmdr. Specter has fielded a stealth-clad ship that never registers as a hit — strikes against it land directly as decayed ‽ marks, with no confirmation until the ship sinks. The rest of your hits also fade after 3 turns. One of her ships is a ghost. Memory and patience are your only weapons.",
          difficulty: "Elite",
          isBoss: false,
          modifiers: ['hit_decay', 'signature_shadow_ship'],
          signature: 'shadow_ship',
          decayTurns: 3,
          aiConfig: {
            unpredictability: 0.12,
            clusterPreference: false,
            huntPersistence: 1.0,
            powerupStrategy: 'adaptive',
          },
          starThresholds: { three: 50, two: 30 }
        },
        {
          id: 9, act: 3, actName: "OPERATION TRIDENT",
          name: "Iron Curtain",
          subtitle: "Break through their armor",
          enemyName: "Gen. Bastion",
          portrait: "assets/portraits/enemy-9.webp",
          briefing: "Gen. Bastion's elite guard wears full deflector shielding. Every ship absorbs the first hit. And the General's signature doctrine: when one of his ships is reduced to its final unbroken cell, that cell re-shields itself. The killing blow has to break armor twice. He plays without errors. Persistence is the only victory.",
          difficulty: "Elite",
          isBoss: false,
          modifiers: ['shields', 'signature_last_stand'],
          signature: 'last_stand',
          aiConfig: {
            unpredictability: 0.05,
            clusterPreference: false,
            // Bastion never loses the trail. Surgical hunter.
            huntPersistence: 1.0,
            layerBias: { Space: 1.3, Sea: 1.2 },
            powerupStrategy: 'defensive',
          },
          starThresholds: { three: 50, two: 30 }
        },
        {
          id: 10, act: 3, actName: "OPERATION TRIDENT",
          name: "The Admiral",
          subtitle: "End this war",
          enemyName: "Admiral Voss",
          portrait: "assets/portraits/enemy-10.webp",
          briefing: "This is it, Commander. Admiral Voss commands a reinforced fleet of six ships. He fights in three phases. Opening: dense sensor fog — every miss fades. First sink: shields engage on every surviving vessel and his cannons start firing in pairs. Last ship standing: stealth plating activates and his desperation barrage begins. There is no retreat. The world is watching.",
          difficulty: "Legendary",
          isBoss: true,
          bossTitle: "FINAL BOSS",
          modifiers: ['enemy_reinforcements', 'fog_of_war', 'signature_phase_fight'],
          signature: 'phase_fight',
          extraShips: [{ name: 'Destroyer', size: 2, shape: 'line', layer: 'Sea', symbol: '🛥️' }],
          fogTurns: 3,
          decayTurns: 4,
          aiConfig: {
            unpredictability: 0.05,
            clusterPreference: true,
            huntPersistence: 1.0,
            layerBias: { Space: 1.2, Sea: 1.2, Sub: 1.1 },
            powerupStrategy: 'aggressive',
          },
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

        // Prefix every mission with its number so the campaign order
        // reads as an explicit "1 → 10" sequence. We also break the
        // mission name onto two lines when it has multiple words so
        // each label stays compact — but skip the break when the first
        // word is a short article ("The Hydra" shouldn't orphan "The"
        // on its own line; we'd rather show "The Hydra" or break after
        // "The"-and-the-next-word together).
        const wrapName = (n) => {
          const words = n.split(' ');
          if (words.length < 2) return n;
          const ARTICLES = new Set(['THE', 'A', 'AN', 'OF', 'AT', 'TO']);
          // If the first word is short / article-y, group it with the
          // second word on line 1 so we don't orphan it.
          let splitAt = 1;
          if (words.length >= 3 && ARTICLES.has(words[0].toUpperCase())) {
            splitAt = 2;
          }
          return words.slice(0, splitAt).join(' ') + '<br>' + words.slice(splitAt).join(' ');
        };
        const wrappedName = wrapName(mission.name);
        const displayName = mission.isBoss
          ? (mission.bossTitle === 'FINAL BOSS' ? `★ ${mission.id} · ` : `${mission.id} · `) + wrappedName
          : `${mission.id} · ${wrappedName}`;

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

      // Act bands and chapter headings both removed — the dashed trail
      // between numbered missions is enough to convey progression, and
      // the tinted regions / heading labels were crowding the map.
      const actBands = '';

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
      // Hide the main menu only AFTER the campaign overlay is in the DOM so
      // there's no flash of the empty game UI between the two screens.
      this.game.ui.hideMainMenu();

      overlay.querySelector('#campaignBack').addEventListener('click', () => {
        overlay.remove();
        this.game.ui.renderMainMenu();
      });
  
      overlay.querySelector('#campaignReset').addEventListener('click', async () => {
        const confirmed = await this.game.ui.showConfirmDialog({
          title: 'Reset campaign?',
          message: 'All mission progress and stars will be lost. This cannot be undone.',
          confirmText: 'Reset',
          cancelText: 'Keep Progress',
          danger: true,
        });
        if (confirmed) {
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
  
      const modifierTags = mission.modifiers
        .filter(mod => CampaignManager.MODIFIER_LABELS[mod])
        .map(mod => `<span class="modifier-tag">${CampaignManager.MODIFIER_LABELS[mod]}</span>`)
        .join('');
  
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

      // Signature trick state. Each block is a tiny piece of bookkeeping
      // that the trick's hooks read/mutate later. Most are inert when their
      // signature isn't active so we always initialize what's relevant.
      this.aiTurnCount = 0;
      if (mission.signature === 'thickening_fog') {
        this.modifierState.thickeningFogInterval = mission.thickeningFogInterval || 4;
      }
      if (mission.signature === 'regrowth') {
        // 1 charge — fires the first time the player sinks a Hydra ship.
        this.modifierState.regrowthCharges = 1;
      }
      if (mission.signature === 'double_tap') {
        this.modifierState.doubleTapInterval = mission.doubleTapInterval || 3;
      }
      if (mission.signature === 'decoy_echoes') {
        // Decoys placed at onCombatStart so they can avoid real ship cells.
        this.modifierState.decoys = [];
        this.modifierState.decoyLayer = mission.decoyLayer || 'Sub';
        this.modifierState.decoyCount = mission.decoyCount || 2;
      }
      if (mission.signature === 'live_demolitions') {
        if (!mission.modifiers.includes('mines')) {
          // Defensive: live_demolitions reuses the mines pipeline, so make
          // sure mines bookkeeping is initialized even if a mission ever
          // forgets to include the modifier.
          this.modifierState.mines = this.modifierState.mines || [];
        }
        this.modifierState.minesPerSink = mission.minesPerSink || 2;
      }
      if (mission.signature === 'recharging_shields') {
        // shieldRechargeAt[shipType] = playerTurnCount when shield comes back
        this.modifierState.shieldRechargeAt = {};
        this.modifierState.shieldRechargeTurns = mission.shieldRechargeTurns || 4;
      }
      if (mission.signature === 'shadow_ship') {
        // Picked at onCombatStart once we know which ships exist.
        this.modifierState.shadowShipType = null;
      }
      if (mission.signature === 'phase_fight') {
        // Voss starts in phase 1 (fog + reinforcements only). Phase 2/3
        // activate as the player sinks his ships. enemyShipsSunk is the
        // ground truth used to advance phases — counts player-caused sinks.
        this.modifierState.phase = 1;
        this.modifierState.enemyShipsSunk = 0;
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

      // Reset per-match AI turn bookkeeping on the game instance so a
      // previous match's state doesn't bleed into this one (Volt's
      // double-tap counter, Voss's bonus-attack queue, etc.).
      this.game._aiTurnFresh = true;
      this.game._aiBonusAttacks = 0;
  
      // Apply this mission's personality dials on top of the AI's randomized
      // defaults. The AI exposes applyConfig() which handles the layerBias
      // shallow-merge so missions only need to specify the keys they care
      // about (a Recruit sets unpredictability+huntPersistence; a boss can
      // also pin down powerupStrategy and per-layer biases).
      if (this.game.ai.applyConfig) {
        this.game.ai.applyConfig(this.activeMission.aiConfig);
      } else {
        // Defensive: support older AI builds without applyConfig.
        Object.assign(this.game.ai.personality, this.activeMission.aiConfig || {});
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

      if (this.activeMission.signature === 'decoy_echoes') {
        this._placeDecoys();
      }

      if (this.activeMission.signature === 'shadow_ship') {
        this._pickShadowShip();
      }
  
      // Show mission active notification
      if (this.activeMission.modifiers.length > 0) {
        const modNames = this.activeMission.modifiers
          .map(mod => CampaignManager.MODIFIER_NOTIF[mod])
          .filter(Boolean);
        if (modNames.length > 0) {
          setTimeout(() => {
            this.game.ui.updateCommentary(`Mission: ${this.activeMission.name} | ${modNames.join(' + ')}`);
            this.game.animateCommentaryBox();
          }, 1500);
        }
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

      // Decoy Echoes (Abyssal): a click on a decoy reads as a hit, then
      // reveals as a miss next turn. We block normal processing so the
      // signature handler can run its own animation + state update.
      if (this.activeMission.signature === 'decoy_echoes' && this.modifierState.decoys) {
        const isDecoy = this.modifierState.decoys.some(d =>
          d.layer === layer && d.index === index && !d.triggered);
        if (isDecoy) {
          return { blocked: true, reason: 'decoy', index, layer };
        }
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

      // Kraken's Recharging Shields: schedule shield regrowth a few turns
      // out. The check runs on every player turn end and re-arms the
      // shield if the ship is still alive when the timer is up.
      if (this.activeMission?.signature === 'recharging_shields'
          && this.modifierState.shieldRechargeAt) {
        const turns = this.modifierState.shieldRechargeTurns || 4;
        this.modifierState.shieldRechargeAt[shipType] = this.playerTurnCount + turns;
      }
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
  
    afterPlayerHit(layer, index, cell, shipType) {
      if (!this.activeMission) return;
      if (this.activeMission.modifiers.includes('hit_decay')) {
        this.modifierState.hitCells?.push({
          layer, index, turnPlaced: this.playerTurnCount, cell
        });
      }

      // Shadow Ship (Specter): a hit on the chosen shadow ship is disguised
      // as a decayed '?' immediately. The hit lands in game state normally,
      // we just rewrite the cell's visual.
      if (this.activeMission.signature === 'shadow_ship'
          && shipType && shipType === this.modifierState.shadowShipType
          && cell) {
        cell.classList.remove('hit');
        cell.classList.add('decayed', 'shadow-hit');
        cell.textContent = '‽';
      }

      // Last Stand (Bastion): when a hit reduces a shielded ship to its
      // final unhit cell, the shield comes back up — even if it was already
      // broken. The killing blow has to break armor twice.
      if (this.activeMission.signature === 'last_stand' && shipType) {
        const ship = this.game.gameState.ships.opponent[shipType];
        if (ship && !ship.isSunk) {
          const remaining = ship.positions.length - ship.hits.length;
          if (remaining === 1 && this.modifierState.shieldBroken
              && this.modifierState.shieldBroken[shipType]
              && !this.modifierState.lastStandTriggered?.[shipType]) {
            this.modifierState.shieldBroken[shipType] = false;
            this.modifierState.lastStandTriggered = this.modifierState.lastStandTriggered || {};
            this.modifierState.lastStandTriggered[shipType] = true;
            this.game.ui.updateCommentary(`${shipType} re-shields! Last stand — break it again to sink.`);
            this.game.animateCommentaryBox();
          }
        }
      }
    }
  
    onPlayerTurnEnd() {
      if (!this.activeMission) return;
      this.playerTurnCount++;
      this._processFog();
      this._processHitDecay();
      this._processShieldRecharge();
      this._processThickeningFog();
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

    // ---------- Powerup-aware timer pause/resume ----------
    // When the player picks up a treasure on a turn-timer mission, the
    // shot clock must NOT keep ticking through the treasure menu, the
    // powerup target-selection, and the powerup execution. Otherwise 5s
    // has to cover three actions instead of one. We pause on treasure
    // find and resume only after the powerup completes (and the player
    // actually still has their turn).
    pausePowerupTimer() {
      if (!this.activeMission) return;
      if (!this.activeMission.modifiers.includes('turn_timer')) return;
      this.stopTurnTimer();
    }

    resumePowerupTimer() {
      if (!this.activeMission) return;
      if (!this.activeMission.modifiers.includes('turn_timer')) return;
      this.startTurnTimer();
    }

    // =====================================================================
    // Signature trick hooks (called from game.js during AI/player turns).
    // Each hook is a no-op for missions that don't use that signature.
    // =====================================================================

    beforeAITurn() {
      if (!this.activeMission) return {};
      this.aiTurnCount = (this.aiTurnCount || 0) + 1;

      let bonusAttacks = 0;

      // Volt's Double-Tap: every Nth AI turn, fire twice.
      if (this.activeMission.signature === 'double_tap') {
        const interval = this.modifierState.doubleTapInterval || 3;
        if (this.aiTurnCount % interval === 0) bonusAttacks += 1;
      }

      // Voss Phase 2 onward: every AI turn fires twice.
      if (this.activeMission.signature === 'phase_fight'
          && this.modifierState.phase >= 2) {
        bonusAttacks += 1;
      }

      return { bonusAttacks };
    }

    // Called from game.js the moment a bonus shot is actually consumed
    // (i.e. between shots, not at turn start). Pops a big red banner so
    // the second shot is unmissable, and returns a delay (ms) the
    // caller should wait before the AI actually thinks/fires again.
    onBonusShotIncoming() {
      if (!this.activeMission) return 0;
      let text = 'INCOMING — SECOND SHOT';
      if (this.activeMission.signature === 'double_tap') {
        text = `${this.activeMission.enemyName.toUpperCase()} — DOUBLE-TAP`;
      } else if (this.activeMission.signature === 'phase_fight') {
        text = 'VOSS — DESPERATION BARRAGE';
      }
      this._flashSignatureBanner(text, 1200);
      return 1300;
    }

    _flashSignatureBanner(text, duration = 1200) {
      // Pops a centered banner that demands attention. Auto-removes after
      // duration + the fade-out animation. Stacking multiple is rare but
      // safe — each banner is its own DOM node.
      const banner = document.createElement('div');
      banner.className = 'signature-banner';
      banner.textContent = text;
      document.body.appendChild(banner);
      setTimeout(() => {
        banner.classList.add('signature-banner-out');
        setTimeout(() => banner.remove(), 380);
      }, duration);
    }

    afterAIShipSunk(shipType, layer) {
      if (!this.activeMission) return;

      // Cinder's Live Demolitions: every player ship he sinks seeds new
      // mines on his own sea board.
      if (this.activeMission.signature === 'live_demolitions') {
        this._addLiveMines(this.modifierState.minesPerSink || 2);
      }
    }

    afterPlayerShipSunk(shipType, layer) {
      if (!this.activeMission) return;

      // Hydra's Regrowth: 1 charge — first player-caused sink restores one
      // hit cell of the just-sunk ship after a brief delay.
      if (this.activeMission.signature === 'regrowth'
          && this.modifierState.regrowthCharges > 0) {
        this.modifierState.regrowthCharges--;
        // Capture the ship reference now (game state could shift if the
        // player keeps clicking) and schedule the regrow beat.
        const ship = this.game.gameState.ships.opponent[shipType];
        if (ship && ship.isSunk && ship.hits.length > 0) {
          setTimeout(() => this._regrowShip(shipType, layer), 1400);
        }
      }

      // Voss Phase Fight: count the sink and possibly advance phases.
      if (this.activeMission.signature === 'phase_fight') {
        this.modifierState.enemyShipsSunk++;
        this._maybeAdvanceVossPhase();
      }

      // Shadow Ship reveal: when the shadow ship sinks, every cell that
      // was disguised as decayed flips back to a proper hit so the player
      // gets the satisfaction of seeing the kill they earned.
      if (this.activeMission.signature === 'shadow_ship'
          && shipType === this.modifierState.shadowShipType) {
        const ship = this.game.gameState.ships.opponent[shipType];
        if (ship) {
          const boardId = `opponent${layer}Board`;
          ship.positions.forEach(pos => {
            const cell = document.querySelector(`#${boardId} .cell[data-index="${pos}"]`);
            if (cell) {
              cell.classList.remove('decayed', 'shadow-hit');
              cell.classList.add('hit');
              cell.textContent = '';
            }
          });
          this.game.ui.updateCommentary(`SPECTER's shadow ship is unmasked — and sunk.`);
          this.game.animateCommentaryBox();
        }
      }
    }

    onAIShipPlaced() {
      // Reserved for future signatures that need to inspect post-placement
      // state (e.g. fleet-aware shadow-ship picking, decoy clustering).
    }

    // ---------- Decoy Echoes (Mission 5: Abyssal) ----------
    _placeDecoys() {
      const gs = this.game.gameState;
      const layer = this.modifierState.decoyLayer;
      const empty = [];
      for (let i = 0; i < GAME_CONSTANTS.BOARD_SIZE ** 2; i++) {
        if (gs.boards.opponent[layer][i] === null) empty.push(i);
      }
      // Fisher-Yates so decoys don't cluster predictably.
      for (let i = empty.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [empty[i], empty[j]] = [empty[j], empty[i]];
      }
      const count = Math.min(this.modifierState.decoyCount, empty.length);
      for (let i = 0; i < count; i++) {
        this.modifierState.decoys.push({ layer, index: empty[i], triggered: false });
      }
    }

    handleDecoyHit(cell, index, layer) {
      const gs = this.game.gameState;
      // Mark this decoy triggered so it can't fire again.
      const entry = this.modifierState.decoys.find(d =>
        d.layer === layer && d.index === index && !d.triggered);
      if (entry) entry.triggered = true;

      // Persist a miss in game state (so the cell is no longer attackable).
      gs.boards.opponent[layer][index] = 'miss';
      gs.shots.player.total++;

      // Stage 1: appear as a hit. Big red flash, hit sound, screen shake.
      cell.classList.add('hit', 'decoy-flash');
      cell.innerHTML = '<span class="decoy-icon">✶</span>';
      this.game.sound.playSound('hit');
      this.game.animations.playExplosion(cell);
      this.game.ui.updateCommentary("Direct hit! …or is it?");
      this.game.animateCommentaryBox();

      // Stage 2: 900ms later, reveal as a decoy. Strip the hit visual,
      // apply the miss + decoy-revealed state. The reveal is what makes
      // the trick land — the player sees the dopamine pop deflate.
      setTimeout(() => {
        cell.classList.remove('hit', 'decoy-flash');
        cell.classList.add('miss', 'decoy-revealed');
        cell.innerHTML = '<span class="decoy-icon-revealed">~</span>';
        this.game.ui.updateCommentary("DECOY ECHO — that wasn't a ship.");
        this.game.animateCommentaryBox();
      }, 900);
    }

    // ---------- Shadow Ship (Mission 8: Specter) ----------
    _pickShadowShip() {
      // Pick a random opponent ship (excluding sunk/zero-position) to be
      // the shadow ship. Specter has 5 ships; we want the trick to be
      // discoverable but not always the same. Bias toward smaller ships
      // so the player can sink it without the bookkeeping crushing them.
      const ships = this.game.gameState.ships.opponent;
      const candidates = Object.keys(ships).filter(name => {
        const ship = ships[name];
        return ship && ship.positions && ship.positions.length > 0 && !ship.isSunk;
      });
      // Prefer 2-cell ships (Cruiser, Submarine) — small enough that the
      // 'no hit confirmation' rule doesn't dominate the whole match.
      const small = candidates.filter(name => {
        const def = GAME_CONSTANTS.SHIPS[name];
        return def && def.size <= 2;
      });
      const pool = small.length > 0 ? small : candidates;
      this.modifierState.shadowShipType = pool[Math.floor(Math.random() * pool.length)] || null;
    }

    // ---------- Hydra Regrowth (Mission 3) ----------
    _regrowShip(shipType, layer) {
      const ship = this.game.gameState.ships.opponent[shipType];
      if (!ship || ship.hits.length === 0) return;

      // Pick one of the ship's hit cells to restore. Random keeps it from
      // always being the first cell the player hit.
      const hitIdx = ship.hits[Math.floor(Math.random() * ship.hits.length)];
      // Restore the cell in game state.
      ship.hits = ship.hits.filter(h => h !== hitIdx);
      ship.isSunk = false;
      this.game.gameState.boards.opponent[layer][hitIdx] = shipType;
      // The player's shot tally already counted this cell as a hit; we
      // intentionally don't decrement it (the player did fire there).

      // Find the cell in the DOM and visually un-hit it.
      const boardId = `opponent${layer}Board`;
      const cell = document.querySelector(`#${boardId} .cell[data-index="${hitIdx}"]`);
      if (cell) {
        cell.classList.remove('hit', 'sunk');
        cell.classList.add('regrowing');
        cell.textContent = '';
        // Fire a quick pulse animation, then remove the helper class.
        setTimeout(() => cell.classList.remove('regrowing'), 1500);
      }
      this.game.sound.playSound?.('place');
      this.game.ui.updateCommentary(`HYDRA: 'Cut a head…' — ${shipType} regrows a cell. Sink it again.`);
      this.game.animateCommentaryBox();
    }

    // ---------- Live Demolitions (Mission 6: Cinder) ----------
    _addLiveMines(count) {
      const gs = this.game.gameState;
      const layer = 'Sea';
      const empty = [];
      for (let i = 0; i < GAME_CONSTANTS.BOARD_SIZE ** 2; i++) {
        if (gs.boards.opponent[layer][i] === null) empty.push(i);
      }
      if (empty.length === 0) return;
      for (let i = empty.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [empty[i], empty[j]] = [empty[j], empty[i]];
      }
      const placed = Math.min(count, empty.length);
      for (let i = 0; i < placed; i++) {
        gs.boards.opponent[layer][empty[i]] = 'Mine';
        this.modifierState.mines = this.modifierState.mines || [];
        this.modifierState.mines.push(empty[i]);
      }
      if (placed > 0) {
        this.game.ui.updateCommentary(`CINDER: 'More where those came from.' — ${placed} new mine${placed > 1 ? 's' : ''} planted.`);
        this.game.animateCommentaryBox();
      }
    }

    // ---------- Recharging Shields (Mission 7: Kraken) ----------
    _processShieldRecharge() {
      if (!this.modifierState.shieldRechargeAt) return;
      const ships = this.game.gameState.ships.opponent;
      const turns = this.modifierState.shieldRechargeTurns || 4;
      for (const shipType in this.modifierState.shieldRechargeAt) {
        const dueTurn = this.modifierState.shieldRechargeAt[shipType];
        if (dueTurn === undefined) continue;
        const ship = ships[shipType];
        // Skip ships that are already sunk or no longer broken.
        if (!ship || ship.isSunk) {
          delete this.modifierState.shieldRechargeAt[shipType];
          continue;
        }
        if (this.playerTurnCount >= dueTurn) {
          this.modifierState.shieldBroken[shipType] = false;
          delete this.modifierState.shieldRechargeAt[shipType];
          this.game.ui.updateCommentary(`KRAKEN: ${shipType}'s shield regenerates. Break it again.`);
          this.game.animateCommentaryBox();
        }
      }
    }

    // ---------- Voss Phase Fight (Mission 10) ----------
    _maybeAdvanceVossPhase() {
      const sunk = this.modifierState.enemyShipsSunk;
      const phase = this.modifierState.phase;

      // Phase 1 -> 2: first sink. Shields engage on remaining ships, AI
      // starts firing in pairs.
      if (phase === 1 && sunk >= 1) {
        this.modifierState.phase = 2;
        // Compose 'shields' modifier on the fly so beforePlayerAttack
        // starts honoring it. modifiers list mutation is fine — only
        // briefing UI reads it pre-combat.
        if (!this.activeMission.modifiers.includes('shields')) {
          this.activeMission.modifiers.push('shields');
        }
        this.modifierState.shieldBroken = this.modifierState.shieldBroken || {};
        this._flashSignatureBanner('VOSS — PHASE 2: SHIELDS UP', 1500);
        this.game.ui.updateCommentary("VOSS: 'Shields up. Open fire — both batteries.'");
        this.game.animateCommentaryBox();
      }

      // Phase 2 -> 3: enemy down to last ship. Hit-decay engages and the
      // AI's pairs become a desperation barrage (still 2 shots per turn
      // — we keep the simpler v1 spec).
      const remaining = Object.values(this.game.gameState.ships.opponent)
        .filter(s => s.positions.length > 0 && !s.isSunk).length;
      if (phase < 3 && remaining === 1) {
        this.modifierState.phase = 3;
        if (!this.activeMission.modifiers.includes('hit_decay')) {
          this.activeMission.modifiers.push('hit_decay');
        }
        this.modifierState.hitCells = this.modifierState.hitCells || [];
        this._flashSignatureBanner('VOSS — PHASE 3: NOTHING TO LOSE', 1500);
        this.game.ui.updateCommentary("VOSS: 'I have nothing left to lose.'");
        this.game.animateCommentaryBox();
      }
    }

    // ---------- Thickening Fog (Mission 2: Haze) ----------
    _processThickeningFog() {
      if (this.activeMission.signature !== 'thickening_fog') return;
      if (!this.modifierState.foggedCells) return;
      const interval = this.modifierState.thickeningFogInterval || 3;
      // Fire on every Nth player turn end. playerTurnCount has already
      // incremented in onPlayerTurnEnd by this point.
      if (this.playerTurnCount === 0 || this.playerTurnCount % interval !== 0) return;

      // Re-fog cells we're already tracking — but always spare the miss
      // the player just placed (diff < 2). Without this guard, the fog
      // would erase the current shot before the player ever sees it land,
      // and the trick reads as a bug ("did my click register?").
      let count = 0;
      this.modifierState.foggedCells.forEach(entry => {
        if (this.playerTurnCount - entry.turnPlaced < 2) return;
        if (!entry.cell || !entry.cell.classList) return;
        if (!entry.cell.classList.contains('miss')) return; // already fogged or sunk
        entry.cell.classList.remove('miss');
        entry.cell.classList.add('fogged');
        entry.cell.textContent = '';
        count++;
      });
      if (count > 0) {
        this.game.ui.updateCommentary(`HAZE: 'The fog rolls in.' — ${count} miss${count === 1 ? '' : 'es'} obscured.`);
        this.game.animateCommentaryBox();
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
      this.aiTurnCount = 0;
    }
  }

  // ---------- Modifier presentation maps ----------
  // Briefing tags: short, icon-led name shown in the briefing screen.
  // Notification labels: ALL-CAPS short form shown in mid-combat banner.
  // Both maps cover every modifier and signature so the in-combat banner
  // names the signature trick when no traditional modifier is active
  // (e.g. Abyssal's Decoy Echoes mission carries no other modifier).
  CampaignManager.MODIFIER_LABELS = {
    'fog_of_war':                '🌫️ Fog of War',
    'turn_timer':                '⏱️ Time Pressure',
    'enemy_reinforcements':      '🛥️ Reinforcements',
    'shields':                   '🛡️ Shields',
    'hit_decay':                 '👻 Hit Decay',
    'mines':                     '💣 Mines',
    'reduced_fleet':             '📉 Reduced Fleet',
    'signature_rookie':          '🎯 Rookie Mistakes',
    'signature_thickening_fog':  '🌫️ Thickening Fog',
    'signature_regrowth':        '🐍 Regrowth',
    'signature_double_tap':      '⚡ Double-Tap',
    'signature_decoy_echoes':    '〰️ Decoy Echoes',
    'signature_live_demolitions':'💣 Live Demolitions',
    'signature_recharging_shields':'🛡️ Recharging Shields',
    'signature_shadow_ship':     '‽ Shadow Ship',
    'signature_last_stand':      '🛡️ Last Stand',
    'signature_phase_fight':     '☠️ Phase Fight',
  };
  CampaignManager.MODIFIER_NOTIF = {
    'fog_of_war':                 'FOG OF WAR',
    'turn_timer':                 'TIME PRESSURE',
    'enemy_reinforcements':       'REINFORCEMENTS',
    'shields':                    'DEFLECTOR SHIELDS',
    'hit_decay':                  'HIT DECAY',
    'mines':                      'NAVAL MINES',
    'reduced_fleet':              'REDUCED FLEET',
    'signature_regrowth':         'REGROWTH',
    'signature_double_tap':       'DOUBLE-TAP',
    'signature_decoy_echoes':     'DECOY ECHOES',
    'signature_live_demolitions': 'LIVE DEMOLITIONS',
    'signature_recharging_shields':'RECHARGING SHIELDS',
    'signature_shadow_ship':      'SHADOW SHIP',
    'signature_last_stand':       'LAST STAND',
    'signature_phase_fight':      'PHASE FIGHT',
    'signature_thickening_fog':   'THICKENING FOG',
    'signature_rookie':           'ROOKIE',
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CampaignManager };
  } else {
    global.CampaignManager = CampaignManager;
  }
})(typeof window !== 'undefined' ? window : globalThis);
