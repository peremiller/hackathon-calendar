# ⚡ HackCal — Tech Hackathon Calendar

A single-file, offline-first web app for browsing, tracking, and exporting tech
hackathons. No build step, no dependencies, no backend — one `index.html` that
runs entirely in your browser and saves everything to `localStorage`.

**Live:** https://hackathon-calendar.vercel.app

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
- **Stats bar** — total events, upcoming count, online count, and days-to-next.
- **Private & offline** — all data lives in your browser's `localStorage`;
  nothing is sent anywhere.

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
