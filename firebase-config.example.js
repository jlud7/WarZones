/*
 * Online-multiplayer config (OPTIONAL).
 *
 * Online play (Play Online → Host/Join) needs a Firebase Realtime Database.
 * The other modes — Campaign, Play vs AI, local 2-player — do NOT need this
 * file and work without it.
 *
 * To enable online play:
 *   1. Copy this file to `firebase-config.js` (gitignored, never committed).
 *   2. Fill in your Firebase web config below.
 *   3. Add `<script src="firebase-config.js"></script>` in index.html,
 *      immediately above the Firebase init <script> block.
 *
 * IMPORTANT — the web API key is embedded in client code, so RESTRICT it:
 *   - Google Cloud Console → Credentials → your key → Application
 *     restrictions: HTTP referrers (your site's domain only).
 *   - API restrictions: limit to the Firebase APIs you actually use.
 *   - Deploy database.rules.json (Firebase console or
 *     `firebase deploy --only database`) so the DB isn't world-open.
 * A restricted web key is safe to expose; an unrestricted one can be abused.
 */
window.WARZONES_FIREBASE_CONFIG = {
  apiKey: "YOUR_RESTRICTED_WEB_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project"
};
