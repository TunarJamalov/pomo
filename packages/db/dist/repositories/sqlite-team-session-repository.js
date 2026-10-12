"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteTeamSessionRepository = void 0;
class SqliteTeamSessionRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    mapRow(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            hostId: row.host_id,
            messageId: row.message_id,
            duration: row.duration,
            startedAt: row.started_at,
            endsAt: row.ends_at,
            status: row.status,
            paused: row.paused === 1,
            pausedAt: row.paused_at,
            pausedTotalSeconds: row.paused_total_seconds,
            pauseCount: row.pause_count,
            pomodoroData: row.pomodoro_data ? JSON.parse(row.pomodoro_data) : null,
        };
    }
    createSession(ctx, data) {
        const info = ctx.db.prepare(`
      INSERT INTO team_sessions (guild_id, channel_id, host_id, duration, started_at, status)
      VALUES (?, ?, ?, ?, datetime('now'), 'waiting')
    `).run(data.guildId, data.channelId, data.hostId, data.duration);
        return this.getSessionById(ctx, Number(info.lastInsertRowid));
    }
    getSessionById(ctx, sessionId) {
        const row = ctx.db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
        return row ? this.mapRow(row) : null;
    }
    getActiveOrWaitingSessionByHost(ctx, hostId) {
        const row = ctx.db.prepare("SELECT * FROM team_sessions WHERE host_id = ? AND status IN ('waiting', 'active', 'break')").get(hostId);
        return row ? this.mapRow(row) : null;
    }
    getActiveOrWaitingSessionByUserId(ctx, userId) {
        const row = ctx.db.prepare(`
      SELECT ts.*
      FROM team_sessions ts
      JOIN team_members tm ON ts.id = tm.session_id
      WHERE tm.user_id = ? AND ts.status IN ('waiting', 'active', 'break')
    `).get(userId);
        return row ? this.mapRow(row) : null;
    }
    getMembers(ctx, sessionId) {
        const rows = ctx.db.prepare('SELECT * FROM team_members WHERE session_id = ?').all(sessionId);
        return rows.map((r) => ({ sessionId: r.session_id, userId: r.user_id }));
    }
    addMember(ctx, sessionId, userId) {
        const info = ctx.db.prepare('INSERT OR IGNORE INTO team_members (session_id, user_id) VALUES (?, ?)').run(sessionId, userId);
        return info.changes > 0;
    }
    removeMember(ctx, sessionId, userId) {
        const info = ctx.db.prepare('DELETE FROM team_members WHERE session_id = ? AND user_id = ?').run(sessionId, userId);
        return info.changes > 0;
    }
    startSession(ctx, sessionId) {
        const info = ctx.db.prepare(`
      UPDATE team_sessions 
      SET status = 'active', 
          started_at = datetime('now'), 
          ends_at = datetime('now', '+' || duration || ' minutes'),
          paused = 0,
          paused_at = NULL
      WHERE id = ? AND status = 'waiting'
    `).run(sessionId);
        return info.changes > 0;
    }
    updateSessionStatus(ctx, sessionId, status) {
        const info = ctx.db.prepare('UPDATE team_sessions SET status = ? WHERE id = ?').run(status, sessionId);
        return info.changes > 0;
    }
    completeSession(ctx, sessionId) {
        const info = ctx.db.prepare("UPDATE team_sessions SET status = 'completed' WHERE id = ? AND status != 'completed'").run(sessionId);
        return info.changes > 0;
    }
    cancelSession(ctx, sessionId) {
        const info = ctx.db.prepare("UPDATE team_sessions SET status = 'cancelled' WHERE id = ? AND status != 'cancelled'").run(sessionId);
        return info.changes > 0;
    }
    updateMessageId(ctx, sessionId, messageId) {
        const info = ctx.db.prepare('UPDATE team_sessions SET message_id = ? WHERE id = ?').run(messageId, sessionId);
        return info.changes > 0;
    }
    updateDurationAndEndsAt(ctx, sessionId, duration, endsAt) {
        const info = ctx.db.prepare('UPDATE team_sessions SET duration = ?, ends_at = ? WHERE id = ?').run(duration, endsAt, sessionId);
        return info.changes > 0;
    }
    updatePomodoroData(ctx, sessionId, data) {
        const info = ctx.db.prepare('UPDATE team_sessions SET pomodoro_data = ? WHERE id = ?').run(JSON.stringify(data), sessionId);
        return info.changes > 0;
    }
    getActiveSessions(ctx) {
        const rows = ctx.db.prepare("SELECT * FROM team_sessions WHERE status IN ('waiting', 'active', 'break')").all();
        return rows.map((r) => this.mapRow(r));
    }
}
exports.SqliteTeamSessionRepository = SqliteTeamSessionRepository;
