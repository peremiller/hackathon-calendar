import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildCalendar,
  futureStartingEvents,
  startsTodayOrLater,
} from '../api/_lib/calendar.mjs';

test('upcoming means an event starts today or later', () => {
  const today = '2026-08-29';
  assert.equal(startsTodayOrLater({ start: '2026-06-07', end: '2026-09-27' }, today), false);
  assert.equal(startsTodayOrLater({ start: today, end: '2026-08-30' }, today), true);
  assert.equal(startsTodayOrLater({ start: '2026-08-30', end: '2026-08-30' }, today), true);
});

test('Google Calendar feed excludes events whose start date has passed', () => {
  const events = futureStartingEvents([
    { id: 'ongoing', name: 'Already started', start: '2026-06-07', end: '2026-09-27' },
    { id: 'today', name: 'Starts today', start: '2026-08-29', end: '2026-08-29' },
    { id: 'future', name: 'Starts later', start: '2026-09-01', end: '2026-09-02' },
  ], '2026-08-29');

  assert.deepEqual(events.map(event => event.id), ['today', 'future']);
});

test('builds a Google-compatible all-day calendar with an exclusive end date', () => {
  const calendar = buildCalendar([{
    id: 'future',
    name: 'AI, Data & Cloud Summit',
    start: '2026-09-01',
    end: '2026-09-02',
    fmt: 'Hybrid',
    loc: 'Manila',
    tags: ['AI/ML', 'Data'],
    src: 'Substack',
    url: 'https://example.com/event',
  }], { generatedAt: '2026-08-29T00:00:00.000Z' });

  assert.match(calendar, /BEGIN:VCALENDAR\r\n/);
  assert.match(calendar, /DTSTART;VALUE=DATE:20260901\r\n/);
  assert.match(calendar, /DTEND;VALUE=DATE:20260903\r\n/);
  assert.match(calendar, /SUMMARY:AI\\, Data & Cloud Summit\r\n/);
  assert.match(calendar, /Source: Substack/);
});

test('the web Upcoming filter uses start-date semantics everywhere it is labelled upcoming', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /if\(upOnly && !isUpcoming\(ev,t\)\) return false/);
  assert.match(html, /data\.filter\(e=>isUpcoming\(e,t\)\)\.length/);
  assert.match(html, /filtered\(\)\.filter\(e=>isUpcoming\(e,t\)\)/);
  assert.match(html, /evs\.filter\(x=>isUpcoming\(x,today\)\)/);
});
