"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresIdentityRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const users_1 = require("../schema/users");
class PostgresIdentityRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async resolveIdentity(provider, providerId, ctx) {
        const dbClient = ctx?.db || this.db;
        const existing = await dbClient.select({ user_id: users_1.user_identities.user_id })
            .from(users_1.user_identities)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(users_1.user_identities.provider, provider), (0, drizzle_orm_1.eq)(users_1.user_identities.provider_id, providerId)))
            .limit(1);
        if (existing.length > 0) {
            return { userId: existing[0].user_id, isNew: false };
        }
        return await dbClient.transaction(async (tx) => {
            // Check again inside transaction to prevent race conditions
            const doubleCheck = await tx.select({ user_id: users_1.user_identities.user_id })
                .from(users_1.user_identities)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(users_1.user_identities.provider, provider), (0, drizzle_orm_1.eq)(users_1.user_identities.provider_id, providerId)))
                .limit(1);
            if (doubleCheck.length > 0) {
                return { userId: doubleCheck[0].user_id, isNew: false };
            }
            const newUser = await tx.insert(users_1.users).values({}).returning({ id: users_1.users.id });
            const userId = newUser[0].id;
            await tx.insert(users_1.user_identities).values({
                user_id: userId,
                provider: provider,
                provider_id: providerId
            });
            return { userId, isNew: true };
        });
    }
    async lookupIdentity(provider, providerId, ctx) {
        const dbClient = ctx?.db || this.db;
        const existing = await dbClient.select({ user_id: users_1.user_identities.user_id })
            .from(users_1.user_identities)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(users_1.user_identities.provider, provider), (0, drizzle_orm_1.eq)(users_1.user_identities.provider_id, providerId)))
            .limit(1);
        return existing.length > 0 ? existing[0].user_id : null;
    }
    async getIdentity(userId, provider, ctx) {
        const dbClient = ctx?.db || this.db;
        const existing = await dbClient.select({ provider_id: users_1.user_identities.provider_id })
            .from(users_1.user_identities)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(users_1.user_identities.user_id, userId), (0, drizzle_orm_1.eq)(users_1.user_identities.provider, provider)))
            .limit(1);
        return existing.length > 0 ? existing[0].provider_id : null;
    }
    async linkIdentity(userId, provider, providerId, ctx) {
        const dbClient = ctx?.db || this.db;
        const existing = await dbClient.select({ user_id: users_1.user_identities.user_id })
            .from(users_1.user_identities)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(users_1.user_identities.provider, provider), (0, drizzle_orm_1.eq)(users_1.user_identities.provider_id, providerId)))
            .limit(1);
        if (existing.length > 0 && existing[0].user_id !== userId) {
            throw new Error(`Provider identity ${providerId} is already linked to another user`);
        }
        if (existing.length === 0) {
            await dbClient.insert(users_1.user_identities).values({
                user_id: userId,
                provider: provider,
                provider_id: providerId
            });
        }
    }
}
exports.PostgresIdentityRepository = PostgresIdentityRepository;
