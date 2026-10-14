import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { ensureSqliteSchema } from '@/lib/sqlite';

/**
 * Paddle webhook. Verifies the Paddle-Signature HMAC on the exact body, then
 * queues the event in `billing_events`; the bot's billing processor turns it
 * into Pomo Pro. Queuing (instead of granting here) means payments made while
 * the bot is restarting are never lost, and each event (by event_id) is stored once.
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

// Paddle's SDKs allow 5 seconds; a little more absorbs clock drift on our side.
// Replays inside the window are harmless because events are stored once per event_id.
const MAX_AGE_SECONDS = 60;

function parseSignature(header: string): { ts: string; signatures: string[] } | null {
  let ts = '';
  const signatures: string[] = [];
  for (const part of header.split(';')) {
    const [key, value] = part.split('=');
    if (key === 'ts' && value) ts = value;
    // More than one h1 is sent while Paddle rotates the secret
    if (key === 'h1' && value) signatures.push(value);
  }
  return ts && signatures.length ? { ts, signatures } : null;
}

function validSignature(rawBody: string, header: string, secret: string): boolean {
  const parsed = parseSignature(header);
  if (!parsed) return false;
  const age = Math.abs(Date.now() / 1000 - Number(parsed.ts));
  if (!Number.isFinite(age) || age > MAX_AGE_SECONDS) return false;

  const expected = Buffer.from(createHmac('sha256', secret).update(`${parsed.ts}:${rawBody}`, 'utf8').digest('hex'), 'utf8');
  return parsed.signatures.some(sig => {
    const received = Buffer.from(sig.trim().toLowerCase(), 'utf8');
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export async function POST(request: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('[BILLING] PADDLE_WEBHOOK_SECRET is not set.');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('paddle-signature') ?? '';
  if (!signature || !validSignature(rawBody, signature, secret)) {
    console.warn('[BILLING] Rejected a Paddle webhook with a bad or expired signature.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let eventId = '';
  let eventType = 'unknown';
  try {
    const parsed = JSON.parse(rawBody);
    eventId = String(parsed?.event_id ?? '');
    eventType = String(parsed?.event_type ?? 'unknown');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!eventId) return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });

  const db = ensureSqliteSchema('billing_events', BILLING_EVENTS_DDL);
  const inserted = db
    .prepare('INSERT OR IGNORE INTO billing_events (provider, event_hash, event_name, payload) VALUES (?, ?, ?, ?)')
    .run('paddle', `paddle:${eventId}`, eventType.slice(0, 80), rawBody);

  console.log(`[BILLING] ${eventType} ${inserted.changes ? 'queued' : 'already received'}`);
  return NextResponse.json({ ok: true });
}
