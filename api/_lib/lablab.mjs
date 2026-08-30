// Public lablab.ai hackathon-directory ingestion for HackCal.
//
// The directory is server-rendered and each event card links to a stable
// /ai-hackathons/<slug> page.  We deliberately read only public card data;
// no account, cookie, or private API is required. Events whose dates are still
// TBA are skipped until lablab publishes a real calendar range.

import { parseDateRange } from './substack.mjs';

const DIRECTORY_URL = 'https://lablab.ai/ai-hackathons';
const READER_URL = `https://r.jina.ai/${DIRECTORY_URL}`;
const CALENDAR_URL = 'https://luma.com/lablab.ai';

const decode = value => String(value == null ? '' : value)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;|&rsquo;/g, "'")
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));

const text = html => decode(String(html || '')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function titleFromSlug(slug) {
  return String(slug || '').split('-').filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    .replace(/\bAi\b/g, 'AI').replace(/\bAmd\b/g, 'AMD')
    .replace(/\bIbm\b/g, 'IBM').replace(/\bIii\b/g, 'III')
    .replace(/\bAssemblyai\b/g, 'AssemblyAI')
    .replace(/\bWearedevelopers\b/g, 'WeAreDevelopers')
    .replace(/\bTechex\b/g, 'TechEx').replace(/\bLablab\b/g, 'lablab');
}

function cardTitle(raw, slug) {
  const candidates = [];
  const heading = String(raw || '').match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (heading) candidates.push(text(heading[1]));
  for (const match of String(raw || '').matchAll(/\balt=["']([^"']+)["']/gi)) {
    candidates.push(text(match[1]).replace(/\s+(?:event\s+)?thumbnail$/i, ''));
  }
  const labelled = candidates.find(value => value.length >= 4 && value.length <= 110 &&
    /(?:hackathon|challenge|academy|agents|genesis)/i.test(value));
  return labelled || titleFromSlug(slug);
}

function eventLocation(card, format) {
  if (format === 'Online') return 'Online / Virtual';
  const match = String(card || '').match(/(?:on-site\s+venue|venue|location)\s*(?:\([^)]*\))?\s*[:\-–—]?\s*([\s\S]{3,110}?)(?=\s+(?:on-site participation|travel|build|prize|register|apply|sign up|$))/i);
  if (match) return text(match[1]).slice(0, 70);
  return format === 'Hybrid' ? 'Online + on-site (see event page)' : 'See event page';
}

export function parseLablabDirectory(html, now = new Date()) {
  const events = [], slugs = new Set(), cards = [];
  const floor = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  const source = String(html || '');
  const re = /<a\b[^>]*href=["'](?:https:\/\/lablab\.ai)?(\/ai-hackathons\/([^"'/?#]+))[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(source))) {
    cards.push({ path: match[1], slug: match[2], raw: match[3], name: null });
  }
  // Cloudflare challenges serverless requests to lablab.ai. Jina Reader exposes
  // the same public page as Markdown, retaining each official card and URL.
  const markdown = /\[!\[Image\s+\d+:\s*([^\]]+)\]\([^)]+\)\s*([\s\S]*?)\]\(https:\/\/lablab\.ai(\/ai-hackathons\/([^\s)#]+))\)/gi;
  while ((match = markdown.exec(source))) {
    cards.push({ path: match[3], slug: match[4], raw: match[2], name: text(match[1]) });
  }
  for (const item of cards) {
    const path = item.path, slug = item.slug.toLowerCase();
    if (slugs.has(slug)) continue;
    slugs.add(slug);
    const card = text(item.raw).replace(/#{1,6}\s*/g, '');
    const date = parseDateRange(card, now);
    // A calendar cannot plot a TBA item truthfully. It will be picked up on a
    // later refresh as soon as lablab publishes an actual range.
    if (!date || date.end < floor) continue;
    const name = (item.name || cardTitle(item.raw, slug)).slice(0, 110);
    const format = /\bhybrid\b/i.test(card) ? 'Hybrid'
      : /\b(?:online|virtual)\b/i.test(card) ? 'Online' : 'In-person';
    const at = card.toLowerCase().indexOf(name.toLowerCase());
    const description = (at >= 0 ? card.slice(at + name.length) : card).trim();
    events.push({
      src: 'lablab.ai', extId: `lablab:${slug}`, name,
      start: date.start, end: date.end, startAt: null, endAt: null,
      tz: null, allDay: true, fmt: format, loc: eventLocation(card, format),
      url: new URL(path, DIRECTORY_URL).href,
      desc: description.slice(0, 260),
      hay: `${card} lablab.ai AI developer hackathon`.slice(0, 600)
    });
  }
  return events;
}

export function parseLablabCalendar(html) {
  const events = [];
  const scripts = String(html || '').match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const raw = script.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    let data; try { data = JSON.parse(decode(raw)); } catch (_) { continue; }
    if (!data || data['@type'] !== 'ItemList') continue;
    for (const row of data.itemListElement || []) {
      const item = row && row.item;
      if (!item || item['@type'] !== 'Event' || !item.name || !item.startDate) continue;
      const location = item.location || {}, address = location.address || {};
      const place = text([location.name, address.addressLocality, address.addressCountry]
        .filter(Boolean).join(', ')).slice(0, 70);
      const online = /OnlineEventAttendanceMode/i.test(item.eventAttendanceMode || '');
      const slug = String(item.url || item['@id'] || item.name).split('/').filter(Boolean).pop();
      events.push({
        src: 'lablab.ai', extId: `lablab:luma:${slug}`, name: text(item.name).slice(0, 110),
        start: String(item.startDate).slice(0, 10),
        end: String(item.endDate || item.startDate).slice(0, 10),
        startAt: item.startDate, endAt: item.endDate || item.startDate,
        tz: null, allDay: false, fmt: online ? 'Online' : 'Hybrid',
        loc: online ? 'Online / Virtual' : (place || 'Online + on-site (see event page)'),
        url: item.url || item['@id'] || CALENDAR_URL,
        desc: 'Official event published on the lablab.ai events calendar.',
        hay: `${item.name} ${place} lablab.ai AI developer hackathon`.slice(0, 600)
      });
    }
  }
  return events;
}

export async function fetchLablabEvents({ grab, deadline = Infinity, now = new Date() } = {}) {
  if (typeof grab !== 'function') throw new Error('A fetch helper is required');
  if (Date.now() > deadline) return [];
  const results = await Promise.allSettled([
    grab(READER_URL),
    grab(CALENDAR_URL),
  ]);
  const directoryResponse = results[0].status === 'fulfilled' ? results[0].value : null;
  const calendarResponse = results[1].status === 'fulfilled' ? results[1].value : null;
  const directory = directoryResponse && directoryResponse.ok
    ? parseLablabDirectory(directoryResponse.text, now) : [];
  const calendar = calendarResponse && calendarResponse.ok
    ? parseLablabCalendar(calendarResponse.text) : [];
  const seen = new Map();
  // Prefer the lablab directory's full online-build range when an event is also
  // present on Luma, whose listing may cover only the on-site phase.
  for (const event of [...directory, ...calendar]) {
    const key = event.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seen.has(key)) seen.set(key, event);
  }
  if (!seen.size) {
    const status = [directoryResponse, calendarResponse].map(r => r && r.status).filter(Boolean).join('/');
    throw new Error(`lablab.ai public feeds returned no dated events${status ? ` (HTTP ${status})` : ''}`);
  }
  return [...seen.values()];
}
