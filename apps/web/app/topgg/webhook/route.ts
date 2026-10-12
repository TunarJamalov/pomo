import { NextResponse } from 'next/server';
import {
  getTopggWebhookSecret,
  getTopggVoterId,
  isTopggRequestAuthorized,
  isTopggTestEvent,
  isTopggVoteEvent,
  parseTopggWebhookBody,
} from '@/lib/topggWebhook';

const BOT_PROCESS_URL =
  process.env.VOTE_PROCESS_INTERNAL_URL ?? 'http://127.0.0.1:5000/topgg/process';

/**
 * Public Top.gg webhook endpoint. Verifies the HMAC signature on the exact
 * request body Top.gg sent, then forwards the vote to PomoBot on localhost.
 */
export async function POST(request: Request) {
  const secret = getTopggWebhookSecret();
  if (!secret) {
    console.error('[TOPGG] TOPGG_WEBHOOK_SECRET/TOPGG_TOKEN is not set in pomofocus-web environment.');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-topgg-signature');
  const authorizationHeader = request.headers.get('authorization');
  if (!signatureHeader && !authorizationHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isTopggRequestAuthorized(rawBody, signatureHeader, authorizationHeader, secret)) {
    console.warn('[TOPGG] Authorization mismatch — check TOPGG_WEBHOOK_SECRET matches the whs_ secret or legacy auth token in Top.gg dashboard.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = parseTopggWebhookBody(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = body.type;
  if (isTopggTestEvent(eventType)) {
    console.log('[TOPGG] Test webhook verified successfully.');
    return NextResponse.json({ ok: true, message: 'Test received' });
  }

  if (!isTopggVoteEvent(eventType)) {
    console.log(`[TOPGG] Skipping non-vote event: ${eventType ?? 'unknown'}`);
    return NextResponse.json({ ok: true, skipped: true });
  }

  const userId = getTopggVoterId(body);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });
  }

  try {
    const upstream = await fetch(BOT_PROCESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        eventType,
        weight: body.data?.weight ?? 1,
      }),
      cache: 'no-store',
    });

    const text = await upstream.text();
    return new NextResponse(text || null, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (error) {
    console.error('[TOPGG] Failed to forward vote to PomoBot:', error);
    return NextResponse.json({ error: 'Vote processor unavailable' }, { status: 502 });
  }
}
