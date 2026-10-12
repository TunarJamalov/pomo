const { getOrCreateUser, getPremiumEntitlement } = require('./database');

async function getPremiumStatus(client, userId) {
    const user = getOrCreateUser(userId);
    const entitlement = getPremiumEntitlement(userId);

    if (entitlement?.status === 'active') {
        return {
            active: true,
            planKey: entitlement.plan_key,
            source: entitlement.source,
            startsAt: entitlement.starts_at,
            expiresAt: entitlement.expires_at,
            managed: true,
        };
    }

    if (user.premium === 1) {
        return {
            active: true,
            planKey: 'legacy',
            source: 'legacy_override',
            startsAt: null,
            expiresAt: null,
            managed: false,
        };
    }

    // Discord roles are authoritative. A role that is deliberately added
    // again after an old expiry/revoke record should restore access.
    const roleSource = await getPremiumRoleSource(client, userId);
    if (roleSource) {
        return {
            active: true,
            planKey: 'supporter',
            source: roleSource,
            startsAt: null,
            expiresAt: null,
            managed: false,
        };
    }

    if (entitlement) {
        return {
            active: false,
            planKey: entitlement.plan_key,
            source: entitlement.source,
            startsAt: entitlement.starts_at,
            expiresAt: entitlement.expires_at,
            status: entitlement.status,
            managed: true,
        };
    }

    return {
        active: false,
        planKey: null,
        source: null,
        startsAt: null,
        expiresAt: null,
        managed: false,
    };
}

async function isPremium(client, userId) {
    return (await getPremiumStatus(client, userId)).active;
}

async function hasPremiumRole(client, userId) {
    return Boolean(await getPremiumRoleSource(client, userId));
}

async function getPremiumRoleSource(client, userId) {
    if (await hasMembershipRole(client, userId)) return 'buymeacoffee_role';

    const guildId = process.env.PREMIUM_GUILD_ID;
    const roleId = process.env.PREMIUM_ROLE_ID;
    if (await hasRole(client, guildId, roleId, userId)) return 'discord_role';
    return null;
}

async function hasMembershipRole(client, userId) {
    const guildId = process.env.PREMIUM_GUILD_ID;
    const roleId = process.env.PREMIUM_MEMBERSHIP_ROLE_ID;
    return hasRole(client, guildId, roleId, userId);
}

// Most users are not in the premium server, and Discord does not cache a
// "not a member" answer, so every /daily used to make two slow REST calls and
// sometimes missed the 3 second reply window. Remember lookups briefly.
const MEMBER_LOOKUP_TTL_MS = 5 * 60 * 1000;
const memberLookups = new Map();

async function fetchPremiumGuildMember(client, guildId, userId) {
    const key = `${guildId}:${userId}`;
    const cached = memberLookups.get(key);
    if (cached && cached.expires > Date.now()) return cached.member;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
    memberLookups.set(key, { member, expires: Date.now() + MEMBER_LOOKUP_TTL_MS });
    if (memberLookups.size > 5000) memberLookups.delete(memberLookups.keys().next().value);
    return member;
}

async function hasRole(client, guildId, roleId, userId) {
    if (!guildId || !roleId || !client) return false;

    try {
        const member = await fetchPremiumGuildMember(client, guildId, userId);
        return Boolean(member?.roles.cache.has(roleId));
    } catch (error) {
        console.error('[PREMIUM] Role check error:', error.message);
        return false;
    }
}

async function syncPremiumRole(client, userId, shouldHaveRole) {
    const guildId = process.env.PREMIUM_GUILD_ID;
    const roleId = process.env.PREMIUM_ROLE_ID;
    if (!guildId || !roleId || !client) return 'not_configured';

    try {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return 'guild_unavailable';
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return 'not_in_support_server';

        const hasRole = member.roles.cache.has(roleId);
        if (shouldHaveRole && !hasRole) await member.roles.add(roleId);
        if (!shouldHaveRole && hasRole) await member.roles.remove(roleId);
        return 'synced';
    } catch (error) {
        console.error('[PREMIUM] Role sync error:', error.message);
        return 'failed';
    }
}

module.exports = {
    getPremiumStatus,
    isPremium,
    hasPremiumRole,
    hasMembershipRole,
    getPremiumRoleSource,
    syncPremiumRole,
};
