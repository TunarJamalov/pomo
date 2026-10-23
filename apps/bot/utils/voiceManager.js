const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const {
    db,
    getOrCreateUser,
    updateUser,
    incrementUser,
    getVoiceSettings,
    createVoiceSession,
    getActiveVoiceSession,
    getActiveVoiceSessions,
    touchVoiceSession,
    completeVoiceSession,
    getVoiceRewardedMinutesForDay,
    getVoiceCreditedMinutesForDay,
    getActivePet,
    awardPetXP,
    getUserClan,
    addClanXP,
    updateGuildScore,
    recordGuildFocusProgress,
    recordActivityReward,
    getOrCreateGuildSettings,
    getOrCreateSettings,
} = require('./database');
const {
    Colors,
    Pets,
    petBuffMultiplier,
    waterForMinutes,
    xpForMinutes,
    xpForLevel,
    VOICE_FOCUS_DAILY_CAP_MINUTES,
} = require('./constants');
const { checkStudyAchievements } = require('./achievementChecker');
const { formatTime } = require('./embeds');
const { addGoalProgress } = require('./goalManager');
const { normalizeLanguage, t } = require('./i18n');
const { applyStudyStreak, recordSessionActivity } = require('./studyStreak');
const { applyWaterDoubler } = require('./rewardBoosts');
const { stopLofi, isPlayingLofi } = require('./audioPlayer');

const HEARTBEAT_MS = 5 * 60 * 1000;
let heartbeat = null;

async function handleVoiceStateUpdate(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user?.bot) return;
    if (oldState.channelId === newState.channelId) return;

    const guild = newState.guild || oldState.guild;
    const settings = getVoiceSettings(guild.id);
    const oldTracked = isTrackedVoiceChannel(guild, oldState.channelId, settings);
    const newTracked = isTrackedVoiceChannel(guild, newState.channelId, settings);

    if (oldTracked && !newTracked) {
        await finishVoiceSession(guild.client, member.id, guild.id, {
            endReason: newState.channelId ? 'moved_channel' : 'left_channel',
        });
    }

    if (!oldTracked && newTracked) {
        startVoiceSession(member.id, guild.id, newState.channelId);
    }

    if (oldTracked && newTracked) {
        const active = getActiveVoiceSession(member.id, guild.id);
        if (active) {
            db.prepare(`
                UPDATE voice_sessions
                SET channel_id = ?, last_seen_at = datetime('now')
                WHERE id = ? AND status = 'active'
            `).run(newState.channelId, active.id);
        } else {
            startVoiceSession(member.id, guild.id, newState.channelId);
        }
    }

    await handleStudyRooms(guild, member, oldState, newState);

    // Lofi Auto-Leave: if bot is now alone in a voice channel, stop radio after 60s
    if (oldState.channelId && isPlayingLofi(guild.id)) {
        try {
            const botVoiceChannel = guild.members.me?.voice?.channel;
            if (botVoiceChannel) {
                const humanCount = botVoiceChannel.members.filter(m => !m.user.bot).size;
                if (humanCount === 0) {
                    console.log(`[AUDIO] Bot is alone in ${guild.id}, stopping lofi in 60s...`);
                    setTimeout(() => {
                        // Re-check so we don't stop if someone rejoined
                        const stillAlone = botVoiceChannel.members.filter(m => !m.user.bot).size === 0;
                        if (stillAlone && isPlayingLofi(guild.id)) {
                            stopLofi(guild.id);
                            console.log(`[AUDIO] Auto-stopped lofi in ${guild.id} (channel empty).`);
                        }
                    }, 60_000);
                }
            }
        } catch (e) {
            // Ignore
        }
    }
}

function startVoiceSession(userId, guildId, channelId) {
    const settings = getVoiceSettings(guildId);
    if (!settings.voice_tracking_enabled) return null;
    return createVoiceSession(userId, guildId, channelId);
}

async function finishVoiceSession(client, userId, guildId, options = {}) {
    const session = getActiveVoiceSession(userId, guildId);
    if (!session) return null;

    const settings = getVoiceSettings(guildId);
    const endedAt = options.endedAt || toSqliteDate(new Date());
    const totalMinutes = Math.max(0, Math.floor(
        (parseSqliteDate(endedAt).getTime() - parseSqliteDate(session.started_at).getTime()) / 60000
    ));
    const minMinutes = Math.max(1, settings.voice_min_minutes || 10);

    if (totalMinutes < minMinutes) {
        completeVoiceSession(session.id, {
            endedAt,
            totalMinutes,
            creditedMinutes: 0,
            rewardedMinutes: 0,
            waterReward: 0,
            xpReward: 0,
            status: 'discarded',
            endReason: options.endReason || 'below_minimum',
        });
        if (options.notify !== false) {
            await sendShortSessionHint(client, userId, guildId, totalMinutes, minMinutes, settings);
        }
        return { totalMinutes, creditedMinutes: 0, rewardedMinutes: 0, discarded: true };
    }

    const overlapMinutes = getOverlappingTimerMinutes(userId, session.started_at, endedAt);
    const today = endedAt.slice(0, 10);
    // Focus minutes (leaderboards, goals, clans) are capped per day too
    const creditedToday = getVoiceCreditedMinutesForDay(userId, today);
    const creditedMinutes = Math.min(
        Math.max(0, totalMinutes - overlapMinutes),
        Math.max(0, VOICE_FOCUS_DAILY_CAP_MINUTES - creditedToday),
    );
    const alreadyRewarded = getVoiceRewardedMinutesForDay(userId, today);
    const dailyCap = Math.max(0, settings.voice_daily_reward_cap ?? 240);
    const remainingCap = Math.max(0, dailyCap - alreadyRewarded);
    const rewardBaseMinutes = settings.voice_rewards_enabled
        ? Math.min(creditedMinutes, remainingCap)
        : 0;
    const rewardedMinutes = Math.floor(rewardBaseMinutes / 25) * 25;

    const rewards = awardVoiceFocus(userId, guildId, creditedMinutes, rewardedMinutes, session.started_at);

    completeVoiceSession(session.id, {
        endedAt,
        totalMinutes,
        creditedMinutes,
        rewardedMinutes,
        waterReward: rewards.water,
        xpReward: rewards.xp,
        status: 'completed',
        endReason: options.endReason || 'left_channel',
    });

    if (creditedMinutes > 0) {
        await addGoalProgress(client, {
            guildId,
            userId,
            minutes: creditedMinutes,
            sourceType: 'voice',
            sourceId: session.id,
        });

        recordGuildFocusProgress({
            guildId,
            minutes: creditedMinutes,
            sourceType: 'voice',
            sourceId: session.id,
        });
    }

    // /voice dms off: the server asked for no DMs after voice sessions (summary or quests)
    const serverAllowsDms = getVoiceSettings(guildId)?.voice_summary_dm !== 0;

    if (options.notify !== false && serverAllowsDms) {
        await sendVoiceSummary(client, userId, {
            guildId,
            totalMinutes,
            creditedMinutes,
            overlapMinutes,
            rewardedMinutes,
            ...rewards,
        });
    }

    if (creditedMinutes > 0 && serverAllowsDms) {
        const { checkAndNotifyQuests } = require('../commands/quests');
        const { getGuildLanguage } = require('./i18n');
        const language = getGuildLanguage(guildId);
        const channel = await client?.users?.createDM(userId).catch(() => null);
        if (channel) {
            await checkAndNotifyQuests(client, userId, language, channel);
        }
    }

    return {
        totalMinutes,
        creditedMinutes,
        overlapMinutes,
        rewardedMinutes,
        ...rewards,
    };
}

/**
 * A room the bot created for a member: inside the study-room category, not the
 * trigger, and carrying the bot's own permission overwrite. Only these are ever
 * deleted, so admins' own channels (even ones named with 🔴) are never touched.
 */
function isBotStudyRoom(channel, settings, botId) {
    return Boolean(
        channel
        && channel.type === ChannelType.GuildVoice
        && settings?.studyroom_category_id
        && channel.parentId === settings.studyroom_category_id
        && channel.id !== settings.studyroom_trigger_id
        && channel.permissionOverwrites.cache.has(botId)
    );
}

// Missing permissions repeat on every join, so warn per guild/member at most this often
const STUDY_ROOM_LOG_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const STUDY_ROOM_DM_COOLDOWN_MS = 60 * 60 * 1000;
const studyRoomWarnedAt = new Map();

function shouldWarn(key, cooldownMs) {
    const last = studyRoomWarnedAt.get(key) || 0;
    if (Date.now() - last < cooldownMs) return false;
    studyRoomWarnedAt.set(key, Date.now());
    return true;
}

async function reportStudyRoomFailure(guild, member, err) {
    const missingPermissions = err?.code === 50013 || /Missing Permissions/i.test(err?.message || '');
    if (shouldWarn(`log:${guild.id}`, STUDY_ROOM_LOG_COOLDOWN_MS)) {
        console.warn(`[VOICE] Study room setup failed in guild ${guild.id}: ${err.message}`);
    }
    if (!missingPermissions || !shouldWarn(`dm:${guild.id}:${member.id}`, STUDY_ROOM_DM_COOLDOWN_MS)) return;

    const { getGuildLanguage } = require('./i18n');
    const language = getGuildLanguage(guild.id, 'en');
    await member.send({
        embeds: [new EmbedBuilder()
            .setColor(Colors.WARNING)
            .setTitle(t(language, 'studyRoomNoPermissionTitle'))
            .setDescription(t(language, 'studyRoomNoPermissionBody', { server: guild.name }))],
    }).catch(() => {});
}

async function handleStudyRooms(guild, member, oldState, newState) {
    const settings = getOrCreateGuildSettings(guild.id);
    const botId = guild.members.me?.id;
    if (!botId || !settings?.studyroom_category_id) return;

    // Clean up the room the member just left once it is empty
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        try {
            const oldChannel = await guild.channels.fetch(oldState.channelId).catch(() => null);
            if (isBotStudyRoom(oldChannel, settings, botId) && oldChannel.members.size === 0) {
                await oldChannel.delete('Dynamic study room became empty');
            }
        } catch (_) { /* already deleted */ }
    }

    // Joining the trigger channel (from anywhere) opens the member's own room and moves them there
    const triggerId = settings.studyroom_trigger_id;
    if (!triggerId || newState.channelId !== triggerId || oldState.channelId === triggerId) return;

    try {
        const isOwnRoom = c => isBotStudyRoom(c, settings, botId)
            && c.permissionOverwrites.cache.get(member.id)?.allow.has(PermissionFlagsBits.ManageChannels);
        let room = guild.channels.cache.find(isOwnRoom);
        if (!room) {
            const rooms = await guild.channels.fetch().catch(() => null);
            room = rooms?.find(c => c && isOwnRoom(c)) || null;
        }

        if (!room) {
            room = await guild.channels.create({
                name: `🔴 ${member.user.username}'s Room`,
                type: ChannelType.GuildVoice,
                parent: settings.studyroom_category_id,
                permissionOverwrites: [
                    { id: guild.id, allow: [], deny: [PermissionFlagsBits.Connect] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.MoveMembers] },
                    { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
                ],
            });
            console.log(`[VOICE] Auto-created study room ${room.id} for ${member.id}`);
        }

        await member.voice.setChannel(room, 'Join-to-create study room').catch(err => {
            console.warn(`[VOICE] Could not move ${member.id} into study room in guild ${guild.id}: ${err.message}`);
        });

        // If the move failed (e.g. missing Move Members), don't leave an empty room behind
        const roomId = room.id;
        setTimeout(async () => {
            try {
                const c = await guild.channels.fetch(roomId).catch(() => null);
                if (isBotStudyRoom(c, settings, botId) && c.members.size === 0) {
                    await c.delete('Study room was empty for 5 minutes');
                }
            } catch (_) {}
        }, 5 * 60 * 1000);
    } catch (err) {
        await reportStudyRoomFailure(guild, member, err);
    }
}

function awardVoiceFocus(userId, guildId, creditedMinutes, rewardedMinutes, startedAt) {
    if (creditedMinutes <= 0) return { water: 0, xp: 0, leveledUp: false };

    const user = getOrCreateUser(userId);
    let water = waterForMinutes(rewardedMinutes);
    let xp = xpForMinutes(rewardedMinutes);
    const activePet = getActivePet(userId);

    // Pro 2x water applies to voice too; boost items are not auto-spent here
    if (water > 0) water = applyWaterDoubler(userId, water, { allowItem: false }).water;

    let snackBuffText = '';
    const now = new Date();
    if (user.active_buff_type && user.buff_expires_at && new Date(user.buff_expires_at) > now) {
        if (user.active_buff_type === 'water_boost') {
            const bonus = Math.max(1, Math.floor(water * user.active_buff_value));
            water += bonus;
            snackBuffText = ` (+${bonus} 💧 from Snack Buff)`;
        } else if (user.active_buff_type === 'xp_boost') {
            const bonus = Math.max(1, Math.floor(xp * user.active_buff_value));
            xp += bonus;
            snackBuffText = ` (+${bonus} ✨ XP from Snack Buff)`;
        }
    } else if (user.active_buff_type && user.buff_expires_at && new Date(user.buff_expires_at) <= now) {
        updateUser(userId, { active_buff_type: null, active_buff_value: 0, buff_expires_at: null });
    }

    if (activePet && rewardedMinutes > 0) {
        const petInfo = Pets[activePet.pet_key];
        if (petInfo) {
            const levelMultiplier = petBuffMultiplier(activePet);
            if (petInfo.buffType === 'xp_boost') {
                xp += Math.floor(xp * levelMultiplier);
            } else if (petInfo.buffType === 'water_boost') {
                water += Math.max(1, Math.floor(water * levelMultiplier));
            }
        }
    }

    incrementUser(userId, 'total_focus_minutes', creditedMinutes);
    incrementUser(userId, 'total_sessions', 1);
    if (water > 0) incrementUser(userId, 'water', water);
    if (xp > 0) incrementUser(userId, 'xp', xp);

    const guildName = db.prepare('SELECT guild_name FROM guild_settings WHERE guild_id = ?').get(guildId)?.guild_name;
    updateGuildScore(guildId, guildName || null, creditedMinutes);

    const clan = getUserClan(userId);
    if (clan) {
        addClanXP(clan.id, creditedMinutes, xp);
        try {
            require('./clanExpeditions').addFocusMinutesToExpedition(userId, clan.id, creditedMinutes);
        } catch (err) { console.error('[VOICE] Expedition progress failed:', err.message); }
    }

    // Update challenge progress (voice has no text channel to announce in;
    // completions still show on /challenge leaderboard)
    try {
        require('./challenges').recordChallengeFocus({ userId, guildId, minutes: creditedMinutes });
    } catch (err) { console.error('[VOICE] Challenge progress failed:', err.message); }

    const { streak } = applyStudyStreak(userId, user, activePet);
    recordSessionActivity(userId);
    const updated = getOrCreateUser(userId);
    let newLevel = updated.level;
    while (updated.xp >= xpForLevel(newLevel)) newLevel++;
    const leveledUp = newLevel > updated.level;
    if (leveledUp) updateUser(userId, { level: newLevel });

    let petXpToAward = xp;
    if (user.active_buff_type === 'pet_xp_boost' && user.buff_expires_at && new Date(user.buff_expires_at) > now) {
        const petBonus = Math.max(1, Math.floor(petXpToAward * user.active_buff_value));
        petXpToAward += petBonus;
    }
    if (xp > 0) awardPetXP(userId, petXpToAward);

    recordActivityReward(userId, {
        sourceType: 'voice',
        sourceId: null,
        title: 'Voice Study',
        minutes: creditedMinutes,
        water,
        xp,
        streak,
        level: newLevel,
        leveledUp,
    });

    try {
        checkStudyAchievements(userId, creditedMinutes, parseSqliteDate(startedAt).getUTCHours());
    } catch (err) {
        console.error(`[VOICE] Achievement check failed for ${userId}:`, err.message);
    }

    return { water, xp, leveledUp, newLevel, streak };
}


function getOverlappingTimerMinutes(userId, voiceStart, voiceEnd) {
    const ranges = [];
    const soloRows = db.prepare(`
        SELECT started_at,
               COALESCE(ends_at, datetime(started_at, '+' || duration || ' minutes')) as ended_at
        FROM study_sessions
        WHERE user_id = ?
          AND title != '__break__'
          AND datetime(started_at) < datetime(?)
          AND datetime(COALESCE(ends_at, datetime(started_at, '+' || duration || ' minutes'))) > datetime(?)
    `).all(userId, voiceEnd, voiceStart);

    const teamRows = db.prepare(`
        SELECT ts.started_at,
               COALESCE(ts.ends_at, datetime(ts.started_at, '+' || ts.duration || ' minutes')) as ended_at
        FROM team_members tm
        JOIN team_sessions ts ON tm.session_id = ts.id
        WHERE tm.user_id = ?
          AND ts.status IN ('active', 'completed', 'break')
          AND datetime(ts.started_at) < datetime(?)
          AND datetime(COALESCE(ts.ends_at, datetime(ts.started_at, '+' || ts.duration || ' minutes'))) > datetime(?)
    `).all(userId, voiceEnd, voiceStart);

    for (const row of [...soloRows, ...teamRows]) {
        const start = Math.max(parseSqliteDate(row.started_at).getTime(), parseSqliteDate(voiceStart).getTime());
        const end = Math.min(parseSqliteDate(row.ended_at).getTime(), parseSqliteDate(voiceEnd).getTime());
        if (end > start) ranges.push([start, end]);
    }

    if (ranges.length === 0) return 0;
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0]];
    for (const range of ranges.slice(1)) {
        const last = merged[merged.length - 1];
        if (range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
        else merged.push(range);
    }

    const overlapMs = merged.reduce((sum, [start, end]) => sum + (end - start), 0);
    return Math.ceil(overlapMs / 60000);
}

function isTrackedVoiceChannel(guild, channelId, settings = getVoiceSettings(guild.id)) {
    if (!settings.voice_tracking_enabled || !channelId) return false;
    if (guild.afkChannelId && channelId === guild.afkChannelId) return false;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return false;
    // Quick Setup tracks every voice channel in the server (except AFK above)
    if (settings.voice_target_type === 'all') return true;
    if (settings.voice_target_type === 'category') {
        return channel.parentId === settings.voice_target_id;
    }
    return channelId === settings.voice_target_id;
}

async function recoverVoiceSessions(client) {
    const sessions = getActiveVoiceSessions();
    let resumed = 0;
    let closed = 0;

    for (const session of sessions) {
        const guild = await client.guilds.fetch(session.guild_id).catch(() => null);
        const member = guild
            ? await guild.members.fetch(session.user_id).catch(() => null)
            : null;
        const settings = guild ? getVoiceSettings(guild.id) : null;
        const channelId = member?.voice?.channelId;

        if (guild && channelId && isTrackedVoiceChannel(guild, channelId, settings)) {
            touchVoiceSession(session.id);
            resumed++;
        } else {
            await finishVoiceSession(client, session.user_id, session.guild_id, {
                endedAt: session.last_seen_at || session.started_at,
                endReason: 'recovery_closed',
                notify: false,
            });
            closed++;
        }
    }

    for (const guild of client.guilds.cache.values()) {
        const settings = getVoiceSettings(guild.id);
        if (!settings.voice_tracking_enabled) continue;
        for (const state of guild.voiceStates.cache.values()) {
            if (!state.member?.user?.bot && isTrackedVoiceChannel(guild, state.channelId, settings)) {
                startVoiceSession(state.member.id, guild.id, state.channelId);
            }
        }
    }

    startVoiceHeartbeat(client);
    console.log(`[VOICE] Recovered ${resumed} active session(s), closed ${closed} stale session(s).`);
}

function startVoiceHeartbeat(client) {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = setInterval(async () => {
        for (const session of getActiveVoiceSessions()) {
            const guild = client.guilds.cache.get(session.guild_id)
                || await client.guilds.fetch(session.guild_id).catch(() => null);
            const member = guild
                ? guild.members.cache.get(session.user_id)
                    || await guild.members.fetch(session.user_id).catch(() => null)
                : null;
            const settings = guild ? getVoiceSettings(guild.id) : null;

            if (guild && member?.voice?.channelId && isTrackedVoiceChannel(guild, member.voice.channelId, settings)) {
                touchVoiceSession(session.id);
            } else {
                await finishVoiceSession(client, session.user_id, session.guild_id, {
                    endedAt: session.last_seen_at || toSqliteDate(new Date()),
                    endReason: 'heartbeat_closed',
                    notify: false,
                });
            }
        }
    }, HEARTBEAT_MS);
}

const SHORT_HINT_MIN_MINUTES = 2;

/**
 * Someone left a tracked voice channel before the minimum and has never earned
 * anything from Pomo: tell them once how voice tracking counts, instead of a
 * silent nothing. Skips people passing through, regulars, servers that turned
 * voice DMs off and members who turned notifications off.
 */
async function sendShortSessionHint(client, userId, guildId, totalMinutes, minMinutes, settings) {
    if (totalMinutes < SHORT_HINT_MIN_MINUTES || !client?.users) return;
    if (settings?.voice_summary_dm === 0) return;
    const prefs = db.prepare('SELECT reminders_enabled FROM settings WHERE user_id = ?').get(userId);
    if (prefs && prefs.reminders_enabled === 0) return;
    if (db.prepare('SELECT 1 FROM activity_rewards WHERE user_id = ? LIMIT 1').get(userId)) return;
    if (!require('./database').markOnboardingTipShown(userId, 'voice_short')) return;

    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;
    const language = getGuildLanguage(guildId);
    await user.send(t(language, 'voiceShortSessionHint', { minutes: totalMinutes, min: minMinutes })).catch(() => {});
}

async function sendVoiceSummary(client, userId, result) {
    // /settings notifications off turns reminders_enabled off: no summary DMs then
    const prefs = getOrCreateSettings(userId);
    if (prefs && prefs.reminders_enabled === 0) return;
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;
    const language = getGuildLanguage(result.guildId);

    let description =
        `${t(language, 'trackedLabel')}: **${formatTime(result.totalMinutes)}**\n` +
        `${t(language, 'creditedFocusLabel')}: **${formatTime(result.creditedMinutes)}**`;

    if (result.overlapMinutes > 0) {
        description += `\n${t(language, 'timerOverlapRemovedLabel')}: **${formatTime(result.overlapMinutes)}**`;
    }
    if (result.rewardedMinutes > 0) {
        description += `\n\n${t(language, 'voiceRewards', { water: result.water, xp: result.xp })}`;
    } else {
        description += `\n\n${t(language, 'voiceNoReward')}`;
    }
    if (result.leveledUp) description += `\n${t(language, 'levelUpLabel')}: **${result.newLevel}**`;

    // A counted session: show the streak and what to do next, like the timer's card
    const counted = result.creditedMinutes > 0;
    if (counted && result.streak) {
        description += `\n\n${t(language, 'voiceStreakLine', { streak: result.streak, next: result.streak + 1 })}`;
    }
    // Voice-only members never ran a command, so they never saw what water is for
    if (counted && require('./database').markOnboardingTipShown(userId, 'voice_first')) {
        description += `\n\n${t(language, 'voiceFirstSessionTip')}`;
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle(t(language, 'voiceStudyCompleteTitle'))
        .setDescription(description)
        .setTimestamp();
    const components = counted
        ? [require('./nextSteps').buildNextStepsRow({ user_id: userId }, language, { again: false })]
        : [];

    await user.send({ embeds: [embed], components }).catch(() => {});
}

function getGuildLanguage(guildId) {
    if (!guildId) return 'en';
    try {
        const settings = getOrCreateGuildSettings(guildId);
        return normalizeLanguage(settings.language || 'en');
    } catch {
        return 'en';
    }
}

function parseSqliteDate(value) {
    if (!value) return new Date(0);
    return new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}

function toSqliteDate(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = {
    handleVoiceStateUpdate,
    startVoiceSession,
    finishVoiceSession,
    isTrackedVoiceChannel,
    getOverlappingTimerMinutes,
    recoverVoiceSessions,
    parseSqliteDate,
    toSqliteDate,
    reportStudyRoomFailure,
};
