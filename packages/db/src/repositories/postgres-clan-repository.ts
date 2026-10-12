import { eq, and, sql, desc } from 'drizzle-orm';
import * as schema from '../schema';
import { Clan, ClanMember, ClanRepository } from './clan-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';

export class PostgresClanRepository implements ClanRepository {
    constructor(private db: any, private identityRepository: IdentityRepository) {}

    private getDb(ctx?: TransactionContext) {
        return (ctx as any)?.transaction || this.db;
    }

    async getClanByUserId(userId: string, ctx?: TransactionContext): Promise<Clan | null> {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId) return null;

        const members = await this.getDb(ctx)
            .select()
            .from(schema.clan_members)
            .where(eq(schema.clan_members.user_id, canonicalUserId))
            .limit(1);

        if (!members.length) return null;

        const clanId = members[0].clan_id;
        return this.getClanById(clanId, ctx);
    }

    async getClanById(clanId: string | number, ctx?: TransactionContext): Promise<Clan | null> {
        const clans = await this.getDb(ctx)
            .select()
            .from(schema.clans)
            .where(eq(schema.clans.id, String(clanId)))
            .limit(1);

        if (!clans.length) return null;
        return this.mapClan(clans[0]);
    }

    async createClan(ownerId: string, name: string, ctx?: TransactionContext): Promise<Clan> {
        const canonicalOwnerId = await this.identityRepository.lookupIdentity('discord', ownerId, ctx);
        if (!canonicalOwnerId) throw new Error('User not found');

        const [clan] = await this.getDb(ctx)
            .insert(schema.clans)
            .values({
                name,
                owner_id: canonicalOwnerId
            })
            .returning();

        await this.getDb(ctx)
            .insert(schema.clan_members)
            .values({
                clan_id: clan.id,
                user_id: canonicalOwnerId,
                role: 'owner'
            });

        return this.mapClan(clan);
    }

    async joinClan(clanId: string | number, userId: string, ctx?: TransactionContext): Promise<void> {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId) throw new Error('User not found');

        await this.getDb(ctx)
            .insert(schema.clan_members)
            .values({
                clan_id: String(clanId),
                user_id: canonicalUserId,
                role: 'member'
            });
    }

    async leaveClan(userId: string, ctx?: TransactionContext): Promise<void> {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId) return;

        await this.getDb(ctx)
            .delete(schema.clan_members)
            .where(eq(schema.clan_members.user_id, canonicalUserId));
    }

    async addClanXP(clanId: string | number, minutes: number, xpBoost: number, ctx?: TransactionContext): Promise<void> {
        await this.getDb(ctx)
            .update(schema.clans)
            .set({
                total_focus_minutes: sql`total_focus_minutes + ${minutes}`,
                xp: sql`xp + ${xpBoost}`,
                season_xp: sql`season_xp + ${xpBoost}`
            })
            .where(eq(schema.clans.id, String(clanId)));
    }

    async getClanMembers(clanId: string | number, ctx?: TransactionContext): Promise<ClanMember[]> {
        const members = await this.getDb(ctx)
            .select()
            .from(schema.clan_members)
            .where(eq(schema.clan_members.clan_id, String(clanId)));

        const results: ClanMember[] = [];
        for (const m of members) {
            // we need discord_id for the bot
            const identity = await this.identityRepository.getIdentity(m.user_id, 'discord', ctx);
            if (identity) {
                results.push({
                    id: m.user_id,
                    clan_id: m.clan_id,
                    discord_id: identity,
                    role: m.role || 'member',
                    joined_at: m.joined_at instanceof Date ? m.joined_at.toISOString() : (m.joined_at || '')
                });
            }
        }
        return results;
    }

    async getClanLeaderboard(limit: number = 10, ctx?: TransactionContext): Promise<Clan[]> {
        const clans = await this.getDb(ctx)
            .select()
            .from(schema.clans)
            .orderBy(desc(schema.clans.season_xp))
            .limit(limit);

        return clans.map((c: any) => this.mapClan(c));
    }

    private mapClan(row: any): Clan {
        return {
            id: row.id,
            name: row.name,
            owner_id: row.owner_id,
            water: row.water || 0,
            xp: row.xp || 0,
            season_xp: row.season_xp || 0,
            level: row.level || 1,
            tree_level: row.tree_level || 1,
            total_focus_minutes: row.total_focus_minutes || 0,
            created_at: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at || '')
        };
    }
}
