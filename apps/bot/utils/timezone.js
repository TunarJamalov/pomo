function normalizeTimeZone(timeZone) {
    const candidate = typeof timeZone === 'string' && timeZone.trim()
        ? timeZone.trim()
        : 'UTC';
    try {
        return new Intl.DateTimeFormat('en-US', { timeZone: candidate }).resolvedOptions().timeZone;
    } catch {
        return null;
    }
}

function isValidTimeZone(timeZone) {
    return Boolean(normalizeTimeZone(timeZone));
}

function getTimeZoneParts(date = new Date(), timeZone = 'UTC') {
    const normalized = normalizeTimeZone(timeZone) || 'UTC';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: normalized,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(date);

    const values = {};
    for (const part of parts) {
        if (part.type !== 'literal') values[part.type] = Number(part.value);
    }
    return values;
}

function getTimeZoneOffsetMs(timeZone, date) {
    const parts = getTimeZoneParts(date, timeZone);
    const localAsUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
    );
    return localAsUtc - date.getTime();
}

function localDateTimeToUtc(parts, timeZone = 'UTC') {
    const normalized = normalizeTimeZone(timeZone) || 'UTC';
    let utcMs = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour || 0,
        parts.minute || 0,
        parts.second || 0,
    );

    for (let i = 0; i < 3; i++) {
        const offset = getTimeZoneOffsetMs(normalized, new Date(utcMs));
        utcMs = Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour || 0,
            parts.minute || 0,
            parts.second || 0,
        ) - offset;
    }

    return new Date(utcMs);
}

function formatLocalDate(parts) {
    return [
        String(parts.year).padStart(4, '0'),
        String(parts.month).padStart(2, '0'),
        String(parts.day).padStart(2, '0'),
    ].join('-');
}

function addLocalDays(parts, days) {
    const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return {
        year: value.getUTCFullYear(),
        month: value.getUTCMonth() + 1,
        day: value.getUTCDate(),
    };
}

function getWeekStart(date = new Date(), timeZone = 'UTC') {
    const parts = getTimeZoneParts(date, timeZone);
    const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    const day = localDate.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    return formatLocalDate(addLocalDays(parts, diff));
}

function getWeekWindow(date = new Date(), timeZone = 'UTC') {
    const normalized = normalizeTimeZone(timeZone) || 'UTC';
    const parts = getTimeZoneParts(date, normalized);
    const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    const day = localDate.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const startParts = addLocalDays(parts, diff);
    const endParts = addLocalDays(startParts, 7);
    const startUtc = localDateTimeToUtc({ ...startParts, hour: 0, minute: 0, second: 0 }, normalized);
    const endUtc = localDateTimeToUtc({ ...endParts, hour: 0, minute: 0, second: 0 }, normalized);
    return {
        timeZone: normalized,
        startDate: formatLocalDate(startParts),
        endDate: formatLocalDate(endParts),
        startUtc,
        endUtc,
    };
}

function getPreviousWeekWindow(date = new Date(), timeZone = 'UTC') {
    const current = getWeekWindow(date, timeZone);
    const startParts = addLocalDays({
        year: Number(current.startDate.slice(0, 4)),
        month: Number(current.startDate.slice(5, 7)),
        day: Number(current.startDate.slice(8, 10)),
    }, -7);
    const endParts = {
        year: Number(current.startDate.slice(0, 4)),
        month: Number(current.startDate.slice(5, 7)),
        day: Number(current.startDate.slice(8, 10)),
    };
    return {
        timeZone: current.timeZone,
        startDate: formatLocalDate(startParts),
        endDate: formatLocalDate(endParts),
        startUtc: localDateTimeToUtc({ ...startParts, hour: 0, minute: 0, second: 0 }, current.timeZone),
        endUtc: current.startUtc,
    };
}

function getDayWindow(date = new Date(), timeZone = 'UTC') {
    const normalized = normalizeTimeZone(timeZone) || 'UTC';
    const parts = getTimeZoneParts(date, normalized);
    const nextParts = addLocalDays(parts, 1);
    return {
        timeZone: normalized,
        startDate: formatLocalDate(parts),
        startUtc: localDateTimeToUtc({ ...parts, hour: 0, minute: 0, second: 0 }, normalized),
        endUtc: localDateTimeToUtc({ ...nextParts, hour: 0, minute: 0, second: 0 }, normalized),
    };
}

function isLocalMondayMidnight(date = new Date(), timeZone = 'UTC') {
    const parts = getTimeZoneParts(date, timeZone);
    const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    return localDate.getUTCDay() === 1 && parts.hour === 0;
}

function isLocalMondayReportWindow(date = new Date(), timeZone = 'UTC') {
    const parts = getTimeZoneParts(date, timeZone);
    const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    return localDate.getUTCDay() === 1 && parts.hour >= 0 && parts.hour < 6;
}

function toSqlDateTime(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = {
    normalizeTimeZone,
    isValidTimeZone,
    getTimeZoneParts,
    formatLocalDate,
    addLocalDays,
    getWeekStart,
    getWeekWindow,
    getPreviousWeekWindow,
    getDayWindow,
    isLocalMondayMidnight,
    isLocalMondayReportWindow,
    toSqlDateTime,
};
