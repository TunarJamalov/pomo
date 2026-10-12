import { TransactionContext } from '../transaction/transaction-manager';
export interface UserPet {
    id: string | number;
    user_id: string;
    pet_key: string;
    level: number;
    xp: number;
    evolved: number;
    is_active: number;
    found_at: string;
}
export interface PetRepository {
    getOwnedPets(userId: string, ctx?: TransactionContext): Promise<UserPet[]>;
    getPet(userId: string, petKey: string, ctx?: TransactionContext): Promise<UserPet | null>;
    getActivePet(userId: string, ctx?: TransactionContext): Promise<UserPet | null>;
    equipPet(userId: string, petKey: string, ctx?: TransactionContext): Promise<boolean>;
    awardPetXP(userId: string, addedXP: number, ctx?: TransactionContext): Promise<{
        pet: UserPet;
        leveledUp: boolean;
        effectiveXP: number;
    } | null>;
    evolvePet(userId: string, petKey: string, ctx?: TransactionContext): Promise<boolean>;
    addPet(userId: string, petKey: string, isActive: boolean, ctx?: TransactionContext): Promise<void>;
}
