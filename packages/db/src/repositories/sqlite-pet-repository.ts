import { PetRepository, UserPet } from './pet-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';

export class SqlitePetRepository implements PetRepository {
    constructor(private db: any, private identityRepo: IdentityRepository) {}

    async getOwnedPets(userId: string, ctx?: TransactionContext): Promise<UserPet[]> {
        // Legacy sqlite tables key pet rows by discord id directly.
        const rows = (ctx?.db || this.db).prepare('SELECT * FROM user_pets WHERE user_id = ?').all(userId);
        return rows.map((r: any) => ({ ...r, user_id: userId }));
    }

    async getPet(userId: string, petKey: string, ctx?: TransactionContext): Promise<UserPet | null> {
        // Legacy sqlite tables key pet rows by discord id directly.
        const row = (ctx?.db || this.db).prepare('SELECT * FROM user_pets WHERE user_id = ? AND pet_key = ?').get(userId, petKey);
        return row ? { ...row, user_id: userId } : null;
    }

    async getActivePet(userId: string, ctx?: TransactionContext): Promise<UserPet | null> {
        // Legacy sqlite tables key pet rows by discord id directly.
        const row = (ctx?.db || this.db).prepare('SELECT * FROM user_pets WHERE user_id = ? AND is_active = 1').get(userId);
        return row ? { ...row, user_id: userId } : null;
    }

    async equipPet(userId: string, petKey: string, ctx?: TransactionContext): Promise<boolean> {
        // Legacy sqlite tables key pet rows by discord id directly.
        (ctx?.db || this.db).prepare('UPDATE user_pets SET is_active = 0 WHERE user_id = ?').run(userId);
        const info = (ctx?.db || this.db).prepare('UPDATE user_pets SET is_active = 1 WHERE user_id = ? AND pet_key = ?').run(userId, petKey);
        return info.changes > 0;
    }

    async awardPetXP(userId: string, addedXP: number, ctx?: TransactionContext): Promise<{ pet: UserPet; leveledUp: boolean; effectiveXP: number } | null> {
        const pet = await this.getActivePet(userId, ctx);
        if (!pet) return null;

        const effectiveXP = pet.evolved === 1 ? Math.round(addedXP * 1.5) : addedXP;
        (ctx?.db || this.db).prepare('UPDATE user_pets SET xp = xp + ? WHERE id = ?').run(effectiveXP, pet.id);
        
        const updatedPet = (ctx?.db || this.db).prepare('SELECT * FROM user_pets WHERE id = ?').get(pet.id);
        let currentLevel = updatedPet.level;
        let nextLevelXP = currentLevel * 50;

        let levelUp = false;
        while (updatedPet.xp >= nextLevelXP && currentLevel < 10) {
            updatedPet.xp -= nextLevelXP;
            currentLevel++;
            levelUp = true;
            nextLevelXP = currentLevel * 50;
        }

        if (levelUp || updatedPet.xp < 0) {
            (ctx?.db || this.db).prepare('UPDATE user_pets SET level = ?, xp = ? WHERE id = ?').run(currentLevel, updatedPet.xp, pet.id);
            updatedPet.level = currentLevel;
        }

        return { pet: { ...updatedPet, user_id: userId } as UserPet, leveledUp: levelUp, effectiveXP };
    }

    async addPet(userId: string, petKey: string, isActive: boolean, ctx?: TransactionContext): Promise<void> {
        // Legacy sqlite tables key pet rows by discord id directly.
        (ctx?.db || this.db).prepare('INSERT INTO user_pets (user_id, pet_key, level, xp, is_active) VALUES (?, ?, 1, 0, ?)').run(userId, petKey, isActive ? 1 : 0);
    }

    async evolvePet(userId: string, petKey: string, ctx?: TransactionContext): Promise<boolean> {
        // Legacy sqlite tables key pet rows by discord id directly.
        const info = (ctx?.db || this.db).prepare('UPDATE user_pets SET level = 1, xp = 0, evolved = 1 WHERE user_id = ? AND pet_key = ? AND evolved = 0').run(userId, petKey);
        return info.changes > 0;
    }
}
