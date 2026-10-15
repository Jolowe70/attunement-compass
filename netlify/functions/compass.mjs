// The Attunement Compass guide. The Anthropic key stays on the server, and this function only runs
// the Compass steps (test the signal, faithful response, weekly reflection) with prompts written here. The browser
// sends the person's words, never a prompt, so the key cannot be used for anything else.

import https from 'https';

const MODEL = process.env.COMPASS_MODEL || 'claude-haiku-4-5';
const TIMEOUT_MS = 8500; // Netlify stops a normal function at 10 seconds; fail with a real message first.

const LANGS = { en: 'English', es: 'Spanish', fr: 'French', yo: 'Yoruba', ig: 'Igbo', ha: 'Hausa' };
const DOMAINS = ['relationships', 'work', 'inner', 'social', 'financial', 'health', 'ministry', 'family', 'other', ''];
const PRESSURES = ['urgent', 'gentle', 'unclear', ''];
const TESTS = ['christological', 'canonical', 'character', 'corporate'];
const RESULTS = ['aligned', 'misaligned', 'unclear'];
const SOURCES = ['truth', 'error', 'unclear'];
const STANCES = ['refute', 'affirm', 'wait'];

// Languages written with many accent marks use more tokens, so they get more room.
const BUDGET = { test: { base: 900, heavy: 1400 }, respond: { base: 800, heavy: 1250 }, reflect: { base: 700, heavy: 1100 } };
const ACTIONS = ['test', 'respond', 'reflect'];
const STEPS = ['pending', 'done', 'not_yet', 'released'];
const HEAVY = ['yo', 'ig', 'ha'];

const SYSTEM = [
  'You are the guide inside THE ATTUNEMENT COMPASS, a spiritual discernment practice grounded in 1 John 4: "Beloved, believe not every spirit, but try the spirits whether they are of God."',
  'Rules you always keep:',
  '1) You are an aid to the person\'s own discernment. Never claim to speak for God, to receive revelation, or to be certain. Say "likely", and point them to Scripture and to their church.',
  '2) Never write out Bible verses as quotations. Refer to Scripture only by book, chapter and verse; the app shows the exact King James words itself.',
  '3) Be Christ-centred, Trinitarian, denomination-neutral, warm and plain. Write for a global audience.',
  '4) Never attribute illness, trauma, grief, or mental-health symptoms to evil spirits. Give no medical, legal or financial advice.',
  '5) If the person may be at risk of harming themselves or someone else, is being abused, or faces a medical emergency, set crisis to true.',
  '6) Reply with ONLY minified single-line JSON in exactly the shape requested. No markdown, no code fences, no commentary.'
].join('\n');

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n);

// Clear statements of danger are caught here before the AI is asked anything.
const CRISIS = /\b(kill(ing)? myself|end (it all|my life)|take my (own )?life|suicid\w*|want to die|don'?t want to (live|be alive)|hurt myself|self[- ]harm|cut myself|overdose|kill (him|her|them|someone)|matarme|suicidar|quitarme la vida|me tuer|me suicider|en finir avec (la|ma) vie)\b/i;
export const crisisWords = (text) => CRISIS.test(String(text || ''));

export function buildPrompt(action, p) {
  const lang = LANGS[p.lang] || 'English';
  const domain = p.domain || 'unspecified';
  const pressure = { urgent: 'an urgent rush (fear, panic, compulsion)', gentle: 'a quiet nudge (clear, patient, inviting)', unclear: 'unclear' }[p.pressure] || 'not noted';
  if (action === 'test') {
    return 'Apply Stage II of the Compass, the four calibration tests, to the signal below. Write every sentence in ' + lang + '.\n' +
      '1) christological: does it submit to the Lordship of Jesus Christ? If followed, does it make Jesus Lord, or the self?\n' +
      '2) canonical: does it harmonise with the whole of Scripture, read in context?\n' +
      '3) character: what fruit does it produce: the fruit of the Spirit (Galatians 5:22-23) or the works of the flesh?\n' +
      '4) corporate: is it accountable to the body of Christ, or does it thrive in secrecy and isolation? You cannot know whether they have shared it unless they say so; if they have not said, the result is "unclear" and you encourage them to bring it to a mature believer or their pastor.\n' +
      'Artificial urgency, fear and panic are warning signs; the Spirit of Truth is clear, specific and patient, and brings peace even when calling to hard action. A signal that fails two or more tests is very likely not from the Spirit of God. Use "unclear" whenever you honestly cannot tell.\n' +
      'Life domain: ' + domain + '. The pressure they felt: ' + pressure + '.\nSIGNAL: ' + clip(p.signal, 1200) + '\n' +
      'Return {"source":"truth|error|unclear","summary":"1-2 gentle pastoral sentences","tests":{"christological":{"result":"aligned|misaligned|unclear","analysis":"2-3 sentences"},"canonical":{...},"character":{...},"corporate":{...}},"crisis":false}';
  }
  if (action === 'respond') {
    return 'Stage III of the Compass: the faithful response. Write every sentence in ' + lang + '.\n' +
      'Life domain: ' + domain + '. SIGNAL: ' + clip(p.signal, 1200) + '\nThe tests suggested the source is: ' + clip(p.source, 10) + ' (' + clip(p.summary, 500) + ').\n' +
      'Choose the stance: "refute" if it is likely from the spirit of error, "affirm" if it is likely from the Spirit of Truth, "wait" if it is unclear.\n' +
      'Guide them through Scripture: choose 1 to 3 passages from ANYWHERE in the Bible that speak most truly to this exact signal, read in their own context and never twisted. ' +
      'Give each as a King James reference written in English, in the form "Book Chapter:Verse" or "Book Chapter:Verse-Verse" (at most 8 verses), for example "Psalm 34:17-19" or "1 Peter 5:6-7". Never quote the words.\n' +
      'Return {"stance":"refute|affirm|wait","prayer":"40-80 words the person can pray themselves, first person, addressed to God. For refute: name the lying signal and reject it in the name of Jesus Christ, then receive the truth. For affirm: yield to the Lord and ask grace to obey. For wait: ask for clarity and peace.","passages":[{"ref":"Book C:V-V","why":"2-3 sentences on what the passage says in its context and how it speaks to this signal"}],"step":"ONE concrete step of obedience they can take in the next ten minutes","community":"one sentence on whom to bring this to (their pastor, a mature believer, their church)","encouragement":"1-2 sentences"}';
  }
  if (action === 'reflect') {
    const list = (p.entries || []).map((e, i) => (i + 1) + ') [' + [e.domain || 'unspecified', e.pressure || 'pressure not noted', 'source ' + e.source, 'step ' + e.step].join(', ') + '] ' + e.signal).join('\n');
    return 'A believer is in week ' + p.week + ' of a 30-day practice of THE ATTUNEMENT COMPASS. Below are the signals they tested this past week, with the life domain, how the signal pressed on them, what the tests suggested, and whether they took their one step. Write every sentence in ' + lang + '.\n' +
      'Reflect back, gently and plainly, what keeps returning: recurring themes, life domains, rushed versus quiet signals, and the pattern of their obedience. Encourage; never condemn (Romans 8:1). Do not diagnose, and never attribute struggles to evil spirits.\n' +
      'Guide them to Scripture: choose 1 or 2 passages from ANYWHERE in the Bible, as King James references written in English ("Book Chapter:Verse" or "Book Chapter:Verse-Verse", at most 8 verses). Never quote the words.\n' +
      'ENTRIES:\n' + list + '\n' +
      'Return {"themes":["2-4 short phrases"],"reflection":"80-140 words","passages":[{"ref":"Book C:V-V","why":"1-2 sentences on how it speaks to this week"}],"focus":"one simple practice for the week ahead","crisis":false}';
  }
  return null;
}

export function repairJSON(text) {
  let s = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  if (start > 0) s = s.slice(start);
  try { return JSON.parse(s); } catch (e) { /* try to close a cut-off reply */ }
  let inStr = false, esc = false;
  const stack = [];
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') inStr = !inStr;
    else if (!inStr && (ch === '{' || ch === '[')) stack.push(ch);
    else if (!inStr && (ch === '}' || ch === ']')) stack.pop();
  }
  let fixed = s + (inStr ? '"' : '');
  fixed = fixed.replace(/,\s*$/, '').replace(/:\s*$/, ':""');
  while (stack.length) fixed += stack.pop() === '{' ? '}' : ']';
  try { return JSON.parse(fixed); } catch (e) { return null; }
}

const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
const txt = (v, n) => clip(typeof v === 'string' ? v : '', n).trim();
const REF = /^(?:[1-3] )?[A-Za-z][A-Za-z .]{1,24} \d{1,3}(?::\d{1,3}(?:\s?[-–]\s?\d{1,3})?)?$/;

// Only the expected fields leave this function, each checked and trimmed.
export function shape(action, raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (action === 'test') {
    const tests = {};
    for (const k of TESTS) {
      const t = (raw.tests && raw.tests[k]) || {};
      const r = t.result || (t.verdict === 'pass' ? 'aligned' : t.verdict === 'fail' ? 'misaligned' : '');
      tests[k] = { result: pick(r, RESULTS, 'unclear'), analysis: txt(t.analysis || t.why, 600) };
    }
    if (!TESTS.some((k) => tests[k].analysis)) return null;
    let source = pick(raw.source, SOURCES, 'unclear');
    const fails = TESTS.filter((k) => tests[k].result === 'misaligned').length;
    if (source === 'truth' && fails >= 2) source = 'unclear'; // never call it the Spirit of Truth when two tests fail
    return { source, summary: txt(raw.summary, 500), tests, crisis: raw.crisis === true };
  }
  if (action === 'respond') {
    const passages = (Array.isArray(raw.passages) ? raw.passages : [])
      .map((x) => ({ ref: txt(x && x.ref, 40).replace(/\s+/g, ' '), why: txt(x && x.why, 600) }))
      .filter((x) => REF.test(x.ref)).slice(0, 3);
    const out = {
      stance: pick(raw.stance, STANCES, 'wait'), prayer: txt(raw.prayer, 900), passages,
      step: txt(raw.step, 400), community: txt(raw.community, 300), encouragement: txt(raw.encouragement, 400), crisis: raw.crisis === true
    };
    return out.prayer || out.step ? out : null;
  }
  if (action === 'reflect') {
    const passages = (Array.isArray(raw.passages) ? raw.passages : [])
      .map((x) => ({ ref: txt(x && x.ref, 40).replace(/\s+/g, ' '), why: txt(x && x.why, 500) }))
      .filter((x) => REF.test(x.ref)).slice(0, 2);
    const themes = (Array.isArray(raw.themes) ? raw.themes : []).map((t) => txt(t, 80)).filter(Boolean).slice(0, 4);
    const out = { themes, reflection: txt(raw.reflection, 1200), passages, focus: txt(raw.focus, 300), crisis: raw.crisis === true };
    return out.reflection ? out : null;
  }
  return null;
}

// Best effort: each running copy of the function remembers recent requests per address.
const hits = new Map();
export function rateLimited(key, max = 8, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return arr.length > max;
}

const reply = (status, obj) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

function sameSite(event) {
  const origin = event.headers.origin || event.headers.Origin;
  if (!origin) return true; // some browsers leave it off for same-site requests
  const host = event.headers.host || '';
  try {
    const o = new URL(origin).host;
    const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    return o === host || extra.some((e) => e === origin || e === o) || /^localhost(:\d+)?$/.test(o);
  } catch (e) { return false; }
}

function post(body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => { const e = new Error('timeout'); e.name = 'AbortError'; req.destroy(e); });
    req.write(body);
    req.end();
  });
}

export async function callAnthropic(prompt, maxTokens) {
  const r = await post(JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }));
  let data = {};
  try { data = JSON.parse(r.body); } catch (e) { /* keep empty */ }
  if (r.status !== 200) throw new Error('upstream ' + r.status + (data.error && data.error.message ? ': ' + data.error.message : ''));
  return (data.content || []).map((b) => b.text || '').join('');
}

export const handler = async (event, _ctx, deps = {}) => {
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'method' });
  if (!process.env.ANTHROPIC_API_KEY) return reply(503, { ok: false, error: 'not_configured' });
  if (!sameSite(event)) return reply(403, { ok: false, error: 'origin' });
  if ((event.body || '').length > 6000) return reply(413, { ok: false, error: 'too_large' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'bad_json' }); }
  const action = body.action;
  if (!ACTIONS.includes(action)) return reply(400, { ok: false, error: 'unknown_action' });

  const p = {
    lang: pick(body.lang, Object.keys(LANGS), 'en'),
    domain: pick(body.domain, DOMAINS, ''),
    pressure: pick(body.pressure, PRESSURES, ''),
    signal: clip(body.signal, 1200).trim(),
    source: pick(body.source, SOURCES, 'unclear'),
    summary: clip(body.summary, 500)
  };
  if (action === 'reflect') {
    p.week = Math.min(6, Math.max(1, Number(body.week) || 1));
    p.entries = (Array.isArray(body.entries) ? body.entries : []).slice(0, 14).map((e) => ({
      domain: pick(e && e.domain, DOMAINS, ''), pressure: pick(e && e.pressure, PRESSURES, ''),
      source: pick(e && e.source, SOURCES, 'unclear'), step: pick(e && e.step, STEPS, 'pending'), signal: clip(e && e.signal, 240).trim()
    })).filter((e) => e.signal.length >= 3);
    if (p.entries.length < 3) return reply(400, { ok: false, error: 'too_few' });
    p.signal = p.entries.map((e) => e.signal).join(' | ');
  }
  if (p.signal.length < 3) return reply(400, { ok: false, error: 'empty' });
  if (action !== 'reflect' && crisisWords(p.signal)) return reply(200, { ok: true, result: { crisis: true } });

  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip, Number(process.env.COMPASS_RATE || 8))) return reply(429, { ok: false, error: 'busy' });

  const max = BUDGET[action][HEAVY.includes(p.lang) ? 'heavy' : 'base'];
  let text;
  try {
    text = await (deps.call || callAnthropic)(buildPrompt(action, p), max);
  } catch (e) {
    console.error('compass', action, e.message);
    return reply(e.name === 'AbortError' ? 504 : 502, { ok: false, error: e.name === 'AbortError' ? 'timeout' : 'upstream' });
  }
  const result = shape(action, repairJSON(text));
  if (!result) return reply(502, { ok: false, error: 'unreadable' });
  return reply(200, { ok: true, result });
};
