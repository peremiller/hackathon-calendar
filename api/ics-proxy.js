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
    // Not an .ics feed — maybe a lu.ma / event HTML page. Look for a calendar link.
    const m = first.text.match(/https?:\/\/api\.lu\.ma\/ics\/get[^"'\s\\]+/i)
           || first.text.match(/webcal:\/\/[^"'\s\\]+/i)
           || first.text.match(/https?:\/\/[^"'\s\\]*\.ics\b[^"'\s\\]*/i);
    if (m) {
      const icsUrl = m[0].replace(/^webcal:\/\//i, 'https://').replace(/&amp;/g, '&');
      const second = await grab(icsUrl);
      if (looksLikeICS(second.text)) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({ ics: second.text, resolvedFrom: icsUrl });
        return;
      }
    }
    res.status(422).json({
      error: 'No calendar (.ics) feed found at that URL. In Luma, open the calendar → Subscribe → copy the iCal / webcal link and paste that.'
    });
  } catch (e) {
    res.status(502).json({ error: 'Could not fetch the feed: ' + String((e && e.message) || e) });
  }
}
