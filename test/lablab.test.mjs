import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchLablabEvents,
  parseLablabCalendar,
  parseLablabDirectory,
} from '../api/_lib/lablab.mjs';

const directory = `
  <a href="/ai-hackathons/alpaca-ai-trading-agents-hackathon">
    <img alt="Alpaca AI Trading Agents Hackathon event thumbnail">
    <span>LIVE</span><span>Online</span><span>AUG 28 - SEP 4</span><span>3280</span>
    <h3>Alpaca AI Trading Agents Hackathon</h3>
    <p>Online Hackathon | Dates: 28 August–4 September 2026 | $6,000 Prize Pool</p>
  </a>
  <a href="/ai-hackathons/ai-infra-summit-hackathon">
    <h3>AI Infra Summit Hackathon</h3><span>Register</span><span>Hybrid</span>
    <span>SEP 10 - 17</span>
    <p>Online Build: September 10–16, 2026 | On-site: September 15–17, 2026.</p>
    <p>On-site Venue: Santa Clara Convention Center. On-site participation is by invitation only.</p>
  </a>
  <a href="/ai-hackathons/amd-lablab-ai-academy-challenge">
    <img alt="Lablab x AMD AI Academy Challenge event thumbnail">
    <span>Register Online SEP 1 - DEC 1</span>
    <p>September 1 – December 1, 2026. Individual participation only.</p>
  </a>
  <a href="/ai-hackathons/ai-genesis-2026"><h3>AI GENESIS</h3><p>Dates: TBA</p></a>
  <a href="/ai-hackathons/finished-event"><h3>Finished AI Hackathon</h3><p>August 3–10, 2026</p></a>`;

test('extracts every dated current lablab.ai card and skips TBA or finished cards', () => {
  const events = parseLablabDirectory(directory, new Date('2026-08-30T00:00:00Z'));

  assert.deepEqual(events.map(event => [event.name, event.start, event.end, event.src]), [
    ['Alpaca AI Trading Agents Hackathon', '2026-08-28', '2026-09-04', 'lablab.ai'],
    ['AI Infra Summit Hackathon', '2026-09-10', '2026-09-17', 'lablab.ai'],
    ['Lablab x AMD AI Academy Challenge', '2026-09-01', '2026-12-01', 'lablab.ai'],
  ]);
  assert.equal(events[0].fmt, 'Online');
  assert.equal(events[1].fmt, 'Hybrid');
  assert.match(events[1].loc, /Santa Clara Convention Center/);
  assert.equal(events[2].url, 'https://lablab.ai/ai-hackathons/amd-lablab-ai-academy-challenge');
});

test('parses lablab cards from the public Markdown reader fallback', () => {
  const markdown = `[![Image 1: IBM Bob 2.0 hackathon](https://img.example/bob.jpg) Register Online SEP 25 - 27 7137 ## IBM Bob 2.0 hackathon 💻 Online Hackathon | September 25–27, 2026](https://lablab.ai/ai-hackathons/ibm-bob-2-hackathon)`;
  const events = parseLablabDirectory(markdown, new Date('2026-08-30T00:00:00Z'));

  assert.deepEqual(events.map(event => [event.name, event.start, event.end, event.fmt]), [
    ['IBM Bob 2.0 hackathon', '2026-09-25', '2026-09-27', 'Online'],
  ]);
});

test('adds newly dated lablab events from its official Luma calendar', () => {
  const html = `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"@type":"Event","url":"https://luma.com/genesis","name":"AI GENESIS","eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode","startDate":"2026-11-02T10:00:00.000+04:00","endDate":"2026-11-03T20:00:00.000+04:00","location":{"name":"Dubai","address":{"addressLocality":"Dubai","addressCountry":"AE"}}}}]}</script>`;
  const events = parseLablabCalendar(html);

  assert.deepEqual(events.map(event => [event.name, event.start, event.end, event.fmt]), [
    ['AI GENESIS', '2026-11-02', '2026-11-03', 'Hybrid'],
  ]);
});

test('combines the directory and official calendar without duplicate cross-posts', async () => {
  const markdown = `[![Image 1: AI Infra Summit Hackathon](https://img.example/infra.jpg) Register Hybrid SEP 10 - 17 2084 ## AI Infra Summit Hackathon](https://lablab.ai/ai-hackathons/ai-infra-summit-hackathon)

[![Image 2: TechEx Amsterdam Hackathon - AI & Big Data Expo Europe](https://img.example/techex.jpg) Register Hybrid OCT 16 - 19 ## TechEx Amsterdam Hackathon - AI & Big Data Expo Europe](https://lablab.ai/ai-hackathons/techex-amsterdam-hackathon)`;
  const calendar = `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"@type":"Event","url":"https://luma.com/infra","name":"AI Infra Summit Hackathon","startDate":"2026-09-15T08:00:00-07:00","endDate":"2026-09-17T16:00:00-07:00"}},{"item":{"@type":"Event","url":"https://luma.com/techex","name":"TechEx Amsterdam Hackathon","startDate":"2026-10-19T09:00:00+02:00","endDate":"2026-10-20T16:00:00+02:00"}},{"item":{"@type":"Event","url":"https://luma.com/genesis","name":"AI GENESIS","startDate":"2026-11-02T10:00:00+04:00","endDate":"2026-11-03T20:00:00+04:00"}}]}</script>`;
  const events = await fetchLablabEvents({
    now: new Date('2026-08-30T00:00:00Z'),
    grab: async url => ({ ok: true, status: 200, text: url.includes('r.jina.ai') ? markdown : calendar }),
  });

  assert.deepEqual(events.map(event => [event.name, event.start]), [
    ['AI Infra Summit Hackathon', '2026-09-10'],
    ['TechEx Amsterdam Hackathon - AI & Big Data Expo Europe', '2026-10-16'],
    ['AI GENESIS', '2026-11-02'],
  ]);
  assert.equal(events[1].end, '2026-10-20');
});
