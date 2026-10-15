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

## Netlify settings

| Variable | Needed? | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | the guide |
| `COMPASS_MODEL` | no | another model, e.g. `claude-sonnet-4-5` (slower; may hit the 10-second limit in Yoruba, Igbo or Hausa) |
| `COMPASS_RATE` | no | requests per person per 10 minutes (default 8) |
| `ALLOWED_ORIGINS` | no | other website addresses allowed to call the guide, comma-separated |

To God alone be the glory.
