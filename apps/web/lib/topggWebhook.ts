import { createHmac, timingSafeEqual } from 'crypto';

/** Signed webhooks older/newer than this are rejected (replay protection). */
const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isFreshTimestamp(timestamp: string, nowMs = Date.now()): boolean {
  if (!/^\d{1,16}$/.test(timestamp)) return false;
  let seconds = Number(timestamp);
  // Accept both unix seconds and milliseconds.
  if (seconds > 1e12) seconds = Math.floor(seconds / 1000);
  return Math.abs(nowMs / 1000 - seconds) <= MAX_TIMESTAMP_SKEW_SECONDS;
}

export type TopggWebhookBody = {
  type?: string;
  data?: {
    weight?: number;
    user?: {
      platform_id?: string;
    };
  };
  user?: string;
};

export function getTopggWebhookSecret(): string {
  return (process.env.TOPGG_WEBHOOK_SECRET ?? process.env.TOPGG_TOKEN ?? '').trim();
}

export function verifyTopggSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const sigObj = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [key, ...valueParts] = part.split('=');
      return [key, valueParts.join('=')];
    }),
  );

  const timestamp = sigObj.t?.trim();
  const receivedSig = sigObj.v1?.trim().toLowerCase();
  if (!timestamp || !receivedSig) return false;
  if (!isFreshTimestamp(timestamp)) return false;

  const expected = createHmac('sha256', secret.trim())
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return safeEqual(receivedSig, expected);
}

export function verifyTopggAuthorization(
  authorizationHeader: string | null,
  secret: string,
): boolean {
  const token = authorizationHeader?.replace(/^Bearer\s+/i, '').trim();
  return Boolean(token && safeEqual(token, secret.trim()));
}

export function isTopggRequestAuthorized(
  rawBody: string,
  signatureHeader: string | null,
  authorizationHeader: string | null,
  secret: string,
): boolean {
  if (signatureHeader && verifyTopggSignature(rawBody, signatureHeader, secret)) {
    return true;
  }

  return verifyTopggAuthorization(authorizationHeader, secret);
}

export function parseTopggWebhookBody(rawBody: string): TopggWebhookBody {
  return JSON.parse(rawBody) as TopggWebhookBody;
}

export function getTopggVoterId(body: TopggWebhookBody): string | undefined {
  return body.data?.user?.platform_id ?? body.user;
}

export function isTopggVoteEvent(eventType?: string): boolean {
  return !eventType || eventType === 'vote.create' || eventType === 'upvote' || eventType === 'vote';
}

export function isTopggTestEvent(eventType?: string): boolean {
  return eventType === 'webhook.test' || eventType === 'test';
}
