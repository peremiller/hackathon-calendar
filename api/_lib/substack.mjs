// Public Substack tech-event ingestion for HackCal.
//
// Substack officially publishes an RSS feed for every public publication at
// https://<publication>.substack.com/feed. A reader's personalised Home feed is
// private, so this adapter deliberately uses public publication feeds only.
// Additional feeds can be supplied through SUBSTACK_FEEDS as comma/newline-
// separated URLs or as "Name|URL|Default location" entries.

const DEFAULT_FEEDS = [
  ['AI Safety Events & Training', 'https://aisafetyeventsandtraining.substack.com/feed', 'Global / Online', true],
  ["Kyosuke's Tech Events", 'https://kyosuketogami.substack.com/feed', 'San Francisco Bay Area, United States', true],
  ['Milano Tech Events', 'https://milanotechevents.substack.com/feed', 'Milan, Italy', true],
  ['Dublin Tech Events', 'https://dublintechevents.substack.com/feed', 'Dublin, Ireland', true],
  ['Hyd Tech Events', 'https://hydevents.substack.com/feed', 'Hyderabad, India', true],
  ['Philippine Startup Week', 'https://philippinestartupweek.substack.com/feed', 'Philippines', false],
  ['OneQuantum Philippines', 'https://onequantumphilippines.substack.com/feed', 'Philippines', false]
].map(([name, url, loc, eventFocused]) => ({ name, url, loc, eventFocused }));

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12
};
const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
const EVENT_RE = /\b(event|conference|summit|meetup|webinar|workshop|hack(?:a)?thon|hackfest|buildathon|game jam|ctf|demo day|pitch night|training|bootcamp|forum|expo|festival|symposium|roundtable|fireside|talk|lecture|showcase|launch|open house|office hours|masterclass|networking)\b/i;
const TECH_RE = /\b(ai|artificial intelligence|ml|machine learning|llm|agentic|developer|engineering|software|startup|founder|web3|crypto|blockchain|data|cloud|devops|open source|api|robotics|hardware|quantum|cyber|security|saas|product|technology|tech)\b/i;
const GENERIC_LINK = /^(register|register now|rsvp|rsvp here|sign up|join|apply|learn more|more info|details|event|here|link|read more|watch|tickets?)$/i;
const GENERIC_HEADING = /^(upcoming events?|events?|calendar|what'?s on|save the date|this week|next week|sponsored|advertisement)$/i;

export const publicSubstackFeeds = () => {
  const configured = String(process.env.SUBSTACK_FEEDS || '')
    .split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    .map((entry, i) => {
      const bits = entry.split('|').map(s => s.trim());
      const raw = bits.length > 1 ? bits[1] : bits[0];
      try {
        const u = new URL(raw);
        const host = u.hostname.toLowerCase();
        if (u.protocol !== 'https:' || !(host === 'substack.com' || host.endsWith('.substack.com'))) return null;
        if (!/\/feed\/?$/.test(u.pathname)) u.pathname = u.pathname.replace(/\/$/, '') + '/feed';
        return { name: bits.length > 1 ? bits[0] : `Configured Substack ${i + 1}`,
          url: u.href, loc: bits[2] || 'See event page', eventFocused: true };
      } catch (_) { return null; }
    }).filter(Boolean);
  const seen = new Set();
  return [...DEFAULT_FEEDS, ...configured].filter(feed => {
    const key = feed.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 14);
};

const decode = s => String(s == null ? '' : s)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;|&rsquo;/g, "'")
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const text = html => decode(String(html || '').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' '))
  .replace(/\s+/g, ' ').trim();
const tag = (xml, name) => {
  const m = String(xml || '').match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decode(m[1]).trim() : '';
};
const iso = (year, month, day) => {
  const d = new Date(Date.UTC(+year, +month - 1, +day));
  if (d.getUTCFullYear() !== +year || d.getUTCMonth() !== +month - 1 || d.getUTCDate() !== +day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const inferredYear = (month, ref) => {
  const d = new Date(ref);
  if (isNaN(d)) return new Date().getUTCFullYear();
  const year = d.getUTCFullYear(), refMonth = d.getUTCMonth() + 1;
  return month < refMonth - 5 ? year + 1 : year;
};

export function parseDateRange(value, referenceDate = new Date()) {
  const s = text(value).replace(/\b(?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)(?:day)?\b,?/gi, ' ');
  let m = s.match(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*(?:-|–|—|to)\\s*(?:${MONTH}\\s+)?(\\d{1,2})(?:st|nd|rd|th)?)?(?:,?\\s+(20\\d{2}))?\\b`, 'i'));
  if (m) {
    const sm = MONTHS[m[1].toLowerCase()], sd = +m[2];
    const em = m[3] ? MONTHS[m[3].toLowerCase()] : sm, ed = m[4] ? +m[4] : sd;
    const y = +(m[5] || inferredYear(sm, referenceDate));
    const ey = em < sm ? y + 1 : y;
    const start = iso(y, sm, sd), end = iso(ey, em, ed);
    if (start && end) return { start, end, match: m[0] };
  }
  m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}(?:\\s*(?:-|–|—|to)\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+${MONTH})?)?(?:,?\\s+(20\\d{2}))?\\b`, 'i'));
  if (m) {
    const sm = MONTHS[m[2].toLowerCase()], sd = +m[1];
    const em = m[4] ? MONTHS[m[4].toLowerCase()] : sm, ed = m[3] ? +m[3] : sd;
    const y = +(m[5] || inferredYear(sm, referenceDate));
    const ey = em < sm ? y + 1 : y;
    const start = iso(y, sm, sd), end = iso(ey, em, ed);
    if (start && end) return { start, end, match: m[0] };
  }
  m = s.match(/\b(20\d{2})-(\d{2})-(\d{2})(?:\s*(?:-|–|—|to)\s*(?:20\d{2}-\d{2}-)?(\d{2}))?\b/);
  if (m) {
    const start = iso(+m[1], +m[2], +m[3]), end = iso(+m[1], +m[2], +(m[4] || m[3]));
    if (start && end) return { start, end, match: m[0] };
  }
  return null;
}

function blocks(html) {
  return String(html || '').replace(/<br\s*\/?\s*>/gi, '</p>')
    .split(/<\/(?:p|li|h[1-6]|div|tr|blockquote)>/i)
    .map(raw => {
      const links = [...raw.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m => ({ href: decode(m[1]), label: text(m[2]) }));
      const emph = [...raw.matchAll(/<(?:strong|b|h[1-6])\b[^>]*>([\s\S]*?)<\/(?:strong|b|h[1-6])>/gi)]
        .map(m => text(m[1])).filter(Boolean);
      return { raw, text: text(raw), links, emph };
    }).filter(b => b.text);
}

function goodTitle(s) {
  s = text(s).replace(/^[\s•·\-–—|:]+|[\s•·\-–—|:]+$/g, '').trim();
  if (s.length < 4 || s.length > 130 || GENERIC_LINK.test(s) || GENERIC_HEADING.test(s)) return null;
  if (parseDateRange(s) && s.replace(/\d|\W/g, '').length < 5) return null;
  return s;
}
// Keep title, date and registration link inside one event section. Never
// choose them independently from adjacent rows in a newsletter.
function candidate(bs, i, itemTitle, postUrl) {
  const here=bs[i];
  const direct=[...here.links.map(l=>l.label),...here.emph].map(goodTitle).find(Boolean);
  let group=[here], name=direct;
  if(!name){
    const prev=bs[i-1];
    if(!prev || !/<h[1-6]\b/i.test(prev.raw)) return null;
    name=[...prev.links.map(l=>l.label),...prev.emph,prev.text].map(goodTitle).find(Boolean);
    if(!name)return null;
    group=[prev,here];
  }
  for(let n=i+1;n<Math.min(bs.length,i+4);n++){
    const next=bs[n];
    if(/<h[1-6]\b/i.test(next.raw))break;
    // An independently named/date-bearing row begins another event.
    const named=next.links.some(l=>goodTitle(l.label)&&!/^(registration link|register|register now|rsvp|sign up|apply|tickets?|details|learn more)$/i.test(l.label));
    if(named||parseDateRange(next.text))break;
    group.push(next);
  }
  const links=group.flatMap(b=>b.links);
  const selected=links.find(l=>goodTitle(l.label)===name)||links.find(l=>/^(registration link|register|register now|rsvp|sign up|apply|tickets?|details|learn more)$/i.test(l.label));
  let url=postUrl;
  if(selected){try{const u=new URL(selected.href,postUrl);if(u.protocol==='https:')url=u.href;}catch{}}
  return {name,url,context:group.map(b=>b.text).join(' · ')};
}
function clock(value, start) {
  const m = text(value).match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (!m) return null;
  let h = +m[1]; if (h < 1 || h > 12) return null;
  const pm = /^p/i.test(m[3]); h = h % 12 + (pm ? 12 : 0);
  return `${start}T${String(h).padStart(2, '0')}:${m[2] || '00'}:00`;
}
function location(value, fallback) {
  const s = text(value);
  if (/\b(online|virtual|remote|zoom|livestream|live stream)\b/i.test(s)) return 'Online / Virtual';
  const m = s.match(/(?:📍|location|venue)\s*[:\-–—]?\s*([^|·;]{3,80})/i);
  return text(m ? m[1] : fallback).slice(0, 80) || 'See event page';
}
function idFor(value) {
  let h = 2166136261;
  for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export function parseSubstackFeed(xml, feed = {}, now = new Date()) {
  const out = [], floor = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  const channelName = text(tag(String(xml).split(/<item\b/i)[0], 'title')) || feed.name || 'Substack';
  const items = String(xml || '').match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const item of items.slice(0, 30)) {
    const itemTitle = text(tag(item, 'title'));
    const postUrl = text(tag(item, 'link'));
    const pubDate = tag(item, 'pubDate') || tag(item, 'dc:date') || now;
    const body = tag(item, 'content:encoded') || tag(item, 'description');
    const bs = blocks(body);
    for (let i = 0; i < bs.length; i++) {
      const date = parseDateRange(bs[i].text, pubDate);
      if (!date || date.end < floor) continue;
      const matched = candidate(bs, i, itemTitle, postUrl);
      if (!matched) continue;
      const {name, url, context} = matched;
      const relevant = feed.eventFocused !== false || EVENT_RE.test(context + ' ' + name) ||
        (EVENT_RE.test(itemTitle) && TECH_RE.test(context + ' ' + name + ' ' + channelName));
      if (!relevant || /subscribe|sponsor|advertis/i.test(name)) continue;
      const loc = location(context, feed.loc);
      // A newsletter clock without an explicit zone is evidence, not an instant.
      const startAt = null;
      out.push({
        src: 'Substack', extId: `substack:${idFor(`${url}|${name}|${date.start}`)}`,
        name: name.slice(0, 110), start: date.start, end: date.end,
        startAt, endAt: null, tz: null, allDay: true, needsVerification: true,
        timeStatus: 'organizer_verification_required', sourcePostUrl: postUrl,
        dateNote: 'Newsletter lead; verify the event title, date, year and time zone with its organizer before scheduling.',
        fmt: loc === 'Online / Virtual' ? 'Online' : 'In-person', loc,
        url, desc: context.slice(0, 260),
        hay: `${channelName} ${itemTitle} ${context} Substack tech event`.slice(0, 600)
      });
    }
  }
  const seen = new Map();
  for (const e of out) {
    const key = e.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + e.start;
    if (!seen.has(key)) seen.set(key, e);
  }
  return [...seen.values()];
}

export async function fetchSubstackEvents({ grab, deadline = Infinity, now = new Date() } = {}) {
  if (typeof grab !== 'function') throw new Error('A fetch helper is required');
  const feeds = publicSubstackFeeds();
  const results = await Promise.allSettled(feeds.map(async feed => {
    if (Date.now() > deadline) return [];
    const r = await grab(feed.url);
    if (!r || !r.ok) throw new Error(`${feed.name} returned HTTP ${(r && r.status) || 'unknown'}`);
    if (!/<rss\b|<feed\b/i.test(r.text || '')) throw new Error(`${feed.name} returned no RSS feed`);
    return parseSubstackFeed(r.text, feed, now);
  }));
  const events = [], failures = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') events.push(...r.value);
    else failures.push(`${feeds[i].name}: ${String(r.reason && r.reason.message || r.reason)}`);
  });
  if (!events.length && failures.length === feeds.length) throw new Error(`All public Substack feeds failed (${failures[0]})`);
  return events;
}
