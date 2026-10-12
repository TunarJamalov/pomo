const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const { Themes } = require('./constants');
const { formatTime } = require('./embeds');
const { normalizeLanguage, t } = require('./i18n');

// Canvas text uses the system sans-serif font. Scripts that may render as
// missing glyphs (CJK, Arabic) keep the English card labels.
const CARD_FALLBACK_LANGUAGES = new Set(['ja', 'ko', 'ar']);

function cardLanguage(language) {
    const lang = normalizeLanguage(language || 'en');
    return CARD_FALLBACK_LANGUAGES.has(lang) ? 'en' : lang;
}

const PLOT_WIDTH = 200;
const PLOT_HEIGHT = 200;
const COLS = 3;
const ROWS = 2;
const CANVAS_WIDTH = PLOT_WIDTH * COLS;
const CANVAS_HEIGHT = PLOT_HEIGHT * ROWS;

async function generateGardenBuffer(plots) {
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');

    for (let index = 0; index < 6; index++) {
        const plot = plots[index];
        const x = (index % COLS) * PLOT_WIDTH;
        const y = Math.floor(index / COLS) * PLOT_HEIGHT;

        if (plot) {
            const imageStage = plot.stage + 1;
            const imagePath = path.join(
                __dirname,
                '..',
                'assets',
                'plant',
                `${plot.plant_type}_stage_${imageStage}.png`,
            );
            try {
                const image = await loadImage(imagePath);
                ctx.drawImage(image, x, y, PLOT_WIDTH, PLOT_HEIGHT);
            } catch (error) {
                console.error(`[CANVAS] Failed to load ${imagePath}:`, error.message);
                ctx.fillStyle = '#4f545c';
                ctx.fillRect(x + 10, y + 10, PLOT_WIDTH - 20, PLOT_HEIGHT - 20);
                ctx.fillStyle = '#ffffff';
                ctx.font = '20px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Img Error', x + PLOT_WIDTH / 2, y + PLOT_HEIGHT / 2);
            }
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, PLOT_WIDTH, PLOT_HEIGHT);
    }

    return canvas.toBuffer('image/png');
}

// ─── Garden Share Card ─────────────────────────────────────────────────────────
// Generates a beautiful shareable snapshot of the user's garden with stats overlay
async function generateGardenShareCard(plots, user, username, language = 'en') {
    const lang = cardLanguage(language);
    const CARD_W = 640;
    const HEADER_H = 90;
    const FOOTER_H = 60;
    const GRID_W = PLOT_WIDTH * COLS;
    const GRID_H = PLOT_HEIGHT * ROWS;
    const CARD_H = HEADER_H + GRID_H + FOOTER_H;
    const PADDING = 20;

    const canvas = createCanvas(CARD_W, CARD_H);
    const ctx = canvas.getContext('2d');

    // ── Background gradient ─────────────────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    bgGrad.addColorStop(0, '#0f1117');
    bgGrad.addColorStop(1, '#1a1f2e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // ── Soft green glow in background ───────────────────────────────────────
    const glow = ctx.createRadialGradient(CARD_W / 2, HEADER_H + GRID_H / 2, 50, CARD_W / 2, HEADER_H + GRID_H / 2, 300);
    glow.addColorStop(0, 'rgba(87, 242, 135, 0.08)');
    glow.addColorStop(1, 'rgba(87, 242, 135, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // ── Header ───────────────────────────────────────────────────────────────
    const level = user.level || 1;
    const totalMins = user.total_focus_minutes || 0;
    const hours = Math.floor(totalMins / 60);
    const water = user.water || 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'left';
    const gardenTitle = `\uD83C\uDF31 ${t(lang, 'cardGardenTitle', { username })}`;
    fitText(ctx, gardenTitle, CARD_W - PADDING * 2 - 90, 26, 16);
    ctx.fillText(gardenTitle, PADDING, 38);

    // Level badge
    const badgeText = t(lang, 'cardLevelBadge', { level });
    ctx.font = 'bold 13px sans-serif';
    const badgeW = ctx.measureText(badgeText).width + 20;
    const badgeX = CARD_W - PADDING - badgeW;
    ctx.fillStyle = 'rgba(87, 242, 135, 0.2)';
    ctx.beginPath();
    ctx.roundRect(badgeX, 14, badgeW, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#57f287';
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, badgeX + badgeW / 2, 32);

    // Stats row
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(truncateText(ctx, `\u23F1\uFE0F ${t(lang, 'cardGardenHoursFocused', { hours })}`, 125), PADDING, 68);
    ctx.fillText(truncateText(ctx, `\uD83D\uDCA7 ${t(lang, 'cardGardenWater', { water })}`, 125), PADDING + 130, 68);
    ctx.fillText(`\uD83E\uDEB4 ${t(lang, 'cardGardenPlots', { used: plots.length })}`, PADDING + 260, 68);

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_H - 1);
    ctx.lineTo(CARD_W, HEADER_H - 1);
    ctx.stroke();

    // ── Garden Grid ─────────────────────────────────────────────────────────
    const gridOffsetX = (CARD_W - GRID_W) / 2;

    for (let index = 0; index < 6; index++) {
        const plot = plots[index];
        const x = gridOffsetX + (index % COLS) * PLOT_WIDTH;
        const y = HEADER_H + Math.floor(index / COLS) * PLOT_HEIGHT;

        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x, y, PLOT_WIDTH, PLOT_HEIGHT);

        if (plot) {
            const imageStage = plot.stage + 1;
            const imagePath = path.join(__dirname, '..', 'assets', 'plant', `${plot.plant_type}_stage_${imageStage}.png`);
            try {
                const image = await loadImage(imagePath);
                ctx.drawImage(image, x, y, PLOT_WIDTH, PLOT_HEIGHT);
            } catch {
                ctx.fillStyle = '#2b2d31';
                ctx.fillRect(x + 10, y + 10, PLOT_WIDTH - 20, PLOT_HEIGHT - 20);
                ctx.fillStyle = '#ffffff';
                ctx.font = '32px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('\uD83C\uDF3F', x + PLOT_WIDTH / 2, y + PLOT_HEIGHT / 2 + 12);
            }

            // Stage label
            const stages = [
                `\uD83C\uDF31 ${t(lang, 'cardStageSeedling')}`,
                `\uD83C\uDF3F ${t(lang, 'cardStageGrowing')}`,
                `\uD83C\uDF33 ${t(lang, 'cardStageMature')}`,
                `\u2728 ${t(lang, 'cardStageReady')}`,
            ];
            const stageLabel = stages[Math.min(plot.stage, 3)];
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(x, y + PLOT_HEIGHT - 26, PLOT_WIDTH, 26);
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(stageLabel, x + PLOT_WIDTH / 2, y + PLOT_HEIGHT - 9);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(x, y, PLOT_WIDTH, PLOT_HEIGHT);
            ctx.font = '32px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillText('+', x + PLOT_WIDTH / 2, y + PLOT_HEIGHT / 2 + 12);
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, PLOT_WIDTH, PLOT_HEIGHT);
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const footerY = HEADER_H + GRID_H;
    ctx.fillStyle = 'rgba(87, 242, 135, 0.06)';
    ctx.fillRect(0, footerY, CARD_W, FOOTER_H);

    ctx.strokeStyle = 'rgba(87, 242, 135, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, footerY);
    ctx.lineTo(CARD_W, footerY);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${t(lang, 'cardGardenFooter')} \uD83C\uDF3F`, PADDING, footerY + 37);

    ctx.fillStyle = 'rgba(87, 242, 135, 0.7)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('pomofocus.online', CARD_W - PADDING, footerY + 37);

    return canvas.toBuffer('image/png');
}

// ─── Session End Card ─────────────────────────────────────────────────────────
// Generates a compact "Session Complete" card posted in the channel when a
// study session finishes. Designed to be eye-catching so server members feel FOMO.
async function generateSessionEndCard({ username, avatar, duration, waterAwarded, xpAwarded, streak, title, leveledUp, newLevel, persona, language = 'en' }) {
    const lang = cardLanguage(language);
    const CARD_W = 560;
    const CARD_H = 160;
    const PADDING = 20;
    const AVATAR_SIZE = 60;

    const canvas = createCanvas(CARD_W, CARD_H);
    const ctx = canvas.getContext('2d');

    // ── Background ───────────────────────────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    bgGrad.addColorStop(0, '#1a1f2e');
    bgGrad.addColorStop(1, '#0f1117');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // Left green accent bar
    ctx.fillStyle = '#57f287';
    ctx.fillRect(0, 0, 4, CARD_H);

    // ── Avatar ───────────────────────────────────────────────────────────────
    const avatarX = PADDING + 4;
    const avatarY = (CARD_H - AVATAR_SIZE) / 2;

    if (avatar) {
        try {
            const avatarImg = await loadImage(avatar);
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatarImg, avatarX, avatarY, AVATAR_SIZE, AVATAR_SIZE);
            ctx.restore();

            // Avatar ring
            ctx.strokeStyle = '#57f287';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2 + 1, 0, Math.PI * 2);
            ctx.stroke();
        } catch {
            // fallback: colored circle with initial
            ctx.fillStyle = '#2b2d31';
            ctx.beginPath();
            ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#57f287';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(username.charAt(0).toUpperCase(), avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2 + 9);
        }
    }

    // ── Text area ────────────────────────────────────────────────────────────
    const textX = avatarX + AVATAR_SIZE + 16;
    const maxTextW = CARD_W - textX - PADDING;

    // "✅ Session Complete!" header
    ctx.fillStyle = '#57f287';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`\u2705 ${t(lang, 'cardSessionComplete')}`, textX, 42);

    // Username + session title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    const displayTitle = title && title !== 'Study Session' ? `${username} — ${title}` : username;
    // Truncate if too long
    let truncated = displayTitle;
    while (ctx.measureText(truncated).width > maxTextW && truncated.length > 5) {
        truncated = truncated.slice(0, -1);
    }
    if (truncated !== displayTitle) truncated += '…';
    ctx.fillText(truncated, textX, 72);

    // Stats row
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;
    const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(`\u23F1\uFE0F ${durationStr}`, textX, 104);
    ctx.fillText(`\uD83D\uDCA7 +${waterAwarded}`, textX + 90, 104);
    ctx.fillText(`\u2728 +${xpAwarded} XP`, textX + 170, 104);
    ctx.fillText(truncateText(ctx, `\uD83D\uDD25 ${t(lang, 'cardStreakDays', { streak })}`, maxTextW - 265), textX + 265, 104);

    // Level up badge (if applicable)
    if (leveledUp) {
        const levelUpText = `\uD83C\uDF89 ${t(lang, 'cardLevelUp', { level: newLevel })}`;
        ctx.font = 'bold 13px sans-serif';
        const levelUpW = Math.max(150, ctx.measureText(levelUpText).width + 16);
        ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
        ctx.beginPath();
        ctx.roundRect(textX, 118, levelUpW, 26, 13);
        ctx.fill();
        ctx.fillStyle = '#ffd700';
        ctx.textAlign = 'left';
        ctx.fillText(levelUpText, textX + 8, 136);
    }

    // ── Right side: PomoBot brand ────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('pomofocus.online', CARD_W - PADDING, CARD_H - 14);

    return canvas.toBuffer('image/png');
}

function roundRect(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, height / 2, width / 2);
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();
}

async function generateStatsDashboard(discordUser, dbUser, statsData, isPremium) {
    const width = 800;
    const height = isPremium ? 680 : 380;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const theme = Themes[dbUser.theme] || Themes.basic;
    const createGradient = (colors, x0, y0, x1, y1) => {
        if (!Array.isArray(colors)) return colors;
        const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
        colors.forEach((color, index) => {
            gradient.addColorStop(index / (colors.length - 1), color);
        });
        return gradient;
    };

    ctx.fillStyle = createGradient(theme.bg, 0, 0, width, height);
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = theme.card;
    roundRect(ctx, 30, 30, width - 60, height - 60, 20);
    ctx.fill();

    const title = `${discordUser.username}'s Study Analytics`;
    let titleSize = 32;
    ctx.fillStyle = theme.text;
    ctx.font = `bold ${titleSize}px sans-serif`;
    while (ctx.measureText(title).width > width - 100 && titleSize > 22) {
        titleSize--;
        ctx.font = `bold ${titleSize}px sans-serif`;
    }
    ctx.fillText(title, 50, 80);
    ctx.fillStyle = theme.subtext;
    ctx.font = '16px sans-serif';
    ctx.fillText(
        isPremium ? `Pomo Pro - ${statsData.periodDays}-Day Analytics` : 'Basic Performance Overview',
        50,
        110,
    );

    const startX = 50;
    const startY = 140;
    const gap = 20;
    const columns = 4;
    const boxWidth = (width - 100 - gap * (columns - 1)) / columns;
    const boxHeight = 85;
    const metrics = isPremium
        ? [
            { label: `${statsData.periodDays}d Sessions`, value: `${statsData.periodSessions}` },
            { label: `${statsData.periodDays}d Focus`, value: formatTime(statsData.periodMinutes) },
            { label: 'Active Days', value: `${statsData.activeDays}/${statsData.periodDays}` },
            {
                label: 'Best Day',
                value: statsData.bestDay?.minutes
                    ? `${formatShortDate(statsData.bestDay.date)} / ${formatTime(statsData.bestDay.minutes)}`
                    : 'No activity',
            },
            { label: 'Avg Session', value: formatTime(statsData.avgLength) },
            { label: 'Current Streak', value: `${dbUser.streak} days` },
            { label: 'Harvests', value: `${statsData.totalHarvests}` },
            { label: 'Lifetime XP', value: `${dbUser.xp}` },
        ]
        : [
            { label: 'Sessions', value: `${statsData.totalSessions}` },
            { label: 'Total Focus', value: formatTime(dbUser.total_focus_minutes) },
            { label: 'Current Streak', value: `${dbUser.streak} days` },
            { label: 'Water Earned', value: `${dbUser.water}` },
        ];

    metrics.forEach((metric, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const x = startX + column * (boxWidth + gap);
        const y = startY + row * (boxHeight + gap);
        ctx.fillStyle = theme.xpBg;
        roundRect(ctx, x, y, boxWidth, boxHeight, 12);
        ctx.fill();
        ctx.fillStyle = theme.subtext;
        ctx.font = '14px sans-serif';
        ctx.fillText(metric.label, x + 15, y + 30);
        ctx.fillStyle = theme.text;
        ctx.font = 'bold 22px sans-serif';
        fitText(ctx, metric.value, boxWidth - 30, 22, 16);
        ctx.fillText(metric.value, x + 15, y + 65);
    });

    if (isPremium) {
        const chartY = startY + 2 * (boxHeight + gap) + 10;
        if (statsData.periodDays === 7) {
            drawSevenDayTimeline(ctx, theme, createGradient, statsData.days, startX, chartY, width - 100);
        } else {
            drawFocusHeatmap(ctx, theme, statsData.days, startX, chartY, width - 100);
        }
    } else {
        ctx.fillStyle = theme.accent;
        ctx.font = 'italic 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
            'Unlock 30/90-day analytics and focus heatmaps with Pomo Pro Beta.',
            width / 2,
            height - 50,
        );
        ctx.textAlign = 'left';
    }

    return canvas.toBuffer('image/png');
}

async function generateWeeklyRecap(discordUser, dbUser, recapData, language = 'en') {
    const lang = cardLanguage(language);
    const width = 900;
    const height = 540;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const theme = Themes[dbUser.theme] || Themes.basic;
    const gradient = (colors, x0, y0, x1, y1) => {
        if (!Array.isArray(colors)) return colors;
        const value = ctx.createLinearGradient(x0, y0, x1, y1);
        colors.forEach((color, index) => {
            value.addColorStop(index / (colors.length - 1), color);
        });
        return value;
    };

    ctx.fillStyle = gradient(theme.bg, 0, 0, width, height);
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = theme.card;
    roundRect(ctx, 24, 24, width - 48, height - 48, 18);
    ctx.fill();

    ctx.fillStyle = theme.accent;
    ctx.fillRect(24, 24, 8, height - 48);

    const avatarSize = 76;
    const avatarX = 58;
    const avatarY = 55;
    try {
        const avatar = await loadImage(discordUser.displayAvatarURL({ extension: 'png', size: 128 }));
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
    } catch {
        ctx.fillStyle = theme.accent;
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = theme.text;
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(discordUser.username.charAt(0).toUpperCase(), avatarX + avatarSize / 2, avatarY + 49);
        ctx.textAlign = 'left';
    }

    const headingX = avatarX + avatarSize + 22;
    ctx.fillStyle = theme.text;
    ctx.font = 'bold 30px sans-serif';
    const title = t(lang, 'cardRecapTitle', { username: discordUser.username });
    fitText(ctx, title, 530, 30, 20);
    ctx.fillText(title, headingX, 85);
    ctx.fillStyle = theme.subtext;
    ctx.font = '15px sans-serif';
    ctx.fillText(`${formatShortDate(recapData.startDate, lang)} - ${formatShortDate(recapData.endDate, lang)} UTC`, headingX, 112);

    ctx.textAlign = 'right';
    ctx.fillStyle = theme.accent;
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('POMOBOT', width - 55, 78);
    ctx.fillStyle = theme.subtext;
    ctx.font = '12px sans-serif';
    ctx.fillText(t(lang, 'cardRecapTagline'), width - 55, 101);
    ctx.textAlign = 'left';

    const metrics = [
        { label: t(lang, 'cardRecapFocusTime'), value: formatTime(recapData.periodMinutes) },
        { label: t(lang, 'cardRecapSessions'), value: String(recapData.periodSessions) },
        { label: t(lang, 'cardRecapActiveDays'), value: `${recapData.activeDays}/7` },
        { label: t(lang, 'cardRecapCurrentStreak'), value: t(lang, 'cardDaysCount', { count: dbUser.streak }) },
    ];
    const metricX = 58;
    const metricY = 155;
    const metricGap = 14;
    const metricWidth = (width - 116 - metricGap * 3) / 4;
    metrics.forEach((metric, index) => {
        const x = metricX + index * (metricWidth + metricGap);
        ctx.fillStyle = theme.xpBg;
        roundRect(ctx, x, metricY, metricWidth, 82, 10);
        ctx.fill();
        ctx.fillStyle = theme.subtext;
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(truncateText(ctx, metric.label, metricWidth - 28), x + 14, metricY + 25);
        ctx.fillStyle = theme.text;
        ctx.font = 'bold 23px sans-serif';
        fitText(ctx, metric.value, metricWidth - 28, 23, 16);
        ctx.fillText(metric.value, x + 14, metricY + 59);
    });

    const chartX = 58;
    const chartY = 280;
    const chartWidth = 540;
    const chartHeight = 150;
    ctx.fillStyle = theme.subtext;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(t(lang, 'cardRecapDailyFocus'), chartX, chartY - 18);

    const maxMinutes = Math.max(...recapData.days.map(day => day.minutes), 30);
    const barGap = 15;
    const barWidth = (chartWidth - barGap * 6) / 7;
    recapData.days.forEach((day, index) => {
        const x = chartX + index * (barWidth + barGap);
        const availableHeight = chartHeight - 35;
        const rawHeight = (day.minutes / maxMinutes) * availableHeight;
        const fillHeight = Math.max(day.minutes > 0 ? 8 : 3, rawHeight);
        const y = chartY + availableHeight - fillHeight;

        ctx.fillStyle = theme.xpBg;
        roundRect(ctx, x, chartY, barWidth, availableHeight, 7);
        ctx.fill();
        ctx.fillStyle = gradient(theme.xpBar, x, y, x, y + fillHeight);
        roundRect(ctx, x, y, barWidth, fillHeight, 7);
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.fillStyle = theme.subtext;
        ctx.font = '11px sans-serif';
        ctx.fillText(formatWeekday(day, lang).toLocaleUpperCase(lang), x + barWidth / 2, chartY + chartHeight);
        if (day.minutes > 0) {
            ctx.fillStyle = theme.text;
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(`${day.minutes}m`, x + barWidth / 2, y - 7);
        }
    });
    ctx.textAlign = 'left';

    const insightX = 630;
    const insightY = 263;
    const insightWidth = 214;
    ctx.fillStyle = theme.xpBg;
    roundRect(ctx, insightX, insightY, insightWidth, 183, 12);
    ctx.fill();
    ctx.fillStyle = theme.subtext;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(truncateText(ctx, t(lang, 'cardRecapHighlights'), insightWidth - 32), insightX + 16, insightY + 26);

    const highlights = [
        {
            label: t(lang, 'cardRecapBestDay'),
            value: recapData.bestDay.minutes
                ? `${formatShortDate(recapData.bestDay.date, lang)} - ${formatTime(recapData.bestDay.minutes)}`
                : t(lang, 'cardRecapNoFocus'),
        },
        { label: t(lang, 'cardRecapAvgSession'), value: formatTime(recapData.avgLength) },
        {
            label: t(lang, 'cardRecapFocusMix'),
            value: t(lang, 'cardRecapMixValue', {
                solo: recapData.sources.solo,
                team: recapData.sources.team,
                voice: recapData.sources.voice,
            }),
        },
    ];
    highlights.forEach((item, index) => {
        const y = insightY + 58 + index * 45;
        ctx.fillStyle = theme.subtext;
        ctx.font = '11px sans-serif';
        ctx.fillText(truncateText(ctx, item.label, insightWidth - 32), insightX + 16, y);
        ctx.fillStyle = theme.text;
        ctx.font = 'bold 13px sans-serif';
        fitText(ctx, item.value, insightWidth - 32, 13, 10);
        ctx.fillText(item.value, insightX + 16, y + 18);
    });

    ctx.fillStyle = theme.subtext;
    ctx.font = '12px sans-serif';
    ctx.fillText(truncateText(ctx, buildRecapMessage(recapData, lang), 600), 58, height - 48);
    ctx.textAlign = 'right';
    ctx.fillText('pomofocus.online', width - 55, height - 48);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

async function generateServerStatsCard({
    guildName,
    activity,
    commandUses,
    topCommandText,
    topContributorText,
    goalText,
    setupScore,
}) {
    const width = 900;
    const height = 520;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#111827');
    bg.addColorStop(0.55, '#172033');
    bg.addColorStop(1, '#0f3d35');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    roundRect(ctx, 28, 28, width - 56, height - 56, 22);
    ctx.fill();

    ctx.fillStyle = '#34d399';
    ctx.fillRect(28, 28, 8, height - 56);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px sans-serif';
    const title = `${guildName || 'Server'} Study Progress`;
    fitText(ctx, title, 600, 34, 22);
    ctx.fillText(title, 58, 82);

    ctx.fillStyle = '#9ca3af';
    ctx.font = '15px sans-serif';
    ctx.fillText('Last 7 days with PomoBot', 58, 112);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('POMOBOT', width - 58, 78);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px sans-serif';
    ctx.fillText('STUDY. GROW. REPEAT.', width - 58, 101);
    ctx.textAlign = 'left';

    const metrics = [
        { label: 'FOCUS TIME', value: formatTime(activity.current_minutes || 0) },
        { label: 'ACTIVE STUDENTS', value: String(activity.current_users || 0) },
        { label: 'SESSIONS', value: String(activity.current_sessions || 0) },
        { label: 'SETUP SCORE', value: setupScore || '0/3' },
    ];

    const metricX = 58;
    const metricY = 150;
    const gap = 16;
    const metricWidth = (width - 116 - gap * 3) / 4;
    metrics.forEach((metric, index) => {
        const x = metricX + index * (metricWidth + gap);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        roundRect(ctx, x, metricY, metricWidth, 92, 14);
        ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(metric.label, x + 16, metricY + 30);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 26px sans-serif';
        fitText(ctx, metric.value, metricWidth - 32, 26, 16);
        ctx.fillText(metric.value, x + 16, metricY + 66);
    });

    const compareText = buildServerMomentumText(activity);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    roundRect(ctx, 58, 268, 370, 136, 14);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('MOMENTUM', 80, 306);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 22px sans-serif';
    fitText(ctx, compareText.title, 326, 22, 17);
    ctx.fillText(compareText.title, 80, 340);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '14px sans-serif';
    wrapText(ctx, compareText.body, 80, 367, 326, 19, 3);

    const details = [
        { label: 'Top contributor', value: topContributorText || 'No focus sessions yet' },
        { label: 'Commands used', value: `${commandUses?.uses || 0} uses by ${commandUses?.users || 0} users` },
        { label: 'Top command', value: topCommandText || 'No command data yet' },
        { label: 'Weekly goal', value: goalText || 'Not configured' },
    ];

    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    roundRect(ctx, 460, 268, 382, 136, 14);
    ctx.fill();
    details.forEach((item, index) => {
        const x = 482 + (index % 2) * 180;
        const y = 305 + Math.floor(index / 2) * 50;
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(item.label.toUpperCase(), x, y);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 14px sans-serif';
        fitText(ctx, item.value, 158, 14, 10);
        ctx.fillText(item.value, x, y + 20);
    });

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px sans-serif';
    const footerText = 'Build a focused study community with voice tracking, goals, gardens, and leaderboards.';
    fitText(ctx, footerText, 620, 13, 11);
    ctx.fillText(footerText, 58, 450);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('pomofocus.online', width - 58, 450);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

function buildServerMomentumText(activity) {
    const current = Number(activity.current_minutes || 0);
    const previous = Number(activity.previous_minutes || 0);
    if (current === 0) {
        return {
            title: 'Ready for the first session',
            body: 'Start with /study or enable voice tracking so members can build momentum together.',
        };
    }
    if (previous === 0) {
        return {
            title: 'New activity this week',
            body: 'Your server started logging focus time. Keep the streak going with a weekly goal.',
        };
    }
    const percent = Math.round(((current - previous) / previous) * 100);
    if (percent >= 20) {
        return {
            title: `Up ${percent}% this week`,
            body: 'Focus activity is climbing. Share this progress and invite more members to join.',
        };
    }
    if (percent <= -20) {
        return {
            title: `${Math.abs(percent)}% lower this week`,
            body: 'A weekly goal or scheduled team session can help bring members back into rhythm.',
        };
    }
    return {
        title: 'Steady study rhythm',
        body: 'Your server is keeping a stable study pace. Small daily sessions will compound.',
    };
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = Infinity) {
    const words = text.split(' ');
    let line = '';
    let lines = 0;
    for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth && line) {
            if (lines + 1 >= maxLines) {
                ctx.fillText(truncateText(ctx, `${line} ${word}`, maxWidth), x, y);
                return;
            }
            ctx.fillText(line, x, y);
            lines++;
            line = word;
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    if (line) ctx.fillText(line, x, y);
}

function truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let output = text;
    while (output.length > 1 && ctx.measureText(`${output}...`).width > maxWidth) {
        output = output.slice(0, -1).trimEnd();
    }
    return `${output}...`;
}

function buildRecapMessage(recapData, language = 'en') {
    if (recapData.periodMinutes === 0) return t(language, 'cardRecapMsgFresh');
    if (recapData.activeDays === 7) return t(language, 'cardRecapMsgSevenDays');
    if (recapData.periodMinutes >= 600) return t(language, 'cardRecapMsgDeepWork');
    if (recapData.periodMinutes >= 180) return t(language, 'cardRecapMsgStrong');
    return t(language, 'cardRecapMsgDefault');
}

function fitText(ctx, text, maxWidth, initialSize, minimumSize) {
    let size = initialSize;
    ctx.font = `bold ${size}px sans-serif`;
    while (ctx.measureText(text).width > maxWidth && size > minimumSize) {
        size--;
        ctx.font = `bold ${size}px sans-serif`;
    }
}

function formatShortDate(date, language = 'en') {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString(language, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    });
}

function formatWeekday(day, language = 'en') {
    if (language === 'en' || !day.date) return day.dayName;
    return new Date(`${day.date}T00:00:00Z`).toLocaleDateString(language, { weekday: 'short', timeZone: 'UTC' });
}

function drawSevenDayTimeline(ctx, theme, createGradient, days, startX, chartY, chartWidth) {
    const chartHeight = 200;
    ctx.fillStyle = theme.subtext;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('7-Day Study Timeline', startX, chartY + 20);
    ctx.strokeStyle = theme.subtext;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, chartY + chartHeight);
    ctx.lineTo(startX + chartWidth, chartY + chartHeight);
    ctx.stroke();

    const maxMinutes = Math.max(...days.map(day => day.minutes), 60);
    const barGap = 40;
    const barWidth = (chartWidth - barGap * (days.length + 1)) / days.length;
    days.forEach((day, index) => {
        const x = startX + barGap + index * (barWidth + barGap);
        const rawHeight = (day.minutes / maxMinutes) * (chartHeight - 60);
        const fillHeight = Math.max(rawHeight, 4);
        const y = chartY + chartHeight - fillHeight;
        ctx.fillStyle = createGradient(theme.xpBar, x, y, x, y + fillHeight);
        roundRect(ctx, x, y, barWidth, fillHeight, Math.min(6, fillHeight / 2));
        ctx.fill();

        ctx.fillStyle = theme.subtext;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(day.dayName, x + barWidth / 2, chartY + chartHeight + 25);
        if (day.minutes > 0) {
            ctx.fillStyle = theme.text;
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(`${day.minutes}m`, x + barWidth / 2, y - 10);
        }
    });
    ctx.textAlign = 'left';
}

function drawFocusHeatmap(ctx, theme, days, startX, chartY, chartWidth) {
    const firstDate = new Date(`${days[0].date}T00:00:00Z`);
    const leadingDays = (firstDate.getUTCDay() + 6) % 7;
    const weeks = Math.ceil((leadingDays + days.length) / 7);
    const cellSize = 24;
    const gap = 7;
    const gridWidth = weeks * cellSize + (weeks - 1) * gap;
    const gridX = startX + Math.max(38, (chartWidth - gridWidth) / 2);
    const gridY = chartY + 52;
    const maxMinutes = Math.max(...days.map(day => day.minutes), 1);
    const alphaLevels = [0, 0.28, 0.48, 0.72, 1];

    ctx.fillStyle = theme.subtext;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`${days.length}-Day Focus Heatmap`, startX, chartY + 20);
    ctx.font = '11px sans-serif';
    [
        { row: 0, label: 'Mon' },
        { row: 2, label: 'Wed' },
        { row: 4, label: 'Fri' },
    ].forEach(item => {
        ctx.fillStyle = theme.subtext;
        ctx.fillText(item.label, gridX - 32, gridY + item.row * (cellSize + gap) + 17);
    });

    days.forEach((day, index) => {
        const position = leadingDays + index;
        const column = Math.floor(position / 7);
        const row = position % 7;
        const x = gridX + column * (cellSize + gap);
        const y = gridY + row * (cellSize + gap);
        ctx.save();
        if (day.minutes === 0) {
            ctx.fillStyle = theme.xpBg;
        } else {
            const level = Math.max(1, Math.ceil((day.minutes / maxMinutes) * 4));
            ctx.globalAlpha = alphaLevels[level];
            ctx.fillStyle = theme.accent;
        }
        roundRect(ctx, x, y, cellSize, cellSize, 5);
        ctx.fill();
        ctx.restore();
    });

    const legendY = gridY + 7 * (cellSize + gap) + 10;
    ctx.fillStyle = theme.subtext;
    ctx.font = '11px sans-serif';
    ctx.fillText('Less', gridX, legendY + 13);
    for (let level = 0; level <= 4; level++) {
        ctx.save();
        ctx.fillStyle = level === 0 ? theme.xpBg : theme.accent;
        if (level > 0) ctx.globalAlpha = alphaLevels[level];
        roundRect(ctx, gridX + 34 + level * 22, legendY, 16, 16, 4);
        ctx.fill();
        ctx.restore();
    }
    ctx.fillStyle = theme.subtext;
    ctx.fillText('More', gridX + 150, legendY + 13);
    ctx.textAlign = 'right';
    ctx.fillText(
        `${formatTime(days.reduce((sum, day) => sum + day.minutes, 0))} across ${days.filter(day => day.minutes > 0).length} active days`,
        startX + chartWidth,
        legendY + 13,
    );
    ctx.textAlign = 'left';
}

module.exports = {
    generateGardenBuffer,
    generateGardenShareCard,
    generateSessionEndCard,
    generateStatsDashboard,
    generateWeeklyRecap,
    generateServerStatsCard,
    generatePomoChallengeCard,
    generateEveningReflectionCard,
    generateWiltingGardenBuffer,
};

// ─── 30-Day PomoChallenge Card ─────────────────────────────────────────────────────────
async function generatePomoChallengeCard(discordUser, dbUser, days) {
    const { createCanvas, loadImage } = require('@napi-rs/canvas');
    const CARD_W = 600;
    const CARD_H = 340;
    
    const canvas = createCanvas(CARD_W, CARD_H);
    const ctx = canvas.getContext('2d');
    
    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    bgGrad.addColorStop(0, '#1a1f2e');
    bgGrad.addColorStop(1, '#0f1117');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    
    // Grid settings
    const PADDING = 30;
    const HEADER_H = 80;
    const COLS = 10;
    const ROWS = 3;
    const GAP = 8;
    const CELL_SIZE = (CARD_W - (PADDING * 2) - (GAP * (COLS - 1))) / COLS;
    
    // Header
    const avatarSize = 40;
    if (discordUser.displayAvatarURL) {
        try {
            const img = await loadImage(discordUser.displayAvatarURL({ extension: 'png', size: 64 }));
            ctx.save();
            ctx.beginPath();
            ctx.arc(PADDING + avatarSize/2, 20 + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, PADDING, 20, avatarSize, avatarSize);
            ctx.restore();
        } catch(e) {}
    }
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${discordUser.displayName || discordUser.username}'s 30-Day Challenge`, PADDING + avatarSize + 15, 47);
    
    // Stats
    const activeDays = days.filter(d => d.minutes > 0).length;
    const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);
    const hours = Math.floor(totalMinutes / 60);
    
    ctx.fillStyle = '#57f287';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${activeDays}/30 Days Active`, CARD_W - PADDING, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px sans-serif';
    ctx.fillText(`${hours}h total focused`, CARD_W - PADDING, 60);
    
    // Render 30 day grid
    let maxMin = Math.max(...days.map(d => d.minutes), 1);
    let startY = HEADER_H + 10;
    
    days.forEach((day, index) => {
        const col = index % COLS;
        const row = Math.floor(index / COLS);
        const x = PADDING + col * (CELL_SIZE + GAP);
        const y = startY + row * (CELL_SIZE + GAP);
        
        ctx.save();
        if (day.minutes === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
        } else {
            const intensity = Math.min(1, 0.4 + (day.minutes / maxMin) * 0.6);
            ctx.fillStyle = `rgba(87, 242, 135, ${intensity})`;
        }
        
        // Use a local roundRect implementation for simplicity
        ctx.beginPath();
        ctx.roundRect(x, y, CELL_SIZE, CELL_SIZE, 8);
        ctx.fill();
        ctx.restore();
        
        // Day number
        ctx.fillStyle = day.minutes === 0 ? 'rgba(255,255,255,0.2)' : '#000000';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${index + 1}`, x + CELL_SIZE/2, y + CELL_SIZE/2 + 4);
    });
    
    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('pomofocus.online', CARD_W / 2, CARD_H - 15);
    
    return canvas.toBuffer('image/png');
}

// ─── Evening Reflection Card ────────────────────────────────────────────────────────
async function generateEveningReflectionCard(discordUser, data) {
    const { createCanvas, loadImage } = require('@napi-rs/canvas');
    const lang = cardLanguage(data?.language);
    const CARD_W = 500;
    const CARD_H = 220;
    
    const canvas = createCanvas(CARD_W, CARD_H);
    const ctx = canvas.getContext('2d');
    
    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    bgGrad.addColorStop(0, '#1a1f2e'); // dark night blue
    bgGrad.addColorStop(1, '#0b0c10');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    
    // Grid settings
    const PADDING = 30;
    
    // Header text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(t(lang, 'cardReflectionTitle'), PADDING, 45);
    
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '16px sans-serif';
    ctx.fillText(`${new Date().toISOString().split('T')[0]}`, PADDING, 70);
    
    // Draw Stats Block
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.roundRect(PADDING, 95, CARD_W - PADDING*2, 85, 12);
    ctx.fill();
    
    // Text inside stats
    ctx.textAlign = 'center';
    
    // Today Mins
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px sans-serif';
    ctx.fillText(truncateText(ctx, t(lang, 'cardFocusTime'), 140), PADDING + 80, 125);
    ctx.fillStyle = '#57f287';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`${data.todayMins}m`, PADDING + 80, 155);

    // Streak
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px sans-serif';
    ctx.fillText(truncateText(ctx, t(lang, 'cardCurrentStreak'), 140), CARD_W/2, 125);
    ctx.fillStyle = '#faa61a';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`${data.streak} 🔥`, CARD_W/2, 155);
    
    // Total Hours
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px sans-serif';
    ctx.fillText(truncateText(ctx, t(lang, 'cardAllTime'), 140), CARD_W - PADDING - 80, 125);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    const totalHrs = Math.floor(data.totalMins / 60);
    ctx.fillText(`${totalHrs}h`, CARD_W - PADDING - 80, 155);
    
    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('pomofocus.online', CARD_W / 2, CARD_H - 15);
    
    return canvas.toBuffer('image/png');
}


// ─── Wilting Garden Card (For AT_RISK segment) ──────────────────────────────────
async function generateWiltingGardenBuffer(plots, user, discordUser) {
    const { createCanvas, loadImage } = require('@napi-rs/canvas');
    const { Plants } = require('./constants');
    const fs = require('fs');
    const path = require('path');
    const theme = Themes[user.theme] || Themes.basic;
    
    // We will generate the regular garden buffer and then tint it yellow/gray to show it's wilting.
    // Instead of reusing generateGardenBuffer, we'll draw a similar one.
    const width = 600;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Desaturated/Darkened Background
    ctx.fillStyle = '#1c1b18'; // yellowish dark gray
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    ctx.roundRect(20, 20, width - 40, height - 40, 16);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${discordUser.displayName || discordUser.username}'s Garden is Wilting 🥀`, width / 2, 60);

    const plotW = 120;
    const plotH = 120;
    const startX = 60;
    const startY = 120;
    const gap = 30;

    for (let i = 0; i < 3; i++) {
        const plot = plots[i];
        const cx = startX + i * (plotW + gap) + plotW / 2;
        const cy = startY + plotH / 2;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        ctx.roundRect(startX + i * (plotW + gap), startY, plotW, plotH, 12);
        ctx.fill();

        if (plot && plot.plant_id) {
            const plantMeta = Plants[plot.plant_id];
            if (plantMeta && plantMeta.images) {
                const imgName = plantMeta.images[Math.min(plot.growth_stage - 1, plantMeta.images.length - 1)];
                const imgPath = path.join(__dirname, '..', 'assets', 'plants', imgName);
                if (fs.existsSync(imgPath)) {
                    try {
                        const img = await loadImage(imgPath);
                        // Draw with lower opacity to simulate wilting
                        ctx.globalAlpha = 0.5;
                        ctx.drawImage(img, cx - 40, cy - 40, 80, 80);
                        ctx.globalAlpha = 1.0;
                        
                        // Add warning overlay
                        ctx.fillStyle = '#faa61a';
                        ctx.font = 'bold 16px sans-serif';
                        ctx.fillText('⚠️ Wilting', cx, cy + 50);
                    } catch (e) {}
                }
            }
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.font = '14px sans-serif';
            ctx.fillText('Empty', cx, cy + 5);
        }
    }
    
    // Bottom text
    ctx.fillStyle = '#ff5b5b';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`Your ${user.streak} day streak is at risk. 1 session restores it.`, width / 2, 330);
    
    return canvas.toBuffer('image/png');
}
