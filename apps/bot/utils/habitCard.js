/**
 * Renders /habit view: one row per habit with a HabitKit-style grid of the
 * last 26 weeks (a column per week, Monday at the top, today in the last
 * column) and its streaks.
 */
const { createCanvas } = require('@napi-rs/canvas');
const { shiftDay, weekStart } = require('./habits');

const WEEKS = 26;
const CELL = 14;
const GAP = 3;
const PAD = 32;
const LABEL_W = 230;
const ROW_H = 7 * (CELL + GAP) + 34;
const HEADER_H = 78;

const BG = '#1a1b1e';
const PANEL = '#232428';
const EMPTY = '#2b2d31';
const TEXT = '#f2f3f5';
const MUTED = '#b5bac1';
const SUBTLE = '#80848e';

function withAlpha(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
    return `${out}…`;
}

/**
 * @param {{ today: string, items: Array }} overview from buildHabitOverview
 * @param {{ title: string, streakLabel: (item) => string, todayLabel: (item) => string }} labels
 */
function renderHabitCard(overview, labels) {
    const gridW = WEEKS * (CELL + GAP) - GAP;
    const width = PAD * 2 + LABEL_W + gridW;
    const height = HEADER_H + overview.items.length * (ROW_H + 12) + PAD - 12;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = TEXT;
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(labels.title, PAD, 46);
    ctx.fillStyle = SUBTLE;
    ctx.font = '13px sans-serif';
    ctx.fillText(overview.today, PAD, 66);

    const firstWeek = shiftDay(weekStart(overview.today), -(WEEKS - 1) * 7);

    overview.items.forEach((item, index) => {
        const top = HEADER_H + index * (ROW_H + 12);
        ctx.fillStyle = PANEL;
        roundRect(ctx, PAD - 12, top - 4, width - PAD * 2 + 24, ROW_H, 12);
        ctx.fill();

        // Label column
        ctx.fillStyle = item.color;
        roundRect(ctx, PAD, top + 14, 10, 10, 3);
        ctx.fill();
        ctx.fillStyle = TEXT;
        ctx.font = 'bold 17px sans-serif';
        ctx.fillText(fitText(ctx, item.name, LABEL_W - 40), PAD + 18, top + 24);
        ctx.fillStyle = MUTED;
        ctx.font = '13px sans-serif';
        ctx.fillText(labels.streakLabel(item), PAD, top + 52);
        ctx.fillStyle = SUBTLE;
        ctx.fillText(labels.todayLabel(item), PAD, top + 72);

        // Grid
        const gridLeft = PAD + LABEL_W;
        const gridTop = top + 10;
        for (let week = 0; week < WEEKS; week++) {
            for (let weekday = 0; weekday < 7; weekday++) {
                const day = shiftDay(firstWeek, week * 7 + weekday);
                if (day > overview.today) continue;
                const count = item.counts.get(day) || 0;
                ctx.fillStyle = count >= item.target
                    ? item.color
                    : count > 0 ? withAlpha(item.color, 0.4) : EMPTY;
                roundRect(ctx, gridLeft + week * (CELL + GAP), gridTop + weekday * (CELL + GAP), CELL, CELL, 3);
                ctx.fill();
                if (day === overview.today) {
                    ctx.strokeStyle = TEXT;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }
        }
    });

    return canvas.toBuffer('image/png');
}

module.exports = { renderHabitCard };
