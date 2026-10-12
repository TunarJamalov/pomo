import { NextResponse } from 'next/server';
import { getActivityClaims } from '@/lib/activityAuth';
import { getDb, getProductivityRepository, resolveSqliteUserId } from '@/lib/db';

function authorize(req: Request, userId: string | null) {
  const claims = getActivityClaims(req);
  return Boolean(userId && claims && claims.sub === userId);
}

function normalizeTaskId(value: unknown): string | null {
  const raw = String(value ?? '');
  return /^\d{1,12}$/.test(raw) ? raw : null;
}

// `userId` in the request is the Discord snowflake (activity token `sub`).
// SqliteProductivityRepository expects the internal SQLite users.id, so the
// snowflake is always mapped first via resolveSqliteUserId().

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!authorize(req, userId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const internalId = await resolveSqliteUserId(userId as string);
    const tasks = internalId ? await getProductivityRepository().listTasks(internalId, true) : [];

    const db = getDb(true);
    const today = db.prepare(`
      SELECT COALESCE(SUM(duration), 0) AS minutes
      FROM study_sessions
      WHERE user_id = ?
        AND completed = 1
        AND title != '__break__'
        AND date(started_at) = date('now')
    `).get(userId) as any;

    return NextResponse.json({
      todos: tasks.map((t: any) => ({
        ...t,
        completed: t.completed ? 1 : 0,
      })),
      today_focus_minutes: Number(today?.minutes || 0),
    });
  } catch (error) {
    console.error('Activity Todos GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId, content } = await req.json();
    if (!authorize(req, userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const task = String(content || '').trim().slice(0, 120);
    if (!task) {
      return NextResponse.json({ error: 'Task cannot be empty.' }, { status: 400 });
    }

    // Creates the parent users row if missing (same as the bot does).
    const internalId = await resolveSqliteUserId(userId, true);
    if (!internalId) {
      return NextResponse.json({ error: 'Failed to create task.' }, { status: 400 });
    }

    const result = await getProductivityRepository().createTask(internalId, task);
    if (!result.success) {
      return NextResponse.json({ error: result.reason === 'limit' ? 'You can keep up to 10 active tasks.' : 'Failed to create task.' }, { status: 400 });
    }

    return NextResponse.json({
      todo: {
        ...result.task,
        completed: result.task!.completed ? 1 : 0,
      },
    });
  } catch (error) {
    console.error('Activity Todos POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId, todoId, completed = true } = await req.json();
    if (!authorize(req, userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const taskId = normalizeTaskId(todoId);
    if (!taskId) {
      return NextResponse.json({ error: 'Invalid task.' }, { status: 400 });
    }

    const internalId = await resolveSqliteUserId(userId);
    if (!internalId) {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    }

    const prodRepo = getProductivityRepository();
    const ok = completed
      ? await prodRepo.completeTask(internalId, taskId)
      : await prodRepo.uncompleteTask(internalId, taskId);
    return NextResponse.json({ success: ok });
  } catch (error) {
    console.error('Activity Todos PATCH Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId, todoId } = await req.json();
    if (!authorize(req, userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const taskId = normalizeTaskId(todoId);
    if (!taskId) {
      return NextResponse.json({ error: 'Invalid task.' }, { status: 400 });
    }

    const internalId = await resolveSqliteUserId(userId);
    if (!internalId) {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    }

    const ok = await getProductivityRepository().deleteTask(internalId, taskId);
    return NextResponse.json({ success: ok });
  } catch (error) {
    console.error('Activity Todos DELETE Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
