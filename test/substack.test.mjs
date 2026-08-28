import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDateRange, parseSubstackFeed, publicSubstackFeeds } from '../api/_lib/substack.mjs';

test('parses month-first and cross-month date ranges', () => {
  assert.deepEqual(parseDateRange('September 4–5, 2026', new Date('2026-08-28')), {
    start: '2026-09-04', end: '2026-09-05', match: 'September 4–5, 2026'
  });
  const cross = parseDateRange('30 September – 2 October 2026', new Date('2026-08-28'));
  assert.equal(cross.start, '2026-09-30');
  assert.equal(cross.end, '2026-10-02');
});

test('extracts multiple dated tech events from a Substack RSS item', () => {
  const xml = `<?xml version="1.0"?><rss><channel><title>Metro Tech Events</title><item>
    <title><![CDATA[This week's developer events]]></title>
    <link>https://example.substack.com/p/weekly-events</link>
    <pubDate>Fri, 28 Aug 2026 08:00:00 GMT</pubDate>
    <content:encoded><![CDATA[
      <h2>AI Governance Summit</h2>
      <p>August 31, 2026 · 9:00 AM · Online</p>
      <p><a href="https://events.example.com/ai-summit">Register</a></p>
      <ul><li><a href="https://events.example.com/devcon">Manila Developer Conference</a>
      — September 4–5, 2026 — SMX Convention Center, Manila</li></ul>
    ]]></content:encoded>
  </item></channel></rss>`;
  const events = parseSubstackFeed(xml, { name: 'Metro Tech Events', loc: 'Metro Manila, Philippines', eventFocused: true }, new Date('2026-08-28'));
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(e => [e.name, e.start, e.end, e.src]), [
    ['AI Governance Summit', '2026-08-31', '2026-08-31', 'Substack'],
    ['Manila Developer Conference', '2026-09-04', '2026-09-05', 'Substack']
  ]);
  assert.equal(events[0].fmt, 'Online');
  assert.equal(events[0].startAt, '2026-08-31T09:00:00');
  assert.equal(events[1].url, 'https://events.example.com/devcon');
});

test('rejects non-Substack configured feed hosts', () => {
  const previous = process.env.SUBSTACK_FEEDS;
  process.env.SUBSTACK_FEEDS = 'https://attacker.example/feed';
  assert.equal(publicSubstackFeeds().some(f => f.url.includes('attacker.example')), false);
  if (previous == null) delete process.env.SUBSTACK_FEEDS;
  else process.env.SUBSTACK_FEEDS = previous;
});
