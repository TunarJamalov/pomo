
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { Colors, waterForMinutes, xpForMinutes, xpForLevel, Pets, petBuffMultiplier, Relics, Plants } = require('../constants');
const { studyEmbed, successEmbed, infoEmbed, progressBar, formatTime } = require('../embeds');
const {
    db,
    getOrCreateUser,
    updateUser,
    incrementUser,
    getPremiumEntitlement,
    getActivePet,
    getUserClan,
    addClanXP,
    awardPetXP,
    completeSession,
    addFocusMinutesToTodo,
    getOrCreateSettings,
    getOrCreateGuildSettings,
    recordGuildFocusProgress,
    recordActivityReward,
    getOrCreateProProfileSettings,
} = require('../database');
const { generateSessionEndCard } = require('../canvas');
const { isFullPro } = require('../premiumManager');
const { applyStudyStreak, recordSessionActivity } = require('../studyStreak');
const { applyWaterDoubler } = require('../rewardBoosts');
const { getTimeZoneParts } = require('../timezone');
const { addGoalProgress } = require('../goalManager');
const { checkStudyAchievements } = require('../achievementChecker');
const { addFocusMinutesToExpedition } = require('../clanExpeditions');
const { t } = require('../i18n');


// Extra injected dependencies will be attached to module exports or passed as args.
// We will pass deps = { clearTimers, parseUTC, startBreakTimer, getSessionLanguage } as the 3rd argument.

async function handleSessionComplete(client, session, deps) {
    const { clearTimers, parseUTC, startBreakTimer, getSessionLanguage } = deps;
    try {
        clearTimers(session.id);
        // Several timers/recovery paths can fire for one session; only the first one rewards
        if (completeSession(session.id) === false) return;

        const user = getOrCreateUser(session.user_id);
        const minutes = session.duration;
        const language = getSessionLanguage(session);
        const sessionTitle = session.title || t(language, 'studySession');
        const linkedTodo = session.todo_id
            ? addFocusMinutesToTodo(session.user_id, session.todo_id, minutes)
            : null;

        // Calculate base rewards
        let waterAwarded = waterForMinutes(minutes);
        let xpAwarded = xpForMinutes(minutes);

        // ── Marathon bonus: base rewards move in 25-min blocks, so 101–124 min
        // would otherwise pay the same as 100 min. Sessions of 110+ min go
        // beyond that and earn a flat bonus (applied before %-based buffs).
        let marathonBonusText = '';
        if (minutes >= 110) {
            waterAwarded += 1;
            xpAwarded += 10;
            marathonBonusText = `\n🏁 ${t(language, 'sessionBonusMarathon', { minutes })}`;
        }

        // 2x water: boost item first, otherwise Pro (shared with team/voice)
        const { db, getActivePet } = require('../database');
        const doubled = applyWaterDoubler(session.user_id, waterAwarded);
        waterAwarded = doubled.water;
        const boostText = doubled.source === 'item' ? ` (${t(language, 'sessionBonusItemBoost')})`
            : doubled.source === 'premium' ? ` (\u2b50 ${t(language, 'sessionBonusPremiumBoost')})` : '';

        // ── Snack Buffs ───────────────────────────────────────────────
        let snackBuffText = '';
        const now = new Date();
        if (user.active_buff_type && user.buff_expires_at && new Date(user.buff_expires_at) > now) {
            if (user.active_buff_type === 'water_boost') {
                const bonus = Math.max(1, Math.floor(waterAwarded * user.active_buff_value));
                waterAwarded += bonus;
                snackBuffText = `\n🍲 ${t(language, 'sessionBonusSnackWater', { amount: bonus })}`;
            } else if (user.active_buff_type === 'xp_boost') {
                const bonus = Math.max(1, Math.floor(xpAwarded * user.active_buff_value));
                xpAwarded += bonus;
                snackBuffText = `\n🍲 ${t(language, 'sessionBonusSnackXp', { amount: bonus })}`;
            }
        }

        // ── Clan Tree Buff ────────────────────────────────────────────
        let clanBuffText = '';
        const userClan = getUserClan(session.user_id);
        if (userClan && userClan.tree_level > 1) {
            const treeMultiplier = (userClan.tree_level - 1) * 0.01; // +1% per level beyond Lv1
            const waterBonus = Math.floor(waterAwarded * treeMultiplier);
            const xpBonus = Math.floor(xpAwarded * treeMultiplier);
            
            if (waterBonus > 0 || xpBonus > 0) {
                waterAwarded += waterBonus;
                xpAwarded += xpBonus;
                clanBuffText = `\n🌳 ${t(language, 'sessionBonusClanTree', { level: userClan.tree_level, water: waterBonus, xp: xpBonus })}`;
            }
        } else if (user.active_buff_type && user.buff_expires_at && new Date(user.buff_expires_at) <= now) {
            // Expired buff, clear it
            updateUser(session.user_id, { active_buff_type: null, active_buff_value: 0, buff_expires_at: null });
        }

        // ── Pet Buffs ─────────────────────────────────────────────────
        const activePet = getActivePet(session.user_id);
        let petRewardText = '';
        let specialText = '';

        if (activePet) {
            const pInfo = Pets[activePet.pet_key];
            const levelMult = petBuffMultiplier(activePet);

            // Base rarity-scaled buff
            if (pInfo.buffType === 'xp_boost') {
                const bonus = Math.floor(xpAwarded * levelMult);
                xpAwarded += bonus;
                petRewardText = ` (+${bonus} XP) ${pInfo.emoji}`;
            } else if (pInfo.buffType === 'water_boost') {
                const bonus = Math.max(1, Math.floor(waterAwarded * levelMult));
                waterAwarded += bonus;
                petRewardText = ` (+${bonus} 💧) ${pInfo.emoji}`;
            }

            // ── Unique specials ──────────────────────────────────────────

            // Coffee Spirit: every 5th session +3 water
            if (pInfo.special === 'fifth_session_bonus') {
                const updatedSessions = (user.total_sessions ?? 0) + 1; // +1 because we haven't incremented yet
                if (updatedSessions % 5 === 0) {
                    waterAwarded += 3;
                    specialText += `\n☕ ${t(language, 'sessionBonusCaffeineSurge', { count: updatedSessions })}`;
                }
            }

            // Book of Time: full 100-min session +15 XP bonus
            if (pInfo.special === 'long_session_bonus' && minutes >= 100) {
                xpAwarded += 15;
                specialText += `\n📖 ${t(language, 'sessionBonusTimeMaster')}`;
            }

            // Alien Student: 15% chance to double all water
            if (pInfo.special === 'double_water_chance' && Math.random() < 0.15) {
                waterAwarded *= 2;
                specialText += `\n👽 ${t(language, 'sessionBonusCosmicLuck')}`;
            }
        }

        // ── Mushroom Relic Buff ───────────────────────────────────────
        let mushroomBuffText = '';
        const mushroomRelic = Relics.mushroom;
        const hasMushroom = db.prepare('SELECT id FROM inventory WHERE user_id = ? AND item_key = ? AND quantity > 0')
            .get(session.user_id, 'mushroom');
        if (hasMushroom) {
            const waterBonus = Math.max(1, Math.floor(waterAwarded * mushroomRelic.buffValue));
            const xpBonus = Math.max(1, Math.floor(xpAwarded * mushroomRelic.buffValue));
            waterAwarded += waterBonus;
            xpAwarded += xpBonus;
            mushroomBuffText = `\n🍄 ${t(language, 'sessionBonusLuckyMushroom', { water: waterBonus, xp: xpBonus })}`;
        }
        // --- PERSONA PASSIVE BONUSES ---
        if (user.persona) {
            try {
                if (user.persona === 'sprinter' && minutes < 30) {
                    xpAwarded = Math.floor(xpAwarded * 1.15);
                    specialText += `\n⚡ *${t(language, 'personaBonusSprinter')}*`;
                } else if (user.persona === 'marathoner' && minutes >= 90) {
                    waterAwarded = Math.floor(waterAwarded * 1.20);
                    specialText += `\n🏔️ *${t(language, 'personaBonusMarathoner')}*`;
                } else if (user.persona === 'night_owl') {
                    const guildTz = session.guild_id ? getOrCreateGuildSettings(session.guild_id)?.timezone : null;
                    const hour = getTimeZoneParts(new Date(), guildTz || 'UTC').hour; // server's local time
                    if (hour >= 22 || hour <= 4) {
                        xpAwarded = Math.floor(xpAwarded * 1.25);
                        specialText += `\n🌙 *${t(language, 'personaBonusNightOwl')}*`;
                    }
                } else if (user.persona === 'architect') {
                    // MVP generic bonus
                    xpAwarded = Math.floor(xpAwarded * 1.10);
                    waterAwarded = Math.floor(waterAwarded * 1.10);
                    specialText += `\n🗺️ *${t(language, 'personaBonusArchitect')}*`;
                }
            } catch (err) { console.error('Persona bonus error:', err); }
        }
        // -------------------------------

        // One-time welcome bonus: a user's very first session pays like a full block,
        // so a short first session (e.g. the 5-minute trial) still shows real rewards
        if (Number(user.total_sessions || 0) === 0) {
            waterAwarded += 1;
            xpAwarded += 10;
            specialText += `\n\n🎁 ${t(language, 'sessionBonusWelcome')}`;
        }

        incrementUser(session.user_id, 'water', waterAwarded);
        incrementUser(session.user_id, 'xp', xpAwarded);
        incrementUser(session.user_id, 'total_focus_minutes', minutes);
        incrementUser(session.user_id, 'total_sessions', 1);

        await addGoalProgress(client, {
            guildId: session.guild_id,
            userId: session.user_id,
            minutes,
            sourceType: 'solo',
            sourceId: session.id,
        });

        recordGuildFocusProgress({
            guildId: session.guild_id,
            minutes,
            sourceType: 'solo',
            sourceId: session.id,
        });

        // Update Clan XP
        const { addClanXP } = require('../database');
        if (userClan) {
            addClanXP(userClan.id, minutes, xpAwarded);
            specialText += `\n🛡️ ${t(language, 'sessionBonusClanSynergy', { xp: minutes + xpAwarded, clan: userClan.name })}`;
        }

        // ── Mushroom Drop Roll ────────────────────────────────────────
        let mushroomDropText = '';
        if (!hasMushroom && Math.random() < mushroomRelic.dropChance) {
            // Unique — only add if user doesn't already have one
            db.prepare(
                'INSERT INTO inventory (user_id, item_key, quantity) VALUES (?, ?, 1) ON CONFLICT(user_id, item_key) DO UPDATE SET quantity = quantity + 1'
            ).run(session.user_id, 'mushroom');
            mushroomDropText = `\n\n🍄 ${t(language, 'sessionBonusMushroomFound')}`;
        }

        // Update streak (shared with voice and team sessions)
        const { streak: newStreak, protectedBy } = applyStudyStreak(session.user_id, user, activePet);
        if (protectedBy === 'loyal_dog') {
            specialText += `\n\n🐶 ${t(language, 'sessionBonusLoyalDog')}`;
        } else if (protectedBy === 'pro_shield') {
            specialText += `\n\n🛡️ ${t(language, 'sessionBonusProShield')}`;
        }
        recordSessionActivity(session.user_id);

        // Check level up
        const updatedUser = getOrCreateUser(session.user_id);
        let leveledUp = false;
        let newLevel = updatedUser.level;
        while (updatedUser.xp >= xpForLevel(newLevel)) {
            newLevel++;
            leveledUp = true;
        }
        if (leveledUp) {
            updateUser(session.user_id, { level: newLevel });
            
            // Level 5 Persona Unlock Trigger
            if (newLevel === 5) {
                try {
                    const discordUser = await client.users.fetch(session.user_id).catch(() => null);
                    if (discordUser) {
                        const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
                        const btn = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setLabel(`🎭 ${t(language, 'personaChooseMyButton')}`)
                                .setStyle(ButtonStyle.Link)
                                .setURL('https://discord.com/channels/@me')
                        );
                        await discordUser.send({
                            content: `🎓 ${t(language, 'personaLevel5DmBody', { username: discordUser.username })}`,
                        }).catch(() => {});
                    }
                } catch(e) {}
            }
        }

        recordActivityReward(session.user_id, {
            sourceType: 'solo',
            sourceId: session.id,
            title: sessionTitle,
            minutes,
            water: waterAwarded,
            xp: xpAwarded,
            streak: newStreak,
            level: newLevel,
            leveledUp,
        });

        

        // Update challenge progress for any active challenges the user has joined
        let challengeNews = [];
        try {
            challengeNews = require('../challenges').recordChallengeFocus({ userId: session.user_id, guildId: session.guild_id, minutes });
        } catch (err) { console.error('[TIMER] Challenge progress failed:', err.message); }
        // Expedition progress
        if (userClan) {
            try {
                const expResult = addFocusMinutesToExpedition(session.user_id, userClan.id, minutes);
                if (expResult && expResult.completed) {
                    specialText += `\n\n🗺️ ${t(language, 'expeditionCompletedLine', { minutes: expResult.expedition.target_minutes })}`;
                }
            } catch (err) { console.error('Expedition error:', err); }
        }

        // Pet XP
        let petXpToAward = xpAwarded;
        if (user.active_buff_type === 'pet_xp_boost' && user.buff_expires_at && new Date(user.buff_expires_at) > now) {
            const petBonus = Math.max(1, Math.floor(petXpToAward * user.active_buff_value));
            petXpToAward += petBonus;
            snackBuffText = `\n🍲 ${t(language, 'sessionBonusSnackPetXp', { amount: petBonus })}`;
        }

        const petResult = awardPetXP(session.user_id, petXpToAward);
        let petString = '';
        if (petResult) {
            const petInfo = Pets[petResult.pet.pet_key];
            petString = `\n🐾 ${t(language, 'sessionBonusPetXp', { xp: petXpToAward, emoji: petInfo.emoji, pet: petInfo.name, level: petResult.pet.level })}`;
            if (petResult.leveledUp) {
                petString += `\n🎉 ${t(language, 'sessionBonusPetLevelUp', { pet: petInfo.name, level: petResult.pet.level })}`;
            }
        }

        let description =
            `**${sessionTitle}** ${t(language, 'completedBang')} 🎉\n\n` +
            `⏱️ **${t(language, 'durationLabel')}:** ${formatTime(minutes)}\n` +
            (linkedTodo ? `📌 **${t(language, 'linkedTaskLabel')}:** ${linkedTodo.content} (+${minutes}m)\n` : '') +
            `💧 **${t(language, 'waterEarned')}:** +${waterAwarded}${boostText}${activePet && Pets[activePet.pet_key]?.buffType === 'water_boost' ? petRewardText : ''}\n` +
            `✨ **${t(language, 'xpEarned')}:** +${xpAwarded}${activePet && Pets[activePet.pet_key]?.buffType === 'xp_boost' ? petRewardText : ''}${snackBuffText}${clanBuffText}${mushroomBuffText}\n\n` +
            `🔥 **${t(language, 'streakLabel')}:** ${newStreak} ${t(language, 'dayCount')}\n` +
            (petString ? petString + '\n' : '') +
            (snackBuffText ? snackBuffText + '\n' : '') +
            (specialText ? specialText : '') +
            (marathonBonusText ? marathonBonusText : '');


        if (leveledUp) {
            description += `\n🎉 **${t(language, 'levelUpLine', { level: newLevel })}**`;
        }

        if (mushroomDropText) {
            description += mushroomDropText;
        }

        // Check achievements
        const sessionStartHour = parseUTC(session.started_at).getHours();
        const newAchievements = checkStudyAchievements(session.user_id, minutes, sessionStartHour);
        const achievementText = newAchievements
            .map(ach => `\n🏆 ${t(language, 'sessionBonusAchievementUnlocked', { emoji: ach.emoji, name: ach.name })}`)
            .join('');
        if (achievementText) description += '\n' + achievementText;

        // Everything the image card does not show (it only has duration, water,
        // xp, streak, level and title); sent next to the card so nothing is lost.
        const cardExtras = [
            linkedTodo ? `📌 **${t(language, 'linkedTaskLabel')}:** ${linkedTodo.content} (+${minutes}m)` : '',
            boostText ? `💧${boostText}` : '',
            petRewardText ? `🐾 ${petRewardText.trim()}` : '',
            snackBuffText, clanBuffText, mushroomBuffText, petString,
            specialText, marathonBonusText, mushroomDropText, achievementText,
        ].map(s => (s || '').trim()).filter(Boolean).join('\n');

        const embed = successEmbed(t(language, 'sessionCompleteTitle'), description);

        // Send completion message
        const channel = await client.channels.fetch(session.channel_id).catch(() => null);
        if (channel) {
            // Check user's preferred session card style
            const userSettings = getOrCreateSettings(session.user_id);
            const cardStyle = userSettings.session_card_style || 'image';

            if (cardStyle === 'text') {
                // Detailed text embed (classic style)
                await channel.send({ content: `<@${session.user_id}>`, embeds: [embed] }).catch(() => {});
            } else {
                // Generate and send the visual Session End Card (default)
                try {
                    const discordUser = await client.users.fetch(session.user_id).catch(() => null);
                    const avatarUrl = discordUser ? discordUser.displayAvatarURL({ extension: 'png', size: 128 }) : null;
                    const cardBuffer = await generateSessionEndCard({
                        username: discordUser?.displayName || discordUser?.username || `User#${session.user_id.slice(-4)}`,
                        avatar: avatarUrl,
                        duration: minutes,
                        waterAwarded,
                        xpAwarded,
                        streak: newStreak,
                        title: sessionTitle,
                        leveledUp,
                        newLevel,
                        persona: user.persona,
                        language,
                        // Card themes are Pro only; the saved choice comes back if Pro returns
                        theme: isFullPro(session.user_id) ? getOrCreateProProfileSettings(session.user_id).card_theme : 'classic',
                    });
                    const attachment = new AttachmentBuilder(cardBuffer, { name: 'session-complete.png' });
                    const payload = { content: `<@${session.user_id}>`, files: [attachment] };
                    if (cardExtras) {
                        payload.embeds = [new EmbedBuilder()
                            .setColor(Colors.SUCCESS)
                            .setDescription(cardExtras.slice(0, 4000))
                            .setImage('attachment://session-complete.png')];
                    }
                    await channel.send(payload).catch(() => {});
                } catch (cardErr) {
                    console.error('[TIMER] Session end card failed:', cardErr.message);
                    await channel.send({ content: `<@${session.user_id}>`, embeds: [embed] }).catch(() => {});
                }
            }

            if (challengeNews.length) {
                await channel.send({ content: challengeNews.join('\n'), allowedMentions: { users: [session.user_id] } }).catch(() => {});
            }

            // Update original message
            if (session.message_id) {
                const message = await channel.messages.fetch(session.message_id).catch(() => null);
                if (message) {
                    const doneEmbed = new EmbedBuilder()
                        .setColor(Colors.SUCCESS)
                        .setTitle(`✅ ${sessionTitle} — ${t(language, 'completedStatus')}`)
                        .setDescription(`${progressBar(1, 1, 20)}\n\n${t(language, 'sessionFinishedShort')}`)
                        .setTimestamp();
                    await message.edit({ embeds: [doneEmbed], components: [] }).catch(() => { });
                }
            }

            // --- Pomodoro Auto-Transition: Work → Break ---
            if (session.pomodoro_data) {
                const pomData = JSON.parse(session.pomodoro_data);
                if (pomData.type === 'work' && pomData.cycle < pomData.maxCycles) {
                    const { createSession, updateSessionPomodoroData, getActiveSessionForUser } = require('../database');
                    const newSessionId = createSession(session.user_id, session.guild_id, session.channel_id, session.message_id, pomData.break, '__break__');
                    updateSessionPomodoroData(newSessionId, { ...pomData, type: 'break' });
                    const newSession = getActiveSessionForUser(session.user_id);

                    await channel.send(`🍅 <@${session.user_id}> ${t(language, 'sessionBonusPomodoroWorkComplete', { cycle: pomData.cycle, maxCycles: pomData.maxCycles, minutes: pomData.break })}`).catch(() => {});
                    if (newSession) {
                        startBreakTimer(client, newSession);
                    } else {
                        console.error(`[TIMER] Auto-transition failed: no active session found for user ${session.user_id} after break createSession`);
                    }
                } else if (pomData.type === 'work' && pomData.cycle >= pomData.maxCycles) {
                    await channel.send(`🍅 <@${session.user_id}> ${t(language, 'sessionBonusPomodoroComplete', { maxCycles: pomData.maxCycles })} 🎉`).catch(() => {});
                }
            }
        }
    } catch (err) {
        console.error('[TIMER] Session complete error:', err);
    }
}
module.exports = { handleSessionComplete };
