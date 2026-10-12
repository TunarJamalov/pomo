import type { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDiscordAccessToken } from '@/lib/discordAuth';
import { getUserGuilds } from '@/lib/discordApi';

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

export function canManageGuild(permissions: unknown) {
  try {
    const perms = BigInt(String(permissions ?? 0));
    return (perms & MANAGE_GUILD) === MANAGE_GUILD || (perms & ADMINISTRATOR) === ADMINISTRATOR;
  } catch {
    return false;
  }
}

export type GuildListResult =
  | { ok: true; guilds: any[] }
  | { ok: false; status: 401; error: string; reauth: boolean };

/**
 * Loads the signed-in user's Discord guilds using the server-side-only OAuth
 * token. `reauth: true` means the user must sign in again (token expired or
 * revoked and could not be refreshed).
 */
export async function loadUserGuilds(req: NextRequest): Promise<GuildListResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Unauthorized', reauth: false };
  }
  const accessToken = await getDiscordAccessToken(req);
  if (!accessToken) {
    return { ok: false, status: 401, error: 'Your Discord login expired. Please sign in again.', reauth: true };
  }
  const guilds = await getUserGuilds(accessToken);
  if (guilds === null) {
    return { ok: false, status: 401, error: 'Your Discord login expired. Please sign in again.', reauth: true };
  }
  return { ok: true, guilds };
}
