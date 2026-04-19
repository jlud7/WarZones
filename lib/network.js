/*
 * NetworkManager module.
 *
 * Firebase Realtime Database signaling + message bus for trust-based
 * online play. Expects the global `firebase` object to be initialized
 * before this module is used (index.html loads the Firebase compat SDK
 * prior to any lib/*.js). Dual-mode loader.
 */
(function (global) {
  'use strict';

  /**
   * NetworkManager — Firebase Realtime Database signaling + messaging.
   *
   * Room layout in RTDB:
   *   /rooms/{code}
   *     /host        : { joinedAt }            (host presence)
   *     /guest       : { joinedAt }            (guest presence, set by joiner)
   *     /messages    : { autoId: { from, type, payload, ts } }  (append-only)
   *     /createdAt
   *
   * Each client writes its own role into host/guest and listens to the other.
   * All gameplay traffic (attacks, results, ship data, powerups) flows through
   * /messages as short-lived records.
   */
  class NetworkManager {
    constructor(game) {
      this.game = game;
      this.isHost = false;
      this.roomCode = null;
      this.isConnected = false;
      this.clientId = Math.random().toString(36).slice(2, 10);
  
      // Firebase refs (populated when a room is active)
      this.db = null;
      this.roomRef = null;
      this.messagesRef = null;
      this.messagesListener = null;
      this.otherRoleListener = null;
      this.hostDisconnectListener = null;
  
      // Ping/latency tracking
      this.pingInterval = null;
      this.lastPingTime = null;
      this.currentPing = null;
  
      // Track which message IDs we've already handled. Populated with
      // pre-existing messages at pair time so we don't replay history.
      this.handledMessageIds = new Set();
    }
  
    _getDb() {
      if (!this.db) {
        if (typeof firebase === 'undefined' || !firebase.database) {
          console.error('Firebase SDK not loaded');
          return null;
        }
        this.db = firebase.database();
      }
      return this.db;
    }
  
    generateRoomCode() {
      // Exclude confusing chars: 0/O, 1/I/L, Q (looks like O)
      const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';
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
        if (this.isConnected) {
          this.lastPingTime = Date.now();
          this.send({ type: 'PING', timestamp: this.lastPingTime });
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
        this.send({ type: 'PONG', timestamp: data.timestamp });
        return true;
      }
      if (data.type === 'PONG') {
        this.currentPing = Date.now() - data.timestamp;
        this.updateConnectionUI('connected', 'Connected');
        return true;
      }
      return false;
    }
  
    /**
     * Host a new room. `customId` is the room code generated via generateRoomCode().
     */
    async initialize(customId = null) {
      const db = this._getDb();
      if (!db) {
        this.updateConnectionUI('disconnected', 'Firebase unavailable');
        this.game.ui.updateCommentary('Firebase not loaded — check your internet connection.');
        return;
      }
  
      this.updateConnectionUI('connecting', 'Connecting...');
      this.roomCode = customId || this.generateRoomCode();
      this.roomRef = db.ref(`rooms/${this.roomCode}`);
      this.messagesRef = this.roomRef.child('messages');
      this.handledMessageIds.clear();
  
      try {
        // Host: create room, advertise presence, wait for a guest to join.
        await this.roomRef.child('host').set({ joinedAt: firebase.database.ServerValue.TIMESTAMP, clientId: this.clientId });
        await this.roomRef.child('createdAt').set(firebase.database.ServerValue.TIMESTAMP);
        // Clean up the room when the host disconnects (tab close / navigate away)
        this.roomRef.onDisconnect().remove();
  
        this.game.ui.showRoomCode(this.roomCode);
        this.updateConnectionUI('connecting', 'Waiting for opponent...');
  
        // Listen for a guest to appear
        this.otherRoleListener = this.roomRef.child('guest').on('value', (snap) => {
          if (snap.exists() && !this.isConnected) {
            this._onRoomPaired();
          }
        });
      } catch (err) {
        console.error('Failed to initialize room:', err);
        this.updateConnectionUI('disconnected', 'Error');
        this.game.ui.updateCommentary('Could not create room. Check your internet connection.');
        setTimeout(() => {
          this.hideConnectionUI();
          this.game.ui.renderMainMenu();
        }, 2500);
      }
    }
  
    /**
     * Join an existing room by code.
     */
    async connect(remoteId) {
      const db = this._getDb();
      if (!db) {
        this.updateConnectionUI('disconnected', 'Firebase unavailable');
        this.game.ui.updateCommentary('Firebase not loaded — check your internet connection.');
        return;
      }
  
      this.updateConnectionUI('connecting', 'Joining...');
      this.roomCode = remoteId;
      this.roomRef = db.ref(`rooms/${this.roomCode}`);
      this.messagesRef = this.roomRef.child('messages');
      this.handledMessageIds.clear();
  
      try {
        // Verify host exists before joining
        const hostSnap = await this.roomRef.child('host').get();
        if (!hostSnap.exists()) {
          this.updateConnectionUI('disconnected', 'Room not found');
          this.game.ui.updateCommentary('Room not found. Check the room code and try again.');
          setTimeout(() => {
            this.hideConnectionUI();
            this.game.ui.renderMainMenu();
          }, 2500);
          this.roomRef = null;
          return;
        }
  
        // Join as guest
        await this.roomRef.child('guest').set({ joinedAt: firebase.database.ServerValue.TIMESTAMP, clientId: this.clientId });
        // Guest cleans up its own presence on disconnect
        this.roomRef.child('guest').onDisconnect().remove();
  
        // Watch for host disappearing (they closed the tab)
        this.otherRoleListener = this.roomRef.child('host').on('value', (snap) => {
          if (!snap.exists() && this.isConnected) {
            this._onOpponentLeft();
          }
        });
  
        this._onRoomPaired();
      } catch (err) {
        console.error('Failed to join room:', err);
        this.updateConnectionUI('disconnected', 'Error');
        this.game.ui.updateCommentary('Could not join room. Check your internet connection.');
        setTimeout(() => {
          this.hideConnectionUI();
          this.game.ui.renderMainMenu();
        }, 2500);
      }
    }
  
    /**
     * Called once both host and guest are present. Wires up the message
     * listener and notifies the game that a peer has connected.
     */
    async _onRoomPaired() {
      if (this.isConnected) return;
      this.isConnected = true;
      this.updateConnectionUI('connected', 'Connected');
  
      // If I'm the host, also watch for the guest leaving unexpectedly
      if (this.isHost) {
        this.hostDisconnectListener = this.roomRef.child('guest').on('value', (snap) => {
          if (!snap.exists() && this.isConnected) {
            this._onOpponentLeft();
          }
        });
      }
  
      // Pre-mark any messages that already exist in the room so we don't
      // replay them. This is more reliable than a timestamp filter (which
      // would compare server-resolved ts against client-local Date.now,
      // silently dropping every message if the client clock is ahead of
      // the Firebase server — that was the original "attacks do nothing"
      // bug). After this pre-mark step, the child_added listener will
      // fire for every existing child (all skipped) and then for any new
      // messages as they arrive.
      try {
        const existing = await this.messagesRef.get();
        if (existing && existing.exists()) {
          existing.forEach((child) => {
            this.handledMessageIds.add(child.key);
          });
        }
      } catch (e) {
        console.warn('Could not read existing messages; falling back to full replay', e);
      }
  
      // Listen for new messages (append-only log). We skip messages we've
      // already marked as handled (pre-existing or previously processed)
      // and messages we sent ourselves.
      this.messagesListener = this.messagesRef.on('child_added', (snap) => {
        const msg = snap.val();
        const id = snap.key;
        if (!msg || this.handledMessageIds.has(id)) return;
        this.handledMessageIds.add(id);
  
        // Skip our own messages (Firebase echoes writes back to the sender)
        if (msg.from === this.clientId) return;
  
        const data = msg.payload;
        if (!data) return;
  
        // Handle ping/pong internally
        if (this.handlePing(data)) return;
  
        console.log('Received data:', data);
        this.game.handlePeerData(data);
      });
  
      this.startPingLoop();
      this.game.onPeerConnected(this.isHost);
    }
  
    _onOpponentLeft() {
      if (!this.isConnected) return;
      this.isConnected = false;
      this.stopPingLoop();
      this.updateConnectionUI('disconnected', 'Disconnected');
  
      if (this.game.gameState.phase !== 'gameOver') {
        this.game.ui.updateCommentary('Opponent disconnected!');
        setTimeout(() => {
          this.hideConnectionUI();
          this.game.ui.renderMainMenu();
        }, 2000);
      }
    }
  
    /**
     * Recursively strip `undefined` values from an outgoing payload.
     * Firebase's push() REJECTS any object containing undefined, which
     * would abort the send and drop the message. Also replaces NaN /
     * Infinity with null so those don't cause deserialization surprises.
     * Empty arrays and empty objects are left as-is — Firebase will drop
     * them, but the receivers are responsible for rehydrating defaults.
     */
    _sanitize(value) {
      if (value === undefined) return null;
      if (value === null) return null;
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
      }
      if (Array.isArray(value)) {
        return value.map(v => this._sanitize(v));
      }
      if (typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value)) {
          const v = this._sanitize(value[key]);
          if (v !== undefined) out[key] = v;
        }
        return out;
      }
      return value;
    }
  
    /**
     * Push a message into the room's /messages log. All clients except the
     * sender will receive it via the child_added listener.
     */
    send(data) {
      if (!this.messagesRef || !this.isConnected) {
        console.error('Room not open, cannot send data');
        return;
      }
      const payload = this._sanitize(data);
      console.log('Sending data:', payload);
      this.messagesRef.push({
        from: this.clientId,
        type: data.type,
        payload: payload,
        ts: firebase.database.ServerValue.TIMESTAMP
      }).catch(err => {
        console.error('Failed to send message:', err, 'payload:', payload);
        this.updateConnectionUI('disconnected', 'Error');
      });
    }
  
    /**
     * Tear down all listeners and remove our presence from the room.
     * The host removes the entire room; the guest only removes its own node.
     */
    reset() {
      this.stopPingLoop();
  
      // Detach listeners
      if (this.messagesRef && this.messagesListener) {
        this.messagesRef.off('child_added', this.messagesListener);
      }
      if (this.roomRef && this.otherRoleListener) {
        const otherRole = this.isHost ? 'guest' : 'host';
        this.roomRef.child(otherRole).off('value', this.otherRoleListener);
      }
      if (this.roomRef && this.hostDisconnectListener) {
        this.roomRef.child('guest').off('value', this.hostDisconnectListener);
      }
  
      // Clear presence
      if (this.roomRef) {
        try {
          if (this.isHost) {
            // Host wipes the whole room
            this.roomRef.remove().catch(() => {});
            this.roomRef.onDisconnect().cancel().catch(() => {});
          } else {
            // Guest only wipes its own node
            this.roomRef.child('guest').remove().catch(() => {});
            this.roomRef.child('guest').onDisconnect().cancel().catch(() => {});
          }
        } catch (e) {
          console.warn('Error cleaning up room:', e);
        }
      }
  
      this.roomRef = null;
      this.messagesRef = null;
      this.messagesListener = null;
      this.otherRoleListener = null;
      this.hostDisconnectListener = null;
      this.isHost = false;
      this.roomCode = null;
      this.isConnected = false;
      this.currentPing = null;
      this.handledMessageIds.clear();
      this.hideConnectionUI();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NetworkManager };
  } else {
    global.NetworkManager = NetworkManager;
  }
})(typeof window !== 'undefined' ? window : globalThis);
