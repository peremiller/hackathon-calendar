// Minimal Telegram Bot API client for HackCal's daily digest bot.
//
// Deliberately dependency-free: one POST helper, HTML escaping, message
// chunking, and the few methods the inline menus need. Telegram hard-caps a
// message at 4096 characters, and a busy day in "global / all" mode blows
// straight past that, so send() splits on event boundaries rather than
// mid-entity (a split inside <b>…</b> is rejected by Telegram with a 400).

const API = t => `https://api.telegram.org/bot${t}`;
const LIMIT = 3900;            // headroom under Telegram's 4096 hard cap

export const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return t;
}

// Recipients for the scheduled push. Comma-separated so the same digest can go
// to a personal chat and a group without any datastore.
export function chatIds() {
  return String(process.env.TELEGRAM_CHAT_ID || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

export async function call(method, body, tok = token()) {
  const r = await fetch(`${API(tok)}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) {
    throw new Error(`Telegram ${method} failed: ${data.description || r.status}`);
  }
  return data.result;
}

// Split on blank-line boundaries so every chunk is standalone valid HTML.
export function chunk(text, limit = LIMIT) {
  if (text.length <= limit) return [text];
  const out = [];
  let buf = '';
  for (const block of text.split('\n\n')) {
    const piece = block.length > limit ? block.slice(0, limit) : block;
    if (buf && buf.length + piece.length + 2 > limit) { out.push(buf); buf = piece; }
    else buf = buf ? buf + '\n\n' + piece : piece;
  }
  if (buf) out.push(buf);
  return out;
}

// The keyboard rides on the LAST chunk only — buttons under a mid-thread
// fragment would sit above the rest of the digest.
export async function send(chatId, text, { keyboard = null, tok = token() } = {}) {
  const parts = chunk(text);
  const sent = [];
  for (let i = 0; i < parts.length; i++) {
    const body = {
      chat_id: chatId, text: parts[i],
      parse_mode: 'HTML', disable_web_page_preview: true
    };
    if (keyboard && i === parts.length - 1) body.reply_markup = { inline_keyboard: keyboard };
    sent.push(await call('sendMessage', body, tok));
  }
  return sent;
}

// Editing in place keeps a menu from spamming the chat with copies of itself.
// Telegram rejects an edit whose text exceeds the cap, and refuses a no-op edit
// ("message is not modified"), so both fall back to / are treated as success.
export async function editText(chatId, messageId, text, { keyboard = null, tok = token() } = {}) {
  if (text.length > LIMIT) {
    return { fellBack: true, sent: await send(chatId, text, { keyboard, tok }) };
  }
  const body = {
    chat_id: chatId, message_id: messageId, text,
    parse_mode: 'HTML', disable_web_page_preview: true
  };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  try {
    return { edited: await call('editMessageText', body, tok) };
  } catch (e) {
    if (/not modified/i.test(String(e.message))) return { unchanged: true };
    // An edit can also fail because the message is too old to edit; sending a
    // fresh one is better than the tap appearing to do nothing.
    return { fellBack: true, sent: await send(chatId, text, { keyboard, tok }) };
  }
}

// Every callback_query must be answered or the button shows a spinner forever.
export async function answerCallback(id, { text = '', tok = token() } = {}) {
  try {
    return await call('answerCallbackQuery', { callback_query_id: id, text }, tok);
  } catch (_) { return null; }   // never let the ack sink the real work
}

// Populates the native "/" command list and the blue Menu button in the client.
export async function setMyCommands(commands, { tok = token() } = {}) {
  return call('setMyCommands', { commands }, tok);
}

// Broadcast to every configured chat. One bad chat id (user blocked the bot,
// left the group) must not sink the whole run, so failures are collected.
export async function broadcast(text, ids = chatIds(), { keyboard = null, tok = token() } = {}) {
  const results = [];
  for (const id of ids) {
    try {
      const sent = await send(id, text, { keyboard, tok });
      results.push({ chatId: id, ok: true, messages: sent.length });
    } catch (e) {
      results.push({ chatId: id, ok: false, error: String(e.message || e) });
    }
  }
  return results;
}
