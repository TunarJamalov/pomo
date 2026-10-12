const MS_PER_DAY = 86400000;
const HEARTBEAT_KEY = 'bot_heartbeat_at';
const GRACE_UNTIL_KEY = 'bot_downtime_grace_until';
const GRACE_DAYS_KEY = 'bot_downtime_grace_days';
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_DOWNTIME_GRACE_HOURS = 6;
const DEFAULT_GRACE_WINDOW_HOURS = 48;

const { getRuntimeState, setRuntimeState } = require('./database');

function recordBotHeartbeat(now = new Date()) {
    setRuntimeState(HEARTBEAT_KEY, now.toISOString());
}

function startBotHeartbeat() {
    captureDowntimeGrace();
    recordBotHeartbeat();
    return setInterval(() => recordBotHeartbeat(), HEARTBEAT_INTERVAL_MS);
}

function getStreakProgress(user, now = new Date()) {
    const today = now.toISOString().slice(0, 10);
    const todayDay = epochDay(now);
    const lastStudyDay = parseStudyDay(user?.last_study_date);
    const currentStreak = Number(user?.streak) || 0;

    if (lastStudyDay === null) {
        return {
            action: 'first_study',
            streak: Math.max(1, currentStreak || 1),
            today,
            todayDay,
            lastStudyDay,
            gapDays: null,
        };
    }

    if (lastStudyDay === todayDay) {
        return {
            action: 'same_day',
            streak: currentStreak,
            today,
            todayDay,
            lastStudyDay,
            gapDays: 0,
        };
    }

    if (lastStudyDay === todayDay - 1) {
        return {
            action: 'continued',
            streak: currentStreak + 1,
            today,
            todayDay,
            lastStudyDay,
            gapDays: 1,
        };
    }

    const gapDays = todayDay - lastStudyDay;
    if (isDowntimeGraceGap(gapDays, now)) {
        return {
            action: 'downtime_grace',
            streak: currentStreak + 1,
            today,
            todayDay,
            lastStudyDay,
            gapDays,
        };
    }

    return {
        action: 'broken',
        streak: 1,
        today,
        todayDay,
        lastStudyDay,
        gapDays,
    };
}

function isDowntimeGraceGap(gapDays, now = new Date()) {
    if (!Number.isFinite(gapDays) || gapDays <= 1) return false;

    const missedDays = Math.max(0, gapDays - 1);
    const graceUntil = getRuntimeState(GRACE_UNTIL_KEY);
    const graceDays = getRuntimeState(GRACE_DAYS_KEY);

    if (graceUntil?.value && graceDays?.value) {
        const until = new Date(graceUntil.value);
        const days = Number(graceDays.value);
        if (!Number.isNaN(until.getTime()) && now <= until && missedDays <= days) {
            return true;
        }
    }

    return false;
}

function captureDowntimeGrace(now = new Date()) {
    const heartbeat = getRuntimeState(HEARTBEAT_KEY);
    if (!heartbeat?.value) return null;

    const lastHeartbeat = new Date(heartbeat.value);
    if (Number.isNaN(lastHeartbeat.getTime())) return null;

    const downtimeMs = now.getTime() - lastHeartbeat.getTime();
    const thresholdMs = getDowntimeGraceThresholdHours() * 60 * 60 * 1000;
    if (downtimeMs < thresholdMs) return null;

    const graceDays = Math.max(1, Math.ceil(downtimeMs / MS_PER_DAY));
    const graceUntil = new Date(now.getTime() + getGraceWindowHours() * 60 * 60 * 1000).toISOString();

    setRuntimeState(GRACE_DAYS_KEY, String(graceDays));
    setRuntimeState(GRACE_UNTIL_KEY, graceUntil);

    console.log(`[STREAK] Downtime grace active for ${graceDays} missed day(s) until ${graceUntil}`);
    return { graceDays, graceUntil };
}

function getDowntimeGraceThresholdHours() {
    const parsed = Number(process.env.POMO_STREAK_DOWNTIME_GRACE_HOURS);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_DOWNTIME_GRACE_HOURS;
}

function getGraceWindowHours() {
    const parsed = Number(process.env.POMO_STREAK_GRACE_WINDOW_HOURS);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_GRACE_WINDOW_HOURS;
}

function epochDay(date) {
    return Math.floor(date.getTime() / MS_PER_DAY);
}

function parseStudyDay(value) {
    if (!value) return null;
    const raw = String(value);
    const date = raw.includes('T') ? new Date(raw) : new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    return epochDay(date);
}

module.exports = {
    HEARTBEAT_KEY,
    recordBotHeartbeat,
    startBotHeartbeat,
    captureDowntimeGrace,
    getStreakProgress,
    isDowntimeGraceGap,
};
