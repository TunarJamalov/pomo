'use strict';

const axios  = require('axios');
const { db, getPremiumEntitlement } = require('../utils/database');

const { grantProAccess, revokeProAccess } = require('../utils/premiumManager');
const { t, getUserLanguage } = require('../utils/i18n');
const { loadTokens, saveTokens, isAccessTokenExpired } = require('../config/boostyTokens');

const CONFIG = {
  BLOG_NAME:          process.env.BOOSTY_BLOG_NAME || 'pomobot',
  POLL_INTERVAL_MS:   parseInt(process.env.BOOSTY_POLL_INTERVAL_MS) || 600_000,
  API_TIMEOUT_MS:     15_000,
  MAX_FETCH_PAGES:    50,
  PAGE_SIZE:          100,

  LAPSE_WARNING_AT_COUNT:   2,
  LAPSE_REVOKE_AT_COUNT:    4,

  MAX_LAST_SUCCESS_AGE_MS:  30 * 60 * 1000,
  OWNER_ID: process.env.OWNER_ID || process.env.OWNER_DISCORD_ID,
  MIN_PAID_PRICE:     parseInt(process.env.BOOSTY_PAID_PRICE_THRESHOLD) || 1,
};

// Renew a still-paying subscriber's Pro when it has less than this many days left
const RENEW_WITHIN_DAYS = 3;

const pollerState = {
  isRunning:           false,
  lastSuccessfulPollAt: null,
  consecutiveFailures:  0,
  totalCyclesRun:       0,
  intervalHandle:       null,
};

const BoostyAuthManager = {
  async getValidToken() {
    let tokens = loadTokens();

    if (!tokens) {
      throw new Error('No Boosty tokens found. Run: node scripts/boostyLogin.js');
    }

    if (isAccessTokenExpired(tokens)) {
      console.log('[BoostyAuth] Access token expired or near expiry. Refreshing...');
      tokens = await this.refreshAccessToken(tokens);
    }

    return tokens.access_token;
  },

  async refreshAccessToken(currentTokens) {
    try {
      const response = await axios.post(
        'https://api.boosty.to/oauth/token/',
        new URLSearchParams({
          grant_type:    'refresh_token',
          refresh_token: currentTokens.refresh_token,
          device_id:     currentTokens.device_id,
          device_os:     'web',
          device_name:   'Chrome',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent':   'Mozilla/5.0 (compatible; PomoBot/1.0)',
          },
          timeout: CONFIG.API_TIMEOUT_MS,
        }
      );

      const data = response.data;

      if (!data.access_token) {
        throw new Error(`Refresh response missing access_token: ${JSON.stringify(data)}`);
      }

      const newTokens = {
        access_token:  data.access_token,
        refresh_token: data.refresh_token || currentTokens.refresh_token,
        expires_at:    Date.now() + (data.expires_in * 1000),
        device_id:     currentTokens.device_id,
      };

      saveTokens(newTokens);
      console.log(`[BoostyAuth] Token refreshed. New expiry in ${data.expires_in}s.`);
      return newTokens;

    } catch (err) {
      const reason = err.response?.data || err.message;
      console.error('[BoostyAuth] Token refresh FAILED:', reason);
      await alertOwner(
        '🔴 **BoostyPoller: Token Refresh Failed**\n\n' +
        `The Boosty access token could not be refreshed.\n` +
        `**Error:** \`${JSON.stringify(reason).slice(0, 300)}\`\n\n` +
        `**Action required:** Run \`node scripts/boostyLogin.js\` to re-authenticate.\n` +
        `No Pro grants or revocations will occur until this is fixed.`
      );
      throw err;
    }
  },
};

const BoostyApiClient = {
  async fetchAllSubscribers() {
    let token;
    try {
      token = await BoostyAuthManager.getValidToken();
    } catch (err) {
      return null;
    }

    const subscriberMap = new Map();
    let offset = 0;
    let pagesFetched = 0;

    while (true) {
      if (pagesFetched >= CONFIG.MAX_FETCH_PAGES) {
        console.warn(`[BoostyAPI] Hit MAX_FETCH_PAGES (${CONFIG.MAX_FETCH_PAGES}). Stopping pagination.`);
        break;
      }

      let response;
      try {
        response = await axios.get(
          // No trailing slash: Boosty answers 404 for .../subscribers/
          `https://api.boosty.to/v1/blog/${CONFIG.BLOG_NAME}/subscribers`,
          {
            params: { limit: CONFIG.PAGE_SIZE, offset: offset, sort_by: 'on_time', order: 'gt' },
            headers: {
              'Authorization': `Bearer ${token}`,
              'User-Agent':    'Mozilla/5.0 (compatible; PomoBot/1.0)',
              'Accept':        'application/json',
            },
            timeout: CONFIG.API_TIMEOUT_MS,
          }
        );
      } catch (err) {
        const status = err.response?.status;
        const detail = err.response?.data || err.message;
        console.error(`[BoostyAPI] Fetch failed on page ${pagesFetched + 1} (offset ${offset}):`, detail);

        if (status === 401) {
          console.log('[BoostyAPI] 401 received mid-fetch. Attempting token refresh...');
          try {
            const tokens = loadTokens();
            const newTokens = await BoostyAuthManager.refreshAccessToken(tokens);
            token = newTokens.access_token;
            continue;
          } catch (refreshErr) {
            return null;
          }
        }
        return null;
      }

      const body = response.data;
      const subscribers = Array.isArray(body?.data) ? body.data
        : body?.data?.subscribers ?? body?.subscribers ?? body?.data?.data;

      if (!Array.isArray(subscribers)) {
        // Log only the shape: the body contains subscriber emails
        console.error('[BoostyAPI] Unexpected response shape. Top-level keys:', Object.keys(body || {}),
          'data keys:', body?.data && typeof body.data === 'object' ? Object.keys(body.data) : typeof body?.data);
        return null;
      }

      for (const sub of subscribers) {
        const price = sub.price ?? sub.level?.price ?? sub.subscriptionLevel?.price ?? 0;
        const isExpired = sub.isExpired ?? (sub.subscribed === false);

        if (price < CONFIG.MIN_PAID_PRICE || isExpired) continue;

        // Match only on private identifiers. Display names and blog URLs are
        // public, so anyone could claim a paying subscriber's Pro with them.
        if (sub.email)   subscriberMap.set(sub.email.toLowerCase(), sub);
        if (sub.id)      subscriberMap.set(String(sub.id), sub);
      }

      if (subscribers.length < CONFIG.PAGE_SIZE) break;

      offset += CONFIG.PAGE_SIZE;
      pagesFetched++;

      await sleep(300);
    }

    console.log(`[BoostyAPI] Fetched ${subscriberMap.size} unique active subscribers across ${pagesFetched + 1} page(s).`);
    return subscriberMap;
  },
};

const LapseStateMachine = {
  async handleAbsence(proUser) {
    const userId   = proUser.user_id;
    const newCount = (proUser.lapse_check_count || 0) + 1;
    const now      = new Date().toISOString();

    db.prepare(`
      UPDATE users SET
        lapse_check_count  = ?,
        lapse_detected_at  = COALESCE(lapse_detected_at, ?)
      WHERE discord_id = ?
    `).run(newCount, now, userId);

    console.log(`[LapseStateMachine] User ${userId}: absence check ${newCount}/${CONFIG.LAPSE_REVOKE_AT_COUNT}`);

    if (newCount === 1) return;

    if (newCount === CONFIG.LAPSE_WARNING_AT_COUNT) {
      await this.sendWarningDM(userId);
      return;
    }

    if (newCount >= CONFIG.LAPSE_REVOKE_AT_COUNT) {
      const lastSuccessAge = pollerState.lastSuccessfulPollAt
        ? (Date.now() - pollerState.lastSuccessfulPollAt.getTime())
        : Infinity;

      if (lastSuccessAge > CONFIG.MAX_LAST_SUCCESS_AGE_MS) {
        console.warn(`[LapseStateMachine] Revocation blocked for ${userId}. Resetting lapse count.`);
        await this.resetLapseState(userId);
        return;
      }

      await this.executeRevocation(proUser);
    }
  },

  async clearLapseState(userId) {
    const user = db.prepare(`SELECT lapse_check_count FROM users WHERE discord_id = ?`).get(userId);

    if (user?.lapse_check_count > 0) {
      console.log(`[LapseStateMachine] User ${userId} reappeared. Clearing lapse state.`);
      await this.resetLapseState(userId);

      if (user.lapse_check_count >= CONFIG.LAPSE_WARNING_AT_COUNT) {
        await sendUserDM(userId, 'premiumBoostyConfirmedDm');
      }
    }
  },

  async resetLapseState(userId) {
    db.prepare(`
      UPDATE users SET lapse_check_count = 0, lapse_detected_at = NULL WHERE discord_id = ?
    `).run(userId);
  },

  async sendWarningDM(userId) {
    await sendUserDM(userId, 'premiumBoostyWarningDm');
    console.log(`[LapseStateMachine] Warning DM sent to ${userId}.`);
  },

  async executeRevocation(proUser) {
    const userId = proUser.user_id;
    console.log(`[LapseStateMachine] Executing revocation for ${userId}.`);

    revokeProAccess(userId, 'BOOSTY_POLLER', 'Boosty subscription lapsed');
    await this.resetLapseState(userId);

    db.prepare(`
      INSERT OR IGNORE INTO pro_revocation_log
        (user_id, revoked_at, reason, lapse_check_count)
      VALUES (?, datetime('now'), 'SUBSCRIPTION_LAPSED', ?)
    `).run(userId, proUser.lapse_check_count);

    await sendUserDM(userId, 'premiumBoostyLapseDm');

    await alertOwner(
      `📋 **Pro Revocation Executed**\n` +
      `User: <@${userId}> (\`${userId}\`)\n` +
      `Reason: Absent from Boosty subscriber list for ${proUser.lapse_check_count} consecutive polls.\n` +
      `Boosty identifier on file: \`${proUser.boosty_identifier || 'none'}\`\n\n` +
      `If this was a mistake, run: \`/premiumadmin grant @user days:30\``
    );
  },
};

const ReconciliationEngine = {
  async runGrantPass(subscriberMap) {
    const pending = db.prepare(`SELECT * FROM pro_verification_queue WHERE status = 'PENDING'`).all();
    if (pending.length === 0) return;

    console.log(`[ReconciliationEngine] Grant pass: checking ${pending.length} pending verification(s).`);

    // Two different Discord accounts claiming the same subscriber in one pass:
    // nobody gets it automatically, the owner decides.
    const claimsPerIdentifier = new Map();
    for (const record of pending) {
      const key = normalizeIdentifier(record.boosty_identifier);
      claimsPerIdentifier.set(key, (claimsPerIdentifier.get(key) || 0) + 1);
    }

    for (const record of pending) {
      const identifier = normalizeIdentifier(record.boosty_identifier);
      const matchedSub = subscriberMap.get(identifier);
      if (!matchedSub) continue;

      // Boosty user IDs can be seen by others, so only a private email match
      // grants Pro automatically. ID claims wait for the owner's Approve button.
      if (!isEmailIdentifier(identifier)) continue;
      if (claimsPerIdentifier.get(identifier) > 1) {
        db.prepare(`UPDATE pro_verification_queue SET status = 'CONFLICT' WHERE id = ?`).run(record.id);
        await alertOwner(
          `⚠️ **Boosty claim conflict**\n` +
          `<@${record.discord_id}> (${record.discord_username}) and another account claimed the same Boosty subscription at the same time.\n` +
          `No Pro was granted. Review manually with \`/premiumadmin\`.`
        );
        continue;
      }

      const subscriberId = subscriberKey(matchedSub);
      const claimedBy = db.prepare(`
        SELECT discord_id FROM pro_verification_queue
        WHERE boosty_subscriber_id = ?
          AND discord_id != ?
          AND status IN ('APPROVED', 'AUTO_VERIFIED')
      `).get(subscriberId, record.discord_id);

      if (claimedBy) {
        db.prepare(`UPDATE pro_verification_queue SET status = 'CONFLICT' WHERE id = ?`).run(record.id);
        await alertOwner(
          `⚠️ **Boosty claim conflict**\n` +
          `<@${record.discord_id}> (${record.discord_username}) submitted a Boosty subscription ` +
          `that is already linked to <@${claimedBy.discord_id}>.\n` +
          `No Pro was granted. Review manually with \`/premiumadmin\` if this is legitimate.`
        );
        continue;
      }

      console.log(`[ReconciliationEngine] AUTO-GRANT: ${record.discord_username} matched Boosty subscriber ${subscriberId}`);

      grantProAccess(record.discord_id, 30, 'POLLING_ENGINE', { source: 'boosty' });

      db.prepare(`
        UPDATE pro_verification_queue SET
          status               = 'AUTO_VERIFIED',
          verified_by          = 'POLLING_ENGINE',
          boosty_subscriber_id = ?,
          granted_days         = 30,
          granted_at           = datetime('now')
        WHERE id = ?
      `).run(subscriberId, record.id);

      await sendUserDM(record.discord_id, 'premiumBoostyAutoGrantDm');

      await alertOwner(
        `✅ **Auto-Grant Completed**\n` +
        `User: <@${record.discord_id}> (${record.discord_username})\n` +
        `Boosty subscriber: \`${subscriberId}\`\n` +
        `Matched via polling engine.`
      );
    }
  },

  async runLapsePass(subscriberMap) {
    const linked = db.prepare(`
      SELECT
        u.discord_id as user_id,
        u.lapse_check_count,
        u.lapse_detected_at,
        pv.boosty_identifier
      FROM pro_verification_queue pv
      INNER JOIN users u ON u.discord_id = pv.discord_id
      WHERE pv.status IN ('APPROVED', 'AUTO_VERIFIED')
    `).all();

    if (linked.length === 0) return;

    console.log(`[ReconciliationEngine] Lapse pass: checking ${linked.length} Boosty-linked user(s).`);

    for (const proUser of linked) {
      const entitlement = getPremiumEntitlement(proUser.user_id);
      // A manual revoke is final; the poller never overrides it.
      if (!entitlement || entitlement.status === 'revoked') continue;

      const expiresAt = entitlement.expires_at ? new Date(`${entitlement.expires_at.replace(' ', 'T')}Z`) : null;
      const daysLeft = expiresAt ? (expiresAt - Date.now()) / 86_400_000 : Infinity;
      if (daysLeft > 365) continue; // long manual grant, not subscription-driven

      const identifier = normalizeIdentifier(proUser.boosty_identifier);
      if (!identifier) continue;

      if (subscriberMap.has(identifier)) {
        await LapseStateMachine.clearLapseState(proUser.user_id);
        // Still paying: keep Pro rolling before it runs out (or restore it if it just expired)
        if (entitlement.status === 'expired' || daysLeft < RENEW_WITHIN_DAYS) {
          grantProAccess(proUser.user_id, 30, 'POLLING_RENEWAL', { source: 'boosty' });
          console.log(`[ReconciliationEngine] Renewed Pro for ${proUser.user_id}`);
        }
      } else if (entitlement.status === 'active') {
        await LapseStateMachine.handleAbsence(proUser);
      }
    }
  },

  async reconcile() {
    console.log('[ReconciliationEngine] Starting reconciliation...');
    const subscriberMap = await BoostyApiClient.fetchAllSubscribers();

    if (subscriberMap === null) {
      pollerState.consecutiveFailures++;
      console.error(`[ReconciliationEngine] API fetch returned null. Aborting cycle. Consecutive failures: ${pollerState.consecutiveFailures}`);

      if (pollerState.consecutiveFailures === 3) {
        await alertOwner(
          `⚠️ **BoostyPoller: 3 Consecutive API Failures**\n\n` +
          `The Boosty API has failed to return valid data for 3 consecutive polling cycles.\n` +
          `**No Pro grants or revocations are occurring.**\n\n` +
          `Check: \`node scripts/boostyLogin.js\` to re-authenticate.`
        );
      }
      return;
    }

    pollerState.consecutiveFailures  = 0;
    pollerState.lastSuccessfulPollAt = new Date();

    await this.runGrantPass(subscriberMap);
    await this.runLapsePass(subscriberMap);

    console.log('[ReconciliationEngine] Reconciliation complete.');
  },
};

const PollerOrchestrator = {
  start() {
    if (!process.env.BOOSTY_POLLER_ENABLED || process.env.BOOSTY_POLLER_ENABLED !== 'true') {
      console.log('[BoostyPoller] Disabled via BOOSTY_POLLER_ENABLED env flag. Skipping start.');
      return;
    }

    console.log(`[BoostyPoller] Starting. Poll interval: ${CONFIG.POLL_INTERVAL_MS / 1000}s`);
    this.runCycle();
    pollerState.intervalHandle = setInterval(() => this.runCycle(), CONFIG.POLL_INTERVAL_MS);
  },

  stop() {
    if (pollerState.intervalHandle) {
      clearInterval(pollerState.intervalHandle);
      pollerState.intervalHandle = null;
      console.log('[BoostyPoller] Stopped.');
    }
  },

  async runCycle() {
    if (pollerState.isRunning) {
      console.warn('[BoostyPoller] Previous cycle still running. Skipping this tick.');
      return;
    }

    pollerState.isRunning = true;
    pollerState.totalCyclesRun++;
    const cycleStart = Date.now();
    console.log(`[BoostyPoller] Cycle #${pollerState.totalCyclesRun} starting...`);

    try {
      await ReconciliationEngine.reconcile();
    } catch (err) {
      console.error('[BoostyPoller] Unhandled error in cycle:', err);
      await alertOwner(`🔴 **BoostyPoller: Unhandled Cycle Error**\n\`\`\`${err.message}\`\`\`\nThe cycle was aborted.`);
    } finally {
      pollerState.isRunning = false;
      console.log(`[BoostyPoller] Cycle #${pollerState.totalCyclesRun} finished in ${Date.now() - cycleStart}ms.`);
    }
  },
};

function normalizeIdentifier(identifier) {
  return (identifier || '').toLowerCase().trim();
}

function isEmailIdentifier(identifier) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
}

function subscriberKey(sub) {
  return sub.id != null ? String(sub.id) : sub.email.toLowerCase();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendDM(userId, content) {
  try {
    const { client } = require('../index');
    if (client.isReady()) {
        const user = await client.users.fetch(userId);
        await user.send(content);
    }
  } catch (err) {
    console.warn(`[BoostyPoller] Could not DM user ${userId}:`, err.message);
  }
}

// User-facing DM in the language of the guild the user was last active in
async function sendUserDM(userId, key) {
  await sendDM(userId, t(getUserLanguage(userId), key));
}

async function alertOwner(message) {
  if (!CONFIG.OWNER_ID) return;
  await sendDM(CONFIG.OWNER_ID, message);
}

function initAuditTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS pro_revocation_log (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id            TEXT NOT NULL,
      revoked_at         TEXT NOT NULL,
      reason             TEXT NOT NULL,
      lapse_check_count  INTEGER,
      reinstated_at      TEXT DEFAULT NULL
    )
  `).run();
}

module.exports = {
  startBoostyPoller: () => {
    initAuditTable();
    PollerOrchestrator.start();
  },
  stopBoostyPoller: () => PollerOrchestrator.stop(),
  getPollerState: () => ({ ...pollerState }),
  _test: { ReconciliationEngine },
};
