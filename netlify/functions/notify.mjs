// Email notices for discernment partners (COMPASS-04).
// The app calls this right after a signal is shared or a word of counsel is written. This function:
//   1. confirms who is calling (their Supabase session),
//   2. confirms the event really happened, was done by them, and is recent,
//   3. finds who should hear about it (partners, or the entry's owner),
//   4. skips anyone who turned notices off, or was told about the same entry recently,
//   5. sends a short email through Resend, in the recipient's language.
// Emails never contain the signal or the counsel itself: only a link back to the Compass.
import https from 'https';
import http from 'http';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://etmkqtddanvxdiicofbf.supabase.co').replace(/\/+$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0bWtxdGRkYW52eGRpaWNvZmJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMzM5OTYsImV4cCI6MjEwNzYwOTk5Nn0.W7_HL2neO9kuEHvfjgEaTMUSTCoBWvy7iZTkhacgyCs';
const RESEND_URL = process.env.RESEND_URL || 'https://api.resend.com/emails';
const FROM = process.env.NOTIFY_FROM || 'The Attunement Compass <no-reply@attunementcompass.com>';
const SITE = () => (process.env.SITE_URL || process.env.URL || 'https://attunementcompass.com').replace(/\/+$/, '');

const RECENT_MS = 15 * 60 * 1000;               // the event must have happened in the last 15 minutes
const WINDOW = { share: 24 * 3600, counsel: 30 * 60 }; // seconds: at most one email per entry per person in this window
const ACTOR_DAILY_MAX = 40;                     // emails one person can cause in a day

export const TEMPLATES = {
  en: { shareSubject: '{name} shared a signal with you', shareBody: '{name} has shared a signal with you on The Attunement Compass and would value your prayer and counsel.', counselSubject: '{name} wrote to you on The Attunement Compass', counselBody: '{name} wrote a word of counsel on a shared signal.', open: 'Open The Attunement Compass', privacy: 'For privacy, this email does not include what was written. Open the Compass to read it.', footer: 'You receive this because you walk with {name} on The Attunement Compass. To stop these emails, open My Journey and turn off email notices.' },
  es: { shareSubject: '{name} compartió una señal contigo', shareBody: '{name} compartió una señal contigo en The Attunement Compass y valoraría tu oración y consejo.', counselSubject: '{name} te escribió en The Attunement Compass', counselBody: '{name} escribió una palabra de consejo sobre una señal compartida.', open: 'Abrir The Attunement Compass', privacy: 'Por privacidad, este correo no incluye lo que se escribió. Abre la Brújula para leerlo.', footer: 'Recibes esto porque caminas con {name} en The Attunement Compass. Para dejar de recibir estos correos, abre Mi Camino y desactiva los avisos por correo.' },
  fr: { shareSubject: '{name} a partagé un signal avec vous', shareBody: '{name} a partagé un signal avec vous sur The Attunement Compass et serait reconnaissant de votre prière et de vos conseils.', counselSubject: '{name} vous a écrit sur The Attunement Compass', counselBody: '{name} a écrit une parole de conseil sur un signal partagé.', open: 'Ouvrir The Attunement Compass', privacy: "Par respect de la vie privée, cet e-mail ne contient pas ce qui a été écrit. Ouvrez la Boussole pour le lire.", footer: 'Vous recevez ceci parce que vous marchez avec {name} sur The Attunement Compass. Pour ne plus recevoir ces e-mails, ouvrez Mon Parcours et désactivez les avis par e-mail.' },
  yo: { shareSubject: '{name} pín àmì kan pẹ̀lú rẹ', shareBody: '{name} ti pín àmì kan pẹ̀lú rẹ lórí The Attunement Compass, yóò sì mọrírì àdúrà àti ìmọ̀ràn rẹ.', counselSubject: '{name} kọ̀wé sí ọ lórí The Attunement Compass', counselBody: '{name} kọ ọ̀rọ̀ ìmọ̀ràn kan lórí àmì tí a pín.', open: 'Ṣí The Attunement Compass', privacy: 'Fún ààbò àṣírí, ímeèlì yìí kò ní ohun tí a kọ. Ṣí Compass láti kà á.', footer: 'O ń gba èyí nítorí pé o ń bá {name} rìn lórí The Attunement Compass. Láti dá àwọn ímeèlì wọ̀nyí dúró, ṣí Ìrìn-Àjò Mi kí o sì pa ìfitónilétí ímeèlì.' },
  ig: { shareSubject: '{name} kekọrịtara gị akara', shareBody: '{name} kekọrịtara gị akara na The Attunement Compass, ọ ga-enwe ekele maka ekpere na ndụmọdụ gị.', counselSubject: '{name} degaara gị ozi na The Attunement Compass', counselBody: '{name} dere okwu ndụmọdụ n\'akara e kekọrịtara.', open: 'Mepee The Attunement Compass', privacy: 'Maka nzuzo, email a enweghị ihe e dere. Mepee Compass ka ị gụọ ya.', footer: 'Ị na-anata nke a n\'ihi na gị na {name} na-eje ije na The Attunement Compass. Iji kwụsị email ndị a, mepee Njem M ma gbanyụọ ọkwa email.' },
  ha: { shareSubject: '{name} ya raba alama tare da kai', shareBody: '{name} ya raba alama tare da kai a The Attunement Compass kuma zai yaba da addu\'arka da shawararka.', counselSubject: '{name} ya rubuta maka a The Attunement Compass', counselBody: '{name} ya rubuta kalmar shawara a kan alamar da aka raba.', open: 'Buɗe The Attunement Compass', privacy: 'Don sirri, wannan imel ba ya ƙunshe da abin da aka rubuta. Buɗe Compass don karanta shi.', footer: 'Kana karɓar wannan saboda kana tafiya tare da {name} a The Attunement Compass. Don daina karɓar waɗannan imel, buɗe Tafiyata ka kashe sanarwar imel.' },
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (s, name) => s.replace(/\{name\}/g, name);
const cleanName = (s) => String(s || '').replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'A friend';

export function buildEmail(kind, lang, name) {
  const t = TEMPLATES[lang] || TEMPLATES.en;
  const n = cleanName(name);
  const link = SITE() + '/?open=journey';
  const subject = fill(kind === 'share' ? t.shareSubject : t.counselSubject, n);
  const body = fill(kind === 'share' ? t.shareBody : t.counselBody, n);
  const footer = fill(t.footer, n);
  const text = body + '\n\n' + t.open + ': ' + link + '\n\n' + t.privacy + '\n\n' + footer;
  const html = '<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:24px;color:#1d2533">' +
    '<p style="font-size:17px;line-height:1.6">' + esc(body) + '</p>' +
    '<p style="margin:24px 0"><a href="' + esc(link) + '" style="background:#C9A84C;color:#080F1C;padding:12px 20px;border-radius:8px;text-decoration:none;font-family:Arial,sans-serif;font-size:15px">' + esc(t.open) + '</a></p>' +
    '<p style="font-size:13px;color:#5A6B85;line-height:1.6">' + esc(t.privacy) + '</p>' +
    '<p style="font-size:12px;color:#8a95a8;line-height:1.6;border-top:1px solid #e3e6ec;padding-top:12px">' + esc(footer) + '</p></div>';
  return { subject, text, html };
}

// ---- HTTP with Node's built-in modules -------------------------------------------------
function call(url, { method = 'GET', headers = {}, body } = {}, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https; // http only for local testing
    const data = body === undefined ? null : JSON.stringify(body);
    const req = lib.request({ hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, method,
      headers: { ...headers, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => { let json = null; try { json = raw ? JSON.parse(raw) : null; } catch (e) { /* not JSON */ } resolve({ status: res.statusCode, json }); });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error('timeout')));
    if (data) req.write(data);
    req.end();
  });
}

const service = () => ({ apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY });
async function rest(path) {
  const r = await call(SUPABASE_URL + '/rest/v1/' + path, { headers: service() });
  if (r.status !== 200) throw new Error('db ' + r.status);
  return r.json || [];
}
async function restInsert(table, row) {
  const r = await call(SUPABASE_URL + '/rest/v1/' + table, { method: 'POST', headers: { ...service(), Prefer: 'return=minimal' }, body: row });
  if (r.status >= 300) throw new Error('db insert ' + r.status);
}
async function whoIs(token) {
  const r = await call(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: ANON, Authorization: 'Bearer ' + token } });
  return r.status === 200 && r.json && r.json.id ? r.json.id : null;
}
async function emailOf(id) {
  const r = await call(SUPABASE_URL + '/auth/v1/admin/users/' + id, { headers: service() });
  return r.status === 200 && r.json ? r.json.email : null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const recent = (ts) => ts && Date.now() - new Date(ts).getTime() < RECENT_MS;
const reply = (status, obj) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

// Who should hear about this event, and under what name.
async function recipientsFor(kind, me, body) {
  if (kind === 'share') {
    if (!UUID.test(body.entry_id || '')) return null;
    const [e] = await rest('entries?id=eq.' + body.entry_id + '&select=id,user_id,shared,shared_at');
    if (!e || e.user_id !== me || !e.shared || !recent(e.shared_at)) return null;
    const ps = await rest('partners?owner=eq.' + me + '&select=partner,owner_name');
    return { ref: e.id, list: ps.map((p) => ({ id: p.partner, name: p.owner_name })) };
  }
  if (kind === 'counsel') {
    if (!UUID.test(body.counsel_id || '')) return null;
    const [c] = await rest('counsel?id=eq.' + body.counsel_id + '&select=id,entry_id,author,created_at');
    if (!c || c.author !== me || !recent(c.created_at)) return null;
    const [e] = await rest('entries?id=eq.' + c.entry_id + '&select=id,user_id,shared');
    if (!e || !e.shared) return null;
    if (e.user_id === me) {
      const ps = await rest('partners?owner=eq.' + me + '&select=partner,owner_name');
      return { ref: e.id, list: ps.map((p) => ({ id: p.partner, name: p.owner_name })) };
    }
    const [p] = await rest('partners?owner=eq.' + e.user_id + '&partner=eq.' + me + '&select=partner_name');
    if (!p) return null;
    return { ref: e.id, list: [{ id: e.user_id, name: p.partner_name }] };
  }
  return null;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'method' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.RESEND_API_KEY) return reply(503, { ok: false, error: 'not_configured' });
  const token = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'bad_json' }); }
  const kind = body.kind;
  if (kind !== 'share' && kind !== 'counsel') return reply(400, { ok: false, error: 'kind' });

  try {
    const me = token ? await whoIs(token) : null;
    if (!me) return reply(401, { ok: false, error: 'sign_in' });
    const since = new Date(Date.now() - 86400000).toISOString();
    const mine = await rest('notices?actor=eq.' + me + '&sent_at=gt.' + encodeURIComponent(since) + '&select=id&limit=' + (ACTOR_DAILY_MAX + 1));
    if (mine.length >= ACTOR_DAILY_MAX) return reply(429, { ok: false, error: 'busy' });

    const who = await recipientsFor(kind, me, body);
    if (!who) return reply(200, { ok: true, sent: 0, skipped: 0, note: 'nothing_to_send' });

    let sent = 0, skipped = 0;
    for (const r of who.list.slice(0, 3)) {
      const [pref] = await rest('email_prefs?user_id=eq.' + r.id + '&select=notify');
      if (pref && pref.notify === false) { skipped++; continue; }
      const after = new Date(Date.now() - WINDOW[kind] * 1000).toISOString();
      const prior = await rest('notices?recipient=eq.' + r.id + '&kind=eq.' + kind + '&ref=eq.' + who.ref + '&sent_at=gt.' + encodeURIComponent(after) + '&select=id&limit=1');
      if (prior.length) { skipped++; continue; }
      const email = await emailOf(r.id);
      if (!email) { skipped++; continue; }
      const [j] = await rest('journeys?user_id=eq.' + r.id + '&select=lang');
      const msg = buildEmail(kind, (j && j.lang) || 'en', r.name);
      const res = await call(RESEND_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY }, body: { from: FROM, to: [email], subject: msg.subject, text: msg.text, html: msg.html } });
      if (res.status >= 300) { console.error('resend', res.status, res.json && res.json.message); skipped++; continue; }
      sent++;
      // The email has gone; if logging it fails, say so in the logs rather than failing the request.
      await restInsert('notices', { actor: me, recipient: r.id, kind, ref: who.ref }).catch((e) => console.error('notice log', e.message));
    }
    return reply(200, { ok: true, sent, skipped });
  } catch (e) {
    console.error('notify', e.message);
    return reply(502, { ok: false, error: 'upstream' });
  }
};
