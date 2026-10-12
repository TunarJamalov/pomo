import { NextResponse, type NextRequest } from 'next/server';
import { getBotGuildChannels } from '@/lib/discordApi';
import { getDb } from '@/lib/db';
import { canManageGuild, loadUserGuilds } from '@/lib/guildAccess';

// Discord channel types
const GUILD_TEXT = 0;
const GUILD_VOICE = 2;
const GUILD_CATEGORY = 4;
const GUILD_ANNOUNCEMENT = 5;

// Accepted ranges (values outside are clamped).
const LIMITS = {
  goal_target_minutes: { min: 60, max: 100000, fallback: 2500 },
  voice_min_minutes: { min: 1, max: 120, fallback: 10 },
  voice_daily_reward_cap: { min: 30, max: 480, fallback: 240 },
} as const;

type RouteContext = { params: Promise<{ id: string }> };

async function authorizeGuild(req: NextRequest, guildId: string) {
  if (!/^\d{5,25}$/.test(guildId)) {
    return { error: NextResponse.json({ error: 'Invalid server id.' }, { status: 400 }) };
  }
  const loaded = await loadUserGuilds(req);
  if (!loaded.ok) {
    return { error: NextResponse.json({ error: loaded.error, reauth: loaded.reauth }, { status: loaded.status }) };
  }
  const userGuild = loaded.guilds.find(g => g.id === guildId);
  if (!userGuild) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  if (!canManageGuild(userGuild.permissions)) {
    return { error: NextResponse.json({ error: 'Forbidden. Manage Server permission required.' }, { status: 403 }) };
  }
  return { userGuild };
}

function clampInt(value: unknown, limit: { min: number; max: number; fallback: number }) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return limit.fallback;
  return Math.min(limit.max, Math.max(limit.min, n));
}

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  return /^\d{5,25}$/.test(s) ? s : 'invalid';
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: guildId } = await params;
    const auth = await authorizeGuild(req, guildId);
    if (auth.error) return auth.error;

    // Fetch DB settings
    const db = getDb(true);
    const settings = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId) as any;

    if (!settings) {
      return NextResponse.json({ error: 'Server not configured or bot not added.' }, { status: 404 });
    }

    // Fetch channels using Bot token
    const channels = await getBotGuildChannels(guildId);

    const textChannels = channels.filter(c => c.type === GUILD_TEXT || c.type === GUILD_ANNOUNCEMENT);
    const voiceChannels = channels.filter(c => c.type === GUILD_VOICE);
    const categories = channels.filter(c => c.type === GUILD_CATEGORY);

    return NextResponse.json({
      settings,
      serverInfo: auth.userGuild,
      channels: {
        text: textChannels.map(c => ({ id: c.id, name: c.name, parent_id: c.parent_id })),
        voice: voiceChannels.map(c => ({ id: c.id, name: c.name, parent_id: c.parent_id })),
        categories: categories.map(c => ({ id: c.id, name: c.name }))
      }
    });

  } catch (error) {
    console.error('Server GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: guildId } = await params;
    const auth = await authorizeGuild(req, guildId);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const db = getDb(false);
    const current = db.prepare(`
      SELECT guild_id, studyroom_category_id, studyroom_trigger_id, report_channel_id,
             voice_target_id, voice_target_type
      FROM guild_settings
      WHERE guild_id = ?
    `).get(guildId) as any;
    if (!current) {
      return NextResponse.json({ error: 'Server not configured or bot not added.' }, { status: 404 });
    }

    const categoryId = normalizeId(body.studyroom_category_id);
    const triggerId = normalizeId(body.studyroom_trigger_id);
    const reportChannelId = normalizeId(body.report_channel_id);
    if (categoryId === 'invalid' || triggerId === 'invalid' || reportChannelId === 'invalid') {
      return NextResponse.json({ error: 'Invalid channel id.' }, { status: 400 });
    }

    // Channel ids must belong to THIS guild and be of the expected type.
    // A value equal to what is already stored is accepted unchanged.
    const channels = await getBotGuildChannels(guildId);
    const byId = new Map<string, any>(channels.map(c => [String(c.id), c]));
    const check = (id: string | null, storedValue: string | null, types: number[], label: string) => {
      if (!id || id === storedValue) return null;
      const channel = byId.get(id);
      if (!channel || String(channel.guild_id ?? guildId) !== guildId || !types.includes(Number(channel.type))) {
        return `${label} must be a ${types.includes(GUILD_CATEGORY) ? 'category' : types.includes(GUILD_VOICE) ? 'voice channel' : 'text channel'} in this server.`;
      }
      return null;
    };
    const channelError =
      check(categoryId, current.studyroom_category_id, [GUILD_CATEGORY], 'Study category') ||
      check(triggerId, current.studyroom_trigger_id, [GUILD_VOICE], 'Join-to-create channel') ||
      check(reportChannelId, current.report_channel_id, [GUILD_TEXT, GUILD_ANNOUNCEMENT], 'Report channel');
    if (channelError) {
      return NextResponse.json({ error: channelError }, { status: 400 });
    }

    // Voice tracking target (bot semantics: voice_target_type 'category' ->
    // any voice channel under that category; 'channel' -> that channel only).
    // The settings form does not edit it. We only keep a target that was
    // derived from the study category in sync with it, and never clear or
    // overwrite a target the admin configured via /voice or /setup.
    let voiceTargetId: string | null = current.voice_target_id ?? null;
    let voiceTargetType: string | null = current.voice_target_type ?? null;
    const targetMirrorsCategory =
      !voiceTargetId ||
      (voiceTargetId === current.studyroom_category_id && (voiceTargetType === 'category' || voiceTargetType === null));
    if (categoryId && targetMirrorsCategory) {
      voiceTargetId = categoryId;
      voiceTargetType = 'category';
    }

    db.prepare(`
      UPDATE guild_settings SET
        studyroom_category_id = ?,
        studyroom_trigger_id = ?,
        voice_target_id = ?,
        voice_target_type = ?,
        report_enabled = ?,
        report_channel_id = ?,
        goal_enabled = ?,
        goal_target_minutes = ?,
        voice_min_minutes = ?,
        voice_daily_reward_cap = ?,
        setup_completed_at = COALESCE(setup_completed_at, CURRENT_TIMESTAMP)
      WHERE guild_id = ?
    `).run(
      categoryId,
      triggerId,
      voiceTargetId,
      voiceTargetType,
      body.report_enabled ? 1 : 0,
      reportChannelId,
      body.goal_enabled ? 1 : 0,
      clampInt(body.goal_target_minutes, LIMITS.goal_target_minutes),
      clampInt(body.voice_min_minutes, LIMITS.voice_min_minutes),
      clampInt(body.voice_daily_reward_cap, LIMITS.voice_daily_reward_cap),
      guildId
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Server POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
