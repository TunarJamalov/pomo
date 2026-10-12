"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresQuestRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const misc_1 = require("../schema/misc");
const events_1 = require("../schema/events");
class PostgresQuestRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async claimQuest(userId, questKey, questDate, ctx) {
        const dbClient = ctx?.db || this.db;
        // Check if already claimed (ON CONFLICT DO NOTHING equivalent)
        const existing = await dbClient.select({ id: misc_1.quest_claims.id })
            .from(misc_1.quest_claims)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(misc_1.quest_claims.user_id, userId), (0, drizzle_orm_1.eq)(misc_1.quest_claims.quest_key, questKey), (0, drizzle_orm_1.eq)(misc_1.quest_claims.quest_date, questDate)))
            .limit(1);
        if (existing.length > 0)
            return false;
        await dbClient.insert(misc_1.quest_claims).values({
            user_id: userId,
            quest_key: questKey,
            quest_date: questDate
        });
        return true;
    }
    async markQuestNotified(userId, questKey, questDate, ctx) {
        const dbClient = ctx?.db || this.db;
        const existing = await dbClient.select({ id: events_1.quest_notifications.id })
            .from(events_1.quest_notifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(events_1.quest_notifications.user_id, userId), (0, drizzle_orm_1.eq)(events_1.quest_notifications.quest_key, questKey), (0, drizzle_orm_1.eq)(events_1.quest_notifications.quest_date, questDate)))
            .limit(1);
        if (existing.length > 0)
            return false;
        await dbClient.insert(events_1.quest_notifications).values({
            user_id: userId,
            quest_key: questKey,
            quest_date: questDate
        });
        return true;
    }
}
exports.PostgresQuestRepository = PostgresQuestRepository;
