// Email notices for discernment partners (COMPASS-04; care notes COMPASS-06). The work is in netlify/lib/notices.mjs.
import { whoIs, sendNotices, buildEmail, TEMPLATES } from '../lib/notices.mjs';
export { buildEmail, TEMPLATES };

const reply = (status, obj) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'method' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.RESEND_API_KEY) return reply(503, { ok: false, error: 'not_configured' });
  const token = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'bad_json' }); }
  const kind = body.kind;
  if (kind !== 'share' && kind !== 'counsel' && kind !== 'care') return reply(400, { ok: false, error: 'kind' });
  try {
    const me = token ? await whoIs(token) : null;
    if (!me) return reply(401, { ok: false, error: 'sign_in' });
    const r = await sendNotices(me, kind, body);
    if (r.busy) return reply(429, { ok: false, error: 'busy' });
    return reply(200, { ok: true, ...r });
  } catch (e) {
    console.error('notify', e.message);
    return reply(502, { ok: false, error: 'upstream' });
  }
};
