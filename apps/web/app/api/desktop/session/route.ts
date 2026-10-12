import { NextResponse } from 'next/server';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getActivityClaims } from '@/lib/activityAuth';
import { ensureSqliteSchema } from '@/lib/sqlite';
import { rateLimit } from '@/lib/rateLimit';

const ALLOWED_SUBJECTS = new Set(['general', 'math', 'language', 'coding', 'reading', 'exam']);
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

// Anti-farming limits for desktop-submitted sessions.
/** Max rewarded desktop minutes per user per UTC day (mirrors the bot's default voice daily cap). */
const DESKTOP_DAILY_REWARD_CAP_MINUTES = 240;
/** Sessions must have started within this window. */
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000;
/** Tolerated client clock skew. */
const CLOCK_SKEW_MS = 2 * 60 * 1000;
/** Overlaps shorter than this (rounding / back-to-back sessions) are tolerated. */
const OVERLAP_TOLERANCE_SECONDS = 60;
const MIN_MINUTES = 5;
const MAX_MINUTES = 100;

class SubmissionRejected extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function getDb() {
  // Additive, idempotent DDL only; runs once per process.
  return ensureSqliteSchema('desktop_session', `
    CREATE TABLE IF NOT EXISTS desktop_session_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      client_session_id TEXT NOT NULL,
      study_session_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, client_session_id)
    );

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

    CREATE TABLE IF NOT EXISTS runtime_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

export async function GET(request: Request) {
  const claims = getActivityClaims(request);
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
  }

  const db = getDb();
  const user = db.prepare(`
    SELECT discord_id, water, xp, level, streak, total_focus_minutes, total_sessions
    FROM users
    WHERE discord_id = ?
  `).get(claims.sub) as any;

  return NextResponse.json({
    user: user || {
      discord_id: claims.sub,
      water: 0,
      xp: 0,
      level: 1,
      streak: 0,
      total_focus_minutes: 0,
      total_sessions: 0,
    },
    profile: {
      username: claims.username,
      avatar: claims.avatar,
    },
  }, { headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const claims = getActivityClaims(request);
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
  }

  // Simple per-user rate limit (retries of several failed sessions still fit).
  if (!rateLimit(`desktop-session:${claims.sub}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many sync requests. Please wait a minute and retry.' }, { status: 429, headers: CORS_HEADERS });
  }

  try {
    const body = await request.json();
    const minutes = Number(body.minutes);
    const title = normalizeTitle(body.title);
    const subject = ALLOWED_SUBJECTS.has(String(body.subject)) ? String(body.subject) : 'general';
    const clientSessionId = normalizeClientSessionId(body.clientSessionId);

    if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
      return NextResponse.json({ error: 'Minutes must be between 5 and 100.' }, { status: 400, headers: CORS_HEADERS });
    }

    if (!clientSessionId) {
      return NextResponse.json({ error: 'Missing client session id.' }, { status: 400, headers: CORS_HEADERS });
    }

    const db = getDb();
    const result = db.transaction(() => {
      // Idempotency first: an already-synced session always answers "duplicate",
      // even if it is now older than the acceptance window.
      const existing = db.prepare(`
        SELECT study_session_id
        FROM desktop_session_submissions
        WHERE user_id = ? AND client_session_id = ?
      `).get(claims.sub, clientSessionId) as any;

      if (existing?.study_session_id) {
        const user = getUser(db, claims.sub) || defaultUser(claims.sub);
        return { duplicate: true, sessionId: existing.study_session_id, user };
      }

      const nowMs = Date.now();
      const startedAtMs = resolveStartedAtMs(body.startedAt, minutes, nowMs);
      const endMs = startedAtMs + minutes * 60_000;
      if (startedAtMs > nowMs + CLOCK_SKEW_MS) {
        throw new SubmissionRejected('Session start time is in the future.', 400);
      }
      if (endMs > nowMs + CLOCK_SKEW_MS) {
        throw new SubmissionRejected('Session has not finished yet.', 400);
      }
      if (nowMs - startedAtMs > MAX_SESSION_AGE_MS) {
        throw new SubmissionRejected('Session is too old to sync (older than 24 hours).', 400);
      }

      const startedAt = toSqliteDateTime(startedAtMs);
      const endsAt = toSqliteDateTime(endMs);

      // Reject overlap with any recorded focus session for this user
      // (desktop, Discord timer, web timer, active or completed). Breaks are ignored.
      const overlapping = db.prepare(`
        SELECT id
        FROM study_sessions
        WHERE user_id = ?
          AND COALESCE(title, '') != '__break__'
          AND datetime(started_at) < datetime(?, '-' || ? || ' seconds')
          AND datetime(COALESCE(ends_at, datetime(started_at, '+' || duration || ' minutes'))) > datetime(?, '+' || ? || ' seconds')
        LIMIT 1
      `).get(claims.sub, endsAt, OVERLAP_TOLERANCE_SECONDS, startedAt, OVERLAP_TOLERANCE_SECONDS) as any;
      if (overlapping) {
        throw new SubmissionRejected('This session overlaps another recorded focus session.', 409);
      }

      // Daily (UTC) cap on rewarded desktop minutes.
      const today = db.prepare(`
        SELECT COALESCE(SUM(minutes), 0) AS minutes
        FROM activity_rewards
        WHERE user_id = ? AND source_type = 'desktop' AND date(created_at) = date('now')
      `).get(claims.sub) as { minutes: number };
      const remaining = Math.max(0, DESKTOP_DAILY_REWARD_CAP_MINUTES - Number(today?.minutes || 0));
      const rewardedMinutes = Math.min(minutes, remaining);
      if (rewardedMinutes < MIN_MINUTES) {
        throw new SubmissionRejected(`Daily desktop focus limit reached (${DESKTOP_DAILY_REWARD_CAP_MINUTES} min per day, UTC). Try again tomorrow.`, 429);
      }

      db.prepare(`
        INSERT OR IGNORE INTO users (discord_id, water, total_focus_minutes, xp, level, streak, created_at)
        VALUES (?, 0, 0, 0, 1, 0, datetime('now'))
      `).run(claims.sub);

      // Duration = credited minutes; ends_at keeps the real interval for overlap checks.
      const studyInfo = db.prepare(`
        INSERT INTO study_sessions (
          user_id, guild_id, channel_id, message_id, duration, title, started_at, ends_at, completed, subject
        ) VALUES (?, NULL, 'desktop', NULL, ?, ?, ?, ?, 1, ?)
      `).run(claims.sub, rewardedMinutes, title, startedAt, endsAt, subject);

      const sessionId = Number(studyInfo.lastInsertRowid);
      db.prepare(`
        INSERT INTO desktop_session_submissions (user_id, client_session_id, study_session_id)
        VALUES (?, ?, ?)
      `).run(claims.sub, clientSessionId, sessionId);

      const user = getUser(db, claims.sub);
      const water = waterForMinutes(rewardedMinutes);
      const xp = xpForMinutes(rewardedMinutes);
      const streak = calculateNextStreak(db, user.last_study_date, Number(user.streak || 0));
      const level = calculateLevel(Number(user.xp || 0) + xp, Number(user.level || 1));
      const leveledUp = level > Number(user.level || 1);
      const todayDate = new Date().toISOString().slice(0, 10);

      db.prepare(`
        UPDATE users
        SET water = water + ?,
            xp = xp + ?,
            total_focus_minutes = total_focus_minutes + ?,
            total_sessions = total_sessions + 1,
            streak = ?,
            level = ?,
            last_study_date = ?
        WHERE discord_id = ?
      `).run(water, xp, rewardedMinutes, streak, level, todayDate, claims.sub);

      db.prepare(`
        INSERT INTO activity_rewards (
          user_id, source_type, source_id, title, minutes, water, xp, streak, level, leveled_up, created_at
        ) VALUES (?, 'desktop', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(claims.sub, sessionId, title, rewardedMinutes, water, xp, streak, level, leveledUp ? 1 : 0);

      return {
        duplicate: false,
        sessionId,
        reward: { title, minutes: rewardedMinutes, water, xp, streak, level, leveledUp },
        capped: rewardedMinutes < minutes,
        user: getUser(db, claims.sub),
      };
    })();

    return NextResponse.json({
      success: true,
      ...result,
      profile: {
        username: claims.username,
        avatar: claims.avatar,
      },
    }, { headers: CORS_HEADERS });
  } catch (error) {
    if (error instanceof SubmissionRejected) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: CORS_HEADERS });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400, headers: CORS_HEADERS });
    }
    console.error('Desktop session sync error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: CORS_HEADERS });
  }
}

function normalizeTitle(value: unknown) {
  const title = typeof value === 'string' ? value.trim() : '';
  return title.slice(0, 80) || 'Desktop Focus';
}

function normalizeClientSessionId(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw.length > 120) return null;
  return raw.replace(/[^a-zA-Z0-9:_-]/g, '');
}

/**
 * Parse the client's startedAt. Older clients may omit it: then assume the
 * session just finished (now - minutes).
 */
function resolveStartedAtMs(value: unknown, minutes: number, nowMs: number) {
  if (typeof value === 'string' || typeof value === 'number') {
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return nowMs - minutes * 60_000;
}

function toSqliteDateTime(ms: number) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function defaultUser(discordId: string) {
  return {
    discord_id: discordId,
    water: 0,
    xp: 0,
    level: 1,
    streak: 0,
    total_focus_minutes: 0,
    total_sessions: 0,
    last_study_date: null,
  };
}

function getUser(db: BetterSqliteDatabase, userId: string) {
  return db.prepare(`
    SELECT discord_id, water, xp, level, streak, total_focus_minutes, total_sessions, last_study_date
    FROM users
    WHERE discord_id = ?
  `).get(userId) as any;
}

function waterForMinutes(minutes: number) {
  return Math.floor(minutes / 25);
}

function xpForMinutes(minutes: number) {
  return Math.floor(minutes / 25) * 10;
}

function xpForLevel(level: number) {
  return 5 * level * level + 50 * level + 100;
}

function calculateLevel(xp: number, currentLevel: number) {
  let nextLevel = currentLevel;
  while (xp >= xpForLevel(nextLevel)) {
    nextLevel += 1;
  }
  return nextLevel;
}

function calculateNextStreak(db: BetterSqliteDatabase, lastStudyDate: string | null | undefined, currentStreak: number) {
  if (!lastStudyDate) return 1;
  const msPerDay = 86400000;
  const todayDay = Math.floor(Date.now() / msPerDay);
  const lastDay = Math.floor(new Date(lastStudyDate).getTime() / msPerDay);
  if (lastDay === todayDay) {
    return currentStreak;
  }
  if (lastDay === todayDay - 1) {
    return currentStreak + 1;
  }
  if (isDowntimeGraceGap(db, todayDay - lastDay)) {
    return currentStreak + 1;
  }
  return 1;
}

function isDowntimeGraceGap(db: BetterSqliteDatabase, gapDays: number) {
  if (!Number.isFinite(gapDays) || gapDays <= 1) return false;

  const graceUntilRow = db.prepare(`
    SELECT value
    FROM runtime_state
    WHERE key = 'bot_downtime_grace_until'
  `).get() as { value?: string } | undefined;
  const graceDaysRow = db.prepare(`
    SELECT value
    FROM runtime_state
    WHERE key = 'bot_downtime_grace_days'
  `).get() as { value?: string } | undefined;

  if (!graceUntilRow?.value || !graceDaysRow?.value) return false;
  const graceUntil = new Date(graceUntilRow.value);
  const graceDays = Number(graceDaysRow.value);
  if (Number.isNaN(graceUntil.getTime()) || !Number.isFinite(graceDays)) return false;
  if (Date.now() > graceUntil.getTime()) return false;

  const missedDays = Math.max(0, gapDays - 1);
  return missedDays <= graceDays;
}
