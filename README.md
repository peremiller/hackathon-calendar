# ⚡ HackCal — Tech Hackathon Calendar

A single-file, offline-first web app for browsing, tracking, and exporting tech
hackathons. No build step, no dependencies, no backend — one `index.html` that
runs entirely in your browser and saves everything to `localStorage`.

**Live:** https://hackathon-calendar-umber.vercel.app

## Features

- **Two views**
  - **📅 Calendar** — a full month grid with today highlighted, multi-day events
    spanning across cells, and a "+N more" overflow per day.
  - **📋 List** — events sorted chronologically with date badges, color-coded
    format tags, tech tags, and a live "days until" countdown.
- **Filtering** — free-text search (name, tech, location), a format dropdown
  (Online / In-person / Hybrid), 14 clickable tech-tag chips (AI/ML, Web3,
  FinTech, HealthTech, Climate, Gaming, AR/VR, Robotics, Cybersecurity,
  Open Source, Mobile, Data, DevTools, Hardware), and an "Upcoming only" toggle.
- **Add / edit / delete** your own hackathons through a modal form.
- **Detail cards** — click any event for dates, format, location, tech, a
  description, and an outbound link.
- **Calendar export** — one-click `.ics` download per event, or for the whole
  filtered set, importable into Google / Apple / Outlook calendars.
- **Light & dark mode** — toggle in the header (🌙 / ☀️); remembers your choice
  and respects your OS preference on first load.
- **Import from Discord & WhatsApp** — paste messages copied from your Discord
  channel or WhatsApp group into the **📥 Import** dialog. HackCal auto-detects
  the date, title, format, location, tech tags, and link from each message,
  shows a reviewable preview with checkboxes, and de-duplicates against events
  you already have. Imported events are badged with their source.
- **Discord auto-sync (optional)** — the **🔄 Sync Discord** button pulls recent
  messages from a Discord channel via a tiny Vercel serverless function and
  parses them into events. See setup below.
- **Stats bar** — total events, upcoming count, online count, and days-to-next.
- **Private & offline** — all calendar data lives in your browser's
  `localStorage`; nothing is sent anywhere (the optional Discord sync only reads
  from Discord, server-side).

## Discord auto-sync setup (optional)

The paste **Import** works with zero setup. To enable the one-click **🔄 Sync
Discord** button, configure a bot:

1. Create an application + bot at the [Discord Developer Portal](https://discord.com/developers/applications).
2. Under **Bot → Privileged Gateway Intents**, enable **Message Content Intent**.
3. Invite the bot to your server with **View Channels** + **Read Message History**
   permissions.
4. Get the channel ID (enable Developer Mode → right-click the channel → Copy ID).
5. In Vercel → **Project → Settings → Environment Variables**, set:
   - `DISCORD_BOT_TOKEN` — your bot token
   - `DISCORD_CHANNEL_ID` — the channel to read from
6. Redeploy. The serverless function lives at `api/discord-events.js`.

> **WhatsApp note:** WhatsApp has no official way for an app to read a group's
> messages, so there is no live WhatsApp sync. Use **📥 Import** — open the
> group chat, copy the relevant messages (or use WhatsApp's *Export chat*), and
> paste them in. The parser understands WhatsApp's `[date, time] Name:` format.

## Running locally

It's a static file — just open `index.html`, or serve the folder:

```bash
python3 -m http.server 4318 --directory .
# then visit http://localhost:4318
```

## Data transparency

The app ships with **16 illustrative seeded hackathons** (e.g. ETHGlobal, NASA
Space Apps Challenge, Hack the North, TreeHacks, MIT Reality Hack, Junction,
MLH). These are well-known recurring events included as realistic examples and
are **auto-dated forward** so they always appear upcoming — the specific dates
are placeholders for demonstration, **not** confirmed official schedules. Always
verify dates, formats, and locations on each event's official website before
making plans. Add, edit, or delete any entry to make the calendar your own.

## Tech

Plain HTML + CSS + vanilla JavaScript in a single file. No frameworks, no build,
no network calls. Hosted as a static site on Vercel.

---

🤖 Built with [Claude Code](https://claude.com/claude-code)
