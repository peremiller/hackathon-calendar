const pad = value => String(value).padStart(2, '0');

export function startsTodayOrLater(event, today) {
  return Boolean(event && event.start && event.start >= today);
}

export function futureStartingEvents(events, today) {
  return (Array.isArray(events) ? events : [])
    .filter(event => startsTodayOrLater(event, today))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function uniqueEvents(events) {
  const unique = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || !event.name || !event.start) continue;
    const key = `${event.name.toLowerCase().replace(/[^a-z0-9]/g, '')}|${event.start}`;
    if (!unique.has(key)) unique.set(key, event);
  }
  return [...unique.values()];
}

function compactDate(iso) {
  return String(iso || '').replace(/-/g, '');
}

function nextDate(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function escapeIcal(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

function safeUid(value) {
  return String(value || 'event').replace(/[^a-zA-Z0-9._-]/g, '-');
}

export function buildCalendar(events, options = {}) {
  const name = options.name || 'HackCal Tech Events';
  const generatedAt = options.generatedAt || new Date().toISOString();
  const stamp = generatedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HackCal//Tech Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcal(name)}`,
    'X-WR-TIMEZONE:Asia/Manila',
    'REFRESH-INTERVAL;VALUE=DURATION:PT5M',
    'X-PUBLISHED-TTL:PT5M',
  ];

  for (const event of events) {
    const end = event.end && event.end >= event.start ? event.end : event.start;
    const details = [
      event.fmt,
      Array.isArray(event.tags) ? event.tags.join(', ') : '',
      event.src ? `Source: ${event.src}` : '',
      event.desc,
      event.url,
    ].filter(Boolean).join(' · ');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${safeUid(event.id || `${event.name}-${event.start}`)}@hackcal`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(event.start)}`,
      `DTEND;VALUE=DATE:${nextDate(end)}`,
      `SUMMARY:${escapeIcal(event.name)}`,
      `LOCATION:${escapeIcal(event.loc)}`,
      `DESCRIPTION:${escapeIcal(details)}`,
      ...(event.url ? [`URL:${escapeIcal(event.url)}`] : []),
      ...(Array.isArray(event.tags) && event.tags.length
        ? [`CATEGORIES:${event.tags.map(escapeIcal).join(',')}`]
        : []),
      'TRANSP:TRANSPARENT',
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
