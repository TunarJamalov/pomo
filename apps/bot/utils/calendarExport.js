/**
 * calendarExport.js — Generate .ics (iCalendar) files from PomoBot study data.
 */

function escapeIcsText(text) {
    return String(text || '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

function toUtcStamp(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function generateIcs(events) {
    const now = toUtcStamp(new Date());

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//PomoBot//Study Calendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:PomoBot Study Sessions',
    ];

    for (const event of events) {
        const uid = event.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dtStart = toUtcStamp(event.startTime);
        const dtEnd = toUtcStamp(event.endTime);

        const descriptionParts = [];
        if (event.subject) descriptionParts.push(`Subject: ${event.subject}`);
        if (event.duration) descriptionParts.push(`Duration: ${event.duration} min`);
        if (event.type) descriptionParts.push(`Type: ${event.type}`);
        if (event.description) descriptionParts.push(event.description);

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${uid}@pomobot`);
        lines.push(`DTSTAMP:${now}`);
        lines.push(`DTSTART:${dtStart}`);
        lines.push(`DTEND:${dtEnd}`);
        lines.push(`SUMMARY:${escapeIcsText(event.title || 'Study Session')}`);

        if (descriptionParts.length > 0) {
            lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join('\\n'))}`);
        }

        if (event.location) {
            lines.push(`LOCATION:${escapeIcsText(event.location)}`);
        }

        if (event.alarmMinutes && event.alarmMinutes > 0) {
            lines.push('BEGIN:VALARM');
            lines.push('TRIGGER:-PT' + event.alarmMinutes + 'M');
            lines.push('ACTION:DISPLAY');
            lines.push(`DESCRIPTION:Study session "${escapeIcsText(event.title)}" starts in ${event.alarmMinutes} minutes`);
            lines.push('END:VALARM');
        }

        lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}

module.exports = { generateIcs, escapeIcsText, toUtcStamp };
