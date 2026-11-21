// Vercel serverless function: returns recent Discord channel message contents.
// HackCal's front-end parses these into events with its own parser (same logic
// used for paste-import), so this endpoint just relays raw message text.
//
// Required Vercel environment variables (Project → Settings → Environment Variables):
//   DISCORD_BOT_TOKEN   — a bot token from https://discord.com/developers
//   DISCORD_CHANNEL_ID  — the channel to read events from
//
// Bot setup (one time):
//   1. Create an application + bot at the Discord Developer Portal.
//   2. Enable the "Message Content Intent" under Bot → Privileged Gateway Intents.
//   3. Invite the bot to your server with "Read Messages/View Channels" +
//      "Read Message History" permissions.
//   4. Copy the channel ID (Developer Mode → right-click channel → Copy ID).

export default async function handler(req, res) {
  // Never let credentials, upstream errors, or channel contents enter shared caches.
  res.setHeader('Cache-Control', 'no-store');
  const token = process.env.DISCORD_BOT_TOKEN;
  const channel = process.env.DISCORD_CHANNEL_ID;
  if (!token || !channel) {
    // Not an error — auto-sync just isn't set up. Report it as a normal state
    // so the UI can show a friendly hint instead of an error.
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ configured: false });
    return;
  }
  try {
    const r = await fetch(
      `https://discord.com/api/v10/channels/${channel}/messages?limit=50`,
      { headers: { Authorization: `Bot ${token}` } }
    );
    if (!r.ok) {
      // Discord's error body can include channel or deployment details.
      res.status(r.status).json({ error: 'Discord events temporarily unavailable' });
      return;
    }
    const msgs = await r.json();
    const messages = (Array.isArray(msgs) ? msgs : [])
      .map(m => m && m.content)
      .filter(Boolean);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ messages, count: messages.length });
  } catch (e) {
    // A network error may contain proxy URLs, credentials, or private hostnames.
    res.status(500).json({ error: 'Discord events temporarily unavailable' });
  }
}
