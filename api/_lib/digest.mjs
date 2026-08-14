// Builds HackCal's "today + tomorrow" event digest.
//
// The web app keeps its events in the browser's localStorage, which a cron job
// can never read, so the digest re-runs the same server-side aggregation the
// app's 🌐 Live Sync uses: it calls /api/live-events (CDN-cached for 5 min) and
// narrows the result to the next two calendar days in the reader's timezone.
//
// Seeded events are deliberately NOT included: their dates are illustrative
// ("typical next edition"), and an approximate date has no business in a
// message that says "happening today".
//
// Two axes are configurable, both from env (the scheduled push) and from bot
// command arguments (on-demand pulls):
//   scope  hack | tech | all      how wide a net Live Sync casts
//   region ph   | online | global which events survive the location filter

const PROD = 'https://hackathon-calendar-umber.vercel.app';

export const SCOPES = ['hack', 'tech', 'all'];
export const REGIONS = ['ph', 'online', 'global'];

export const defaults = () => ({
  scope: SCOPES.includes(process.env.DIGEST_SCOPE) ? process.env.DIGEST_SCOPE : 'hack',
  region: REGIONS.includes(process.env.DIGEST_REGION) ? process.env.DIGEST_REGION : 'ph',
  tz: process.env.DIGEST_TZ || 'Asia/Manila'
});

// Always the stable public alias — never VERCEL_URL.
//
// VERCEL_URL is the *generated* deployment URL (…-msd3w9h2s-….vercel.app), and
// Vercel's Standard Deployment Protection guards those even for production
// builds; only the production alias is public. Fetching VERCEL_URL therefore
// returns 401, Live Sync fails, and the digest silently degrades to just the
// Manila supplement — a message that looks fine but is nearly empty.
export const baseUrl = () => process.env.DIGEST_BASE_URL || PROD;

/* ---------------- calendar helpers ---------------- */
// Everything is compared as a YYYY-MM-DD string in the reader's own timezone,
// which is how live-events.js already normalises event dates.
export const dayKey = (date, tz) => new Intl.DateTimeFormat('en-CA', {
  timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date);

export function addDays(key, n) {
  const d = new Date(`${key}T12:00:00Z`);   // midday anchor dodges DST edges
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The key is already a calendar date in the reader's timezone, so it is
// formatted as a fixed UTC instant — re-projecting it would shift the weekday.
export const prettyDay = key => new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric'
}).format(new Date(`${key}T12:00:00Z`));

export const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => esc(s).replace(/"/g, '&quot;');

/* ---------------- region filter ---------------- */
const PH_RE = /\b(philippines|filipino|pinoy|manila|makati|taguig|bgc|bonifacio global|ortigas|pasig|mandaluyong|quezon city|cebu|davao|iloilo|bacolod|baguio|clark|pampanga|laguna|cavite|alabang|muntinlupa|para[ñn]aque|las pi[ñn]as|pasay|antipolo|cagayan de oro|subic|batangas|philippine)\b/i;

export const isOnline = e =>
  /online|hybrid|virtual/i.test(e.fmt || '') || /online|virtual/i.test(e.loc || '');

export const isPH = e => PH_RE.test(`${e.loc || ''} ${e.hay || ''} ${e.name || ''}`);

export function inRegion(e, region) {
  if (region === 'global') return true;
  if (region === 'online') return isOnline(e);
  return isOnline(e) || isPH(e);          // 'ph' = joinable online, or physically in PH
}

/* ---------------- windowing ---------------- */
// An event counts for a day if it starts that day or straddles it. Hackathons
// run 2-3 days, so "starts today" alone would silently drop anything already
// under way — exactly the thing you'd still want to know about.
export const runsOn = (e, day) => {
  const start = e.start;
  const end = e.end && e.end >= start ? e.end : start;
  return !!start && start <= day && end >= day;
};

export function partition(events, today, tomorrow, region) {
  const keep = events.filter(e => inRegion(e, region));
  const byDay = d => keep
    .filter(e => runsOn(e, d))
    .sort((a, b) => (a.start === b.start ? 0 : a.start < b.start ? -1 : 1) ||
      a.name.localeCompare(b.name));
  // Registration deadlines landing in the window are the other time-critical
  // thing a morning message should surface.
  const closing = keep.filter(e =>
    e.regClose && (e.regClose === today || e.regClose === tomorrow) && !runsOn(e, today));
  return { today: byDay(today), tomorrow: byDay(tomorrow), closing };
}

/* ---------------- fetching ---------------- */
// Live Sync's keyword list is what actually determines breadth upstream; the
// `filter` param then decides what survives classification.
const QUERIES = {
  hack: 'hackathon,game jam,ctf,demo day',
  tech: 'hackathon,ai,developer,startup',
  all: 'hackathon,ai,tech,startup'
};

async function fetchJSON(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function fetchLive({ scope, base = baseUrl(), ms = 20000 } = {}) {
  const url = `${base}/api/live-events?q=${encodeURIComponent(QUERIES[scope] || QUERIES.hack)}` +
    `&filter=${encodeURIComponent(scope)}&limit=600`;
  const data = await fetchJSON(url, ms);
  return { events: data.events || [], sources: data.sources || [], fetchedAt: data.fetchedAt };
}

// Live Sync anchors its Luma sweep on SF / NY / London / Bengaluru / Singapore,
// so Philippine listings almost never surface. For region=ph the digest adds one
// Manila-anchored call of its own rather than widening the app's fan-out, which
// is capped on purpose (Luma drops connections when it is pushed harder).
const LUMA = 'https://api.lu.ma/discover/get-paginated-events';
const clean = s => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// The Manila sweep pulls Luma's whole "tech" category for the city, which drags
// in run clubs and coffee meetups the same way the app's own sweep does. These
// mirror live-events.js so the supplement is held to the identical bar — without
// them a "hackathons only" digest quietly fills up with social events.
const HACK_RE = /\b(hack[- ]?a?thon|hackfest|hack night|buildathon|build[- ]?a?thon|jam(?:\b|s\b)|game jam|codefest|code fest|ctf|capture the flag|datathon|makeathon|ideathon|demo day|pitch (?:day|night|competition)|coding (?:challenge|competition|contest)|hack)\b/i;
const TECH_RE = /\b(ai|ml|machine learning|llm|agent|genai|dev(?:eloper)?s?|engineer|coding|code|software|startup|founder|web3|crypto|blockchain|solidity|data|cloud|devops|open ?source|api|robotics|hardware|cyber|security|saas|product|design system|tech)\b/i;

export function classify(e) {
  if (e.src === 'Maven') return 'course';
  const hay = `${e.name || ''} ${e.hay || ''} ${e.desc || ''}`;
  if (HACK_RE.test(hay)) return 'hackathon';
  if (TECH_RE.test(hay)) return 'tech';
  return 'other';
}

export const KEEP = {
  hack: k => k === 'hackathon' || k === 'course',
  tech: k => k !== 'other',
  all: () => true
};

export async function fetchManila({ ms = 9000 } = {}) {
  const urls = [
    `${LUMA}?query=${encodeURIComponent('hackathon')}&latitude=14.5995&longitude=120.9842&pagination_limit=30`,
    `${LUMA}?slug=tech&latitude=14.5995&longitude=120.9842&pagination_limit=30`
  ];
  const out = [];
  const res = await Promise.allSettled(urls.map(u => fetchJSON(u, ms)));
  for (const r of res) {
    if (r.status !== 'fulfilled') continue;
    for (const entry of (r.value && r.value.entries) || []) {
      const e = entry && entry.event;
      if (!e || !e.start_at) continue;
      const geo = e.geo_address_info || {};
      const online = e.location_type === 'online' || e.location_type === 'virtual';
      const place = [geo.city, geo.country].filter(Boolean).join(', ') || clean(geo.address);
      const day = iso => new Intl.DateTimeFormat('en-CA', {
        timeZone: e.timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date(iso));
      out.push({
        src: 'Luma', extId: 'luma:' + e.api_id, name: clean(e.name).slice(0, 110),
        start: day(e.start_at), end: day(e.end_at || e.start_at),
        fmt: online ? 'Online' : (place ? 'In-person' : 'Online'),
        loc: online ? 'Online / Virtual' : (place || 'See event page'),
        url: e.url ? 'https://lu.ma/' + e.url : '', desc: '',
        hay: [geo.city, geo.region, geo.country].filter(Boolean).join(' ')
      });
    }
  }
  return out;
}

export function dedupe(events) {
  const seen = new Map();
  for (const e of events) {
    if (!e || !e.name || !e.start) continue;
    const k = e.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + e.start;
    if (!seen.has(k)) seen.set(k, e);
  }
  return [...seen.values()];
}

/* ---------------- rendering ---------------- */
const FMT_ICON = { Online: '💻', 'In-person': '📍', Hybrid: '🔀' };

function line(e, day) {
  const icon = FMT_ICON[e.fmt] || '📅';
  const name = e.url
    ? `<a href="${escAttr(e.url)}">${esc(e.name)}</a>`
    : `<b>${esc(e.name)}</b>`;
  const bits = [`${esc(e.loc)}`];
  if (e.start > day) bits.push(`starts ${prettyDay(e.start)}`);
  else if (e.end && e.end !== e.start) {
    bits.push(e.start === day ? `runs to ${prettyDay(e.end)}` : `since ${prettyDay(e.start)}`);
  }
  // A deadline that has already passed is noise in a "what's on now" message.
  if (e.regClose && e.regClose >= day) bits.push(`reg closes ${prettyDay(e.regClose)}`);
  return `${icon} ${name}\n   <i>${esc(bits.join(' · '))}</i> · ${esc(e.src)}`;
}

export function render({ today, tomorrow, closing }, meta) {
  const {
    todayKey, tomorrowKey, scope, region, tz, sources = [], stale,
    // offset !== 0 means the caller asked for a specific day (/tomorrow), so
    // calling it "Today" would be a lie; showTomorrow drops the second section
    // entirely for single-day pulls rather than printing an empty one.
    offset = 0, showTomorrow = true
  } = meta;
  const L = [];
  L.push(`<b>🚀 HackCal — ${showTomorrow ? 'daily feed' : 'day view'}</b>`);
  L.push(`<i>${esc(prettyDay(todayKey))} · ${esc(tz)} · scope: ${esc(scope)} · region: ${esc(region)}</i>`);

  const section = (title, rows, day, empty) => {
    L.push('');
    L.push(`<b>${title}</b>`);
    if (!rows.length) { L.push(`<i>${esc(empty)}</i>`); return; }
    for (const e of rows) L.push(line(e, day));
  };

  const headKey = offset === 0 ? '📆 Today' : (offset === 1 ? '🔜 Tomorrow' : '📆');
  section(`${headKey} — ${esc(prettyDay(todayKey))}`, today, todayKey,
    'Nothing on for this scope/region.');
  if (showTomorrow) {
    section(`🔜 Tomorrow — ${esc(prettyDay(tomorrowKey))}`, tomorrow, tomorrowKey,
      'Nothing on tomorrow for this scope/region.');
  }
  if (closing.length) {
    L.push('');
    L.push(`<b>⏳ Registration closing</b>`);
    for (const e of closing) L.push(line(e, todayKey));
  }

  L.push('');
  const down = sources.filter(s => s.ok === false && s.supported !== false).map(s => s.source);
  if (down.length) L.push(`<i>⚠️ Source unavailable this run: ${esc(down.join(', '))}</i>`);
  if (stale) L.push(`<i>⚠️ ${esc(stale)}</i>`);
  L.push(`<a href="${escAttr(PROD)}">Open HackCal</a> · /help for commands`);
  return L.join('\n');
}

/* ---------------- top level ---------------- */
export async function buildDigest(opts = {}) {
  const d = defaults();
  const scope = SCOPES.includes(opts.scope) ? opts.scope : d.scope;
  const region = REGIONS.includes(opts.region) ? opts.region : d.region;
  const tz = opts.tz || d.tz;
  const days = opts.days === 1 ? 1 : 2;
  const offset = Number.isInteger(opts.offset) ? opts.offset : 0;

  const base = dayKey(new Date(), tz);
  const todayKey = addDays(base, offset);
  const tomorrowKey = addDays(todayKey, 1);

  let events = [], sources = [], stale = null;
  try {
    const live = await fetchLive({ scope });
    events = live.events; sources = live.sources;
  } catch (e) {
    stale = `Live Sync failed: ${String(e.message || e)}`;
  }
  if (region === 'ph') {
    try {
      const keep = KEEP[scope] || KEEP.hack;
      events = events.concat((await fetchManila()).filter(e => keep(classify(e))));
    } catch (_) { /* supplement only — never fail the digest over it */ }
  }
  events = dedupe(events);

  const parts = partition(events, todayKey, tomorrowKey, region);
  if (days === 1) parts.tomorrow = [];

  const text = render(parts, {
    todayKey, tomorrowKey, scope, region, tz, sources, stale,
    offset, showTomorrow: days === 2
  });
  return {
    text, scope, region, tz, todayKey, tomorrowKey, stale,
    counts: { today: parts.today.length, tomorrow: parts.tomorrow.length, closing: parts.closing.length, pool: events.length }
  };
}

// Parse "/feed tech global" style arguments — order-independent, unknown words
// ignored, so a fat-fingered command still returns something useful.
export function parseArgs(text) {
  const out = {};
  for (const w of String(text || '').toLowerCase().split(/\s+/)) {
    if (SCOPES.includes(w)) out.scope = w;
    else if (REGIONS.includes(w)) out.region = w;
    else if (w === 'philippines' || w === 'manila') out.region = 'ph';
  }
  return out;
}
