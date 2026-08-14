// Scheduled push: builds the today+tomorrow digest and sends it to every chat
// in TELEGRAM_CHAT_ID.
//
//   GET /api/telegram-digest              (Vercel cron: Authorization: Bearer $CRON_SECRET)
//   GET /api/telegram-digest?key=SECRET   (external schedulers that can't set headers)
//   GET /api/telegram-digest?dry=1        render only, send nothing — safe to eyeball
//
// Optional overrides for one-off runs: ?scope=hack|tech|all &region=ph|online|global
//
// Vercel's cron fires this at 23:30 UTC = 07:30 Asia/Manila. On the Hobby plan
// that firing is only guaranteed within the hour, so the same endpoint is also
// callable by an external scheduler for an exact 07:30 — see TELEGRAM.md.

import { buildDigest } from './_lib/digest.mjs';
import { broadcast, chatIds } from './_lib/tg.mjs';

// Constant-time-ish compare; these are short secrets over TLS, but there is no
// reason to leak length/prefix information through an early return.
function eq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, why: 'CRON_SECRET is not set on the deployment' };
  const first = v => Array.isArray(v) ? v[0] : v;
  const auth = String(req.headers.authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const supplied = bearer ||
    String(req.headers['x-cron-secret'] || '') ||
    String(first((req.query || {}).key) || '');
  return eq(supplied, secret) ? { ok: true } : { ok: false, why: 'Bad or missing cron secret' };
}

export default async function handler(req, res) {
  const gate = authorized(req);
  if (!gate.ok) return res.status(401).json({ ok: false, error: gate.why });

  const p = req.query || {};
  const first = v => Array.isArray(v) ? v[0] : v;
  const dry = ['1', 'true', 'yes'].includes(String(first(p.dry) || '').toLowerCase());

  try {
    const digest = await buildDigest({ scope: first(p.scope), region: first(p.region) });
    const ids = chatIds();

    if (dry) {
      return res.status(200).json({ ok: true, dryRun: true, recipients: ids.length, ...summary(digest) });
    }
    if (!ids.length) {
      return res.status(500).json({ ok: false, error: 'TELEGRAM_CHAT_ID is not set — nobody to send to' });
    }

    const results = await broadcast(digest.text, ids);
    const failed = results.filter(r => !r.ok);
    // Report partial failure honestly: a 200 here would tell the scheduler the
    // morning push landed when it did not.
    return res.status(failed.length === results.length ? 502 : 200).json({
      ok: failed.length === 0, results, ...summary(digest)
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}

const summary = d => ({
  scope: d.scope, region: d.region, tz: d.tz,
  window: [d.todayKey, d.tomorrowKey], counts: d.counts,
  stale: d.stale || undefined, text: d.text
});
