import { TransactionContext } from '../transaction/transaction-manager';
export type IdentityProvider = 'discord' | 'guest';
export interface ResolvedIdentity {
    userId: string;
    isNew: boolean;
}
export interface IdentityRepository {
    resolveIdentity(provider: IdentityProvider, providerId: string, ctx?: TransactionContext): Promise<ResolvedIdentity>;
    getIdentity(userId: string, provider: IdentityProvider, ctx?: TransactionContext): Promise<string | null>;
    lookupIdentity(provider: IdentityProvider, providerId: string, ctx?: TransactionContext): Promise<string | null>;
    linkIdentity(userId: string, provider: IdentityProvider, providerId: string, ctx?: TransactionContext): Promise<void>;
}
