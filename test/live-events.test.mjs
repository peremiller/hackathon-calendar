import test from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentOrFuture, manilaDateKey } from '../api/live-events.js';

test('uses the current Manila calendar date', () => {
  assert.equal(manilaDateKey(new Date('2026-08-28T16:30:00Z')), '2026-08-29');
});

test('keeps current multi-day events and removes ended events', () => {
  assert.equal(isCurrentOrFuture({ start: '2026-08-27', end: '2026-08-29' }, '2026-08-29'), true);
  assert.equal(isCurrentOrFuture({ start: '2026-08-27', end: '2026-08-28' }, '2026-08-29'), false);
  assert.equal(isCurrentOrFuture({ start: '2026-08-30', end: '2026-08-30' }, '2026-08-29'), true);
});
