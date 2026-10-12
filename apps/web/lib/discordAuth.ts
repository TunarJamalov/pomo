import type { NextRequest } from 'next/server';
import { getToken, type JWT } from 'next-auth/jwt';

/**
 * Discord OAuth access tokens are kept ONLY inside the encrypted NextAuth JWT
 * cookie (never copied into the client-visible session). Server code that
 * needs one (e.g. listing the user's guilds) reads it here.
 */

export type DiscordTokenSet = {
  accessToken: string;
  refreshToken?: string;
  /** epoch ms */
  expiresAt?: number;
};

// Discord rotates refresh tokens, so concurrent refreshes with the same
// refresh token must share one result. Keyed by the refresh token used.
type RefreshResult = { ok: true; tokens: DiscordTokenSet } | { ok: false };
const g = globalThis as typeof globalThis & {
  __pomoDiscordRefresh?: Map<string, { promise: Promise<RefreshResult>; at: number }>;
};
const refreshCache = g.__pomoDiscordRefresh ?? (g.__pomoDiscordRefresh = new Map());
const REFRESH_CACHE_TTL_MS = 10 * 60 * 1000;
/** Refresh a bit before the real expiry. */
const EXPIRY_MARGIN_MS = 60 * 1000;

export function isExpired(expiresAt: number | undefined, now = Date.now()) {
  return typeof expiresAt === 'number' && expiresAt - EXPIRY_MARGIN_MS <= now;
}

async function doRefresh(refreshToken: string): Promise<RefreshResult> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { ok: false };
  try {
    const res = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    if (!data?.access_token) return { ok: false };
    return {
      ok: true,
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: Date.now() + Number(data.expires_in || 0) * 1000,
      },
    };
  } catch {
    return { ok: false };
  }
}

export function refreshDiscordToken(refreshToken: string): Promise<RefreshResult> {
  const now = Date.now();
  for (const [key, entry] of refreshCache) {
    if (now - entry.at > REFRESH_CACHE_TTL_MS) refreshCache.delete(key);
  }
  const cached = refreshCache.get(refreshToken);
  if (cached) return cached.promise;
  const promise = doRefresh(refreshToken);
  refreshCache.set(refreshToken, { promise, at: now });
  return promise;
}

/**
 * NextAuth `jwt` callback helper: refreshes the Discord token stored in the
 * JWT when it is (about to be) expired. On failure the token is flagged so the
 * UI can ask the user to sign in again instead of silently showing nothing.
 */
export async function refreshJwtIfNeeded(token: JWT): Promise<JWT> {
  const expiresAt = typeof token.discordExpiresAt === 'number' ? token.discordExpiresAt : undefined;
  if (!token.accessToken || !isExpired(expiresAt)) return token;
  if (typeof token.refreshToken !== 'string' || !token.refreshToken) {
    return { ...token, accessToken: undefined, authError: 'RefreshAccessTokenError' };
  }
  const result = await refreshDiscordToken(token.refreshToken);
  if (!result.ok) {
    return { ...token, accessToken: undefined, authError: 'RefreshAccessTokenError' };
  }
  return {
    ...token,
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
    discordExpiresAt: result.tokens.expiresAt,
    authError: undefined,
  };
}

/**
 * Returns a usable Discord access token for the signed-in user, or null when
 * the user must sign in again (no session, missing/expired token and refresh
 * failed).
 */
export async function getDiscordAccessToken(req: NextRequest): Promise<string | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return null;
  const refreshed = await refreshJwtIfNeeded(token);
  return typeof refreshed.accessToken === 'string' && refreshed.accessToken ? refreshed.accessToken : null;
}
