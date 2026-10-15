import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { ensureSqliteSchema } from '@/lib/sqlite';
import { PRO_TIERS, type BillingCycle, type ProTier } from '@/lib/billing';

/**
 * Epoint (epoint.az) on the website: starting a checkout and checking callbacks.
 * Renewals (charging the saved card) run in the bot: apps/bot/services/billingProcessor.js.
 *
 * Requests are `data` (base64 JSON) + `signature` = base64(sha1_raw(private + data + private)).
 * Server-only: reads EPOINT_PRIVATE_KEY.
 */
const BASE_URL = 'https://epoint.az';

// Same tables as apps/bot/utils/database.js (additive, created by whichever side starts first)
const EPOINT_DDL = `
  CREATE TABLE IF NOT EXISTS epoint_orders (
    order_id TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    cycle TEXT NOT NULL,
    amount TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'first',
    subscription_id INTEGER,
    status TEXT NOT NULL DEFAULT 'new',
    transaction_id TEXT,
    result TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_epoint_orders_user ON epoint_orders(discord_id);
  CREATE TABLE IF NOT EXISTS epoint_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    cycle TEXT NOT NULL,
    amount TEXT NOT NULL,
    card_id TEXT,
    card_mask TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    current_period_end TEXT NOT NULL,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_epoint_subscriptions_user ON epoint_subscriptions(discord_id);
  CREATE TABLE IF NOT EXISTS billing_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    event_hash TEXT NOT NULL UNIQUE,
    event_name TEXT NOT NULL,
    payload TEXT NOT NULL,
    received_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT,
    result TEXT
  );
`;

export function epointDb() {
  return ensureSqliteSchema('epoint', EPOINT_DDL);
}

export function siteUrl() {
  return (process.env.SITE_URL || 'https://pomofocus.online').replace(/\/$/, '');
}

export function epointConfigured() {
  return Boolean(process.env.EPOINT_PUBLIC_KEY && process.env.EPOINT_PRIVATE_KEY);
}

/** Sales open for everyone with PRO_SALES_OPEN=true; before that only for the listed test accounts. */
export function canBuy(discordId: string) {
  if (!epointConfigured()) return false;
  if (process.env.PRO_SALES_OPEN === 'true') return true;
  const testers = (process.env.EPOINT_TEST_DISCORD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return testers.includes(discordId);
}

export function sign(data: string, privateKey = process.env.EPOINT_PRIVATE_KEY || '') {
  return createHash('sha1').update(`${privateKey}${data}${privateKey}`, 'utf8').digest('base64');
}

/** Checks a callback's signature and returns its decoded JSON, or null. */
export function verifyAndDecode(data: unknown, signature: unknown, privateKey = process.env.EPOINT_PRIVATE_KEY || '') {
  if (!privateKey || typeof data !== 'string' || typeof signature !== 'string') return null;
  const expected = Buffer.from(sign(data, privateKey));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function post(path: string, params: Record<string, unknown>) {
  const data = Buffer.from(JSON.stringify({ public_key: process.env.EPOINT_PUBLIC_KEY, ...params }), 'utf8').toString('base64');
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data, signature: sign(data) }).toString(),
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Epoint ${path} returned HTTP ${res.status} without JSON`);
  }
}

export type EpointSubscription = {
  id: number;
  plan: ProTier;
  cycle: BillingCycle;
  amount: string;
  card_mask: string | null;
  status: 'active' | 'past_due' | 'canceled' | 'ended' | 'replaced';
  current_period_end: string;
  cancel_at_period_end: number;
  failed_attempts: number;
};

/** The user's latest subscription that still gives them a plan, if any. */
export function currentSubscription(discordId: string): EpointSubscription | null {
  return (epointDb().prepare(`
    SELECT id, plan, cycle, amount, card_mask, status, current_period_end, cancel_at_period_end, failed_attempts
    FROM epoint_subscriptions
    WHERE discord_id = ? AND status IN ('active', 'past_due')
    ORDER BY id DESC LIMIT 1
  `).get(discordId) as EpointSubscription | undefined) ?? null;
}

/**
 * Creates the order and asks Epoint for a payment page that also saves the card
 * for renewals. Returns the URL to send the buyer to.
 */
export async function startCheckout(discordId: string, plan: ProTier, cycle: BillingCycle, language: 'az' | 'en' | 'ru') {
  const tier = PRO_TIERS[plan];
  const amount = tier.amount[cycle];
  const orderId = `pomo-${randomUUID()}`;
  const db = epointDb();
  db.prepare('INSERT INTO epoint_orders (order_id, discord_id, plan, cycle, amount) VALUES (?, ?, ?, ?, ?)')
    .run(orderId, discordId, plan, cycle, amount);

  const reply = await post('/api/1/card-registration-with-pay', {
    language,
    order_id: orderId,
    amount,
    currency: 'AZN',
    description: `${tier.name} (${cycle === 'yearly' ? 'yearly' : 'monthly'})`,
    success_redirect_url: `${siteUrl()}/billing?checkout=success`,
    error_redirect_url: `${siteUrl()}/billing?checkout=failed`,
  });

  if (reply.status === 'success' && typeof reply.redirect_url === 'string') {
    db.prepare("UPDATE epoint_orders SET transaction_id = ?, updated_at = datetime('now') WHERE order_id = ?")
      .run(typeof reply.transaction === 'string' ? reply.transaction : null, orderId);
    return reply.redirect_url;
  }
  const message = String(reply.message ?? reply.status ?? 'no redirect_url').slice(0, 200);
  db.prepare("UPDATE epoint_orders SET status = 'failed', result = ?, updated_at = datetime('now') WHERE order_id = ?")
    .run(message, orderId);
  throw new Error(`Epoint checkout failed: ${message}`);
}
