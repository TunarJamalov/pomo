"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlitePomoMatchRepository = void 0;
class SqlitePomoMatchRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    createBuddyRequest(data, ctx) {
        const res = (ctx?.db || this.db).prepare(`
            INSERT INTO buddy_requests (user_id, guild_id, subject, duration, mode) VALUES (?, ?, ?, ?, ?)
        `).run(data.userId, data.guildId, data.subject, data.duration, data.mode);
        return { lastInsertRowid: res.lastInsertRowid, changes: res.changes };
    }
    getLatestWaitingBuddyRequestForUser(userId, ctx) {
        return (ctx?.db || this.db).prepare('SELECT * FROM buddy_requests WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
            .get(userId, 'waiting') || null;
    }
    cancelWaitingBuddyRequest(requestId, userId, ctx) {
        const res = (ctx?.db || this.db).prepare("UPDATE buddy_requests SET status = 'cancelled', ended_at = datetime('now') WHERE id = ? AND user_id = ? AND status = 'waiting'").run(requestId, userId);
        return { changes: res.changes };
    }
    getWaitingBuddyRequests(guildId, ctx) {
        return (ctx?.db || this.db).prepare(`
            SELECT * FROM buddy_requests
            WHERE guild_id = ? AND status = 'waiting' AND user_id IS NOT NULL
              AND created_at >= datetime('now', '-30 minutes')
            ORDER BY created_at ASC
        `).all(guildId);
    }
    getGlobalWaitingBuddyRequests(ctx) {
        return (ctx?.db || this.db).prepare(`
            SELECT br.* FROM buddy_requests br
            JOIN guild_settings gs ON gs.guild_id = br.guild_id
            WHERE br.status = 'waiting' AND br.user_id IS NOT NULL
              AND br.created_at >= datetime('now', '-30 minutes')
              AND COALESCE(gs.global_buddy_matching_enabled, 0) = 1
            ORDER BY br.created_at ASC
        `).all();
    }
    expireStaleBuddyRequests(ctx) {
        const res = (ctx?.db || this.db).prepare(`
            UPDATE buddy_requests
            SET status = 'expired', ended_at = datetime('now')
            WHERE status = 'waiting' AND created_at < datetime('now', '-30 minutes')
        `).run();
        return { changes: res.changes };
    }
    matchBuddyPair(requestId1, matchedUser1Id, requestId2, matchedUser2Id, matchScore, ctx) {
        try {
            const execute = () => {
                let changes = 0;
                changes += (ctx?.db || this.db).prepare(`UPDATE buddy_requests SET status = 'matched', matched_user_id = ?, match_score = ? WHERE id = ? AND status = 'waiting'`)
                    .run(matchedUser1Id, matchScore, requestId1).changes;
                changes += (ctx?.db || this.db).prepare(`UPDATE buddy_requests SET status = 'matched', matched_user_id = ?, match_score = ? WHERE id = ? AND status = 'waiting'`)
                    .run(matchedUser2Id, matchScore, requestId2).changes;
                if (changes !== 2)
                    throw new Error('PARTIAL_MATCH');
                return changes;
            };
            if (ctx)
                return execute();
            return this.db.transaction(execute)();
        }
        catch (_) {
            return 0;
        }
    }
    unmatchBuddyPair(userId, requestId, ctx) {
        let myReq;
        const queryDb = ctx?.db || this.db;
        if (requestId != null) {
            myReq = queryDb.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(requestId);
            if (!myReq || myReq.user_id !== userId || myReq.status !== 'matched' || !myReq.matched_user_id) {
                return { ok: false, reason: 'no_active_match' };
            }
        }
        else {
            myReq = queryDb.prepare("SELECT * FROM buddy_requests WHERE user_id = ? AND status = 'matched' ORDER BY id DESC LIMIT 1").get(userId);
            if (!myReq || !myReq.matched_user_id) {
                return { ok: false, reason: 'no_active_match' };
            }
        }
        const partnerId = myReq.matched_user_id;
        const partnerReq = queryDb.prepare("SELECT * FROM buddy_requests WHERE user_id = ? AND matched_user_id = ? AND status = 'matched' ORDER BY id DESC LIMIT 1")
            .get(partnerId, userId);
        try {
            const execute = () => {
                let changes = 0;
                changes += queryDb.prepare("UPDATE buddy_requests SET status = 'unmatched', ended_at = datetime('now') WHERE id = ? AND status = 'matched'")
                    .run(myReq.id).changes;
                if (partnerReq) {
                    changes += queryDb.prepare("UPDATE buddy_requests SET status = 'unmatched', ended_at = datetime('now') WHERE id = ? AND status = 'matched'")
                        .run(partnerReq.id).changes;
                }
                if (changes < 1)
                    throw new Error('NO_MATCH');
                queryDb.prepare('INSERT OR IGNORE INTO buddy_unmatches (unmatcher_id, unmatched_id) VALUES (?, ?)')
                    .run(userId, partnerId);
                return { ok: true, partnerId, myRequestId: myReq.id, partnerRequestId: partnerReq ? partnerReq.id : null };
            };
            if (ctx)
                return execute();
            return this.db.transaction(execute)();
        }
        catch (_) {
            return { ok: false, reason: 'no_active_match' };
        }
    }
    matchBuddyRequest(requestId, matchedUserId, matchScore, ctx) {
        const res = (ctx?.db || this.db).prepare(`
            UPDATE buddy_requests SET status = 'matched', matched_user_id = ?, match_score = ? WHERE id = ?
        `).run(matchedUserId, matchScore, requestId);
        return { changes: res.changes };
    }
    endBuddyRequest(requestId, status = 'completed', ctx) {
        const res = (ctx?.db || this.db).prepare(`
            UPDATE buddy_requests SET status = ?, ended_at = datetime('now') WHERE id = ?
        `).run(status, requestId);
        return { changes: res.changes };
    }
    setBuddyDestination(requestId, userId, choice, ctx) {
        const key = choice.trim().toLowerCase();
        let normalized = null;
        if (key === 'pending' || key === 'own_server' || key === 'study_hub' || key === 'independent') {
            normalized = key;
        }
        if (!normalized || normalized === 'pending')
            return { ok: false, reason: 'invalid_choice' };
        const res = (ctx?.db || this.db).prepare(`
            UPDATE buddy_requests SET destination = ?
            WHERE id = ? AND user_id = ? AND status = 'matched'
        `).run(normalized, requestId, userId);
        if (res.changes !== 1)
            return { ok: false, reason: 'no_active_match' };
        return { ok: true, choice: normalized };
    }
    getMatchDestinationState(myRequestId, userId, ctx) {
        const queryDb = ctx?.db || this.db;
        const mine = queryDb.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(myRequestId);
        if (!mine || mine.user_id !== userId || mine.status !== 'matched' || !mine.matched_user_id) {
            return { ok: false, reason: 'no_active_match' };
        }
        const partner = queryDb.prepare("SELECT * FROM buddy_requests WHERE user_id = ? AND matched_user_id = ? AND status = 'matched' ORDER BY id DESC LIMIT 1").get(mine.matched_user_id, userId);
        if (!partner) {
            return { ok: false, reason: 'no_active_match' };
        }
        const myChoice = mine.destination || 'pending';
        const partnerChoice = partner.destination || 'pending';
        const confirmed = myChoice !== 'pending' && myChoice === partnerChoice;
        return {
            ok: true,
            myChoice,
            partnerChoice,
            partnerId: mine.matched_user_id,
            partnerRequestId: partner.id,
            confirmed,
            confirmedChoice: confirmed ? myChoice : null,
        };
    }
    recordHubConsent(matchKey, requestId, userId, decision, ctx) {
        if (!matchKey || !/^\d+:\d+$/.test(matchKey))
            return { ok: false, reason: 'invalid_match' };
        let canonical = null;
        if (decision === 'accepted' || decision === 'accept')
            canonical = 'accepted';
        else if (decision === 'declined' || decision === 'decline')
            canonical = 'declined';
        if (!userId || !canonical)
            return { ok: false, reason: 'invalid_decision' };
        if (!Number.isInteger(Number(requestId)))
            return { ok: false, reason: 'invalid_match' };
        const res = (ctx?.db || this.db).prepare(`
            INSERT INTO buddy_hub_consents (match_key, request_id, user_id, decision, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(match_key, user_id) DO UPDATE SET
                decision = excluded.decision,
                request_id = excluded.request_id,
                updated_at = datetime('now')
        `).run(matchKey, Number(requestId), userId, canonical);
        return { ok: true, changed: res.changes === 1 };
    }
    getHubConsents(matchKey, ctx) {
        return (ctx?.db || this.db).prepare('SELECT * FROM buddy_hub_consents WHERE match_key = ?').all(matchKey);
    }
    clearHubConsents(matchKey, userId = null, ctx) {
        let res;
        if (userId) {
            res = (ctx?.db || this.db).prepare('DELETE FROM buddy_hub_consents WHERE match_key = ? AND user_id = ?').run(matchKey, userId);
        }
        else {
            res = (ctx?.db || this.db).prepare('DELETE FROM buddy_hub_consents WHERE match_key = ?').run(matchKey);
        }
        return { changes: res.changes };
    }
    claimHubInvite(matchKey, hubGuildId, ctx) {
        if (!matchKey || !/^\d+:\d+$/.test(matchKey) || !hubGuildId) {
            return { claimed: false, reason: 'invalid_match' };
        }
        const queryDb = ctx?.db || this.db;
        const res = queryDb.prepare(`
            INSERT OR IGNORE INTO buddy_hub_invites (match_key, hub_guild_id, status)
            VALUES (?, ?, 'pending')
        `).run(matchKey, hubGuildId);
        if (res.changes === 1) {
            return { claimed: true, isNew: true, row: this.getHubInvite(matchKey, ctx) };
        }
        const existing = this.getHubInvite(matchKey, ctx);
        if (existing && existing.status === 'sent') {
            return { claimed: false, existing, reason: 'already_sent' };
        }
        if (existing) {
            queryDb.prepare("UPDATE buddy_hub_invites SET hub_guild_id = ?, status = 'pending' WHERE match_key = ?")
                .run(hubGuildId, matchKey);
            return { claimed: true, isNew: false, row: this.getHubInvite(matchKey, ctx) };
        }
        return { claimed: false, reason: 'claim_failed' };
    }
    getHubInvite(matchKey, ctx) {
        return (ctx?.db || this.db).prepare('SELECT * FROM buddy_hub_invites WHERE match_key = ?').get(matchKey) || null;
    }
    markHubInviteSent(matchKey, url, code, ctx) {
        const res = (ctx?.db || this.db).prepare(`
            UPDATE buddy_hub_invites
            SET status = 'sent', invite_url = ?, invite_code = ?, sent_at = datetime('now')
            WHERE match_key = ?
        `).run(url || null, code || null, matchKey);
        return { changes: res.changes };
    }
    markHubInviteFailed(matchKey, ctx) {
        const res = (ctx?.db || this.db).prepare(`
            UPDATE buddy_hub_invites
            SET status = 'failed'
            WHERE match_key = ?
        `).run(matchKey);
        return { changes: res.changes };
    }
    isGlobalBuddyMatchingEnabled(guildId, ctx) {
        const settings = (ctx?.db || this.db).prepare('SELECT global_buddy_matching_enabled FROM guild_settings WHERE guild_id = ?').get(guildId);
        return settings ? Boolean(settings.global_buddy_matching_enabled) : false;
    }
    isStudyHubEnabled(guildId, ctx) {
        const settings = (ctx?.db || this.db).prepare('SELECT study_hub_enabled FROM guild_settings WHERE guild_id = ?').get(guildId);
        return settings ? Boolean(settings.study_hub_enabled) : false;
    }
    isStudyHubAcceptingGuests(guildId, ctx) {
        const settings = (ctx?.db || this.db).prepare('SELECT study_hub_accepts_guests FROM guild_settings WHERE guild_id = ?').get(guildId);
        return settings ? Boolean(settings.study_hub_accepts_guests) : false;
    }
    getEligibleStudyHubs(ctx) {
        const rows = (ctx?.db || this.db).prepare(`
            SELECT guild_id FROM guild_settings
            WHERE COALESCE(study_hub_enabled, 0) = 1
              AND COALESCE(study_hub_accepts_guests, 0) = 1
              AND COALESCE(global_buddy_matching_enabled, 0) = 1
            ORDER BY guild_id ASC
        `).all();
        return rows.map(r => r.guild_id);
    }
    isBuddyBlocked(userA, userB, ctx) {
        const row = (ctx?.db || this.db).prepare(`
            SELECT 1 FROM buddy_blocks
            WHERE (blocker_id = ? AND blocked_id = ?)
               OR (blocker_id = ? AND blocked_id = ?)
            LIMIT 1
        `).get(userA, userB, userB, userA);
        return Boolean(row);
    }
    blockBuddyUser(blockerId, blockedId, ctx) {
        if (!blockerId || !blockedId || blockerId === blockedId)
            return { created: false };
        const res = (ctx?.db || this.db).prepare(`
            INSERT OR IGNORE INTO buddy_blocks (blocker_id, blocked_id)
            VALUES (?, ?)
        `).run(blockerId, blockedId);
        return { created: res.changes === 1 };
    }
    isBuddyUnmatched(userA, userB, ctx) {
        const row = (ctx?.db || this.db).prepare(`
            SELECT 1 FROM buddy_unmatches
            WHERE (unmatcher_id = ? AND unmatched_id = ?)
               OR (unmatcher_id = ? AND unmatched_id = ?)
            LIMIT 1
        `).get(userA, userB, userB, userA);
        return Boolean(row);
    }
    hasBuddyMatchHistory(userA, userB, ctx) {
        const row = (ctx?.db || this.db).prepare(`
            SELECT 1 FROM buddy_requests
            WHERE ((user_id = ? AND matched_user_id = ?)
               OR (user_id = ? AND matched_user_id = ?))
              AND status IN ('matched', 'unmatched')
            LIMIT 1
        `).get(userA, userB, userB, userA);
        return Boolean(row);
    }
    createBuddyReport({ reporterId, reportedId, requestId = null, reason, description = null }, ctx) {
        const BUDDY_REPORT_REASONS = ['harassment', 'spam', 'inappropriate', 'fake', 'other'];
        const BUDDY_REPORT_REASON_ALIASES = {
            'suspicious': 'fake',
            'fake profile': 'fake',
            'fake-profile': 'fake',
            'fakeprofile': 'fake',
            'abuse': 'harassment',
            'inappropriate behavior': 'inappropriate',
            'inappropriate behaviour': 'inappropriate',
        };
        let normalized = null;
        if (typeof reason === 'string') {
            const key = reason.trim().toLowerCase();
            if (BUDDY_REPORT_REASONS.includes(key))
                normalized = key;
            else if (Object.prototype.hasOwnProperty.call(BUDDY_REPORT_REASON_ALIASES, key)) {
                normalized = BUDDY_REPORT_REASON_ALIASES[key];
            }
        }
        if (!normalized)
            return { ok: false, reason: 'invalid_reason' };
        if (!reporterId || !reportedId || reporterId === reportedId)
            return { ok: false, reason: 'self_report' };
        if (!this.hasBuddyMatchHistory(reporterId, reportedId, ctx))
            return { ok: false, reason: 'no_match_history' };
        const queryDb = ctx?.db || this.db;
        const dup = queryDb.prepare(`
            SELECT 1 FROM buddy_reports
            WHERE reporter_user_id = ? AND reported_user_id = ? AND status = 'open'
            LIMIT 1
        `).get(reporterId, reportedId);
        if (dup)
            return { ok: false, reason: 'duplicate_open' };
        if (this.countBuddyReportsToday(reporterId, ctx) >= 5) { // BUDDY_REPORT_DAILY_LIMIT = 5
            return { ok: false, reason: 'rate_limited' };
        }
        let storedRequestId = null;
        if (Number.isInteger(requestId)) {
            const req = queryDb.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(requestId);
            if (req && (req.user_id === reporterId || req.user_id === reportedId)) {
                storedRequestId = requestId;
            }
        }
        const cleanDescription = typeof description === 'string' && description.trim()
            ? description.trim().slice(0, 500)
            : null;
        try {
            const res = queryDb.prepare(`
                INSERT INTO buddy_reports (reporter_user_id, reported_user_id, request_id, reason, description)
                VALUES (?, ?, ?, ?, ?)
            `).run(reporterId, reportedId, storedRequestId, normalized, cleanDescription);
            return { ok: true, id: Number(res.lastInsertRowid), reason: normalized };
        }
        catch (_) {
            return { ok: false, reason: 'duplicate_open' };
        }
    }
    countBuddyReportsToday(reporterId, ctx) {
        const row = (ctx?.db || this.db).prepare(`
            SELECT COUNT(*) AS c FROM buddy_reports
            WHERE reporter_user_id = ? AND created_at >= datetime('now', '-24 hours')
        `).get(reporterId);
        return row ? Number(row.c) : 0;
    }
    countRecentBuddyRequests(userId, minutes, ctx) {
        const row = (ctx?.db || this.db).prepare(`
            SELECT COUNT(*) AS c FROM buddy_requests
            WHERE user_id = ? AND created_at >= datetime('now', '-' || ? || ' minutes')
        `).get(userId, minutes);
        return row ? Number(row.c) : 0;
    }
    recordBuddySwipe(swiperId, targetUserId, targetRequestId, action, ctx) {
        if (action !== 'like' && action !== 'pass')
            return { created: false };
        if (!swiperId || !targetUserId || swiperId === targetUserId)
            return { created: false };
        const res = (ctx?.db || this.db).prepare(`
            INSERT OR IGNORE INTO buddy_swipes (swiper_id, target_user_id, target_request_id, action)
            VALUES (?, ?, ?, ?)
        `).run(swiperId, targetUserId, targetRequestId, action);
        return { created: res.changes === 1 };
    }
    hasBuddyLiked(likerId, likedUserId, ctx) {
        const row = (ctx?.db || this.db).prepare(`
            SELECT 1 FROM buddy_swipes
            WHERE swiper_id = ? AND target_user_id = ? AND action = 'like'
            LIMIT 1
        `).get(likerId, likedUserId);
        return Boolean(row);
    }
    getBuddyActedUserIds(swiperId, ctx) {
        const rows = (ctx?.db || this.db).prepare(`
            SELECT DISTINCT target_user_id AS user_id FROM buddy_swipes
            WHERE swiper_id = ?
        `).all(swiperId);
        return rows.map(r => r.user_id);
    }
    buddyMatchScope(matchKey, ctx) {
        try {
            if (!matchKey || !/^\d+:\d+$/.test(matchKey))
                return null;
            const [a, b] = matchKey.split(':').map(Number);
            const rows = (ctx?.db || this.db).prepare('SELECT id, guild_id FROM buddy_requests WHERE id IN (?, ?)').all(a, b);
            if (rows.length !== 2)
                return null;
            return rows[0].guild_id === rows[1].guild_id ? 'local' : 'global';
        }
        catch (_) {
            return null;
        }
    }
    recordBuddyEvent(eventName, fields = {}, ctx) {
        const BUDDY_EVENT_NAMES = [
            'buddy_request_created', 'buddy_candidate_shown', 'buddy_like', 'buddy_pass',
            'buddy_block', 'buddy_match_created', 'buddy_unmatch', 'buddy_report',
            'buddy_destination_selected', 'buddy_destination_confirmed', 'buddy_hub_consent_accepted',
            'buddy_hub_consent_declined', 'buddy_hub_invite_sent', 'buddy_hub_invite_failed',
            'buddy_study_session_started', 'buddy_study_session_completed',
        ];
        const BUDDY_EVENT_SCOPES = ['local', 'global'];
        try {
            if (!BUDDY_EVENT_NAMES.includes(eventName))
                return false;
            const userId = fields.userId || null;
            const guildId = fields.guildId || null;
            const requestId = Number.isInteger(fields.requestId) ? fields.requestId : null;
            const matchKey = (typeof fields.matchKey === 'string' && /^\d+:\d+$/.test(fields.matchKey))
                ? fields.matchKey
                : null;
            const scope = BUDDY_EVENT_SCOPES.includes(fields.scope) ? fields.scope : null;
            (ctx?.db || this.db).prepare(`
                INSERT INTO buddy_analytics_events (event_name, user_id, guild_id, request_id, match_key, scope)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(eventName, userId, guildId, requestId, matchKey, scope);
            return true;
        }
        catch (_) {
            return false;
        }
    }
    getBuddyFunnelStats({ days = 7, guildId = null } = {}, ctx) {
        const queryDb = ctx?.db || this.db;
        const safeDays = [0, 1, 7, 30].includes(Number(days)) ? Number(days) : 7;
        const since = safeDays > 0 ? `datetime('now', '-${safeDays} days')` : null;
        const timeFilter = since ? `AND created_at >= ${since}` : '';
        const guildFilter = guildId ? 'AND guild_id = ?' : '';
        const params = guildId ? [guildId] : [];
        const count = (name, extra = '', extraParams = []) => queryDb.prepare(`
            SELECT COUNT(*) AS c FROM buddy_analytics_events
            WHERE event_name = ? ${timeFilter} ${guildFilter} ${extra}
        `).get(name, ...params, ...extraParams).c;
        const distinctUsers = (name) => queryDb.prepare(`
            SELECT COUNT(DISTINCT user_id) AS c FROM buddy_analytics_events
            WHERE event_name = ? AND user_id IS NOT NULL ${timeFilter} ${guildFilter}
        `).get(name, ...params).c;
        const scopeCount = (name, scope) => queryDb.prepare(`
            SELECT COUNT(*) AS c FROM buddy_analytics_events
            WHERE event_name = ? AND scope = ? ${timeFilter} ${guildFilter}
        `).get(name, scope, ...params).c;
        const BUDDY_EVENT_NAMES = [
            'buddy_request_created', 'buddy_candidate_shown', 'buddy_like', 'buddy_pass',
            'buddy_block', 'buddy_match_created', 'buddy_unmatch', 'buddy_report',
            'buddy_destination_selected', 'buddy_destination_confirmed', 'buddy_hub_consent_accepted',
            'buddy_hub_consent_declined', 'buddy_hub_invite_sent', 'buddy_hub_invite_failed',
            'buddy_study_session_started', 'buddy_study_session_completed',
        ];
        const byName = {};
        for (const name of BUDDY_EVENT_NAMES) {
            byName[name] = count(name);
        }
        const requests = byName.buddy_request_created;
        const requestingUsers = distinctUsers('buddy_request_created');
        const candidatesShown = byName.buddy_candidate_shown;
        const likes = byName.buddy_like;
        const passes = byName.buddy_pass;
        const blocks = byName.buddy_block;
        const matches = byName.buddy_match_created;
        const matchedUsers = distinctUsers('buddy_match_created');
        const localMatches = scopeCount('buddy_match_created', 'local');
        const globalMatches = scopeCount('buddy_match_created', 'global');
        const destinationsSelected = byName.buddy_destination_selected;
        const destinationsConfirmed = byName.buddy_destination_confirmed;
        const consentsAccepted = byName.buddy_hub_consent_accepted;
        const consentsDeclined = byName.buddy_hub_consent_declined;
        const invitesSent = byName.buddy_hub_invite_sent;
        const invitesFailed = byName.buddy_hub_invite_failed;
        const sessionsStarted = byName.buddy_study_session_started;
        const sessionsCompleted = byName.buddy_study_session_completed;
        const repeatUsers = (() => {
            const row = queryDb.prepare(`
                SELECT COUNT(*) AS c FROM (
                    SELECT user_id FROM buddy_analytics_events
                    WHERE event_name = 'buddy_request_created' AND user_id IS NOT NULL
                    ${timeFilter} ${guildFilter}
                    GROUP BY user_id HAVING COUNT(*) >= 2
                )
            `).get(...params);
            return row ? row.c : 0;
        })();
        const rate = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
        return {
            window: { days: safeDays, guildId: guildId || null },
            requests, requestingUsers, candidatesShown, likes, passes, blocks,
            matches, matchedUsers, localMatches, globalMatches, destinationsSelected,
            destinationsConfirmed, consentsAccepted, consentsDeclined, invitesSent,
            invitesFailed, sessionsStarted, sessionsCompleted, repeatUsers,
            rates: {
                likeRate: rate(likes, candidatesShown),
                passRate: rate(passes, candidatesShown),
                blockRate: rate(blocks, candidatesShown),
                matchRate: rate(matches, likes),
                destinationRate: rate(destinationsSelected, matches),
                confirmRate: rate(destinationsConfirmed, destinationsSelected),
                consentRate: rate(consentsAccepted, consentsAccepted + consentsDeclined),
                inviteSuccessRate: rate(invitesSent, invitesSent + invitesFailed),
                sessionConversion: rate(sessionsStarted, matches),
                completionRate: rate(sessionsCompleted, sessionsStarted),
                globalShare: rate(globalMatches, matches),
            },
        };
    }
}
exports.SqlitePomoMatchRepository = SqlitePomoMatchRepository;
