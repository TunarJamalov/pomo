const _test_os = require("os");
const _test_path = require("path");
if (!process.env.POMODORO_DB_PATH) {
    process.env.POMODORO_DB_PATH = _test_path.join(_test_os.tmpdir(), "test_" + Date.now() + "_" + Math.random() + ".db");
}
const { ChannelType } = require('discord.js');
const {
    db,
    initDatabase,
    getOrCreateUser,
    getOrCreateGuildSettings,
    updateGuildSettings,
    createBuddyRequest,
    matchBuddyPair,
    unmatchBuddyPair,
    blockBuddyUser,
    setBuddyDestination,
    getMatchDestinationState,
    buddyMatchKey,
    recordHubConsent,
    getHubConsents,
    getHubInvite,
    pickStudyHub,
    validateStudyHub,
    getEligibleStudyHubs,
} = require('../utils/database');
const {
    handleBuddyDestination,
    handleBuddyHubConsent,
    buildHubConsentRow,
} = require('../commands/findbuddy');

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_buddy_hub_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

beforeAll(() => initDatabase());
afterAll(() => {
    try { db.close(); } catch (_) {}
    try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec('DELETE FROM buddy_hub_invites;');
    db.exec('DELETE FROM buddy_hub_consents;');
    db.exec('DELETE FROM buddy_swipes;');
    db.exec('DELETE FROM buddy_blocks;');
    db.exec('DELETE FROM buddy_reports;');
    db.exec('DELETE FROM buddy_unmatches;');
    db.exec('DELETE FROM buddy_requests;');
    db.exec('DELETE FROM guild_settings;');
});

function makeReq(userId, guildId = 'guild_1', subject = 'Math', duration = 60, mode = 'silent') {
    const r = createBuddyRequest(userId, guildId, subject, duration, mode);
    return Number(r.lastInsertRowid);
}

function makeMatchedPair(aId, bId, guildA = 'guild_1', guildB = 'guild_1') {
    const a = getOrCreateUser(aId);
    const b = getOrCreateUser(bId);
    const reqA = makeReq(a.discord_id, guildA);
    const reqB = makeReq(b.discord_id, guildB);
    const matched = matchBuddyPair(reqA, b.discord_id, reqB, a.discord_id, 80);
    expect(matched).toBe(2);
    return { a: a.discord_id, b: b.discord_id, reqA, reqB };
}

function enableHub(guildId, { guests = true, global = true } = {}) {
    getOrCreateGuildSettings(guildId);
    updateGuildSettings(guildId, {
        global_buddy_matching_enabled: global ? 1 : 0,
        study_hub_enabled: 1,
        study_hub_accepts_guests: guests ? 1 : 0,
    });
}

function reqStatus(id) {
    return db.prepare('SELECT status FROM buddy_requests WHERE id = ?').get(id).status;
}

function makeMockGuild({ id, name = 'Hub Server', canInvite = true, failInvite = false, textChannels = true, inviteCounter = null }) {
    const channel = {
        id: 'chan_' + id,
        name: 'study-hall',
        type: ChannelType.GuildText,
        position: 0,
        permissionsFor: () => ({ has: () => canInvite }),
        createInvite: async () => {
            if (inviteCounter) inviteCounter.count++;
            if (failInvite) throw new Error('Missing Permissions');
            return { url: `https://discord.gg/${id}`, code: `code_${id}` };
        },
    };
    return {
        id,
        name,
        members: { me: { id: 'bot_1' }, fetchMe: async () => ({ id: 'bot_1' }) },
        channels: { fetch: async () => (textChannels ? new Map([[channel.id, channel]]) : new Map()) },
    };
}

function makeHubClient({ users = {}, guilds = {}, failSendFor = new Set() } = {}) {
    const sent = [];
    return {
        sent,
        users: {
            fetch: async (id) => {
                if (!users[id]) return null;
                const u = users[id];
                return {
                    id,
                    username: u.username || ('User_' + id),
                    createDM: async () => ({
                        send: async (msg) => {
                            if (failSendFor.has(id)) throw new Error('Cannot send messages to this user');
                            sent.push({
                                to: id,
                                msg: typeof msg === 'string' ? msg : (msg.content || ''),
                                raw: msg,
                            });
                        },
                    }),
                };
            },
        },
        guilds: {
            fetch: async (id) => {
                if (!guilds[id]) throw new Error('Unknown guild');
                return guilds[id];
            },
        },
    };
}

function makeIx({ userId, guildId = 'guild_1', client, username = null }) {
    const calls = { updates: [], followUps: [], replies: [] };
    return {
        calls,
        user: { id: userId, username: username || ('Ix_' + userId) },
        guildId,
        client: client || makeHubClient(),
        update: async (payload) => { calls.updates.push(payload); },
        deferUpdate: async () => { calls.deferred = true; },
        editReply: async (payload) => { calls.updates.push(payload); },
        followUp: async (payload) => { calls.followUps.push(payload); },
        reply: async (payload) => { calls.replies.push(payload); },
    };
}

function dmsTo(client, userId) {
    return client.sent.filter(s => s.to === userId);
}

function makeHubPair(aId, bId, hubId = 'hub_1') {
    enableHub(hubId);
    const pair = makeMatchedPair(aId, bId);
    setBuddyDestination(pair.reqA, pair.a, 'study_hub');
    setBuddyDestination(pair.reqB, pair.b, 'study_hub');
    const mock = makeMockGuild({ id: hubId });
    return { ...pair, hubId, mock };
}

describe('Hub consent UI', () => {
    test('both select hub → confirmer gets Join buttons, partner gets Join DM', async () => {
        const { a, b, reqA, reqB } = makeMatchedPair('cu_a', 'cu_b');
        enableHub('hub_1');
        const mock = makeMockGuild({ id: 'hub_1' });
        const client = makeHubClient({
            users: { [a]: {}, [b]: {} },
            guilds: { hub_1: mock },
        });

        await handleBuddyDestination(makeIx({ userId: a, client }), 'study_hub', reqA);
        const ixB = makeIx({ userId: b, client });
        await handleBuddyDestination(ixB, 'study_hub', reqB);

        // Confirmer's message carries consent buttons for their own request
        const updatesText = JSON.stringify(ixB.calls.updates);
        expect(updatesText).toContain(`buddy_hub_accept_${reqB}`);
        expect(updatesText).toContain(`buddy_hub_decline_${reqB}`);

        // Partner's DM carries a consent prompt with THEIR OWN request id
        const toA = dmsTo(client, a);
        const prompt = toA.find(m => m.msg.includes('Would you like to join'));
        expect(prompt).toBeTruthy();
        expect(prompt.msg).toContain('Hub Server');
        const withButtons = toA.find(m => m.raw && m.raw.components);
        expect(withButtons).toBeTruthy();
        expect(JSON.stringify(withButtons.raw)).toContain(`buddy_hub_accept_${reqA}`);

        // No invite yet — consent hasn't happened
        expect(getHubInvite(buddyMatchKey(reqA, reqB))).toBeNull();
    });

    test('hub consent row builder carries request id only', () => {
        const row = buildHubConsentRow(4242);
        const text = JSON.stringify(row);
        expect(text).toContain('buddy_hub_accept_4242');
        expect(text).toContain('buddy_hub_decline_4242');
        expect(text).not.toContain('<@');
    });
});

describe('Consent decisions', () => {
    test('one accepts / partner pending → no invite, waiting message', async () => {
        const { a, reqA, reqB } = makeHubPair('ow_a', 'ow_b');
        const client = makeHubClient({ users: { [a]: {} }, guilds: {} });
        const ix = makeIx({ userId: a, client });

        await handleBuddyHubConsent(ix, 'accept', reqA);

        expect(JSON.stringify(ix.calls.updates)).toContain('Waiting for your partner');
        expect(getHubInvite(buddyMatchKey(reqA, reqB))).toBeNull();
        expect(client.sent.map(s => s.msg).join('\n')).not.toContain('discord.gg');
    });

    test('accept + decline → no invite, partner notified, match stays active', async () => {
        const { a, b, reqA, reqB } = makeHubPair('ad_a', 'ad_b');
        const client = makeHubClient({ users: { [a]: {}, [b]: {} }, guilds: {} });

        await handleBuddyHubConsent(makeIx({ userId: a, client }), 'accept', reqA);
        const ixB = makeIx({ userId: b, client });
        await handleBuddyHubConsent(ixB, 'decline', reqB);

        expect(JSON.stringify(ixB.calls.updates)).toContain('Staying independent');
        expect(getHubInvite(buddyMatchKey(reqA, reqB))).toBeNull();

        const toA = dmsTo(client, a);
        expect(toA.some(m => m.msg.includes('decided not to join'))).toBe(true);

        expect(reqStatus(reqA)).toBe('matched');
        expect(reqStatus(reqB)).toBe('matched');
    });

    test('both accept → invite created, URL in both DMs privately', async () => {
        const { a, b, reqA, reqB } = makeHubPair('ba_a', 'ba_b', 'hub_2');
        const mock = makeMockGuild({ id: 'hub_2' });
        const client = makeHubClient({ users: { [a]: {}, [b]: {} }, guilds: { hub_2: mock } });

        await handleBuddyHubConsent(makeIx({ userId: a, client }), 'accept', reqA);
        const ixB = makeIx({ userId: b, client });
        await handleBuddyHubConsent(ixB, 'accept', reqB);

        const invite = getHubInvite(buddyMatchKey(reqA, reqB));
        expect(invite).toBeTruthy();
        expect(invite.status).toBe('sent');
        expect(invite.invite_url).toContain('https://discord.gg/hub_2');
        expect(invite.hub_guild_id).toBe('hub_2');

        const toA = dmsTo(client, a);
        const toB = dmsTo(client, b);
        expect(toA.some(m => m.msg.includes('https://discord.gg/hub_2'))).toBe(true);
        expect(toB.some(m => m.msg.includes('https://discord.gg/hub_2'))).toBe(true);
        expect(JSON.stringify(ixB.calls.updates)).toContain('Invitation sent');

        // URL lives only in DMs, never in message updates shown to others
        expect(JSON.stringify(ixB.calls.updates)).not.toContain('discord.gg');
    });

    test('duplicate accept does not create a second invite', async () => {
        const { a, b, reqA, reqB } = makeHubPair('dup_a', 'dup_b', 'hub_3');
        const counter = { count: 0 };
        const mock = makeMockGuild({ id: 'hub_3', inviteCounter: counter });
        const client = makeHubClient({ users: { [a]: {}, [b]: {} }, guilds: { hub_3: mock } });

        await handleBuddyHubConsent(makeIx({ userId: a, client }), 'accept', reqA);
        await handleBuddyHubConsent(makeIx({ userId: b, client }), 'accept', reqB);
        expect(counter.count).toBe(1);

        // Re-click accept on both sides: replay, no new invite
        const ixA2 = makeIx({ userId: a, client });
        await handleBuddyHubConsent(ixA2, 'accept', reqA);
        expect(counter.count).toBe(1);
        expect(JSON.stringify(ixA2.calls.updates)).toContain('already sent');
        expect(JSON.stringify(ixA2.calls.updates)).toContain('https://discord.gg/hub_3');
    });
});

describe('Consent safety gates', () => {
    test('match ended before acceptance → rejected, no invite', async () => {
        const { a, b, reqA, reqB } = makeHubPair('me_a', 'me_b');
        const client = makeHubClient({ users: { [a]: {}, [b]: {} }, guilds: {} });

        await handleBuddyHubConsent(makeIx({ userId: a, client }), 'accept', reqA);

        const { unmatchBuddyPair } = require('../utils/database');
        unmatchBuddyPair(a, reqA);

        const ixB = makeIx({ userId: b, client });
        await handleBuddyHubConsent(ixB, 'accept', reqB);

        expect(ixB.calls.replies.length).toBe(1);
        expect(getHubInvite(buddyMatchKey(reqA, reqB))).toBeNull();
    });

    test('block before acceptance → rejected, no invite', async () => {
        const { a, b, reqA, reqB } = makeHubPair('bl_a', 'bl_b');
        const client = makeHubClient({ users: { [a]: {}, [b]: {} }, guilds: {} });

        await handleBuddyHubConsent(makeIx({ userId: a, client }), 'accept', reqA);
        db.prepare('INSERT INTO buddy_blocks (blocker_id, blocked_id) VALUES (?, ?)').run(a, b);

        const ixB = makeIx({ userId: b, client });
        await handleBuddyHubConsent(ixB, 'accept', reqB);

        expect(JSON.stringify(ixB.calls.replies)).toContain('Unavailable');
        expect(getHubInvite(buddyMatchKey(reqA, reqB))).toBeNull();
    });

    test('stale and forged interactions rejected', async () => {
        const { a, reqA } = makeHubPair('st_a', 'st_b');
        const client = makeHubClient({ users: { [a]: {} }, guilds: {} });

        // Wrong owner
        const ixForge = makeIx({ userId: 'intruder_x', client });
        await handleBuddyHubConsent(ixForge, 'accept', reqA);
        expect(ixForge.calls.replies.length).toBe(1);

        // Unknown request id
        const ixGhost = makeIx({ userId: a, client });
        await handleBuddyHubConsent(ixGhost, 'accept', 999999);
        expect(ixGhost.calls.replies.length).toBe(1);

        // Invalid decision string
        const ixBad = makeIx({ userId: a, client });
        await handleBuddyHubConsent(ixBad, 'maybe', reqA);
        expect(JSON.stringify(ixBad.calls.replies)).toContain('Invalid Choice');

        expect(db.prepare('SELECT COUNT(*) AS c FROM buddy_hub_invites').get().c).toBe(0);
        expect(db.prepare('SELECT COUNT(*) AS c FROM buddy_hub_consents').get().c).toBe(0);
    });
});

describe('Hub validation at invite time', () => {
    test('hub disabled before invite → no invite, both notified, match active', async () => {
        const { a, b, reqA, reqB } = makeHubPair('hd_a', 'hd_b', 'hub_off');
        const mock = makeMockGuild({ id: 'hub_off' });
        const client = makeHubClient({ users: { [a]: {}, [b]: {} }, guilds: { hub_off: mock } });

        await handleBuddyHubConsent(makeIx({ userId: a, client }), 'accept', reqA);

        db.prepare('UPDATE guild_settings SET study_hub_enabled = 0 WHERE guild_id = ?').run('hub_off');

        const ixB = makeIx({ userId: b, client });
        await handleBuddyHubConsent(ixB, 'accept', reqB);

        expect(getHubInvite(buddyMatchKey(reqA, reqB))).toBeNull();
        const allText = client.sent.map(s => s.msg).join('\n');
        expect(allText).not.toContain('discord.gg');
        expect(reqStatus(reqA)).toBe('matched');
        expect(reqStatus(reqB)).toBe('matched');
    });

    test('accepts_guests disabled before invite → no invite', async () => {
        const { a, b, reqA, reqB } = makeHubPair('ag_a', 'ag_b', 'hub_ag');
        const mock = makeMockGuild({ id: 'hub_ag' });
        const client = makeHubClient({ users: { [a]: {}, [b]: {} }, guilds: { hub_ag: mock } });

        await handleBuddyHubConsent(makeIx({ userId: a, client }), 'accept', reqA);
        db.prepare('UPDATE guild_settings SET study_hub_accepts_guests = 0 WHERE guild_id = ?').run('hub_ag');

        await handleBuddyHubConsent(makeIx({ userId: b, client }), 'accept', reqB);
        expect(getHubInvite(buddyMatchKey(reqA, reqB))).toBeNull();
    });

    test('global matching disabled before invite → no invite', async () => {
        const { a, b, reqA, reqB } = makeHubPair('gm_a', 'gm_b', 'hub_gm');
        const mock = makeMockGuild({ id: 'hub_gm' });
        const client = makeHubClient({ users: { [a]: {}, [b]: {} }, guilds: { hub_gm: mock } });

        await handleBuddyHubConsent(makeIx({ userId: a, client }), 'accept', reqA);
        db.prepare('UPDATE guild_settings SET global_buddy_matching_enabled = 0 WHERE guild_id = ?').run('hub_gm');

        await handleBuddyHubConsent(makeIx({ userId: b, client }), 'accept', reqB);
        expect(getHubInvite(buddyMatchKey(reqA, reqB))).toBeNull();
    });

    test('bot missing from hub → failed status, notified, match active', async () => {
        const { a, b, reqA, reqB } = makeHubPair('bm_a', 'bm_b', 'hub_bm');
        // No guild object registered → guilds.fetch throws → bot missing
        const client = makeHubClient({ users: { [a]: {}, [b]: {} }, guilds: {} });

        await handleBuddyHubConsent(makeIx({ userId: a, client }), 'accept', reqA);
        const ixB = makeIx({ userId: b, client });
        await handleBuddyHubConsent(ixB, 'accept', reqB);

        const invite = getHubInvite(buddyMatchKey(reqA, reqB));
        expect(invite).toBeTruthy();
        expect(invite.status).toBe('failed');
        const allText = client.sent.map(s => s.msg).join('\n');
        expect(allText).toContain('temporarily unavailable');
        expect(allText).not.toContain('discord.gg');
        expect(reqStatus(reqA)).toBe('matched');
    });

    test('missing invite permissions → failed, notified, match active', async () => {
        const { a, b, reqA, reqB } = makeHubPair('mp_a', 'mp_b', 'hub_mp');
        const mock = makeMockGuild({ id: 'hub_mp', canInvite: false });
        const client = makeHubClient({ users: { [a]: {}, [b]: {} }, guilds: { hub_mp: mock } });

        await handleBuddyHubConsent(makeIx({ userId: a, client }), 'accept', reqA);
        await handleBuddyHubConsent(makeIx({ userId: b, client }), 'accept', reqB);

        const invite = getHubInvite(buddyMatchKey(reqA, reqB));
        expect(invite.status).toBe('failed');
        expect(client.sent.map(s => s.msg).join('\n')).toContain('temporarily unavailable');
        expect(reqStatus(reqA)).toBe('matched');
    });

    test('invite creation throws → failed, notified, match active', async () => {
        const { a, b, reqA, reqB } = makeHubPair('ex_a', 'ex_b', 'hub_ex');
        const mock = makeMockGuild({ id: 'hub_ex', failInvite: true });
        const client = makeHubClient({ users: { [a]: {}, [b]: {} }, guilds: { hub_ex: mock } });

        await handleBuddyHubConsent(makeIx({ userId: a, client }), 'accept', reqA);
        await handleBuddyHubConsent(makeIx({ userId: b, client }), 'accept', reqB);

        const invite = getHubInvite(buddyMatchKey(reqA, reqB));
        expect(invite.status).toBe('failed');
        expect(client.sent.map(s => s.msg).join('\n')).toContain('temporarily unavailable');
        expect(client.sent.map(s => s.msg).join('\n')).not.toContain('discord.gg');
        expect(reqStatus(reqA)).toBe('matched');
    });
});

describe('Hub helpers', () => {
    test('pickStudyHub is deterministic (first eligible)', () => {
        const { getOrCreateGuildSettings, updateGuildSettings } = require('../utils/database');
        const { pickStudyHub, validateStudyHub } = require('../commands/findbuddy');
        void validateStudyHub;

        for (const g of ['hub_z', 'hub_a', 'hub_m']) {
            getOrCreateGuildSettings(g);
            updateGuildSettings(g, {
                global_buddy_matching_enabled: 1,
                study_hub_enabled: 1,
                study_hub_accepts_guests: 1,
            });
        }
        // Documented temporary behavior: first eligible hub only
        expect(pickStudyHub()).toBe('hub_a');
    });

    test('validateStudyHub reasons', async () => {
        const { validateStudyHub } = require('../commands/findbuddy');
        const { getOrCreateGuildSettings, updateGuildSettings } = require('../utils/database');

        // Disabled hub
        getOrCreateGuildSettings('v_off');
        expect((await validateStudyHub(makeHubClient(), 'v_off')).reason).toBe('disabled');

        // Bot missing
        getOrCreateGuildSettings('v_bm');
        updateGuildSettings('v_bm', {
            global_buddy_matching_enabled: 1,
            study_hub_enabled: 1,
            study_hub_accepts_guests: 1,
        });
        const noGuildClient = makeHubClient({ users: {}, guilds: {} });
        expect((await validateStudyHub(noGuildClient, 'v_bm')).reason).toBe('bot_missing');

        // No suitable channel
        const emptyGuild = makeMockGuild({ id: 'v_nc' });
        emptyGuild.channels.fetch = async () => new Map();
        getOrCreateGuildSettings('v_nc');
        updateGuildSettings('v_nc', {
            global_buddy_matching_enabled: 1,
            study_hub_enabled: 1,
            study_hub_accepts_guests: 1,
        });
        const ncClient = makeHubClient({ users: {}, guilds: { v_nc: emptyGuild } });
        expect((await validateStudyHub(ncClient, 'v_nc')).reason).toBe('no_channel');

        // OK path
        const okGuild = makeMockGuild({ id: 'v_ok', name: 'Good Hub' });
        getOrCreateGuildSettings('v_ok');
        updateGuildSettings('v_ok', {
            global_buddy_matching_enabled: 1,
            study_hub_enabled: 1,
            study_hub_accepts_guests: 1,
        });
        const okClient = makeHubClient({ users: {}, guilds: { v_ok: okGuild } });
        const okRes = await validateStudyHub(okClient, 'v_ok');
        expect(okRes.ok).toBe(true);
        expect(okRes.name).toBe('Good Hub');
        expect(okRes.channel.id).toBe('chan_v_ok');
    });

    test('recordHubConsent validates input, upserts on re-decide', () => {
        const { recordHubConsent, getHubConsents } = require('../utils/database');
        expect(recordHubConsent('badkey', 1, 'u1', 'accepted').ok).toBe(false);
        expect(recordHubConsent('1:2', 1, 'u1', 'maybe').ok).toBe(false);
        expect(recordHubConsent('1:2', 1, null, 'accepted').ok).toBe(false);

        expect(recordHubConsent('1:2', 1, 'u1', 'accepted').ok).toBe(true);
        expect(recordHubConsent('1:2', 1, 'u1', 'accepted').ok).toBe(true);
        expect(getHubConsents('1:2').length).toBe(1);

        // Change mind: upsert, still one row
        expect(recordHubConsent('1:2', 1, 'u1', 'declined').ok).toBe(true);
        const rows = getHubConsents('1:2');
        expect(rows.length).toBe(1);
        expect(rows[0].decision).toBe('declined');
    });

    test('no auto-invite before both consents', async () => {
        const { a, b, reqA, reqB } = makeHubPair('ni_a', 'ni_b', 'hub_ni');
        const mock = makeMockGuild({ id: 'hub_ni' });
        const client = makeHubClient({ users: { [a]: {}, [b]: {} }, guilds: { hub_ni: mock } });

        // Both selected hub (tested), nobody accepted yet
        expect(getHubInvite(buddyMatchKey(reqA, reqB))).toBeNull();
        expect(client.sent.map(s => s.msg).join('\n')).not.toContain('discord.gg');
        void a; void b;
    });
});
