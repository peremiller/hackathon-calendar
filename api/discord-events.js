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
  const token = process.env.DISCORD_BOT_TOKEN;
  const channel = process.env.DISCORD_CHANNEL_ID;
  if (!token || !channel) {
    res.status(500).json({
      error: 'Discord not configured. Set DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID env vars in Vercel.'
    });
    return;
  }
  try {
    const r = await fetch(
      `https://discord.com/api/v10/channels/${channel}/messages?limit=50`,
      { headers: { Authorization: `Bot ${token}` } }
    );
    if (!r.ok) {
      const body = await r.text();
      res.status(r.status).json({ error: `Discord API ${r.status}: ${body.slice(0, 200)}` });
      return;
    }
    const msgs = await r.json();
    const messages = (Array.isArray(msgs) ? msgs : [])
      .map(m => m && m.content)
      .filter(Boolean);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ messages, count: messages.length });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
