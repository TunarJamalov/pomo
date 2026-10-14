"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteProductivityRepository = void 0;
class SqliteProductivityRepository {
    db;
    identityRepo;
    constructor(db, identityRepo) {
        this.db = db;
        this.identityRepo = identityRepo;
    }
    // Callers pass the internal users.id, but the legacy todos table is keyed by Discord id
    // (user_id references users.discord_id, and the bot reads it that way).
    discordId(userId, ctx) {
        return this.identityRepo.getIdentity(userId, 'discord', ctx);
    }
    mapRowToTask(row) {
        return {
            id: String(row.id),
            content: row.content,
            completed: Boolean(row.completed),
            focus_minutes: Number(row.focus_minutes || 0),
            created_at: row.created_at,
            completed_at: row.completed_at
        };
    }
    async createTask(userId, content, options, ctx) {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId)
            return { success: false, reason: 'user' };
        const activeCount = db.prepare('SELECT COUNT(*) as cnt FROM todos WHERE user_id = ? AND completed = 0').get(providerId).cnt;
        if (activeCount >= 10)
            return { success: false, reason: 'limit' };
        const result = db.prepare('INSERT INTO todos (user_id, content) VALUES (?, ?)').run(providerId, content);
        const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
        return { success: true, task: this.mapRowToTask(row) };
    }
    async completeTask(userId, taskId, ctx) {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId)
            return false;
        const result = db.prepare("UPDATE todos SET completed = 1, completed_at = datetime('now') WHERE id = ? AND user_id = ?").run(Number(taskId), providerId);
        return result.changes > 0;
    }
    async uncompleteTask(userId, taskId, ctx) {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId)
            return false;
        const result = db.prepare("UPDATE todos SET completed = 0, completed_at = NULL WHERE id = ? AND user_id = ?").run(Number(taskId), providerId);
        return result.changes > 0;
    }
    async deleteTask(userId, taskId, ctx) {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId)
            return false;
        const result = db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(Number(taskId), providerId);
        return result.changes > 0;
    }
    async listTasks(userId, activeOnly = false, ctx) {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId)
            return [];
        let rows;
        if (activeOnly) {
            rows = db.prepare('SELECT * FROM todos WHERE user_id = ? AND completed = 0 ORDER BY id ASC').all(providerId);
        }
        else {
            rows = db.prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY completed ASC, created_at DESC').all(providerId);
        }
        return rows.map((r) => this.mapRowToTask(r));
    }
    async getTask(userId, taskId, ctx) {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId)
            return null;
        const row = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(Number(taskId), providerId);
        return row ? this.mapRowToTask(row) : null;
    }
    async addFocusMinutesToTask(userId, taskId, minutes, ctx) {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId)
            return false;
        const result = db.prepare(`
            UPDATE todos
            SET focus_minutes = COALESCE(focus_minutes, 0) + ?
            WHERE id = ? AND user_id = ?
        `).run(minutes, Number(taskId), providerId);
        return result.changes > 0;
    }
}
exports.SqliteProductivityRepository = SqliteProductivityRepository;
