import { NextResponse } from 'next/server';
import { getActivityClaims } from '@/lib/activityAuth';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDb, getProductivityRepository, resolveSqliteUserId } from '@/lib/db';

export async function POST(req: Request) {
  try {
    let userId = null;
    const claims = getActivityClaims(req);
    if (claims && claims.sub) {
      userId = claims.sub;
    } else {
      const session = await getServerSession(authOptions);
      if ((session?.user as any)?.id) userId = (session?.user as any)?.id;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { channelId, minutes, type = 'study', extra_data = null, todoId = null, subject = 'general' } = await req.json();

    const allowedTypes = new Set(['study', 'create_team', 'join_team', 'stop']);
    if (!allowedTypes.has(type)) {
      return NextResponse.json({ error: 'Invalid timer type.' }, { status: 400 });
    }

    if (type !== 'stop') {
      if (!channelId || !minutes || isNaN(minutes) || minutes < 5 || minutes > 100) {
        return NextResponse.json({ error: 'Invalid parameters. Minutes must be between 5 and 100.' }, { status: 400 });
      }
    }

    if (channelId && !/^\d{5,25}$/.test(String(channelId))) {
      return NextResponse.json({ error: 'Invalid channel.' }, { status: 400 });
    }

    if (type === 'join_team' && (!extra_data || !/^\d+$/.test(String(extra_data)))) {
      return NextResponse.json({ error: 'Invalid room code.' }, { status: 400 });
    }

    const linkedTodoId = type === 'study' && todoId ? Number(todoId) : null;
    if (linkedTodoId && !Number.isInteger(linkedTodoId)) {
      return NextResponse.json({ error: 'Invalid task.' }, { status: 400 });
    }
    const allowedSubjects = new Set(['general', 'math', 'language', 'coding', 'reading', 'exam']);
    const normalizedSubject = allowedSubjects.has(String(subject)) ? String(subject) : 'general';

    // Validate the linked task first. `userId` is the Discord snowflake; the
    // SQLite repository expects the internal users.id, so map it.
    if (linkedTodoId) {
      const internalId = await resolveSqliteUserId(userId as string);
      const task = internalId
        ? await getProductivityRepository().getTask(internalId, linkedTodoId.toString())
        : null;
      if (!task || task.completed) {
        return NextResponse.json({ error: 'That task was not found.' }, { status: 400 });
      }
    }

    const db = getDb(false);

    // Synchronous transaction on the shared connection: never hold a SQLite
    // transaction open across an await.
    const errorResult = db.transaction(() => {
        // 1. Ensure user exists
        db.prepare(`
          INSERT OR IGNORE INTO users (discord_id, water, total_focus_minutes, xp, level, streak, created_at)
          VALUES (?, 0, 0, 0, 1, 0, datetime('now'))
        `).run(userId);

        // 2. Check if user is already in a session to fail fast
        if (type !== 'stop') {
          const activeSoloSession = db.prepare('SELECT id FROM study_sessions WHERE user_id = ? AND completed = 0').get(userId);
          const activeTeamSession = db.prepare(`
            SELECT ts.id
            FROM team_sessions ts
            JOIN team_members tm ON ts.id = tm.session_id
            WHERE tm.user_id = ? AND ts.status IN ('waiting', 'active', 'break')
          `).get(userId);

          if (activeSoloSession || activeTeamSession) {
            return NextResponse.json({ error: 'You are already in an active study session! Finish it first.' }, { status: 400 });
          }
        }

        // 3. Insert the command for the Discord Bot to pick up
        const commandExtraData = type === 'study'
          ? JSON.stringify({ todoId: linkedTodoId, subject: normalizedSubject })
          : extra_data;
        db.prepare('INSERT INTO activity_commands (user_id, channel_id, minutes, status, type, extra_data, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))')
          .run(userId, channelId, minutes, 'pending', type, commandExtraData);

        return null;
    })();

    if (errorResult) return errorResult;
    return NextResponse.json({ success: true, message: 'Timer starting in Discord channel...' });
  } catch (error: any) {
    console.error('Timer Command Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
