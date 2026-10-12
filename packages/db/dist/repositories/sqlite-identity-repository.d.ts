import { IdentityRepository, IdentityProvider, ResolvedIdentity } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class SqliteIdentityRepository implements IdentityRepository {
    private db;
    constructor(db: any);
    resolveIdentity(provider: IdentityProvider, providerId: string, ctx?: TransactionContext): Promise<ResolvedIdentity>;
    lookupIdentity(provider: IdentityProvider, providerId: string, ctx?: TransactionContext): Promise<string | null>;
    getIdentity(userId: string, provider: IdentityProvider, ctx?: TransactionContext): Promise<string | null>;
    linkIdentity(userId: string, provider: IdentityProvider, providerId: string, ctx?: TransactionContext): Promise<void>;
}
