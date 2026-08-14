// Interactive side of the bot: Telegram POSTs updates here.
//
//   POST /api/telegram-webhook   (header x-telegram-bot-api-secret-token)
//
// Commands
//   /start /help              what the bot does + this chat's id
//   /id                       chat id, for pasting into TELEGRAM_CHAT_ID
//   /today                    today only
//   /tomorrow                 tomorrow only
//   /feed [scope] [region]    today + tomorrow, any combination on demand
//                             scope  hack | tech | all
//                             region ph | online | global
//
// The scheduled push uses the DIGEST_SCOPE / DIGEST_REGION defaults; the command
// arguments let you pull a wider or narrower view without redeploying. There is
// no datastore here on purpose — arguments are per-request, not persisted.

import { buildDigest, parseArgs, SCOPES, REGIONS } from './_lib/digest.mjs';
import { send, esc } from './_lib/tg.mjs';

const HELP = [
  '<b>🚀 HackCal bot</b>',
  'A daily feed of hackathons and tech events for today and tomorrow.',
  '',
  '<b>Commands</b>',
  '/feed — today + tomorrow (your default scope/region)',
  '/today — just today',
  '/tomorrow — just tomorrow',
  '/id — this chat\'s id',
  '',
  '<b>Arguments</b> (any order, e.g. <code>/feed tech global</code>)',
  `scope: <code>${SCOPES.join('</code> <code>')}</code> — how wide a net to cast`,
  `region: <code>${REGIONS.join('</code> <code>')}</code> — ph means online + Philippines`,
  '',
  `<a href="https://hackathon-calendar-umber.vercel.app">Open HackCal</a>`
].join('\n');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  // Telegram echoes this header on every update; without it anyone who guesses
  // the URL can puppet the bot.
  const want = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!want) return res.status(500).json({ ok: false, error: 'TELEGRAM_WEBHOOK_SECRET is not set' });
  if (String(req.headers['x-telegram-bot-api-secret-token'] || '') !== want) {
    return res.status(401).json({ ok: false, error: 'Bad webhook secret' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const msg = body.message || body.edited_message || body.channel_post;
  const chatId = msg && msg.chat && msg.chat.id;
  const text = String((msg && msg.text) || '').trim();

  // Always 200 back to Telegram once the update is recognised — a non-2xx makes
  // it retry the same update, which would double-send the digest.
  if (!chatId || !text) return res.status(200).json({ ok: true, ignored: true });

  // "/feed@HackCalBot tech" → cmd "/feed", rest "tech"
  const [rawCmd, ...rest] = text.split(/\s+/);
  const cmd = rawCmd.toLowerCase().split('@')[0];
  const args = parseArgs(rest.join(' '));

  try {
    if (cmd === '/start' || cmd === '/help') {
      await send(chatId, `${HELP}\n\nThis chat's id: <code>${esc(chatId)}</code>`);
    } else if (cmd === '/id') {
      await send(chatId, `Chat id: <code>${esc(chatId)}</code>\nPaste it into <code>TELEGRAM_CHAT_ID</code> to receive the 7:30am push.`);
    } else if (cmd === '/feed' || cmd === '/digest') {
      const d = await buildDigest(args);
      await send(chatId, d.text);
    } else if (cmd === '/today') {
      const d = await buildDigest({ ...args, days: 1 });
      await send(chatId, d.text);
    } else if (cmd === '/tomorrow') {
      const d = await buildDigest({ ...args, days: 1, offset: 1 });
      await send(chatId, d.text);
    } else if (cmd.startsWith('/')) {
      await send(chatId, `Unknown command <code>${esc(cmd)}</code>.\n\n${HELP}`);
    } else {
      return res.status(200).json({ ok: true, ignored: true });
    }
  } catch (e) {
    // Surface the failure to the user rather than leaving the message unanswered.
    try { await send(chatId, `⚠️ ${esc(String(e.message || e))}`); } catch (_) { }
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
  return res.status(200).json({ ok: true });
}

function safeParse(s) { try { return JSON.parse(s); } catch (_) { return {}; } }
