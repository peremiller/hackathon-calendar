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
  Open Source, Mobile, Data, DevTools, Hardware), and an "Upcoming only" toggle
  that shows events starting on today's Philippine date or later. Ongoing events
  whose start date has passed remain available when the toggle is off.
- **Add / edit / delete** your own hackathons through a modal form.
- **Detail cards** — click any event for dates, format, location, tech, a
  description, and an outbound link.
- **Calendar export** — one-click `.ics` download per event, or for the whole
  filtered set, importable into Google / Apple / Outlook calendars.
- **Google Calendar subscription** — **Google Calendar** in the sidebar or
  **More → Sync Google Calendar** opens a one-time subscription prompt for the
  complete de-duplicated HackCal, Substack, and lablab.ai tech-event feed, including HackCal's
  recurring built-in events. The feed itself is refreshed every five minutes
  and includes events starting today or later. Google Calendar controls how
  often it polls subscribed URLs.
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
- **Substack tech-event sync** — Live Sync reads the official public RSS feeds
  of active tech-event publications, extracts the individual dated events
  listed inside each issue, and de-duplicates them against the other sources.
  Substack is enabled by default for both the web calendar and Telegram bot.
- **lablab.ai live sync** — every dated current event in lablab.ai's public AI
  hackathon directory is refreshed automatically and flows through the website,
  Telegram bot, and Google Calendar feed. Date-TBA cards are picked up as soon
  as lablab.ai publishes an actual date range.
- **Current-date live population** — event status and every "upcoming" view use
  today's Philippine calendar date. Live Sync runs on first load, refreshes
  automatically every five minutes, and catches up when a stale tab regains
  focus. Multi-day events remain available through their end date in the full
  calendar, while "Upcoming" means the event itself has not started yet.
- **Luma & calendar (.ics) import** — the **🔗 Luma** button (and the Import
  dialog's "Luma / calendar feed" source) pulls events from a
  [Luma](https://lu.ma) subscription feed or any iCalendar (`.ics`) URL —
  Google Calendar, Meetup, Eventbrite, etc. A serverless proxy fetches the feed
  (browsers block cross-origin `.ics` fetches; it also resolves `webcal://` and
  lu.ma page links), and the events are parsed, de-duplicated, and badged 🔗. You
  can also paste raw `.ics` text directly. Your feed URL is remembered for
  one-click refresh. **In Luma:** open a calendar → **Subscribe** (or Settings →
  your personal feed) → copy the iCal / webcal link.
- **Telegram daily digest (optional)** — a bot that messages you the hackathons
  and tech events running **today and tomorrow**, every morning at 07:30
  Asia/Manila. Tap-driven **inline menus** (or `/feed`, `/today`, `/tomorrow`)
  switch scope (hackathons / +tech / everything) and region (PH+online / online
  / global) on the fly, and every digest carries **Refresh / Today / Tomorrow /
  Options** buttons. See **[TELEGRAM.md](TELEGRAM.md)**.
- **Stats bar** — total events, upcoming count, online count, and days-to-next.
- **Private & offline-friendly** — your saved calendar lives in browser
  `localStorage`; optional Live Sync sources are read server-side and only the
  normalized public event listings are returned to the browser.

## Substack tech-event sync

HackCal uses Substack's documented public-publication RSS convention
(`https://publication.substack.com/feed`). It includes a curated default set of
active global, regional and Philippine tech-event publications. A reader's
personalised Home/Activity feed is account-private and is not scraped or given
browser cookies.

To add more public Substack publications, set `SUBSTACK_FEEDS` in Vercel. It
accepts comma- or newline-separated feed URLs. You can optionally include a
display name and fallback location:

```text
Metro Tech|https://example.substack.com/feed|Metro Manila, Philippines
```

Only HTTPS `substack.com` publication feeds are accepted. Live Sync defaults to
**All tech events** and returning browsers are migrated from the prior untouched
hackathon-only default without overwriting custom source/filter settings.

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

## Registration status

Every event shows a registration indicator derived from its (optional)
registration deadline — 🟢 **Open**, 🟠 **Closing soon** (≤7 days left),
🔴 **Registration closed**, 🔵 **Opens later**, or ⚪ **Event ended**. Seeded
events default their deadline to a few days before the start date; the **Import**
parser also detects phrases like "register by August 8". A **🟢 Open to
register** filter shows only events you can still join. The status is computed
from dates in the app — it is **not** a live check of each event's real
registration page, so confirm on the official site.

## Eligibility filter

Each event is marked **🌍 Open to all** or **🎓 Students only**, and a
**🌍 Allows non-students** filter hides student/university-restricted events so
working professionals can find hackathons they can actually enter. The import
parser also reads phrases like "students only" from pasted messages.

## Data transparency

The app ships with **16 real, well-known recurring hackathons** (ETHGlobal, NASA
Space Apps Challenge, Hack the North, TreeHacks, MIT Reality Hack, Junction,
Global Game Jam, picoCTF, Hacktoberfest, PennApps, MakeMIT, MIT Hacking Medicine
GrandHack, ClimateHack.AI, AI Engineer World's Fair, Money20/20, MLH Global Hack
Week). Each links to its **official, verified website**, and the **dates reflect
each event's real published or typical schedule** (researched per-event), shown
for the next upcoming edition.

Dates flagged **≈** are *typical recurring windows* (the next exact edition
wasn't announced yet) rather than confirmed dates — the detail view labels these.
Confirmed examples include NASA Space Apps (Nov 14–15 2026), Hack the North
(Sep 18–20 2026), Junction (Nov 13–15 2026), and Money20/20 (Oct 18–21 2026).
Still, always verify exact dates, format, eligibility, and the registration
deadline on each event's official website before making plans. Add, edit, or
delete any entry to make the calendar your own.

## Telegram daily digest

An optional bot pushes the events running **today and tomorrow** to Telegram at
**07:30 Asia/Manila** daily, and answers `/feed`, `/today`, `/tomorrow` any time.

Because the app's events live in your browser's `localStorage`, the bot can't
read them — it re-runs the same server-side aggregation Live Sync uses and
narrows it to the next two days. Setup (BotFather, env vars, scheduling options)
is in **[TELEGRAM.md](TELEGRAM.md)**.

## Tech

Plain HTML + CSS + vanilla JavaScript in a single file — no frameworks, no build
step. The front end is self-contained; a handful of small Vercel serverless
functions under `api/` handle the things a browser can't do cross-origin
(Discord sync, `.ics` proxying, live event aggregation, and the Telegram bot).

---

🤖 Built with [Claude Code](https://claude.com/claude-code)
