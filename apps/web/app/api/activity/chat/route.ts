import { NextResponse } from 'next/server';
import { getActivityClaims } from '@/lib/activityAuth';
import { ensureSqliteSchema } from '@/lib/sqlite';
import { rateLimit } from '@/lib/rateLimit';

const MAX_MESSAGE_LENGTH = 200;

function getDb() {
  // Additive only; the table normally already exists.
  return ensureSqliteSchema('activity_chat', `
    CREATE TABLE IF NOT EXISTS activity_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      avatar TEXT,
      level INTEGER DEFAULT 1,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

// GET: fetch recent messages + online users leaderboard (only for someone inside the Activity)
export async function GET(req: Request) {
  try {
    if (!getActivityClaims(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = getDb();

    // Last 50 messages
    const messages = db.prepare(`
      SELECT id, user_id, username, avatar, level, message, created_at
      FROM activity_chat
      ORDER BY id DESC
      LIMIT 50
    `).all().reverse();

    // Leaderboard: top 10 by XP. Get username from most recent chat message or use discord_id
    const leaderboard = db.prepare(`
      SELECT
        u.discord_id,
        u.level,
        u.xp,
        u.total_focus_minutes,
        COALESCE(
          (SELECT ac.username FROM activity_chat ac WHERE ac.user_id = u.discord_id ORDER BY ac.id DESC LIMIT 1),
          u.discord_id
        ) as username,
        (SELECT ac.avatar FROM activity_chat ac WHERE ac.user_id = u.discord_id ORDER BY ac.id DESC LIMIT 1) as avatar
      FROM users u
      ORDER BY u.xp DESC
      LIMIT 10
    `).all();

    return NextResponse.json({ messages, leaderboard });
  } catch (error) {
    console.error('Chat GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: send a message
export async function POST(req: Request) {
  try {
    const { userId, message } = await req.json();
    const claims = getActivityClaims(req);
    if (!claims || claims.sub !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // 5 messages per 10 seconds, 30 per minute per user.
    if (!rateLimit(`chat:burst:${claims.sub}`, 5, 10_000) || !rateLimit(`chat:min:${claims.sub}`, 30, 60_000)) {
      return NextResponse.json({ error: 'You are sending messages too fast.' }, { status: 429 });
    }

    // Strip control characters and cap length.
    const clean = message.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!clean) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const db = getDb();
    // Level is derived server-side from the users table; the client value is ignored.
    const user = db.prepare('SELECT level FROM users WHERE discord_id = ?').get(claims.sub) as { level?: number } | undefined;
    const level = Number.isInteger(user?.level) ? Number(user!.level) : 1;

    db.prepare(`
      INSERT INTO activity_chat (user_id, username, avatar, level, message, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(claims.sub, String(claims.username || '').slice(0, 64), claims.avatar, level, clean);

    // Keep only last 200 chat messages (existing ephemeral chat retention).
    db.prepare(`
      DELETE FROM activity_chat WHERE id NOT IN (
        SELECT id FROM activity_chat ORDER BY id DESC LIMIT 200
      )
    `).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Chat POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
