import { NextResponse } from 'next/server';
import { epointDb, verifyAndDecode } from '@/lib/epoint';

/**
 * Epoint's result callback (set as the result URL in the Epoint dashboard).
 * Checks the signature, then queues the decoded result in `billing_events`;
 * the bot's billing processor turns it into a plan. Queuing (instead of granting
 * here) means payments made while the bot restarts are never lost, and each
 * result is stored once.
 */
export async function POST(request: Request) {
  if (!process.env.EPOINT_PRIVATE_KEY) {
    console.error('[BILLING] EPOINT_PRIVATE_KEY is not set.');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  let data: unknown;
  let signature: unknown;
  try {
    const form = await request.formData();
    data = form.get('data');
    signature = form.get('signature');
  } catch {
    return NextResponse.json({ error: 'Expected form data' }, { status: 400 });
  }

  const result = verifyAndDecode(data, signature);
  if (!result) {
    console.warn('[BILLING] Rejected an Epoint callback with a bad signature.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orderId = String(result.order_id ?? '');
  const status = String(result.status ?? 'unknown');
  if (!orderId) return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });

  const eventHash = `epoint:${orderId}:${status}:${String(result.transaction ?? '')}`;
  const inserted = epointDb()
    .prepare('INSERT OR IGNORE INTO billing_events (provider, event_hash, event_name, payload) VALUES (?, ?, ?, ?)')
    .run('epoint', eventHash, `payment.${status}`.slice(0, 80), JSON.stringify(result));

  console.log(`[BILLING] Epoint ${status} for ${orderId} ${inserted.changes ? 'queued' : 'already received'}`);
  return NextResponse.json({ ok: true });
}
