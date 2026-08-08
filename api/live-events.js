// Vercel serverless function: live event aggregator for HackCal.
//
//   GET /api/live-events?q=hackathon&sources=luma,eventbrite,meetup,maven
//
// Fans out to every requested source in parallel, normalises each result into
// HackCal's event shape and returns them de-duplicated, newest-first.
//
// Source status (probed against the live sites):
//   luma       ✅ api.lu.ma/discover/get-paginated-events — public, keyless, cursor-paginated
//   eventbrite ✅ public search pages embed schema.org JSON-LD ItemList of Events
//   meetup     ✅ /find/?source=EVENTS embeds a schema.org JSON-LD Event array
//   maven      ✅ maven.com/courses embeds __NEXT_DATA__ with each course's next live cohort
//   linkedin   ❌ every events URL 307s to the auth wall — no logged-out access, no public API
//   facebook   ❌ event pages render a login gate; Graph API dropped public event search in 2018
//
// The two blocked sources are reported honestly in `sources[]` with a search URL
// the user can open themselves, rather than silently returning nothing.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BUDGET_MS = 12000;  // overall wall-clock budget; partial results beat a timeout
const PER_REQ_MS = 8000;
// Luma needs one request per hub city, which — fired all at once alongside the
// HTML scrapes — starves them of sockets and times them out. Cap the fan-out.
const LUMA_CONCURRENCY = 3;

// Run thunks with a bounded number in flight; never rejects (failures → null).
async function pool(limit, thunks) {
  const out = new Array(thunks.length).fill(null);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, async () => {
    while (i < thunks.length) {
      const n = i++;
      try { out[n] = await thunks[n](); } catch (_) { out[n] = null; }
    }
  }));
  return out;
}

/* ---------- tiny fetch helper with a hard timeout ---------- */
async function grab(url, ms = PER_REQ_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/json,application/xhtml+xml,*/*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    return { ok: r.ok, status: r.status, text: await r.text() };
  } finally { clearTimeout(t); }
}
const json = async (url, ms) => { const r = await grab(url, ms); try { return JSON.parse(r.text); } catch (_) { return null; } };

/* ---------- shared normalising helpers ---------- */
// Render an instant as a YYYY-MM-DD calendar date *in the event's own timezone*,
// so a 9pm-in-Manila event doesn't land on the next day for a UTC reader.
function localDate(iso, tz) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 10) || null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
  } catch (_) { return d.toISOString().slice(0, 10); }
}
const clean = s => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();
const isFuture = e => !e.start || e.start >= new Date(Date.now() - 864e5).toISOString().slice(0, 10);

function mk({ src, extId, name, start, end, fmt, loc, url, desc, hay }) {
  name = clean(name).slice(0, 110);
  if (!name || !start) return null;
  return {
    src, extId, name, start, end: end && end >= start ? end : start,
    fmt: fmt || 'Online', loc: clean(loc).slice(0, 70) || 'See event page',
    url: url || '', desc: clean(desc).slice(0, 260),
    hay: clean([name, desc, loc, hay].join(' ')).slice(0, 600)
  };
}

/* ================= LUMA ================= */
// Public discover API. `query` needs a coordinate to anchor against, so we sweep a
// spread of tech hubs; `slug` pulls a whole category (tech/ai/crypto) near that point.
// Luma starts dropping connections if you fan out hard, so this is deliberately
// small: one keyword call per hub plus two category sweeps — ~7 requests total.
// The 5-minute CDN cache in front of this endpoint keeps the real-world rate low.
const LUMA_HUBS = [
  ['San Francisco', 37.7749, -122.4194], ['New York', 40.7128, -74.006],
  ['London', 51.5074, -0.1278], ['Bengaluru', 12.9716, 77.5946],
  ['Singapore', 1.3521, 103.8198]
];
const LUMA_SWEEP = [['San Francisco', 37.7749, -122.4194], ['London', 51.5074, -0.1278]];
const LUMA_API = 'https://api.lu.ma/discover/get-paginated-events';

function lumaEvent(entry) {
  const e = entry && entry.event; if (!e) return null;
  const geo = e.geo_address_info || {};
  const online = e.location_type === 'online' || e.location_type === 'virtual';
  const place = [geo.city, geo.country].filter(Boolean).join(', ') || clean(geo.address);
  return mk({
    src: 'Luma', extId: 'luma:' + e.api_id, name: e.name,
    start: localDate(e.start_at, e.timezone), end: localDate(e.end_at || e.start_at, e.timezone),
    fmt: online ? 'Online' : (place ? 'In-person' : 'Online'),
    loc: online ? 'Online / Virtual' : (place || 'See event page'),
    url: e.url ? 'https://lu.ma/' + e.url : '',
    desc: '', hay: [geo.city, geo.region, geo.country, e.location_type].join(' ')
  });
}

async function luma(queries, deadline) {
  const out = [];
  const calls = [];
  for (const [, lat, lon] of LUMA_HUBS) {
    calls.push(`${LUMA_API}?query=${encodeURIComponent(queries[0])}&latitude=${lat}&longitude=${lon}&pagination_limit=30`);
  }
  for (const q of queries.slice(1)) {
    const [, lat, lon] = LUMA_HUBS[0];
    calls.push(`${LUMA_API}?query=${encodeURIComponent(q)}&latitude=${lat}&longitude=${lon}&pagination_limit=30`);
  }
  for (const [, lat, lon] of LUMA_SWEEP) {
    calls.push(`${LUMA_API}?slug=tech&latitude=${lat}&longitude=${lon}&pagination_limit=30`);
  }
  const results = await pool(LUMA_CONCURRENCY, calls.map(u =>
    () => Date.now() > deadline ? null : json(u)));
  for (const d of results) {
    for (const entry of (d && d.entries) || []) { const ev = lumaEvent(entry); if (ev) out.push(ev); }
  }
  return out;
}

/* ================= EVENTBRITE ================= */
// Public /d/<place>/<query>/ search pages carry a schema.org ItemList of Events.
function ldBlocks(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m; while ((m = re.exec(html))) { try { out.push(JSON.parse(m[1])); } catch (_) { } }
  return out;
}
function schemaEvent(it, src, idPrefix) {
  if (!it || !/Event/.test(it['@type'] || '')) return null;
  const online = /Online/i.test(it.eventAttendanceMode || '') ||
    /VirtualLocation/i.test((it.location && it.location['@type']) || '');
  const L = it.location || {};
  const addr = L.address || {};
  const place = clean([L.name, addr.addressLocality, addr.addressRegion, addr.addressCountry]
    .filter(v => v && typeof v === 'string').join(', '));
  const tz = it.startDate && /[Z+]/.test(String(it.startDate).slice(10)) ? 'UTC' : null;
  return mk({
    src, extId: idPrefix + (it.url || it.name), name: it.name,
    start: tz ? localDate(it.startDate, 'UTC') : String(it.startDate || '').slice(0, 10),
    end: it.endDate ? (tz ? localDate(it.endDate, 'UTC') : String(it.endDate).slice(0, 10)) : null,
    fmt: online ? 'Online' : (place ? 'In-person' : 'Online'),
    loc: online ? 'Online / Virtual' : (place || 'See event page'),
    url: it.url || '', desc: it.description, hay: place
  });
}
async function eventbrite(queries, deadline) {
  const slug = q => encodeURIComponent(String(q).trim().replace(/\s+/g, '-').toLowerCase());
  const urls = [];
  for (const q of queries) {
    urls.push(`https://www.eventbrite.com/d/online/${slug(q)}/`);
    urls.push(`https://www.eventbrite.com/d/united-states/${slug(q)}/`);
  }
  const out = [];
  const res = await Promise.allSettled(urls.map(u =>
    Date.now() > deadline ? Promise.resolve(null) : grab(u)));
  for (const r of res) {
    const html = r.status === 'fulfilled' && r.value ? r.value.text : '';
    for (const blk of ldBlocks(html)) {
      const list = (blk && blk.itemListElement) || [];
      for (const li of list) {
        const ev = schemaEvent(li && li.item, 'Eventbrite', 'eb:');
        if (ev) out.push(ev);
      }
    }
  }
  return out;
}

/* ================= MEETUP ================= */
// /find/?source=EVENTS embeds a bare JSON-LD array of Event objects.
async function meetup(queries, deadline) {
  const urls = queries.map(q =>
    `https://www.meetup.com/find/?keywords=${encodeURIComponent(q)}&source=EVENTS&distance=anyDistance`);
  const out = [];
  const res = await Promise.allSettled(urls.map(u =>
    Date.now() > deadline ? Promise.resolve(null) : grab(u)));
  for (const r of res) {
    const html = r.status === 'fulfilled' && r.value ? r.value.text : '';
    for (const blk of ldBlocks(html)) {
      for (const it of (Array.isArray(blk) ? blk : [blk])) {
        const ev = schemaEvent(it, 'Meetup', 'mu:');
        if (ev) out.push(ev);
      }
    }
  }
  return out;
}

/* ================= MAVEN ================= */
// maven.com/courses server-renders __NEXT_DATA__ with ~100 courses and, for each,
// its next live cohort — that cohort's start date is the calendar-worthy bit.
function nextData(html) {
  const m = html.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (_) { return null; }
}
const titleCase = s => String(s || '').replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, c => c.toUpperCase()).trim();

async function maven(queries, deadline) {
  if (Date.now() > deadline) return [];
  const r = await grab('https://maven.com/courses');
  const d = nextData(r.text || '');
  const items = (d && d.props && d.props.pageProps && d.props.pageProps.courses
    && d.props.pageProps.courses.items) || [];
  const out = [];
  for (const it of items) {
    const c = it.course || {}, ch = it.next_live_cohort || {}, sch = it.school || {};
    if (!ch.start_date) continue;
    const name = clean(c.name) || titleCase(c.slug);
    const instr = ((c.instructor_infos || [])[0] || {}).name || sch.name || '';
    const tags = (c.course_tags || []).map(t => t && t.label).filter(Boolean).join(' ');
    // Maven is a course catalogue, not an event search — the caller's "hackathon"
    // query doesn't apply here, so every upcoming live cohort is returned and the
    // relevance pass below decides what survives.
    const ev = mk({
      src: 'Maven', extId: 'maven:' + (c.id || c.slug),
      name: name + (instr ? ' — ' + clean(instr) : ''),
      start: localDate(ch.start_date, sch.timezone || 'UTC'),
      end: localDate(ch.end_date || ch.start_date, sch.timezone || 'UTC'),
      fmt: 'Online', loc: 'Online cohort course',
      url: sch.slug && c.slug ? `https://maven.com/${sch.slug}/${c.slug}` : 'https://maven.com/courses',
      desc: clean(c.description) || `Live cohort course on Maven${instr ? ' with ' + clean(instr) : ''}.`,
      hay: tags + ' course cohort'
    });
    if (ev) {
      const dl = ch.attrs && ch.attrs.application_deadline;
      if (dl) ev.regClose = localDate(dl, sch.timezone || 'UTC');
      out.push(ev);
    }
  }
  return out;
}

/* ================= relevance ================= */
// The category sweeps (Luma's whole "tech" feed, Meetup's keyword pages) drag in
// art swaps and picnics alongside real build events, so every event is classified
// and the caller picks how wide a net to keep.
const HACK_RE = /\b(hack[- ]?a?thon|hackfest|hack night|buildathon|build[- ]?a?thon|jam(?:\b|s\b)|game jam|codefest|code fest|ctf|capture the flag|datathon|makeathon|ideathon|demo day|pitch (?:day|night|competition)|coding (?:challenge|competition|contest)|hack)\b/i;
const TECH_RE = /\b(ai|ml|machine learning|llm|agent|genai|dev(?:eloper)?s?|engineer|coding|code|software|startup|founder|web3|crypto|blockchain|solidity|data|cloud|devops|open ?source|api|robotics|hardware|cyber|security|saas|product|design system|tech)\b/i;

function classify(e) {
  const hay = (e.name + ' ' + e.hay + ' ' + e.desc);
  if (e.src === 'Maven') return 'course';
  if (HACK_RE.test(hay)) return 'hackathon';
  if (TECH_RE.test(hay)) return 'tech';
  return 'other';
}
// 'hack' → build events + the explicitly-requested Maven courses
// 'tech' → everything above plus general tech meetups
// 'all'  → no filtering at all
const KEEP = {
  hack: k => k === 'hackathon' || k === 'course',
  tech: k => k !== 'other',
  all: () => true
};

/* ================= login-walled sources ================= */
const WALLED = {
  linkedin: {
    label: 'LinkedIn',
    reason: 'LinkedIn redirects every events URL to its login wall for signed-out visitors and offers no public events API, so it cannot be fetched server-side.',
    searchUrl: q => 'https://www.linkedin.com/search/results/events/?keywords=' + encodeURIComponent(q)
  },
  facebook: {
    label: 'Facebook',
    reason: 'Facebook event pages render a login gate for signed-out visitors, and the Graph API removed public event search in 2018, so it cannot be fetched server-side.',
    searchUrl: q => 'https://www.facebook.com/events/search/?q=' + encodeURIComponent(q)
  }
};

/* ================= handler ================= */
const ADAPTERS = { luma, eventbrite, meetup, maven };

export default async function handler(req, res) {
  const p = (req.query || {});
  const first = v => Array.isArray(v) ? v[0] : v;

  const queries = String(first(p.q) || 'hackathon')
    .split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
  const want = String(first(p.sources) || 'luma,eventbrite,meetup,maven')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const limit = Math.min(Math.max(parseInt(first(p.limit), 10) || 400, 1), 1000);
  const keep = KEEP[String(first(p.filter) || 'hack').toLowerCase()] || KEEP.hack;
  const deadline = Date.now() + BUDGET_MS;

  const sources = [];
  const runs = want.filter(s => ADAPTERS[s]).map(async name => {
    const t0 = Date.now();
    try {
      const evs = await ADAPTERS[name](queries, deadline);
      sources.push({ source: name, ok: true, count: evs.length, ms: Date.now() - t0 });
      return evs;
    } catch (e) {
      sources.push({ source: name, ok: false, count: 0, ms: Date.now() - t0, error: String((e && e.message) || e) });
      return [];
    }
  });
  for (const name of want) {
    if (WALLED[name]) {
      sources.push({
        source: name, ok: false, supported: false, count: 0,
        error: WALLED[name].reason, searchUrl: WALLED[name].searchUrl(queries[0] || 'hackathon')
      });
    } else if (!ADAPTERS[name]) {
      sources.push({ source: name, ok: false, supported: false, count: 0, error: 'Unknown source' });
    }
  }

  const settled = await Promise.allSettled(runs);
  const all = [];
  for (const r of settled) if (r.status === 'fulfilled') all.push(...r.value);

  // de-dupe on name+date (an event cross-posted to Luma and Eventbrite is one event)
  const seen = new Map();
  for (const e of all) {
    if (!isFuture(e)) continue;
    e.kind = classify(e);
    if (!keep(e.kind)) continue;
    const k = e.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + e.start;
    if (!seen.has(k)) seen.set(k, e);
  }
  const events = [...seen.values()].sort((a, b) => a.start.localeCompare(b.start)).slice(0, limit);

  // 5-minute CDN cache keeps "refresh" snappy without hammering the upstreams;
  // stale-while-revalidate means a refresh never blocks on a cold fetch.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  res.status(200).json({
    fetchedAt: new Date().toISOString(),
    query: queries, count: events.length, sources, events
  });
}
