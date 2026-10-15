// The bridge between CLUB 24E and The Attunement Compass (COMPASS-05): one journal for both.
//
// CLUB 24E calls this with its own sign-in token. The bridge:
//   - confirms the CLUB 24E user with CLUB 24E's Supabase (public URL + public anon key),
//   - links them to a Compass journal only after they enter a 6-digit code emailed to that address,
//   - then reads and writes that journal on their behalf, checking every row belongs to them.
// The Compass's secret keys stay here; CLUB 24E never receives them.
import crypto from 'crypto';
import { call, rest, restInsert, service, sendNotices, sendEmailResult, SUPABASE_URL, UUID } from '../lib/notices.mjs';
import { journeyState, pendingStep, modeForDay, localDate, DOMAIN_KEYS } from '../../src/journey.js';

const CLUB_URL = (process.env.CLUB24E_SUPABASE_URL || 'https://xrbntbezqgdgrlpoccaf.supabase.co').replace(/\/+$/, '');
const ORIGINS = String(process.env.BRIDGE_ORIGINS || 'https://club24e.com,https://www.club24e.com,https://brilliant-macaron-baec26.netlify.app')
  .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
const CODE_MINUTES = 15, MAX_ATTEMPTS = 5, MAX_SENDS_PER_HOUR = 3;

const LANGS = ['en', 'es', 'fr', 'yo', 'ig', 'ha'];
const PRESSURES = ['urgent', 'gentle', 'unclear', ''];
const SOURCES = ['truth', 'error', 'unclear'];
const RESULTS = ['aligned', 'misaligned', 'unclear'];
const MODES = ['guided', 'compare', 'self'];
const STANCES = ['refute', 'affirm', 'wait'];
const STEPS = ['done', 'not_yet', 'released'];
const TESTS = ['christological', 'canonical', 'character', 'corporate'];
const REF = /^(?:[1-3] )?[A-Za-z][A-Za-z .]{1,24} \d{1,3}(?::\d{1,3}(?:\s?[-–]\s?\d{1,3})?)?$/;

const pick = (v, list, d) => (list.includes(v) ? v : d);
const txt = (v, n) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
const mask = (email) => String(email || '').replace(/^(.)(.*)(.@.*)$/, (m, a, b, c) => a + '•'.repeat(Math.min(6, b.length)) + c);
const hash = (code, user) => crypto.createHash('sha256').update(code + ':' + user).digest('hex');

function cors(event) {
  const origin = String(event.headers.origin || event.headers.Origin || '').replace(/\/+$/, '');
  const ok = ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, content-type, x-club-apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' } : null;
}
const reply = (headers, status, obj) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(headers || {}) }, body: JSON.stringify(obj) });

// Who is this in CLUB 24E? (Their token is checked by CLUB 24E's own Supabase.)
async function clubUser(token, apikey) {
  if (!token || !apikey) return null;
  const r = await call(CLUB_URL + '/auth/v1/user', { headers: { apikey, Authorization: 'Bearer ' + token } });
  return r.status === 200 && r.json && r.json.id && r.json.email ? { id: r.json.id, email: String(r.json.email).toLowerCase() } : null;
}

async function patch(path, row) {
  const r = await call(SUPABASE_URL + '/rest/v1/' + path, { method: 'PATCH', headers: { ...service(), Prefer: 'return=minimal' }, body: row });
  if (r.status >= 300) throw new Error('db patch ' + r.status);
}
async function del(path) {
  const r = await call(SUPABASE_URL + '/rest/v1/' + path, { method: 'DELETE', headers: { ...service(), Prefer: 'return=minimal' } });
  if (r.status >= 300) throw new Error('db delete ' + r.status);
}
async function insertReturning(table, row) {
  const r = await call(SUPABASE_URL + '/rest/v1/' + table, { method: 'POST', headers: { ...service(), Prefer: 'return=representation' }, body: row });
  if (r.status >= 300) throw new Error('db insert ' + r.status + ' ' + JSON.stringify(r.json));
  return Array.isArray(r.json) ? r.json[0] : r.json;
}
async function upsert(table, row) {
  const r = await call(SUPABASE_URL + '/rest/v1/' + table, { method: 'POST', headers: { ...service(), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: row });
  if (r.status >= 300) throw new Error('db upsert ' + r.status);
}

const CODE_EMAIL = {
  subject: 'Your code to connect CLUB 24E with The Attunement Compass',
  text: (code) => 'Your code is ' + code + '. It expires in ' + CODE_MINUTES + ' minutes.\n\nEnter it in CLUB 24E to keep your Attunement Compass journal in one place.\n\nIf you did not ask for this, you can ignore this email. Nothing will be connected.',
  html: (code) => '<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:24px;color:#1d2533"><p style="font-size:17px">Your code to connect CLUB 24E with The Attunement Compass:</p>' +
    '<p style="font-family:monospace;font-size:32px;letter-spacing:6px;margin:16px 0">' + code + '</p><p style="font-size:14px;color:#5A6B85">It expires in ' + CODE_MINUTES + ' minutes. If you did not ask for this, you can ignore this email. Nothing will be connected.</p></div>'
};

async function journalFor(u) {
  const [journey] = await rest('journeys?user_id=eq.' + u + '&select=round,display_name,lang,rounds_completed');
  const entries = await rest('entries?user_id=eq.' + u + '&select=id,created_at,local_date,round,day_no,mode,domain,signal,source,my_source,step,step_status,shared,origin&order=created_at.desc&limit=400');
  const partners = await rest('partners?owner=eq.' + u + '&select=id');
  const state = journey ? journeyState(journey, entries) : null;
  const pend = pendingStep(entries);
  const sharedIds = entries.filter((e) => e.shared).slice(0, 100).map((e) => e.id);
  const counsel = sharedIds.length ? await rest('counsel?entry_id=in.(' + sharedIds.join(',') + ')&select=entry_id') : [];
  const counts = {};
  for (const c of counsel) counts[c.entry_id] = (counts[c.entry_id] || 0) + 1;
  return {
    journey: journey ? { name: journey.display_name || '', lang: journey.lang, round: journey.round } : null,
    state: state && { day: state.day, mode: state.mode, practised: state.practised, complete: state.complete, practisedToday: state.practisedToday },
    partners: partners.length,
    pending: pend ? { id: pend.id, step: pend.step } : null,
    recent: entries.slice(0, 5).map((e) => ({ id: e.id, date: e.local_date, signal: e.signal.slice(0, 140), source: e.my_source || e.source, step: e.step, status: e.step_status, shared: e.shared, counsel: counts[e.id] || 0 })),
    entries,
    journeyRow: journey,
  };
}

function cleanEntry(x, state) {
  const tests = {};
  for (const k of TESTS) {
    const t = (x.tests && x.tests[k]) || null;
    if (t) tests[k] = { result: pick(t.result, RESULTS, 'unclear'), analysis: txt(t.analysis, 600) };
  }
  const my = {};
  for (const k of TESTS) if (x.my_tests && RESULTS.includes(x.my_tests[k])) my[k] = x.my_tests[k];
  const passages = (Array.isArray(x.passages) ? x.passages : []).map((p) => ({ ref: txt(p && p.ref, 40), why: txt(p && p.why, 600) })).filter((p) => REF.test(p.ref)).slice(0, 3);
  const signal = txt(x.signal, 1200);
  if (signal.length < 1) return null;
  const today = localDate();
  const ld = /^\d{4}-\d{2}-\d{2}$/.test(x.local_date || '') ? x.local_date : today;
  return {
    local_date: ld,
    day_no: state && !state.complete ? state.day : null,
    mode: pick(x.mode, MODES, state && !state.complete ? state.mode : 'guided'),
    domain: pick(x.domain, DOMAIN_KEYS.concat(['']), ''),
    pressure: pick(x.pressure, PRESSURES, ''),
    signal,
    source: Object.keys(tests).length ? pick(x.source, SOURCES, 'unclear') : null,
    my_source: Object.keys(my).length ? pick(x.my_source, SOURCES, 'unclear') : null,
    summary: txt(x.summary, 600) || null,
    tests: Object.keys(tests).length ? tests : null,
    my_tests: Object.keys(my).length ? my : null,
    stance: pick(x.stance, STANCES, null),
    prayer: txt(x.prayer, 1200) || null,
    passages,
    step: txt(x.step, 500) || null,
    community: txt(x.community, 400) || null,
  };
}

// Light per-user limit for each running copy of the function.
const hits = new Map();
function limited(key, max = 40, ms = 60 * 1000) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < ms);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return arr.length > max;
}

export const handler = async (event) => {
  const h = cors(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: h ? 204 : 403, headers: h || {}, body: '' };
  if (event.httpMethod !== 'POST') return reply(h, 405, { ok: false, error: 'method' });
  if (!h && (event.headers.origin || event.headers.Origin)) return reply(null, 403, { ok: false, error: 'origin' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.RESEND_API_KEY) return reply(h, 503, { ok: false, error: 'not_configured' });
  if ((event.body || '').length > 12000) return reply(h, 413, { ok: false, error: 'too_large' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(h, 400, { ok: false, error: 'bad_json' }); }
  const token = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  const apikey = String(event.headers['x-club-apikey'] || '');

  try {
    const club = await clubUser(token, apikey);
    if (!club) return reply(h, 401, { ok: false, error: 'sign_in' });
    if (limited(club.id)) return reply(h, 429, { ok: false, error: 'busy' });
    const [link] = await rest('links?club_user=eq.' + club.id + '&select=compass_user,email,linked_at');
    const action = body.action;

    if (action === 'status') {
      if (!link) return reply(h, 200, { ok: true, linked: false, email: mask(club.email) });
      const j = await journalFor(link.compass_user);
      delete j.entries; delete j.journeyRow;
      return reply(h, 200, { ok: true, linked: true, email: mask(link.email), ...j });
    }

    if (action === 'link_start') {
      if (link) return reply(h, 200, { ok: true, linked: true });
      const [prev] = await rest('link_codes?club_user=eq.' + club.id + '&select=club_user,email,code_hash,expires_at,attempts,sends,window_start');
      const inWindow = prev && Date.now() - new Date(prev.window_start).getTime() < 3600e3;
      if (inWindow && prev.sends >= MAX_SENDS_PER_HOUR) return reply(h, 429, { ok: false, error: 'too_many_codes' });
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await upsert('link_codes', {
        club_user: club.id, email: club.email, code_hash: hash(code, club.id), attempts: 0,
        expires_at: new Date(Date.now() + CODE_MINUTES * 60e3).toISOString(),
        sends: inWindow ? prev.sends + 1 : 1, window_start: inWindow ? prev.window_start : new Date().toISOString()
      });
      const sent = await sendEmailResult(club.email, { subject: CODE_EMAIL.subject, text: CODE_EMAIL.text(code), html: CODE_EMAIL.html(code) });
      if (!sent.ok) {
        // An email that never left does not use up one of the hour's tries.
        // Put back what was there (an earlier code still works), or remove the row.
        if (prev) await upsert('link_codes', prev).catch(() => {});
        else await del('link_codes?club_user=eq.' + club.id).catch(() => {});
        return reply(h, 502, { ok: false, error: sent.reason === 'setup' ? 'email_setup' : 'email' });
      }
      return reply(h, 200, { ok: true, sent: true, email: mask(club.email) });
    }

    if (action === 'link_confirm') {
      if (link) return reply(h, 200, { ok: true, linked: true });
      const [lc] = await rest('link_codes?club_user=eq.' + club.id + '&select=email,code_hash,expires_at,attempts');
      if (!lc || new Date(lc.expires_at).getTime() < Date.now()) return reply(h, 400, { ok: false, error: 'expired' });
      if (lc.attempts >= MAX_ATTEMPTS) return reply(h, 429, { ok: false, error: 'too_many_attempts' });
      if (lc.email !== club.email) return reply(h, 400, { ok: false, error: 'expired' });
      const given = String(body.code || '').replace(/\D/g, '').slice(0, 6);
      const a = Buffer.from(hash(given, club.id)), b = Buffer.from(lc.code_hash);
      if (given.length !== 6 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        await patch('link_codes?club_user=eq.' + club.id, { attempts: lc.attempts + 1 });
        return reply(h, 400, { ok: false, error: 'code', left: Math.max(0, MAX_ATTEMPTS - lc.attempts - 1) });
      }
      // The email is proven. Find their Compass account, or open one for them.
      const found = await call(SUPABASE_URL + '/rest/v1/rpc/compass_user_by_email', { method: 'POST', headers: service(), body: { p_email: club.email } });
      let compassUser = found.status === 200 && typeof found.json === 'string' ? found.json : null;
      let created = false;
      if (!compassUser) {
        const r = await call(SUPABASE_URL + '/auth/v1/admin/users', { method: 'POST', headers: service(), body: { email: club.email, email_confirm: true } });
        if (r.status >= 300 || !r.json || !r.json.id) throw new Error('create user ' + r.status);
        compassUser = r.json.id; created = true;
      }
      await restInsert('links', { club_user: club.id, compass_user: compassUser, email: club.email });
      await del('link_codes?club_user=eq.' + club.id);
      return reply(h, 200, { ok: true, linked: true, created });
    }

    if (!link) return reply(h, 403, { ok: false, error: 'not_linked' });
    const u = link.compass_user;

    if (action === 'start') {
      const [j] = await rest('journeys?user_id=eq.' + u + '&select=user_id');
      if (!j) await restInsert('journeys', { user_id: u, lang: pick(body.lang, LANGS, 'en'), display_name: txt(body.name, 40) || null });
      return reply(h, 200, { ok: true, started: true });
    }

    if (action === 'save') {
      const j = await journalFor(u);
      const state = j.journeyRow ? journeyState(j.journeyRow, j.entries) : null;
      const e = cleanEntry(body.entry || {}, state);
      if (!e) return reply(h, 400, { ok: false, error: 'empty' });
      const share = body.share === true && j.partners > 0;
      const row = await insertReturning('entries', {
        ...e, user_id: u, round: j.journeyRow ? j.journeyRow.round : 1, origin: 'club24e',
        shared: share, shared_at: share ? new Date().toISOString() : null
      });
      let notices = null;
      if (share) notices = await sendNotices(u, 'share', { entry_id: row.id }).catch((x) => { console.error('bridge notice', x.message); return null; });
      return reply(h, 200, { ok: true, saved: true, id: row.id, day: row.day_no, shared: share, notified: notices ? notices.sent : 0 });
    }

    if (action === 'step') {
      if (!UUID.test(body.id || '')) return reply(h, 400, { ok: false, error: 'id' });
      const [e] = await rest('entries?id=eq.' + body.id + '&select=user_id');
      if (!e || e.user_id !== u) return reply(h, 404, { ok: false, error: 'not_found' });
      await patch('entries?id=eq.' + body.id, { step_status: pick(body.status, STEPS, 'released'), step_checked_at: new Date().toISOString() });
      return reply(h, 200, { ok: true });
    }

    if (action === 'unlink') {
      await del('links?club_user=eq.' + club.id);
      return reply(h, 200, { ok: true, linked: false });
    }

    return reply(h, 400, { ok: false, error: 'unknown_action' });
  } catch (e) {
    console.error('bridge', e.message);
    return reply(h, 502, { ok: false, error: 'upstream' });
  }
};
