import assert from 'node:assert/strict';
import test from 'node:test';

import { parseLablabDirectory } from '../api/_lib/lablab.mjs';

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
