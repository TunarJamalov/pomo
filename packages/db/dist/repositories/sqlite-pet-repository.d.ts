import { PetRepository, UserPet } from './pet-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class SqlitePetRepository implements PetRepository {
    private db;
    private identityRepo;
    constructor(db: any, identityRepo: IdentityRepository);
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
