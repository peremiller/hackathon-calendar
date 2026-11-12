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

import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import http from 'node:http';
import https from 'node:https';

// The URL is untrusted: never allow calendar imports to access local services
// or cloud instance metadata, even via redirects or DNS changes.
const MAX_FEED_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 10000;
const looksLikeICS = t => /BEGIN:VCALENDAR/i.test(t || '');

export function isPublicAddress(ip) {
  const family = isIP(ip);
  if (family === 4) {
    const [a,b,c] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (family === 6) {
    // Permit only IPv6 global-unicast space; exclude documentation examples.
    const first = parseInt(ip.split(':')[0], 16);
    return first >= 0x2000 && first < 0x4000 && !/^2001:db8:/i.test(ip);
  }
  return false;
}

export function validateFeedURL(value) {
  const raw = String(value || '').trim().replace(/^webcal:\/\//i, 'https://');
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw new Error('Invalid calendar feed URL'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password ||
      (parsed.port && parsed.port !== (parsed.protocol === 'https:' ? '443' : '80'))) {
    throw new Error('Calendar feeds must use HTTP(S) on a standard port, without URL credentials');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.test') ||
      (isIP(host) && !isPublicAddress(host))) {
    throw new Error('Private or local calendar URLs are not permitted');
  }
  return parsed;
}

async function publicDestination(parsed, lookupFn) {
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return {address: host, family: isIP(host)};
  const entries = await lookupFn(host, {all:true, verbatim:true});
  if (!Array.isArray(entries) || entries.length === 0 ||
      entries.some(entry => !isPublicAddress(entry.address))) {
    throw new Error('Calendar host does not resolve exclusively to public addresses');
  }
  return entries[0];
}

function requestPinnedCalendar(parsed, pinned, transport) {
  return new Promise((resolve, reject) => {
    const client = transport || (parsed.protocol === 'https:' ? https : http);
    const chunks = [];
    let size = 0;
    const req = client.request(parsed, {
      method:'GET',
      headers:{
        'User-Agent':'HackCal/1.0 (+calendar import)',
        'Accept':'text/calendar, text/html, */*',
        'Accept-Encoding':'identity'
      },
      // Pin the already-validated public address for this connection, so a
      // second DNS lookup cannot silently redirect the request to localhost.
      lookup:(_host, _options, callback) => callback(null, pinned.address, pinned.family),
      agent:false
    }, response => {
      response.on('data', bytes => {
        size += bytes.length;
        if (size > MAX_FEED_BYTES) {
          req.destroy(new Error('Calendar feed exceeds the allowed size'));
          return;
        }
        chunks.push(bytes);
      });
      response.on('end', () => resolve({
        status: response.statusCode || 502,
        location: response.headers.location,
        text: Buffer.concat(chunks).toString('utf8')
      }));
      response.on('error', reject);
    });
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error('Calendar feed timed out')));
    req.on('error', reject);
    req.end();
  });
}

export async function grab(value, options = {}) {
  let current = validateFeedURL(value);
  const lookupFn = options.lookupFn || dnsLookup;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const pinned = await publicDestination(current, lookupFn);
    const reply = await requestPinnedCalendar(current, pinned, options.transport);
    if ([301,302,303,307,308].includes(reply.status) && reply.location) {
      if (hop === MAX_REDIRECTS) throw new Error('Calendar feed redirect limit exceeded');
      current = validateFeedURL(new URL(reply.location, current).href);
      continue;
    }
    return {ok:reply.status >= 200 && reply.status < 300, status:reply.status, text:reply.text};
  }
  throw new Error('Calendar feed redirect limit exceeded');
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
    if (!first.ok) { res.status(502).json({ error: 'Calendar feed provider returned an error' }); return; }
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
    res.status(502).json({ error: 'Calendar feed unavailable or blocked by security checks' });
  }
}
