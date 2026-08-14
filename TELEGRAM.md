# HackCal Telegram bot

A daily **07:30 Asia/Manila** push of the hackathons and tech events running
**today and tomorrow**, plus an interactive bot you can query any time.

The web app keeps its events in `localStorage`, which a cron job can never read,
so the bot re-runs the same server-side aggregation the app's 🌐 Live Sync uses
(`/api/live-events` → Luma, Eventbrite, Meetup, Maven) and narrows it to the next
two calendar days.

> The 16 built-in seed hackathons are deliberately **excluded**. Their dates are
> illustrative ("typical next edition", shown with a `≈` in the app), and an
> approximate date has no business in a message that says "happening today".

---

## What you get

```
🚀 HackCal — daily feed
Friday, Aug 14 · Asia/Manila · scope: hack · region: ph

📆 Today — Friday, Aug 14
💻 AI Product Management Bootcamp — Dr. Marily Nika
   Online cohort course · runs to Tuesday, Sep 22 · Maven

🔜 Tomorrow — Saturday, Aug 15
💻 Decentraland Friendzone Mobile Buildathon
   🕘 8:00 PM → 8:00 AM your time · Online / Virtual · Eventbrite
📍 THE DEMO DAY - StellarPH Acceleration Program
   🕘 1:00 PM–5:00 PM · Cebu City, Philippines · Luma

⏳ Registration closing
💻 Master Credit Scorecard Development with Python
   Online cohort course · starts Saturday, Aug 15 · reg closes Friday, Aug 14
```

Multi-day events that are already under way are included (`since …`), not just
ones starting today — a hackathon in its second day is still worth knowing about.

**Times** are shown in the event's own timezone, matching the day it's filed
under, with your local equivalent appended when they differ
(`8:00 PM → 8:00 AM your time`). An end time appears only for single-day events;
for a multi-day run the date range already says it.

Time coverage depends on what each source actually publishes:

| Source | Time? | Why |
| --- | --- | --- |
| Luma | ✅ | Absolute instant + an IANA timezone |
| Meetup | ✅ | schema.org `startDate` with an offset |
| Maven | ✅ | Cohort start timestamp + the school's timezone |
| Eventbrite | ❌ | Its **search-page** JSON-LD carries a bare date (`2026-10-12`) with no clock — the time only exists on each event's own page, which would cost one request per event |

Events with no published time simply show none, rather than a made-up midnight.

---

## Two dials

Both default from env vars and can be overridden per-command.

| Dial | Values | Meaning |
| --- | --- | --- |
| `scope` | `hack` *(default)* | Hackathons, jams, CTFs, demo days + Maven cohorts |
| | `tech` | The above plus general tech meetups and conferences |
| | `all` | No relevance filtering — everything Live Sync returns |
| `region` | `ph` *(default)* | Online/hybrid events **plus** anything physically in the Philippines |
| | `online` | Online/hybrid only |
| | `global` | No location filter — worldwide |

`region=ph` also fires one extra Luma call anchored on Manila, because the app's
own sweep anchors on SF / NY / London / Bengaluru / Singapore and rarely surfaces
Philippine listings. That supplement is held to the same relevance bar as
everything else, so a Manila run club doesn't land in a hackathons-only feed.

---

## Menus

Send `/menu` (or `/start`, or tap **⚙️ Options** under any digest) for a button
interface — no need to remember command syntax:

```
🚀 HackCal
Scope: Hackathons only · Region: PH + Online

[ 📆 Today ]        [ 🔜 Tomorrow ]
[ 🚀 Today + Tomorrow          ]
[ 🎚 Scope: … ]     [ 🌏 Region: … ]
[ ❓ Help                      ]
```

Tapping **Scope** or **Region** opens a picker with the current value ticked;
choosing one applies it and drops straight back to the menu. Every digest —
including the 07:30 push — carries **🔄 Refresh · 📆 Today · 🔜 Tomorrow ·
⚙️ Options**, so you can widen a quiet morning feed without typing anything.

The bot has no datastore, so the menu's state travels inside each button's
`callback_data` and comes back on the next tap. A consequence worth knowing:
buttons are self-contained, so an old menu still works, and a menu from before a
redeploy is answered with *"That menu is out of date — send /menu"* rather than
failing silently. Taps edit the message in place instead of posting a new one,
so the chat doesn't fill with dead menus.

## Bot commands

| Command | Does |
| --- | --- |
| `/menu` | Open the button interface |
| `/feed` | Today + tomorrow, using your defaults |
| `/feed tech global` | Any scope/region combination, on demand (order doesn't matter) |
| `/today` | Just today |
| `/tomorrow` | Just tomorrow |
| `/id` | This chat's id — paste into `TELEGRAM_CHAT_ID` |
| `/help` | The above |

---

## Setup

### 1. Create the bot (2 min, in Telegram)

1. Message [@BotFather](https://t.me/BotFather) → `/newbot`
2. Give it a name (`HackCal`) and a username ending in `bot` (`hackcal_feed_bot`)
3. Copy the token it gives you — looks like `8123456789:AAH...`

The native `/` command list is registered over the API (see step 3 below), so
there's no need to paste anything into BotFather's `/setcommands`.

### 2. Set the environment variables on Vercel

Project → Settings → Environment Variables (Production):

| Variable | Required | Value |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | ✅ | The BotFather token |
| `TELEGRAM_CHAT_ID` | ✅ | Your chat id — comma-separate for several chats |
| `CRON_SECRET` | ✅ | Any long random string; protects the push endpoint |
| `TELEGRAM_WEBHOOK_SECRET` | ✅ | Another random string; protects the webhook |
| `DIGEST_SCOPE` | – | `hack` (default) \| `tech` \| `all` |
| `DIGEST_REGION` | – | `ph` (default) \| `online` \| `global` |
| `DIGEST_TZ` | – | `Asia/Manila` (default) |
| `DIGEST_BASE_URL` | – | Override the origin the digest reads Live Sync from |

Generate the two secrets with:

```bash
openssl rand -hex 32
```

**Don't know your chat id yet?** Set the other three, deploy, register the
webhook (step 3), then send the bot `/id` — it replies with the number. Put that
in `TELEGRAM_CHAT_ID` and redeploy.

### 3. Register the webhook and command list (once, after deploying)

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://hackathon-calendar-umber.vercel.app/api/telegram-webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>","allowed_updates":["message","callback_query"]}'
```

> ⚠️ **`callback_query` is not optional.** Telegram only delivers the update
> types listed in `allowed_updates`. Omit it and every menu button will appear
> to do nothing — the taps are never delivered, so there's no error to see.

Then populate the native `/` command list and the blue Menu button:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{"commands":[
    {"command":"menu","description":"Open the menu"},
    {"command":"feed","description":"Today + tomorrow'"'"'s events"},
    {"command":"today","description":"Just today"},
    {"command":"tomorrow","description":"Just tomorrow"},
    {"command":"id","description":"Show this chat'"'"'s id"},
    {"command":"help","description":"How this bot works"}
  ]}'
```

Confirm it took:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

### 4. Check it before trusting the schedule

Render the digest without sending anything:

```bash
curl -s -H "Authorization: Bearer <CRON_SECRET>" \
  "https://hackathon-calendar-umber.vercel.app/api/telegram-digest?dry=1" | python3 -m json.tool
```

Then send one for real:

```bash
curl -s -H "Authorization: Bearer <CRON_SECRET>" \
  "https://hackathon-calendar-umber.vercel.app/api/telegram-digest"
```

---

## The 07:30 schedule

**07:30 Asia/Manila = 23:30 UTC** the previous day (PH has no DST, so this is
fixed year-round).

### Path A — Vercel cron (shipped, on by default)

`vercel.json` already contains:

```json
"crons": [{ "path": "/api/telegram-digest", "schedule": "30 23 * * *" }]
```

Vercel injects `Authorization: Bearer $CRON_SECRET` automatically. **Caveat:** on
the Hobby plan a cron is only guaranteed to fire *within the hour*, so the message
can land anywhere between 07:30 and 08:30.

### Path B — cron-job.org (free, fires on the minute)

For an exact 07:30, use an external scheduler and **remove the `crons` block from
`vercel.json`** so you don't get two messages.

1. Sign up at [cron-job.org](https://cron-job.org) → **Create cronjob**
2. URL: `https://hackathon-calendar-umber.vercel.app/api/telegram-digest`
3. Schedule: every day at **07:30**, timezone **Asia/Manila**
4. Advanced → Headers → add `Authorization: Bearer <CRON_SECRET>`
5. Save, then hit **TEST RUN** to confirm a 200

If the header field is awkward, the endpoint also accepts the secret as a query
string: `…/api/telegram-digest?key=<CRON_SECRET>`.

### Path C — GitHub Actions

`.github/workflows/telegram-digest.yml` ships **disabled** (its `schedule:` block
is commented out) so it can't collide with Path A. To use it, uncomment the
schedule, remove the `crons` block from `vercel.json`, and add two repository
secrets — `DIGEST_URL` and `CRON_SECRET`. Actions crons typically drift 5–15
minutes under load, so Path B is the better choice for exact timing.

You can always trigger it by hand from the **Actions** tab (with a dry-run
checkbox) to test delivery.

---

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/telegram-digest` | `Bearer $CRON_SECRET`, `x-cron-secret`, or `?key=` | Build + send the digest |
| GET | `/api/telegram-digest?dry=1` | same | Build and return it, send nothing |
| POST | `/api/telegram-webhook` | `x-telegram-bot-api-secret-token` | Telegram updates |

Query overrides on the digest endpoint: `?scope=tech&region=global`.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `401 Bad or missing cron secret` | `CRON_SECRET` differs between the caller and the deployment |
| `500 TELEGRAM_CHAT_ID is not set` | No recipients configured — send the bot `/id` |
| `502` with `results[].error` | Telegram rejected a chat: you never messaged the bot, or it was removed from the group |
| Bot ignores commands | Webhook not registered, or `TELEGRAM_WEBHOOK_SECRET` mismatch — check `getWebhookInfo` |
| Buttons do nothing when tapped | `callback_query` missing from the webhook's `allowed_updates` — re-run `setWebhook` above |
| *"That menu is out of date"* | A menu from before a redeploy whose `callback_data` format changed — send `/menu` |
| Digest says *Source unavailable* | One upstream (Meetup/Eventbrite) rate-limited that run; the others still reported |
| Two messages each morning | Both a Vercel cron and an external scheduler are enabled — keep one |
| Empty feed most days | `scope=hack` + `region=ph` is intentionally narrow; try `/feed tech global` |
