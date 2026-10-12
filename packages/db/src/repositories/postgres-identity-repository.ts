import { IdentityRepository, IdentityProvider, ResolvedIdentity } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { eq, and } from 'drizzle-orm';
import { users, user_identities } from '../schema/users';

export class PostgresIdentityRepository implements IdentityRepository {
    constructor(private db: any) {}

    async resolveIdentity(provider: IdentityProvider, providerId: string, ctx?: TransactionContext): Promise<ResolvedIdentity> {
        const dbClient = ctx?.db || this.db;

        const existing = await dbClient.select({ user_id: user_identities.user_id })
            .from(user_identities)
            .where(and(eq(user_identities.provider, provider), eq(user_identities.provider_id, providerId)))
            .limit(1);

        if (existing.length > 0) {
            return { userId: existing[0].user_id, isNew: false };
        }

        return await dbClient.transaction(async (tx: any) => {
            // Check again inside transaction to prevent race conditions
            const doubleCheck = await tx.select({ user_id: user_identities.user_id })
                .from(user_identities)
                .where(and(eq(user_identities.provider, provider), eq(user_identities.provider_id, providerId)))
                .limit(1);

            if (doubleCheck.length > 0) {
                return { userId: doubleCheck[0].user_id, isNew: false };
            }

            const newUser = await tx.insert(users).values({}).returning({ id: users.id });
            const userId = newUser[0].id;

            await tx.insert(user_identities).values({
                user_id: userId,
                provider: provider,
                provider_id: providerId
            });

            return { userId, isNew: true };
        });
    }

    async lookupIdentity(provider: IdentityProvider, providerId: string, ctx?: TransactionContext): Promise<string | null> {
        const dbClient = ctx?.db || this.db;
        const existing = await dbClient.select({ user_id: user_identities.user_id })
            .from(user_identities)
            .where(and(eq(user_identities.provider, provider), eq(user_identities.provider_id, providerId)))
            .limit(1);
            
        return existing.length > 0 ? existing[0].user_id : null;
    }

    async getIdentity(userId: string, provider: IdentityProvider, ctx?: TransactionContext): Promise<string | null> {
        const dbClient = ctx?.db || this.db;
        const existing = await dbClient.select({ provider_id: user_identities.provider_id })
            .from(user_identities)
            .where(and(eq(user_identities.user_id, userId), eq(user_identities.provider, provider)))
            .limit(1);
            
        return existing.length > 0 ? existing[0].provider_id : null;
    }

    async linkIdentity(userId: string, provider: IdentityProvider, providerId: string, ctx?: TransactionContext): Promise<void> {
        const dbClient = ctx?.db || this.db;
        
        const existing = await dbClient.select({ user_id: user_identities.user_id })
            .from(user_identities)
            .where(and(eq(user_identities.provider, provider), eq(user_identities.provider_id, providerId)))
            .limit(1);
            
        if (existing.length > 0 && existing[0].user_id !== userId) {
            throw new Error(`Provider identity ${providerId} is already linked to another user`);
        }
        
        if (existing.length === 0) {
            await dbClient.insert(user_identities).values({
                user_id: userId,
                provider: provider,
                provider_id: providerId
            });
        }
    }
}
