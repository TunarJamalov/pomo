"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteIdentityRepository = void 0;
class SqliteIdentityRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async resolveIdentity(provider, providerId, ctx) {
        const dbClient = ctx?.db || this.db;
        if (provider !== 'discord') {
            throw new Error(`Provider ${provider} is not supported in SQLite legacy mode`);
        }
        const existing = dbClient.prepare('SELECT id FROM users WHERE discord_id = ?').get(providerId);
        if (existing) {
            return { userId: String(existing.id), isNew: false };
        }
        const result = dbClient.prepare('INSERT INTO users (discord_id) VALUES (?)').run(providerId);
        return { userId: String(result.lastInsertRowid), isNew: true };
    }
    async lookupIdentity(provider, providerId, ctx) {
        if (provider !== 'discord')
            return null;
        const dbClient = ctx?.db || this.db;
        const existing = dbClient.prepare('SELECT id FROM users WHERE discord_id = ?').get(providerId);
        return existing ? String(existing.id) : null;
    }
    async getIdentity(userId, provider, ctx) {
        if (provider !== 'discord')
            return null;
        const dbClient = ctx?.db || this.db;
        const user = dbClient.prepare('SELECT discord_id FROM users WHERE id = ?').get(Number(userId));
        return user ? user.discord_id : null;
    }
    async linkIdentity(userId, provider, providerId, ctx) {
        if (provider !== 'discord')
            throw new Error(`Provider ${provider} is not supported in SQLite legacy mode`);
        const dbClient = ctx?.db || this.db;
        const existing = dbClient.prepare('SELECT id FROM users WHERE discord_id = ?').get(providerId);
        if (existing && String(existing.id) !== userId) {
            throw new Error(`Provider identity ${providerId} is already linked to another user`);
        }
        dbClient.prepare('UPDATE users SET discord_id = ? WHERE id = ?').run(providerId, Number(userId));
    }
}
exports.SqliteIdentityRepository = SqliteIdentityRepository;
