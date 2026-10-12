/**
 * Discord API helper - fetches user info (username, avatar) from Discord.
 * Uses a simple in-memory cache to avoid hammering the API.
 */

const cache = new Map<string, { name: string; avatar: string | null; cachedAt: number }>();
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes

export async function getDiscordUser(discordId: string): Promise<{ name: string; avatar: string | null }> {
  const now = Date.now();
  const cached = cache.get(discordId);
  if (cached && now - cached.cachedAt < CACHE_TTL) {
    return { name: cached.name, avatar: cached.avatar };
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { name: `User#${discordId.slice(-4)}`, avatar: null };

  try {
    const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
      headers: { Authorization: `Bot ${token}` },
      next: { revalidate: 600 }, // Next.js cache: revalidate every 10 min
    });

    if (!res.ok) return { name: `User#${discordId.slice(-4)}`, avatar: null };

    const data = await res.json();
    const name: string = data.global_name || data.username || `User#${discordId.slice(-4)}`;
    const avatar: string | null = data.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${data.avatar}.webp?size=64`
      : null;

    cache.set(discordId, { name, avatar, cachedAt: now });
    return { name, avatar };
  } catch {
    return { name: `User#${discordId.slice(-4)}`, avatar: null };
  }
}

/**
 * Lists the signed-in user's guilds. Returns `null` when Discord rejects the
 * access token (expired/revoked) so callers can ask the user to re-login
 * instead of silently showing an empty list.
 */
export async function getUserGuilds(accessToken: string): Promise<any[] | null> {
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store'
    });

    if (res.status === 401) return null;
    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getBotGuildChannels(guildId: string): Promise<any[]> {
  const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) return [];
  
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${token}` },
      cache: 'no-store'
    });
    
    if (!res.ok) return [];
    
    return await res.json();
  } catch {
    return [];
  }
}
