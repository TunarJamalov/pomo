import { PetRepository, UserPet } from './pet-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresPetRepository implements PetRepository {
    private db;
    constructor(db: any);
    private mapPet;
    getOwnedPets(userId: string, ctx?: TransactionContext): Promise<UserPet[]>;
    getPet(userId: string, petKey: string, ctx?: TransactionContext): Promise<UserPet | null>;
    getActivePet(userId: string, ctx?: TransactionContext): Promise<UserPet | null>;
    equipPet(userId: string, petKey: string, ctx?: TransactionContext): Promise<boolean>;
    awardPetXP(userId: string, addedXP: number, ctx?: TransactionContext): Promise<{
        pet: UserPet;
        leveledUp: boolean;
        effectiveXP: number;
    } | null>;
    addPet(userId: string, petKey: string, isActive: boolean, ctx?: TransactionContext): Promise<void>;
    evolvePet(userId: string, petKey: string, ctx?: TransactionContext): Promise<boolean>;
}
