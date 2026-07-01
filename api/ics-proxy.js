// Vercel serverless function: fetch an iCalendar (.ics) feed server-side so the
// browser can import it (cross-origin .ics fetches are blocked by CORS).
//
// Usage: GET /api/ics-proxy?url=<feed url>
//   - Accepts https://, http://, and webcal:// URLs (webcal is rewritten to https).
//   - If the URL returns an .ics feed, responds { ics: "<text>" }.
//   - If it returns an HTML page (e.g. a lu.ma calendar/event page), tries to
//     discover an embedded .ics / webcal / api.lu.ma link and fetch that.
//
// Works with Luma ("Subscribe" → iCal link), Google Calendar (secret .ics),
// Meetup, Eventbrite, and any standard iCalendar feed.

const looksLikeICS = t => /BEGIN:VCALENDAR/i.test(t || '');

async function grab(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'HackCal/1.0 (+calendar import)', 'Accept': 'text/calendar, text/html, */*' },
    redirect: 'follow'
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

export default async function handler(req, res) {
  let url = (req.query && req.query.url) || '';
  if (Array.isArray(url)) url = url[0];
  url = String(url || '').trim();
  if (!url) { res.status(400).json({ error: 'Missing ?url parameter' }); return; }

  url = url.replace(/^webcal:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(url)) { res.status(400).json({ error: 'URL must start with https://, http:// or webcal://' }); return; }
  // A literal '#' in a calendar URL (e.g. Google Calendar IDs) is part of the feed
  // address, not a fragment — re-encode it so fetch() doesn't drop everything after it.
  url = url.replace(/#/g, '%23');

  try {
    const first = await grab(url);
    if (looksLikeICS(first.text)) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ ics: first.text });
      return;
    }
    // Not an .ics feed — probably a lu.ma (or other) event/calendar HTML page.
    // Build a list of candidate .ics URLs and try each until one is a real feed.
    const html = first.text;
    const candidates = [];
    // 1. Any api.lu.ma/ics/get link embedded in the page.
    let m; const re = /https?:\/\/api\.lu\.ma\/ics\/get[^"'\s\\]+/gi;
    while ((m = re.exec(html))) candidates.push(m[0]);
    // 2. Construct from the event/calendar API id that lu.ma server-renders into the page.
    const evId = html.match(/"api_id"\s*:\s*"(evt-[A-Za-z0-9]+)"/);
    if (evId) candidates.push('https://api.lu.ma/ics/get?entity=event&id=' + evId[1]);
    const calId = html.match(/"api_id"\s*:\s*"(cal-[A-Za-z0-9]+)"/);
    if (calId) candidates.push('https://api.lu.ma/ics/get?entity=calendar&id=' + calId[1]);
    // 3. lu.ma/<slug> → try the conventional per-event .ics path.
    const slug = url.match(/^https?:\/\/lu\.ma\/([A-Za-z0-9_-]+)/i);
    if (slug) candidates.push('https://lu.ma/' + slug[1] + '.ics');
    // 4. Any webcal:// or *.ics link found in the page.
    const wc = html.match(/webcal:\/\/[^"'\s\\]+/i); if (wc) candidates.push(wc[0]);
    const ics = html.match(/https?:\/\/[^"'\s\\]*\.ics\b[^"'\s\\]*/i); if (ics) candidates.push(ics[0]);

    const seen = new Set();
    for (const c of candidates) {
      const cand = c.replace(/^webcal:\/\//i, 'https://').replace(/&amp;/g, '&');
      if (seen.has(cand)) continue; seen.add(cand);
      try {
        const r = await grab(cand);
        if (looksLikeICS(r.text)) {
          res.setHeader('Cache-Control', 'no-store');
          res.status(200).json({ ics: r.text, resolvedFrom: cand });
          return;
        }
      } catch (_) { /* try the next candidate */ }
    }
    res.status(422).json({
      error: 'Could not find a calendar (.ics) feed for that link. For a Luma event, the page link usually works; otherwise open the calendar → Subscribe → copy the iCal / webcal link and paste that.'
    });
  } catch (e) {
    res.status(502).json({ error: 'Could not fetch the feed: ' + String((e && e.message) || e) });
  }
}
