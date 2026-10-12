import crypto from 'crypto';

type ActivityUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

export type ActivityClaims = {
  sub: string;
  username: string;
  avatar: string | null;
  exp: number;
};

const TOKEN_TTL_SECONDS = 60 * 60 * 6;

let warnedAboutFallbackSecret = false;

/**
 * HMAC secret for activity/desktop tokens. ACTIVITY_TOKEN_SECRET should be set;
 * the NEXTAUTH_SECRET / DISCORD_CLIENT_SECRET fallback is kept only so tokens
 * already issued keep working.
 */
export function getActivityTokenSecret() {
  const dedicated = process.env.ACTIVITY_TOKEN_SECRET;
  if (dedicated) return dedicated;
  const fallback = process.env.NEXTAUTH_SECRET || process.env.DISCORD_CLIENT_SECRET;
  if (fallback && !warnedAboutFallbackSecret) {
    warnedAboutFallbackSecret = true;
    console.warn('[activityAuth] ACTIVITY_TOKEN_SECRET is not set; falling back to NEXTAUTH_SECRET/DISCORD_CLIENT_SECRET. Set a dedicated ACTIVITY_TOKEN_SECRET (changing it invalidates existing activity/desktop tokens).');
  }
  return fallback;
}

function getSecret() {
  return getActivityTokenSecret();
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createActivityToken(user: ActivityUser) {
  const secret = getSecret();
  if (!secret) {
    throw new Error('Missing ACTIVITY_TOKEN_SECRET or fallback secret');
  }

  const claims: ActivityClaims = {
    sub: user.id,
    username: user.global_name || user.username || `User#${user.id.slice(-4)}`,
    avatar: user.avatar ?? null,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };

  const payload = base64url(JSON.stringify(claims));
  const signature = signPayload(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyActivityToken(token: string | null | undefined): ActivityClaims | null {
  const secret = getSecret();
  if (!secret || !token) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = signPayload(payload, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ActivityClaims;
    if (!claims.sub || !claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

export function getActivityClaims(request: Request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  return verifyActivityToken(token);
}
