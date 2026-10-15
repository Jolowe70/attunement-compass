# The Attunement Compass

Stop. Test the signal. Recalibrate. A spiritual discernment practice grounded in 1 John 4, in English, Spanish, French, Yoruba, Igbo and Hausa.

React + Vite, hosted on Netlify. No account is needed.

## COMPASS-01 · Fixed and secured

- **Builds again.** The donate link in `src/App.jsx` was missing its quote marks, which stopped every Netlify build.
- **The AI key is locked down.** The old `/api/claude` passed any prompt to the AI on your key. It is replaced by `/api/compass` (`netlify/functions/compass.mjs`), which:
  - only runs the two Compass steps (test the signal, faithful response), with the prompts kept on the server;
  - limits each person to 8 requests every 10 minutes and refuses requests from other websites;
  - sends back only the fields the app needs, each checked;
  - uses `claude-haiku-4-5` by default, which is fast enough for Netlify's 10-second limit.
- **The whole Bible.** The guide chooses 1 to 3 passages from anywhere in Scripture and explains how each one speaks to the signal. It gives references only; the exact King James words come from `public/kjv` (66 books, public domain). A reference that doesn't exist is dropped. **Read the whole chapter** opens the chapter at the passage, with the passage highlighted. In other languages the verses are shown in the KJV (English), and the explanation is in the person's language.
- **More honest results.** Each test can be aligned, misaligned or **unclear**. The overall result says "Likely…", or "Unclear — wait and seek wisdom". If two tests fail, the result is never shown as the Spirit of Truth. The Corporate test stays unclear unless the person says they have brought it to someone. The prayer matches the result: refutation, yielding, or a prayer for clarity.
- **Care in a crisis.** If someone writes about ending their life or harming someone, the Compass stops. It shows a "Please reach out now" screen with emergency guidance (988 in the U.S.) and Matthew 11:28.
- **Installable.** Adds a web app manifest and icons, so "Add to Home Screen" works as the ebook describes.
- The stars no longer jump each time the page changes.
- The obvious translation errors are fixed. Everything else in the five other languages still needs a native speaker's review: see `TRANSLATION-REVIEW.md`.

## COMPASS-02 · The 30-Day Attunement

The ebook says to use the Compass daily for at least thirty days, and that the tool's goal is to no longer be needed. This build turns that into an optional journey. The quick Compass still needs no account.

- **An optional account** (email and password; Google can be switched on). Journals are private: row-level security lets each person read and change only their own rows.
- **Day N of 30, counted by days practised.** Missing a day never skips part of the training.
- **The training wheels come off:**
  - Days 1–10: the guide tests with you.
  - Days 11–20: you answer the four tests first, then see the guide's view beside yours. Where you differ, the note says to weigh both against Scripture and bring it to your church, because the guide can be wrong.
  - Days 21–30: you test on your own. The guide is asked only if you tap **Ask the guide too**.
- **The step follow-up.** The next day (or three hours later), the Compass asks "Did you take your one step?":
  - **I did it** gives a word of thanks;
  - **Not yet** shows Romans 8:1 and grace, never condemnation;
  - **Let it go** puts it down.
- **Journal and patterns.** Every tested signal is saved, unless the person unticks **Save to my journal**. Patterns show:
  - where signals arise;
  - rushed versus quiet signals;
  - what the tests suggested;
  - steps taken;
  - how often you and the guide agreed.
- **A weekly reflection.** After three entries in a week, the guide reflects on what keeps returning, with 1–2 passages (exact KJV) and one practice for the week ahead. It is saved, so it is asked for only once per week.
- **Thirty days walked.** The final screen shows John 10:27 and offers another 30 days.
- **Delete** any entry, or the whole journal, at any time.
- On "test on your own" days, the crisis check also runs on the device, because the server is not asked.
- The guide function now uses Node `https`, retries once quietly on a timeout, and has `/api/health`.

### Supabase setup (project `attunement-compass`, ref `etmkqtddanvxdiicofbf`)
1. **SQL Editor:** run `supabase/compass-schema.sql` (safe to run again).
2. **Authentication → URL Configuration:**
   - Site URL `https://attunementcompass.com`;
   - add `https://attunementcompass.com/**` and your Netlify address to Redirect URLs.
3. **Authentication → Sign In / Providers → Email:** Supabase's built-in email sender is only for testing and sends very few emails. Either turn **Confirm email** off for now, or connect your own email sender (Authentication → Emails → SMTP).
4. **Google (optional):** enable the Google provider, then set `VITE_SUPABASE_GOOGLE=on` in Netlify and redeploy.

The project address and its public anon key are built into `src/supa.js`. The anon key is public by design: it can only do what the row-level security rules allow. Never put the service_role key in the app.

## Netlify settings

| Variable | Needed? | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | the guide |
| `COMPASS_MODEL` | no | another model, e.g. `claude-sonnet-4-5` (slower; may hit the 10-second limit in Yoruba, Igbo or Hausa) |
| `COMPASS_RATE` | no | requests per person per 10 minutes (default 8) |
| `ALLOWED_ORIGINS` | no | other website addresses allowed to call the guide, comma-separated |
| `VITE_SUPABASE_GOOGLE` | no | `on` shows "Continue with Google" (after enabling Google in Supabase) |

After a deploy, open `/api/health` to check that it shows `COMPASS-02` and that the key is set.

To God alone be the glory.
