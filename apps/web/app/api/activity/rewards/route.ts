import { NextResponse } from 'next/server';
import { getActivityClaims } from '@/lib/activityAuth';
import { ensureSqliteSchema } from '@/lib/sqlite';

function getDb() {
  // Additive only (shared with /api/desktop/session).
  return ensureSqliteSchema('activity_rewards', `
    CREATE TABLE IF NOT EXISTS activity_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER,
      title TEXT DEFAULT 'Focus Session',
      minutes INTEGER DEFAULT 0,
      water INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 0,
      streak INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      leveled_up INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      seen_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_activity_rewards_user_seen ON activity_rewards(user_id, seen_at, id);
  `);
}

export async function GET(req: Request) {
  try {
    const claims = getActivityClaims(req);
    if (!claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const rewards = db.prepare(`
      SELECT id, source_type, source_id, title, minutes, water, xp, streak, level, leveled_up, created_at
      FROM activity_rewards
      WHERE user_id = ? AND seen_at IS NULL
      ORDER BY id DESC
      LIMIT 5
    `).all(claims.sub);

    return NextResponse.json({ rewards });
  } catch (error) {
    console.error('Activity rewards GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const claims = getActivityClaims(req);
    if (!claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    const cleanIds = ids.map(Number).filter(Number.isInteger);
    if (cleanIds.length === 0) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    const placeholders = cleanIds.map(() => '?').join(',');
    const db = getDb();
    const info = db.prepare(`
      UPDATE activity_rewards
      SET seen_at = datetime('now')
      WHERE user_id = ? AND id IN (${placeholders})
    `).run(claims.sub, ...cleanIds);

    return NextResponse.json({ success: true, updated: info.changes });
  } catch (error) {
    console.error('Activity rewards POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
