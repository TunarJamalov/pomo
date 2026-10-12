import { PetRepository, UserPet } from './pet-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { eq, and, sql } from 'drizzle-orm';
import { user_pets } from '../schema/gamification';

export class PostgresPetRepository implements PetRepository {
    constructor(private db: any) {}

    private mapPet(row: any): UserPet {
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

    async getOwnedPets(userId: string, ctx?: TransactionContext): Promise<UserPet[]> {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(user_pets).where(eq(user_pets.user_id, userId));
        return rows.map((r: any) => this.mapPet(r));
    }

    async getPet(userId: string, petKey: string, ctx?: TransactionContext): Promise<UserPet | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select()
            .from(user_pets)
            .where(and(eq(user_pets.user_id, userId), eq(user_pets.pet_key, petKey)))
            .limit(1);
        return result.length > 0 ? this.mapPet(result[0]) : null;
    }

    async getActivePet(userId: string, ctx?: TransactionContext): Promise<UserPet | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select()
            .from(user_pets)
            .where(and(eq(user_pets.user_id, userId), eq(user_pets.is_active, true)))
            .limit(1);
        return result.length > 0 ? this.mapPet(result[0]) : null;
    }

    async equipPet(userId: string, petKey: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        // Unequip all pets for this user
        await dbClient.update(user_pets)
            .set({ is_active: false })
            .where(eq(user_pets.user_id, userId));
        // Equip the target pet
        const result = await dbClient.update(user_pets)
            .set({ is_active: true })
            .where(and(eq(user_pets.user_id, userId), eq(user_pets.pet_key, petKey)))
            .returning({ id: user_pets.id });
        return result.length > 0;
    }

    async awardPetXP(userId: string, addedXP: number, ctx?: TransactionContext): Promise<{ pet: UserPet; leveledUp: boolean; effectiveXP: number } | null> {
        const pet = await this.getActivePet(userId, ctx);
        if (!pet) return null;

        const dbClient = ctx?.db || this.db;
        const effectiveXP = pet.evolved === 1 ? Math.round(addedXP * 1.5) : addedXP;

        // Add XP
        await dbClient.update(user_pets)
            .set({ xp: sql`${user_pets.xp} + ${effectiveXP}` })
            .where(eq(user_pets.id, String(pet.id)));

        // Fetch updated pet
        const updatedRow = await dbClient.select().from(user_pets).where(eq(user_pets.id, String(pet.id))).limit(1);
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
            await dbClient.update(user_pets)
                .set({ level: currentLevel, xp: currentXP })
                .where(eq(user_pets.id, String(pet.id)));
            updatedPet.level = currentLevel;
            updatedPet.xp = currentXP;
        }

        return { pet: this.mapPet({ ...updatedPet, user_id: userId }), leveledUp: levelUp, effectiveXP };
    }

    async addPet(userId: string, petKey: string, isActive: boolean, ctx?: TransactionContext): Promise<void> {
        const dbClient = ctx?.db || this.db;
        await dbClient.insert(user_pets)
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

    async evolvePet(userId: string, petKey: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(user_pets)
            .set({ level: 1, xp: 0, evolved: true })
            .where(and(
                eq(user_pets.user_id, userId),
                eq(user_pets.pet_key, petKey),
                eq(user_pets.evolved, false)
            ))
            .returning({ id: user_pets.id });
        return result.length > 0;
    }
}
