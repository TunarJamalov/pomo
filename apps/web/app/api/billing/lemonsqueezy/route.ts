import { NextResponse } from 'next/server';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { ensureSqliteSchema } from '@/lib/sqlite';

/**
 * Lemon Squeezy webhook. Verifies the X-Signature HMAC on the exact body, then
 * queues the event in `billing_events`; the bot's billing processor turns it
 * into Pomo Pro. Queuing (instead of granting here) means payments made while
 * the bot is restarting are never lost, and each event is stored once.
 */
const BILLING_EVENTS_DDL = `
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

function validSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'), 'utf8');
  const received = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function POST(request: Request) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('[BILLING] LEMONSQUEEZY_WEBHOOK_SECRET is not set.');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-signature') ?? '';
  if (!signature || !validSignature(rawBody, signature, secret)) {
    console.warn('[BILLING] Rejected a Lemon Squeezy webhook with a bad signature.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let eventName = 'unknown';
  try {
    eventName = String(JSON.parse(rawBody)?.meta?.event_name ?? 'unknown');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const db = ensureSqliteSchema('billing_events', BILLING_EVENTS_DDL);
  const eventHash = createHash('sha256').update(rawBody).digest('hex');
  const inserted = db
    .prepare('INSERT OR IGNORE INTO billing_events (provider, event_hash, event_name, payload) VALUES (?, ?, ?, ?)')
    .run('lemonsqueezy', eventHash, eventName.slice(0, 80), rawBody);

  console.log(`[BILLING] ${eventName} ${inserted.changes ? 'queued' : 'already received'}`);
  return NextResponse.json({ ok: true });
}
