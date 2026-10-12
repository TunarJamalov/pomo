/**
 * /profile — Canvas-generated profile card.
 * Shows username, avatar, level, XP bar, focus time, streak, water, theme, and bio.
 */

const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const {
    Colors,
    xpForLevel,
    Pets,
    Themes,
    ProProfileAccents,
    ProProfileBadges,
} = require('../utils/constants');
const {
    getOrCreateUser,
    getOrCreateProProfileSettings,
    db,
    getActivePet,
    getActiveTitle,
    getUserExams,
} = require('../utils/database');
const { formatTime } = require('../utils/embeds');
const { isPremium } = require('../utils/premiumCheck');
const { getInteractionLanguage, t } = require('../utils/i18n');
module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your profile card')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('View another user\'s profile')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('bio')
                .setDescription('Set your bio (leave empty to view profile)')
                .setRequired(false)
                .setMaxLength(100)),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        // Handle bio setting
        const bioText = interaction.options.getString('bio');
        if (bioText !== null) {
            const userId = interaction.user.id;
            getOrCreateUser(userId);
            db.prepare('UPDATE users SET bio = ? WHERE discord_id = ?').run(bioText, userId);
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.SUCCESS)
                    .setTitle(`✅ ${t(language, 'bioUpdatedTitle')}`)
                    .setDescription(t(language, 'bioUpdatedBody', { bio: bioText }))
                    .setTimestamp()],
                flags: 64,
            });
        }

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        const user = getOrCreateUser(userId);

        await interaction.deferReply();

        try {
            const premium = await isPremium(interaction.client, userId);
            const proSettings = premium ? getOrCreateProProfileSettings(userId) : null;
            const buffer = await generateProfileCard(targetUser, user, premium, proSettings, language);
            const attachment = new AttachmentBuilder(buffer, { name: 'profile.png' });

            await interaction.editReply({ files: [attachment] });
        } catch (err) {
            console.error('[PROFILE] Canvas error:', err);
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.ERROR)
                    .setTitle(`❌ ${t(language, 'profileErrorTitle')}`)
                    .setDescription(t(language, 'profileErrorBody'))
                    .setTimestamp()],
            });
        }
    },
};

/**
 * Generate a Canvas-based profile card.
 */
async function generateProfileCard(discordUser, dbUser, isPro = false, proSettings = null, language = 'en') {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const theme = Themes[dbUser.theme] || Themes.basic;
    const proAccent = ProProfileAccents[proSettings?.accent_key] || ProProfileAccents.gold;
    const proBadge = ProProfileBadges[proSettings?.badge_key] || ProProfileBadges.pomo_pro;
    const accentColor = isPro && proAccent.color ? proAccent.color : theme.accent;

    const createGrad = (colorDef, x0, y0, x1, y1) => {
        if (Array.isArray(colorDef)) {
            const grad = ctx.createLinearGradient(x0, y0, x1, y1);
            colorDef.forEach((col, i) => grad.addColorStop(i / (colorDef.length - 1), col));
            return grad;
        }
        return colorDef;
    };

    // ─── Background ──────────────────────────────────────────
    ctx.fillStyle = createGrad(theme.bg, 0, 0, width, height);
    roundRect(ctx, 0, 0, width, height, 20);
    ctx.fill();

    // ─── Inner Card ──────────────────────────────────────────
    ctx.fillStyle = theme.card;
    roundRect(ctx, 20, 20, width - 40, height - 40, 16);
    ctx.fill();

    // ─── Accent Strip (top) ─────────────────────────────────
    ctx.fillStyle = accentColor;
    roundRect(ctx, 20, 20, width - 40, 8, 0);
    ctx.fill();

    // ─── Avatar ──────────────────────────────────────────────
    const avatarSize = 100;
    const avatarX = 60;
    const avatarY = 55;

    try {
        const avatarURL = discordUser.displayAvatarURL({ extension: 'png', size: 128 });
        const avatar = await loadImage(avatarURL);

        // Circular clip
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();

        // Avatar border
        ctx.strokeStyle = isPro
            ? accentColor
            : createGrad(theme.bg, avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 2, 0, Math.PI * 2);
        ctx.stroke();
    } catch (err) {
        // Fallback: draw a colored circle
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = theme.text;
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(discordUser.username[0].toUpperCase(), avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 14);
        ctx.textAlign = 'left';
    }

    // ─── Username ────────────────────────────────────────────
    const textX = avatarX + avatarSize + 25;
    ctx.fillStyle = theme.text;
    const reservedBadgeWidth = isPro ? 185 : 0;
    const maxUsernameWidth = width - textX - 45 - reservedBadgeWidth;
    let usernameSize = 28;
    ctx.font = `bold ${usernameSize}px sans-serif`;
    while (ctx.measureText(discordUser.username).width > maxUsernameWidth && usernameSize > 18) {
        usernameSize--;
        ctx.font = `bold ${usernameSize}px sans-serif`;
    }
    ctx.fillText(discordUser.username, textX, avatarY + 30);

    if (isPro) {
        const badgeText = proBadge.text;
        ctx.font = 'bold 13px sans-serif';
        const badgeWidth = ctx.measureText(badgeText).width + 24;
        const badgeX = width - badgeWidth - 45;
        ctx.fillStyle = accentColor;
        roundRect(ctx, badgeX, avatarY + 5, badgeWidth, 28, 14);
        ctx.fill();
        ctx.fillStyle = getContrastColor(accentColor);
        ctx.fillText(badgeText, badgeX + 12, avatarY + 24);
    }

    // ─── Level Badge ─────────────────────────────────────────
    const levelText = `${t(language, 'lvlLabel')} ${dbUser.level}`;
    ctx.font = 'bold 16px sans-serif';
    const levelWidth = ctx.measureText(levelText).width + 20;
    ctx.fillStyle = accentColor;
    roundRect(ctx, textX, avatarY + 40, levelWidth, 28, 14);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(levelText, textX + 10, avatarY + 58);

    // ─── Pet Badge ───────────────────────────────────────────
    const activePet = await getActivePet(dbUser.discord_id);
    if (activePet) {
        const pInfo = Pets[activePet.pet_key];
        const petText = `${pInfo.emoji} Lv.${activePet.level}`;
        ctx.font = 'bold 14px sans-serif';
        const petWidth = ctx.measureText(petText).width + 20;
        
        ctx.fillStyle = theme.xpBg;
        roundRect(ctx, textX + levelWidth + 10, avatarY + 40, petWidth, 28, 14);
        ctx.fill();

        ctx.fillStyle = theme.text;
        ctx.fillText(petText, textX + levelWidth + 20, avatarY + 58);
    }

    // ─── XP Bar ──────────────────────────────────────────────
    const xpNeeded = xpForLevel(dbUser.level);
    const xpProgress = Math.min(dbUser.xp / xpNeeded, 1);

    const barX = textX;
    const barY = avatarY + 80;
    const barWidth = 480;
    const barHeight = 20;

    // Background
    ctx.fillStyle = theme.xpBg;
    roundRect(ctx, barX, barY, barWidth, barHeight, 10);
    ctx.fill();

    // Fill
    if (xpProgress > 0) {
        ctx.fillStyle = isPro && proAccent.color
            ? accentColor
            : createGrad(theme.xpBar, barX, barY, barX + barWidth, barY);
        roundRect(ctx, barX, barY, Math.max(barWidth * xpProgress, 20), barHeight, 10);
        ctx.fill();
    }

    // XP text
    ctx.fillStyle = theme.text;
    ctx.font = '12px sans-serif';
    ctx.fillText(`${dbUser.xp} / ${xpNeeded} XP`, barX + barWidth / 2 - 30, barY + 14);

    // ─── Stats Grid ──────────────────────────────────────────
    const activeTitle = getActiveTitle(dbUser.discord_id);
    if (activeTitle) {
        ctx.fillStyle = accentColor;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`${activeTitle.emoji} ${activeTitle.name}`, textX, 168);
    }

    const statsY = 195;
    const stats = [
        { icon: '⏱️', label: t(language, 'profileFocusTime'), value: formatTime(dbUser.total_focus_minutes) },
        { icon: '🔥', label: t(language, 'streakLabel'), value: `${dbUser.streak} ${t(language, 'dayCount')}` },
        { icon: '💧', label: t(language, 'waterLabel'), value: `${dbUser.water}` },
        { icon: '✨', label: t(language, 'profileTotalXp'), value: `${dbUser.xp}` },
    ];

    const gridCols = 2;
    const colWidth = (width - 100) / gridCols;
    stats.forEach((stat, i) => {
        const col = i % gridCols;
        const row = Math.floor(i / gridCols);
        const sx = 60 + col * colWidth;
        const sy = statsY + row * 60;

        // Stat card background
        ctx.fillStyle = theme.xpBg;
        roundRect(ctx, sx, sy, colWidth - 20, 48, 10);
        ctx.fill();

        ctx.fillStyle = theme.subtext;
        ctx.font = '13px sans-serif';
        ctx.fillText(`${stat.icon} ${stat.label}`, sx + 14, sy + 20);

        ctx.fillStyle = theme.text;
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(stat.value, sx + 14, sy + 40);
    });

    // ─── Upcoming Exam ───────────────────────────────────────
    const exams = getUserExams(dbUser.discord_id);
    const nowMs = Date.now();
    let examY = statsY + 135;
    if (exams.length > 0) {
        const upcoming = exams.find(e => {
            const d = new Date(`${e.exam_date}T00:00:00Z`);
            return d.getTime() >= nowMs;
        });
        if (upcoming) {
            const examDateObj = new Date(`${upcoming.exam_date}T12:00:00Z`);
            const diffDays = Math.ceil((examDateObj.getTime() - nowMs) / (1000 * 60 * 60 * 24));
            const examLabel = diffDays === 0 ? 'TODAY' : diffDays === 1 ? '1 day' : `${diffDays} days`;
            ctx.fillStyle = accentColor;
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(`📚 ${upcoming.title}`, 60, examY);
            ctx.fillStyle = theme.subtext;
            ctx.font = '13px sans-serif';
            ctx.fillText(`in ${examLabel}`, 60, examY + 18);
            examY += 42;
        }
    }

    // ─── Bio ─────────────────────────────────────────────────
    if (dbUser.bio) {
        ctx.fillStyle = theme.subtext;
        ctx.font = 'italic 14px sans-serif';
        ctx.fillText(`"${dbUser.bio}"`, 60, examY);
    }

    // ─── Theme Label (bottom-right) ──────────────────────────
    ctx.fillStyle = theme.subtext;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${t(language, 'profileTheme')}: ${dbUser.theme}`, width - 40, height - 35);
    ctx.textAlign = 'left';
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Study with PomoBot - pomofocus.online', 60, height - 35);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

/**
 * Draw a rounded rectangle path.
 */
function roundRect(ctx, x, y, w, h, r) {
    if (r > h / 2) r = h / 2;
    if (r > w / 2) r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function getContrastColor(hexColor) {
    const hex = hexColor.replace('#', '');
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
    return luminance > 155 ? '#1A1A1A' : '#FFFFFF';
}

module.exports.generateProfileCard = generateProfileCard;
module.exports.getContrastColor = getContrastColor;
