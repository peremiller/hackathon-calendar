// Interactive side of the bot: Telegram POSTs updates here.
//
//   POST /api/telegram-webhook   (header x-telegram-bot-api-secret-token)
//
// Handles two kinds of update:
//   message         slash commands — /menu /feed /today /tomorrow /id /help
//   callback_query  taps on the inline-keyboard menus
//
// Commands accept arguments (/feed tech global); the menus offer the same
// choices as buttons. There is no datastore — the menu's current scope/region
// travel inside each button's callback_data, so a tap always knows the state it
// came from. See _lib/menu.mjs.

import { buildDigest, parseArgs, SCOPES, REGIONS } from './_lib/digest.mjs';
import { send, editText, answerCallback, esc } from './_lib/tg.mjs';
import {
  decode, mainMenu, scopeMenu, regionMenu, digestMenu, menuHeader,
  SCOPE_LABEL, REGION_LABEL
} from './_lib/menu.mjs';

const HELP = [
  '<b>🚀 HackCal bot</b>',
  'A daily feed of hackathons and tech events for today and tomorrow,',
  'pushed every morning at 07:30 Manila time.',
  '',
  '<b>Commands</b>',
  '/menu — buttons for everything below',
  '/feed — today + tomorrow',
  '/today — just today',
  '/tomorrow — just tomorrow',
  '/id — this chat\'s id',
  '',
  '<b>Arguments</b> (any order, e.g. <code>/feed tech global</code>)',
  `scope: <code>${SCOPES.join('</code> <code>')}</code>`,
  `region: <code>${REGIONS.join('</code> <code>')}</code> — ph means online + Philippines`,
  '',
  '<a href="https://hackathon-calendar-umber.vercel.app">Open HackCal</a>'
].join('\n');

const defaults = () => ({
  scope: SCOPES.includes(process.env.DIGEST_SCOPE) ? process.env.DIGEST_SCOPE : 'hack',
  region: REGIONS.includes(process.env.DIGEST_REGION) ? process.env.DIGEST_REGION : 'ph'
});

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

  try {
    if (body.callback_query) return await onTap(body.callback_query, res);
    return await onMessage(body, res);
  } catch (e) {
    // Always 200 back to Telegram once an update is recognised — a non-2xx makes
    // it retry the same update, which would double-send the digest.
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
}

/* ---------------- button taps ---------------- */
async function onTap(cb, res) {
  const chatId = cb.message && cb.message.chat && cb.message.chat.id;
  const messageId = cb.message && cb.message.message_id;
  const state = decode(cb.data);

  if (!chatId || !state) {
    await answerCallback(cb.id, { text: 'That menu is out of date — send /menu' });
    return res.status(200).json({ ok: true, ignored: true });
  }

  let { act, scope, region } = state;

  // Selecting a value swaps it in and drops straight back to the main menu, so
  // choosing a scope and then a region is two taps rather than a round trip.
  if (act.startsWith('s_')) { scope = act.slice(2); act = 'menu'; }
  else if (act.startsWith('r_')) { region = act.slice(2); act = 'menu'; }

  await answerCallback(cb.id);

  const show = (text, keyboard) => editText(chatId, messageId, text, { keyboard });

  if (act === 'menu') return done(res, await show(menuHeader(scope, region), mainMenu(scope, region)));
  if (act === 'pick_s') return done(res, await show(pickText('scope', SCOPE_LABEL[scope]), scopeMenu(scope, region)));
  if (act === 'pick_r') return done(res, await show(pickText('region', REGION_LABEL[region]), regionMenu(scope, region)));
  if (act === 'help') return done(res, await show(HELP, mainMenu(scope, region)));

  if (act === 'feed' || act === 'd0' || act === 'd1') {
    const opts = act === 'feed'
      ? { scope, region }
      : { scope, region, days: 1, offset: act === 'd1' ? 1 : 0 };
    const d = await buildDigest(opts);
    // A digest replaces the menu in place; the digest keyboard keeps the
    // controls attached so the chat doesn't fill with orphaned menus.
    return done(res, await show(d.text, digestMenu(scope, region)));
  }

  return done(res, await show(menuHeader(scope, region), mainMenu(scope, region)));
}

const pickText = (what, current) =>
  `<b>Choose a ${what}</b>\n<i>Currently: ${esc(current)}</i>`;

const done = (res, r) => res.status(200).json({ ok: true, result: r ? Object.keys(r)[0] : 'ok' });

/* ---------------- slash commands ---------------- */
async function onMessage(body, res) {
  const msg = body.message || body.edited_message || body.channel_post;
  const chatId = msg && msg.chat && msg.chat.id;
  const text = String((msg && msg.text) || '').trim();
  if (!chatId || !text) return res.status(200).json({ ok: true, ignored: true });

  // "/feed@HackCalBot tech" → cmd "/feed", rest "tech"
  const [rawCmd, ...rest] = text.split(/\s+/);
  const cmd = rawCmd.toLowerCase().split('@')[0];
  const args = parseArgs(rest.join(' '));
  const d0 = defaults();
  const scope = args.scope || d0.scope;
  const region = args.region || d0.region;

  try {
    if (cmd === '/start' || cmd === '/menu') {
      await send(chatId, menuHeader(scope, region), { keyboard: mainMenu(scope, region) });
    } else if (cmd === '/help') {
      await send(chatId, HELP, { keyboard: mainMenu(scope, region) });
    } else if (cmd === '/id') {
      await send(chatId, `Chat id: <code>${esc(chatId)}</code>\nPaste it into <code>TELEGRAM_CHAT_ID</code> to receive the 7:30am push.`);
    } else if (cmd === '/feed' || cmd === '/digest' || cmd === '/today' || cmd === '/tomorrow') {
      const opts = cmd === '/feed' || cmd === '/digest'
        ? { scope, region }
        : { scope, region, days: 1, offset: cmd === '/tomorrow' ? 1 : 0 };
      const d = await buildDigest(opts);
      await send(chatId, d.text, { keyboard: digestMenu(scope, region) });
    } else if (cmd.startsWith('/')) {
      await send(chatId, `Unknown command <code>${esc(cmd)}</code>.\n\n${HELP}`,
        { keyboard: mainMenu(scope, region) });
    } else {
      return res.status(200).json({ ok: true, ignored: true });
    }
  } catch (e) {
    try { await send(chatId, `⚠️ ${esc(String(e.message || e))}`); } catch (_) { }
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
  return res.status(200).json({ ok: true });
}

function safeParse(s) { try { return JSON.parse(s); } catch (_) { return {}; } }
