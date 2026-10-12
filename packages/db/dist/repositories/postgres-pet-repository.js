"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresPetRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const gamification_1 = require("../schema/gamification");
class PostgresPetRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    mapPet(row) {
        return {
            id: String(row.id),
            user_id: row.user_id,
            pet_key: row.pet_key,
            level: row.level || 1,
            xp: row.xp || 0,
            evolved: row.evolved ? 1 : 0,
            is_active: row.is_active ? 1 : 0,
            found_at: row.found_at || row.created_at || new Date().toISOString()
        };
    }
    async getOwnedPets(userId, ctx) {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(gamification_1.user_pets).where((0, drizzle_orm_1.eq)(gamification_1.user_pets.user_id, userId));
        return rows.map((r) => this.mapPet(r));
    }
    async getPet(userId, petKey, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select()
            .from(gamification_1.user_pets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(gamification_1.user_pets.user_id, userId), (0, drizzle_orm_1.eq)(gamification_1.user_pets.pet_key, petKey)))
            .limit(1);
        return result.length > 0 ? this.mapPet(result[0]) : null;
    }
    async getActivePet(userId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select()
            .from(gamification_1.user_pets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(gamification_1.user_pets.user_id, userId), (0, drizzle_orm_1.eq)(gamification_1.user_pets.is_active, true)))
            .limit(1);
        return result.length > 0 ? this.mapPet(result[0]) : null;
    }
    async equipPet(userId, petKey, ctx) {
        const dbClient = ctx?.db || this.db;
        // Unequip all pets for this user
        await dbClient.update(gamification_1.user_pets)
            .set({ is_active: false })
            .where((0, drizzle_orm_1.eq)(gamification_1.user_pets.user_id, userId));
        // Equip the target pet
        const result = await dbClient.update(gamification_1.user_pets)
            .set({ is_active: true })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(gamification_1.user_pets.user_id, userId), (0, drizzle_orm_1.eq)(gamification_1.user_pets.pet_key, petKey)))
            .returning({ id: gamification_1.user_pets.id });
        return result.length > 0;
    }
    async awardPetXP(userId, addedXP, ctx) {
        const pet = await this.getActivePet(userId, ctx);
        if (!pet)
            return null;
        const dbClient = ctx?.db || this.db;
        const effectiveXP = pet.evolved === 1 ? Math.round(addedXP * 1.5) : addedXP;
        // Add XP
        await dbClient.update(gamification_1.user_pets)
            .set({ xp: (0, drizzle_orm_1.sql) `${gamification_1.user_pets.xp} + ${effectiveXP}` })
            .where((0, drizzle_orm_1.eq)(gamification_1.user_pets.id, String(pet.id)));
        // Fetch updated pet
        const updatedRow = await dbClient.select().from(gamification_1.user_pets).where((0, drizzle_orm_1.eq)(gamification_1.user_pets.id, String(pet.id))).limit(1);
        const updatedPet = { ...updatedRow[0] };
        let currentLevel = updatedPet.level;
        let currentXP = updatedPet.xp;
        let levelUp = false;
        while (currentXP >= currentLevel * 50 && currentLevel < 10) {
            currentXP -= currentLevel * 50;
            currentLevel++;
            levelUp = true;
        }
        if (levelUp) {
            await dbClient.update(gamification_1.user_pets)
                .set({ level: currentLevel, xp: currentXP })
                .where((0, drizzle_orm_1.eq)(gamification_1.user_pets.id, String(pet.id)));
            updatedPet.level = currentLevel;
            updatedPet.xp = currentXP;
        }
        return { pet: this.mapPet({ ...updatedPet, user_id: userId }), leveledUp: levelUp, effectiveXP };
    }
    async addPet(userId, petKey, isActive, ctx) {
        const dbClient = ctx?.db || this.db;
        await dbClient.insert(gamification_1.user_pets)
            .values({
            user_id: userId,
            pet_key: petKey,
            level: 1,
            xp: 0,
            is_active: isActive,
            evolved: false
        })
            .onConflictDoNothing();
    }
    async evolvePet(userId, petKey, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(gamification_1.user_pets)
            .set({ level: 1, xp: 0, evolved: true })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(gamification_1.user_pets.user_id, userId), (0, drizzle_orm_1.eq)(gamification_1.user_pets.pet_key, petKey), (0, drizzle_orm_1.eq)(gamification_1.user_pets.evolved, false)))
            .returning({ id: gamification_1.user_pets.id });
        return result.length > 0;
    }
}
exports.PostgresPetRepository = PostgresPetRepository;
