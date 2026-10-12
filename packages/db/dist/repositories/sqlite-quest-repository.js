"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteQuestRepository = void 0;
class SqliteQuestRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async claimQuest(userId, questKey, questDate, ctx) {
        const result = (ctx?.db || this.db).prepare(`
            INSERT OR IGNORE INTO quest_claims (user_id, quest_key, quest_date)
            VALUES (?, ?, ?)
        `).run(userId, questKey, questDate);
        return result.changes > 0;
    }
    async markQuestNotified(userId, questKey, questDate, ctx) {
        const result = (ctx?.db || this.db).prepare(`
            INSERT OR IGNORE INTO quest_notifications (user_id, quest_key, quest_date)
            VALUES (?, ?, ?)
        `).run(userId, questKey, questDate);
        return result.changes > 0;
    }
}
exports.SqliteQuestRepository = SqliteQuestRepository;
