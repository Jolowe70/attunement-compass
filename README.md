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
- **Forgot password?** sends a reset link. Unknown emails get the same message, so no one can find out who has an account. The link opens a "Set a new password" screen.
- The guide function now uses Node `https`, retries once quietly on a timeout, and has `/api/health`.

## COMPASS-04 · Email notices

- **Who gets an email:**
  - when someone shares a signal, each partner;
  - when counsel is written, the other side (the person, or their partners).
- **Emails never include the signal or the counsel**, only a link back (`/?open=journey`). Email can be read by others.
- **No floods:**
  - at most one email per shared signal per person a day;
  - for counsel on the same signal, at most one every 30 minutes;
  - no more than 40 emails a day caused by any one person.
- **Off switch:** anyone with a partner sees **Email notices** in My Journey and can turn them off.
- **Language:** each email goes in the recipient's chosen language.
- **Checks before sending.** The server (`netlify/functions/notify.mjs`) confirms that:
  - the request comes from a signed-in person;
  - the event really happened, was theirs, and happened in the last 15 minutes;
  - every recipient is a real partner.

  So no one can use it to send email to strangers.

**Setup**
1. Run `supabase/compass-schema.sql` again (safe to run again).
2. In Netlify, add two environment variables, then redeploy:

   | Variable | Where to find it |
   |---|---|
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → the **service_role** (secret) key. Keep it only in Netlify, never in the app or a chat. |
   | `RESEND_API_KEY` | Resend → API Keys. Create a new key, e.g. "Compass notices", with sending access only. |

   Optional: `NOTIFY_FROM` (default `The Attunement Compass <no-reply@attunementcompass.com>`).
3. Check `/api/health`: it should show `COMPASS-04`, with both keys true.

## COMPASS-03 · Discernment partners

The fourth test asks whether a signal can stand in the light of the body of Christ. This build makes that test real.

- **Invite one to three partners, or your pastor** (My Journey → Your discernment partners):
  - the link works once and expires in 7 days;
  - send it by copy, the phone's Share, or WhatsApp.
- **The person opening the link** sees who is inviting them and in what role, before signing in. They choose the name the other person will see.
- **Sharing is chosen entry by entry.** "Share this with my partners" is off by default and resets after every session. Any entry can be shared or made private later from the journal.
- **Partners see only what is shared**, never the journal, the patterns or the reflections. When an entry is made private, it and its counsel disappear for them at once.
- **Words of counsel.** Partners answer under a shared entry, and the person can reply. Each name is set by the database, so no one can post under someone else's name.
- **Walking with others.** Someone who was invited sees the people they walk with at the top of their page, with what each has shared.
- **Either side can end it** at any time ("Remove" or "Stop walking with…").
- The database enforces every rule (28 permission checks):
  - strangers see nothing;
  - partners cannot change entries;
  - an invitation cannot be reused;
  - no more than three partners.

**Setup:** run `supabase/compass-schema.sql` again in the SQL Editor. It is safe to run again, and it adds the partner tables.

### Supabase setup (project `attunement-compass`, ref `etmkqtddanvxdiicofbf`)
1. **SQL Editor:** run `supabase/compass-schema.sql` (safe to run again).
2. **Authentication → URL Configuration:**
   - Site URL `https://attunementcompass.com`;
   - add `https://attunementcompass.com/**` and your Netlify address to Redirect URLs.
3. **Email through Resend** (keep **Confirm email** on):
   - **In Resend → Domains:**
     - add `attunementcompass.com`;
     - add the DNS records Resend shows at your domain's DNS host;
     - press Verify.
   - **In Resend → API Keys:**
     - create a key named "Attunement Compass – Supabase", with *Sending access* only;
     - limit it to that domain;
     - copy the key straight into Supabase and nowhere else.
   - **In Supabase → Authentication → Emails → SMTP Settings**, turn on custom SMTP:

     | Setting | Value |
     |---|---|
     | Sender email | `no-reply@attunementcompass.com` |
     | Sender name | `The Attunement Compass` |
     | Host | `smtp.resend.com` |
     | Port | `465` |
     | Username | `resend` |
     | Password | the Resend key |

   - **In Supabase → Authentication → Rate Limits:** raise the emails-per-hour limit (for example, to 100).
   - **In Supabase → Authentication → Emails → Templates** (optional): use the wording below.
4. **Google (optional):** enable the Google provider, then set `VITE_SUPABASE_GOOGLE=on` in Netlify and redeploy.

**Email wording (optional).** Keep `{{ .ConfirmationURL }}` exactly as written.

*Confirm signup* — subject "Confirm your 30-Day Attunement"
> Welcome. Please confirm your email to keep your journal: <a href="{{ .ConfirmationURL }}">Confirm my email</a>. "My sheep hear my voice, and I know them, and they follow me." (John 10:27)

*Reset password* — subject "Reset your Attunement Compass password"
> Someone asked to reset the password for this email. If it was you, <a href="{{ .ConfirmationURL }}">choose a new password</a>. If not, you can ignore this email.

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
