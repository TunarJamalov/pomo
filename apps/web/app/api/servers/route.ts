import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { canManageGuild, loadUserGuilds } from '@/lib/guildAccess';

export async function GET(req: NextRequest) {
  try {
    const loaded = await loadUserGuilds(req);
    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error, reauth: loaded.reauth }, { status: loaded.status });
    }

    // Filter guilds where user has MANAGE_GUILD (0x20) or ADMINISTRATOR (0x8)
    const manageGuilds = loaded.guilds.filter(g => canManageGuild(g.permissions));

    if (manageGuilds.length === 0) {
      return NextResponse.json([]);
    }

    // Check which of these guilds have the bot installed
    const guildIds = manageGuilds.map(g => g.id);
    const placeholders = guildIds.map(() => '?').join(',');
    
    const db = getDb(true);
    const botGuilds = db.prepare(`SELECT guild_id, setup_completed_at FROM guild_settings WHERE guild_id IN (${placeholders})`).all(...guildIds) as any[];

    const botGuildMap = new Map();
    botGuilds.forEach(bg => {
      botGuildMap.set(bg.guild_id, bg);
    });

    const result = manageGuilds.map(g => ({
      id: g.id,
      name: g.name,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.webp` : null,
      hasBot: botGuildMap.has(g.id),
      setupComplete: botGuildMap.has(g.id) ? !!botGuildMap.get(g.id).setup_completed_at : false
    }));

    // Sort: Has bot first, then alphabetical
    result.sort((a, b) => {
      if (a.hasBot && !b.hasBot) return -1;
      if (!a.hasBot && b.hasBot) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Servers API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
