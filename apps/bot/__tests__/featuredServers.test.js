process.env.OWNER_ID = 'owner_1';
process.env.FEATURE_REVIEW_CHANNEL_ID = 'review_channel';
process.env.FEATURED_SERVERS_CHANNEL_ID = 'listing_channel';

const { PermissionFlagsBits } = require('discord.js');
const { initDatabase, db } = require('../utils/database');
const featured = require('../utils/featuredServers');

beforeAll(() => initDatabase());
beforeEach(() => db.exec('DELETE FROM featured_servers'));

function textChannel(id) {
    return {
        id,
        isTextBased: () => true,
        send: jest.fn().mockResolvedValue({ id: `msg_${id}`, channelId: id, url: `https://discord.com/channels/x/${id}/msg` }),
        messages: { delete: jest.fn().mockResolvedValue({}) },
    };
}

function setup({ manage = true, invite = null, canCreateInvite = true } = {}) {
    const review = textChannel('review_channel');
    const listing = textChannel('listing_channel');
    const requester = { send: jest.fn().mockResolvedValue({}) };
    const client = {
        channels: { fetch: jest.fn(async id => ({ review_channel: review, listing_channel: listing })[id] || null) },
        users: { fetch: jest.fn().mockResolvedValue(requester) },
        fetchInvite: jest.fn().mockResolvedValue(invite),
    };
    const channel = {
        createInvite: jest.fn().mockResolvedValue({ code: 'created123' }),
        permissionsFor: () => ({ has: () => canCreateInvite }),
    };
    const guild = { id: 'guild_1', name: 'Study Club', memberCount: 512, members: { me: {} }, rulesChannel: null, systemChannel: null };
    const base = {
        client,
        guild,
        guildId: 'guild_1',
        channel,
        locale: 'en',
        user: { id: 'admin_1', tag: 'admin' },
        memberPermissions: { has: flag => manage && flag === PermissionFlagsBits.ManageGuild },
        reply: jest.fn().mockResolvedValue({}),
        deferReply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        showModal: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
    };
    return { base, review, listing, requester, channel };
}

function modal(base, invite = '') {
    const values = { description: 'A friendly server for exam prep and daily focus sessions.', invite };
    return { ...base, fields: { getTextInputValue: key => values[key] } };
}

const ownerClick = (base, action) => ({ ...base, user: { id: 'owner_1' }, customId: `feature_${action}_guild_1` });

describe('/server feature', () => {
    test('only members with Manage Server can request a listing', async () => {
        const { base } = setup({ manage: false });
        await featured.handleFeatureCommand(base);
        expect(base.showModal).not.toHaveBeenCalled();
        expect(base.reply.mock.calls[0][0].flags).toBe(64);
    });

    test('creates a permanent invite and sends the request for review once', async () => {
        const { base, review, channel } = setup();
        await featured.handleFeatureModal(modal(base));

        expect(channel.createInvite).toHaveBeenCalledWith(expect.objectContaining({ maxAge: 0, maxUses: 0 }));
        expect(featured.getFeatured('guild_1')).toMatchObject({ status: 'pending', invite_url: 'https://discord.gg/created123', member_count: 512 });
        expect(review.send).toHaveBeenCalledTimes(1);

        await featured.handleFeatureModal(modal(base));
        expect(review.send).toHaveBeenCalledTimes(1);
    });

    test('a pasted invite must belong to this server and never expire', async () => {
        const other = setup({ invite: { code: 'abc', guild: { id: 'someone_else' } } });
        await featured.handleFeatureModal(modal(other.base, 'https://discord.gg/abc'));
        expect(featured.getFeatured('guild_1')).toBeNull();

        const temporary = setup({ invite: { code: 'abc', guild: { id: 'guild_1' }, expiresTimestamp: Date.now() + 1000 } });
        await featured.handleFeatureModal(modal(temporary.base, 'discord.gg/abc'));
        expect(featured.getFeatured('guild_1')).toBeNull();

        const good = setup({ invite: { code: 'abc', guild: { id: 'guild_1' }, expiresTimestamp: null } });
        await featured.handleFeatureModal(modal(good.base, 'https://discord.com/invite/abc'));
        expect(featured.getFeatured('guild_1').invite_url).toBe('https://discord.gg/abc');
        expect(good.channel.createInvite).not.toHaveBeenCalled();
    });

    test('asks for an invite when Pomo cannot create one', async () => {
        const { base } = setup({ canCreateInvite: false });
        await featured.handleFeatureModal(modal(base));
        expect(featured.getFeatured('guild_1')).toBeNull();
        expect(base.editReply.mock.calls[0][0]).toContain('Create Invite');
    });
});

describe('owner review', () => {
    test('only the owner can approve', async () => {
        const { base } = setup();
        await featured.handleFeatureModal(modal(base));
        await featured.handleReviewButton({ ...base, customId: 'feature_approve_guild_1' });
        expect(featured.getFeatured('guild_1').status).toBe('pending');
    });

    test('approving posts the listing once and tells the requester', async () => {
        const { base, listing, requester } = setup();
        await featured.handleFeatureModal(modal(base));

        await featured.handleReviewButton(ownerClick(base, 'approve'));
        await featured.handleReviewButton(ownerClick(base, 'approve'));

        expect(listing.send).toHaveBeenCalledTimes(1);
        expect(featured.getFeatured('guild_1')).toMatchObject({ status: 'approved', listing_message_id: 'msg_listing_channel' });
        expect(requester.send).toHaveBeenCalledTimes(1);
    });

    test('rejecting posts nothing', async () => {
        const { base, listing } = setup();
        await featured.handleFeatureModal(modal(base));
        await featured.handleReviewButton(ownerClick(base, 'reject'));
        expect(listing.send).not.toHaveBeenCalled();
        expect(featured.getFeatured('guild_1').status).toBe('rejected');
    });
});

describe('/server unfeature', () => {
    test('removes the listing message, and the server can apply again later', async () => {
        const { base, listing, review } = setup();
        await featured.handleFeatureModal(modal(base));
        await featured.handleReviewButton(ownerClick(base, 'approve'));

        await featured.handleUnfeatureCommand(base);
        expect(listing.messages.delete).toHaveBeenCalledWith('msg_listing_channel');
        expect(featured.getFeatured('guild_1').status).toBe('removed');

        await featured.handleFeatureModal(modal(base));
        expect(featured.getFeatured('guild_1').status).toBe('pending');
        expect(review.send).toHaveBeenCalledTimes(2);
    });
});
