import { ProductivityRepository, Task } from './productivity-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';

export class SqliteProductivityRepository implements ProductivityRepository {
    constructor(private db: any, private identityRepo: IdentityRepository) {}

    // Callers pass the internal users.id, but the legacy todos table is keyed by Discord id
    // (user_id references users.discord_id, and the bot reads it that way).
    private discordId(userId: string, ctx?: TransactionContext): Promise<string | null> {
        return this.identityRepo.getIdentity(userId, 'discord', ctx);
    }

    private mapRowToTask(row: any): Task {
        return {
            id: String(row.id),
            content: row.content,
            completed: Boolean(row.completed),
            focus_minutes: Number(row.focus_minutes || 0),
            created_at: row.created_at,
            completed_at: row.completed_at
        };
    }

    async createTask(userId: string, content: string, options?: any, ctx?: TransactionContext): Promise<{ success: boolean; task?: Task; reason?: string }> {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId) return { success: false, reason: 'user' };

        const activeCount = db.prepare('SELECT COUNT(*) as cnt FROM todos WHERE user_id = ? AND completed = 0').get(providerId).cnt;
        if (activeCount >= 10) return { success: false, reason: 'limit' };

        const result = db.prepare('INSERT INTO todos (user_id, content) VALUES (?, ?)').run(providerId, content);
        const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
        
        return { success: true, task: this.mapRowToTask(row) };
    }

    async completeTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<boolean> {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId) return false;

        const result = db.prepare("UPDATE todos SET completed = 1, completed_at = datetime('now') WHERE id = ? AND user_id = ?").run(Number(taskId), providerId);
        return result.changes > 0;
    }

    async uncompleteTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<boolean> {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId) return false;

        const result = db.prepare("UPDATE todos SET completed = 0, completed_at = NULL WHERE id = ? AND user_id = ?").run(Number(taskId), providerId);
        return result.changes > 0;
    }

    async deleteTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<boolean> {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId) return false;

        const result = db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(Number(taskId), providerId);
        return result.changes > 0;
    }

    async listTasks(userId: string, activeOnly: boolean = false, ctx?: TransactionContext): Promise<Task[]> {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId) return [];

        let rows;
        if (activeOnly) {
            rows = db.prepare('SELECT * FROM todos WHERE user_id = ? AND completed = 0 ORDER BY id ASC').all(providerId);
        } else {
            rows = db.prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY completed ASC, created_at DESC').all(providerId);
        }

        return rows.map((r: any) => this.mapRowToTask(r));
    }

    async getTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<Task | null> {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId) return null;

        const row = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(Number(taskId), providerId);
        return row ? this.mapRowToTask(row) : null;
    }

    async addFocusMinutesToTask(userId: string, taskId: string, minutes: number, ctx?: TransactionContext): Promise<boolean> {
        const db = ctx?.db || this.db;
        const providerId = await this.discordId(userId, ctx);
        if (!providerId) return false;

        const result = db.prepare(`
            UPDATE todos
            SET focus_minutes = COALESCE(focus_minutes, 0) + ?
            WHERE id = ? AND user_id = ?
        `).run(minutes, Number(taskId), providerId);
        
        return result.changes > 0;
    }
}
