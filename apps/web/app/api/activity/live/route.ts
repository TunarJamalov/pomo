import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActivityClaims } from '@/lib/activityAuth';

export async function GET(req: Request) {
  try {
    // Session titles are written by users: only show them inside the Activity.
    if (!getActivityClaims(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();

    const counts = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM study_sessions WHERE completed = 0) as solo,
        (SELECT COUNT(*) FROM team_sessions WHERE status IN ('waiting', 'active', 'break')) as teams,
        (SELECT COUNT(*) FROM voice_sessions WHERE status = 'active') as voice
    `).get() as { solo: number; teams: number; voice: number };

    const rows = db.prepare(`
      SELECT kind, user_id, username, avatar, level, title, duration, started_at, members
      FROM (
        SELECT
          'solo' as kind,
          s.user_id,
          COALESCE(
            (SELECT ac.username FROM activity_chat ac WHERE ac.user_id = s.user_id ORDER BY ac.id DESC LIMIT 1),
            s.user_id
          ) as username,
          (SELECT ac.avatar FROM activity_chat ac WHERE ac.user_id = s.user_id ORDER BY ac.id DESC LIMIT 1) as avatar,
          COALESCE(u.level, 1) as level,
          COALESCE(s.title, 'Focus session') as title,
          s.duration,
          s.started_at,
          1 as members
        FROM study_sessions s
        LEFT JOIN users u ON u.discord_id = s.user_id
        WHERE s.completed = 0

        UNION ALL

        SELECT
          'team' as kind,
          ts.host_id as user_id,
          COALESCE(
            (SELECT ac.username FROM activity_chat ac WHERE ac.user_id = ts.host_id ORDER BY ac.id DESC LIMIT 1),
            ts.host_id
          ) as username,
          (SELECT ac.avatar FROM activity_chat ac WHERE ac.user_id = ts.host_id ORDER BY ac.id DESC LIMIT 1) as avatar,
          COALESCE(u.level, 1) as level,
          CASE
            WHEN ts.status = 'waiting' THEN 'Team room waiting'
            WHEN ts.status = 'break' THEN 'Team break'
            ELSE 'Team focus room'
          END as title,
          ts.duration,
          ts.started_at,
          (SELECT COUNT(*) FROM team_members tm WHERE tm.session_id = ts.id) as members
        FROM team_sessions ts
        LEFT JOIN users u ON u.discord_id = ts.host_id
        WHERE ts.status IN ('waiting', 'active', 'break')

        UNION ALL

        SELECT
          'voice' as kind,
          vs.user_id,
          COALESCE(
            (SELECT ac.username FROM activity_chat ac WHERE ac.user_id = vs.user_id ORDER BY ac.id DESC LIMIT 1),
            vs.user_id
          ) as username,
          (SELECT ac.avatar FROM activity_chat ac WHERE ac.user_id = vs.user_id ORDER BY ac.id DESC LIMIT 1) as avatar,
          COALESCE(u.level, 1) as level,
          'Voice study tracking' as title,
          NULL as duration,
          vs.started_at,
          1 as members
        FROM voice_sessions vs
        LEFT JOIN users u ON u.discord_id = vs.user_id
        WHERE vs.status = 'active'
      )
      ORDER BY datetime(started_at) DESC
      LIMIT 8
    `).all();


    return NextResponse.json({
      counts,
      total: (counts.solo || 0) + (counts.voice || 0) + (counts.teams || 0),
      sessions: rows,
    });
  } catch (error) {
    console.error('Activity live GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
