export const FOUNDER_FEED = 'https://primeqe-founder-operating-hub.ajmillertperez562.chatgpt.site/api/events?mode=cache&origin=founder';

export function founderRecords(payload) {
  if (!Array.isArray(payload?.events)) throw new Error('Founder Hub feed format changed');
  return payload.events.filter(e => e.sourceId !== 'hackcal' && e.date && e.name).map(e => ({
    src: 'PrimeQE Founder Hub', extId: 'primeqe:' + e.id, name: String(e.name).slice(0,250),
    start: e.date, end: e.endDate || e.date, startAt: e.startAt || null, endAt: e.endAt || null,
    tz: 'Asia/Manila', allDay: !e.startAt, fmt: /online|virtual/i.test(e.location) ? 'Online' : 'In-person',
    loc: e.location || 'See organizer', url: e.url || '', desc: e.description || '',
    hay: [e.name,e.description,e.type,...(e.topics || [])].join(' '), regClose: e.deadline || ''
  }));
}

export async function fetchFounderEvents() {
  const response = await fetch(FOUNDER_FEED, {signal: AbortSignal.timeout(8000), headers: {Accept:'application/json'}});
  if (!response.ok) throw new Error('Founder Hub HTTP ' + response.status);
  return founderRecords(await response.json());
}
