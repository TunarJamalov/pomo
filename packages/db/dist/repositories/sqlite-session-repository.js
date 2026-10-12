"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteSessionRepository = void 0;
const buddy_1 = require("../utils/buddy");
class SqliteSessionRepository {
    db;
    identityRepo;
    constructor(db, identityRepo) {
        this.db = db;
        this.identityRepo = identityRepo;
    }
    mapRow(row) {
        return {
            id: row.id,
            user_id: row.user_id,
            guild_id: row.guild_id,
            channel_id: row.channel_id,
            message_id: row.message_id,
            duration: row.duration,
            title: row.title,
            started_at: row.started_at,
            ends_at: row.ends_at,
            completed: row.completed === 1,
            reminder_sent: row.reminder_sent === 1,
            paused: row.paused === 1,
            paused_at: row.paused_at,
            paused_total_seconds: row.paused_total_seconds,
            pause_count: row.pause_count,
            todo_id: row.todo_id,
            subject: row.subject,
            pomodoro_data: row.pomodoro_data,
            goal_text: row.goal_text,
            outcome: row.outcome,
            buddy_match_key: row.buddy_match_key,
        };
    }
    async createSession(ctx, data) {
        const startedAt = data.startedAt ? data.startedAt.toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');
        let endsAt = null;
        if (data.endsAt) {
            endsAt = data.endsAt.toISOString().slice(0, 19).replace('T', ' ');
        }
        else {
            const e = new Date(new Date(startedAt + 'Z').getTime() + data.duration * 60000);
            endsAt = e.toISOString().slice(0, 19).replace('T', ' ');
        }
        // data.userId is the Discord ID (string). study_sessions.user_id stores Discord IDs directly.
        // We do NOT call getIdentity here because that function looks up by SQLite integer primary key,
        // not by Discord ID — calling it with a Discord ID would always return NOT_FOUND.
        const discordId = data.userId;
        const info = ctx.db.prepare(`
      INSERT INTO study_sessions (
        user_id, guild_id, channel_id, message_id, duration, title,
        started_at, ends_at, subject, todo_id, pomodoro_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(discordId, data.guildId || null, data.channelId || null, data.messageId || null, data.duration, data.title, startedAt, endsAt, data.subject || 'general', data.todoId || null, data.pomodoroData ? JSON.stringify(data.pomodoroData) : null);
        const sessionId = Number(info.lastInsertRowid);
        try {
            if (data.title !== '__break__') {
                const match = ctx.db.prepare("SELECT id, matched_user_id FROM buddy_requests WHERE user_id = ? AND status = 'matched' ORDER BY id DESC LIMIT 1").get(data.userId);
                if (match && match.matched_user_id) {
                    const partnerReq = ctx.db.prepare("SELECT id FROM buddy_requests WHERE user_id = ? AND matched_user_id = ? AND status = 'matched' ORDER BY id DESC LIMIT 1").get(match.matched_user_id, data.userId);
                    if (partnerReq) {
                        const key = (0, buddy_1.generateBuddyMatchKey)(match.id, partnerReq.id);
                        if (key) {
                            ctx.db.prepare('UPDATE study_sessions SET buddy_match_key = ? WHERE id = ?').run(key, sessionId);
                            ctx.db.prepare(`
                            INSERT INTO buddy_analytics_events (event_name, user_id, guild_id, request_id, match_key, scope)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `).run('buddy_study_session_started', discordId, data.guildId || null, match.id, key, key);
                        }
                    }
                }
            }
        }
        catch (err) {
            console.error('[SessionRepository] Failed to assign buddy match key:', err);
        }
        return this.getSessionById(ctx, sessionId);
    }
    getSessionById(ctx, sessionId) {
        const row = ctx.db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(sessionId);
        return row ? this.mapRow(row) : null;
    }
    async getActiveSession(ctx, userId) {
        const row = ctx.db.prepare('SELECT * FROM study_sessions WHERE user_id = ? AND completed = 0').get(userId);
        return row ? this.mapRow(row) : null;
    }
    getUncompletedSessions(ctx) {
        const rows = ctx.db.prepare('SELECT * FROM study_sessions WHERE completed = 0').all();
        return rows.map((r) => this.mapRow(r));
    }
    pauseSession(ctx, sessionId) {
        const info = ctx.db.prepare(`
      UPDATE study_sessions
      SET paused = 1,
          paused_at = datetime('now'),
          pause_count = pause_count + 1
      WHERE id = ? AND completed = 0 AND paused = 0
    `).run(sessionId);
        return info.changes > 0;
    }
    resumeSession(ctx, sessionId) {
        const session = this.getSessionById(ctx, sessionId);
        if (!session || !session.paused || !session.paused_at || !session.ends_at || !session.started_at)
            return false;
        const pausedAtMs = new Date(session.paused_at.includes('T') ? session.paused_at : session.paused_at.replace(' ', 'T') + 'Z').getTime();
        const nowMs = Date.now();
        const pausedSeconds = Math.max(0, Math.floor((nowMs - pausedAtMs) / 1000));
        const startedAtMs = new Date(session.started_at.includes('T') ? session.started_at : session.started_at.replace(' ', 'T') + 'Z').getTime();
        const shiftedStart = new Date(startedAtMs + pausedSeconds * 1000);
        const newStartedAtStr = shiftedStart.toISOString().slice(0, 19).replace('T', ' ');
        const endsAtMs = new Date(session.ends_at.includes('T') ? session.ends_at : session.ends_at.replace(' ', 'T') + 'Z').getTime();
        const shiftedEnd = new Date(endsAtMs + pausedSeconds * 1000);
        const newEndsAtStr = shiftedEnd.toISOString().slice(0, 19).replace('T', ' ');
        const info = ctx.db.prepare(`
      UPDATE study_sessions
      SET paused = 0,
          paused_at = NULL,
          started_at = ?,
          ends_at = ?,
          paused_total_seconds = COALESCE(paused_total_seconds, 0) + ?
      WHERE id = ? AND paused = 1
    `).run(newStartedAtStr, newEndsAtStr, pausedSeconds, sessionId);
        return info.changes > 0;
    }
    completeSession(ctx, sessionId) {
        const session = this.getSessionById(ctx, sessionId);
        if (!session || session.completed === true)
            return null;
        const info = ctx.db.prepare('UPDATE study_sessions SET completed = 1 WHERE id = ? AND completed = 0').run(sessionId);
        if (info.changes > 0) {
            return { ...session, completed: true };
        }
        return null;
    }
    cancelSession(ctx, sessionId) {
        const info = ctx.db.prepare('DELETE FROM study_sessions WHERE id = ? AND completed = 0').run(sessionId);
        return info.changes > 0;
    }
    updateMessageId(ctx, sessionId, messageId) {
        const info = ctx.db.prepare('UPDATE study_sessions SET message_id = ? WHERE id = ?').run(messageId, sessionId);
        return info.changes > 0;
    }
    updatePomodoroData(ctx, sessionId, data) {
        const info = ctx.db.prepare('UPDATE study_sessions SET pomodoro_data = ? WHERE id = ?').run(JSON.stringify(data), sessionId);
        return info.changes > 0;
    }
    markReminderSent(ctx, sessionId) {
        const info = ctx.db.prepare('UPDATE study_sessions SET reminder_sent = 1 WHERE id = ?').run(sessionId);
        return info.changes > 0;
    }
}
exports.SqliteSessionRepository = SqliteSessionRepository;
