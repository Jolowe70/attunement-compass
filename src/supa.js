// Supabase for the 30-Day Attunement. The library loads only when someone opens their journey,
// so the quick Compass never waits for it (and a network hiccup can never blank the page).
const URL = import.meta.env.VITE_SUPABASE_URL || "https://etmkqtddanvxdiicofbf.supabase.co";
// The anon key is public by design: it can only do what the row-level security rules allow.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0bWtxdGRkYW52eGRpaWNvZmJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMzM5OTYsImV4cCI6MjEwNzYwOTk5Nn0.W7_HL2neO9kuEHvfjgEaTMUSTCoBWvy7iZTkhacgyCs";
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ANON;
export const journeyAvailable = !!(URL && KEY);
export const googleOn = import.meta.env.VITE_SUPABASE_GOOGLE === "on";

let clientP = null;
export function sb() {
  if (!journeyAvailable) return Promise.reject(new Error("not_configured"));
  if (!clientP) {
    clientP = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }));
  }
  return clientP;
}

const ok = ({ data, error }) => { if (error) throw error; return data; };

export async function currentUser() {
  const c = await sb();
  const { data } = await c.auth.getSession();
  return data.session ? data.session.user : null;
}
export async function onAuth(cb) {
  const c = await sb();
  const { data } = c.auth.onAuthStateChange((event, session) => cb(session ? session.user : null, event));
  return () => data.subscription.unsubscribe();
}
export async function signIn(email, password) { const c = await sb(); return ok(await c.auth.signInWithPassword({ email, password })); }
export async function signUp(email, password) {
  const c = await sb();
  return ok(await c.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + "/" } }));
}
export async function signInGoogle() { const c = await sb(); ok(await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/" } })); }
export async function resetPassword(email) {
  const c = await sb();
  ok(await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/" }));
}
export async function updatePassword(password) { const c = await sb(); return ok(await c.auth.updateUser({ password })); }
export async function signOut() { const c = await sb(); await c.auth.signOut(); }

export async function getJourney() {
  const c = await sb();
  const rows = ok(await c.from("journeys").select("*").limit(1));
  return rows[0] || null;
}
export async function startJourney(lang, displayName) {
  const c = await sb();
  return ok(await c.from("journeys").insert({ lang, display_name: displayName || null }).select().single());
}
export async function newRound(j) {
  const c = await sb();
  return ok(await c.from("journeys").update({ round: j.round + 1, round_started_at: new Date().toISOString(), rounds_completed: j.rounds_completed + 1 }).eq("user_id", j.user_id).select().single());
}

// Only the person's own entries (entries shared WITH them by others are fetched separately).
export async function listEntries(userId) {
  const c = await sb();
  return ok(await c.from("entries").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(400));
}
export async function listSharedWithMe(userId) {
  const c = await sb();
  return ok(await c.from("entries").select("id,user_id,created_at,local_date,day_no,domain,pressure,signal,source,my_source,stance,prayer,passages,step,community,step_status,shared_at")
    .neq("user_id", userId).eq("shared", true).order("created_at", { ascending: false }).limit(200));
}
export async function setShared(id, shared) {
  const c = await sb();
  return ok(await c.from("entries").update({ shared, shared_at: shared ? new Date().toISOString() : null }).eq("id", id).select().single());
}

// Discernment partners
export async function listPartners() { const c = await sb(); return ok(await c.from("partners").select("*").order("created_at")); }
export async function listInvites() {
  const c = await sb();
  return ok(await c.from("invites").select("*").is("used_at", null).gt("expires_at", new Date().toISOString()).order("created_at"));
}
export async function createInvite(role, name) { const c = await sb(); return ok(await c.rpc("create_invite", { p_role: role, p_name: name })); }
export async function cancelInvite(code) { const c = await sb(); ok(await c.from("invites").delete().eq("code", code)); }
export async function inviteInfo(code) { const c = await sb(); const rows = ok(await c.rpc("invite_info", { p_code: code })); return rows[0] || null; }
export async function acceptInvite(code, name) { const c = await sb(); return ok(await c.rpc("accept_invite", { p_code: code, p_name: name })); }
export async function endPartnership(id) { const c = await sb(); ok(await c.from("partners").delete().eq("id", id)); }
export async function listCounsel(entryIds) {
  if (!entryIds.length) return [];
  const c = await sb();
  return ok(await c.from("counsel").select("*").in("entry_id", entryIds.slice(0, 300)).order("created_at"));
}
export async function addCounsel(entryId, body) { const c = await sb(); return ok(await c.from("counsel").insert({ entry_id: entryId, body }).select().single()); }
export async function deleteCounsel(id) { const c = await sb(); ok(await c.from("counsel").delete().eq("id", id)); }
export async function addEntry(e) {
  const c = await sb();
  return ok(await c.from("entries").insert(e).select().single());
}
export async function setStep(id, status) {
  const c = await sb();
  return ok(await c.from("entries").update({ step_status: status, step_checked_at: new Date().toISOString() }).eq("id", id).select().single());
}
export async function deleteEntry(id) { const c = await sb(); ok(await c.from("entries").delete().eq("id", id)); }
export async function deleteEverything(userId) {
  const c = await sb();
  ok(await c.from("invites").delete().eq("owner", userId));
  ok(await c.from("partners").delete().eq("owner", userId));
  ok(await c.from("entries").delete().eq("user_id", userId));
  ok(await c.from("reflections").delete().eq("user_id", userId));
  ok(await c.from("journeys").delete().eq("user_id", userId));
}

export async function getReflection(round, week) {
  const c = await sb();
  const rows = ok(await c.from("reflections").select("*").eq("round", round).eq("week", week).limit(1));
  return rows[0] || null;
}
export async function saveReflection(round, week, body) {
  const c = await sb();
  return ok(await c.from("reflections").insert({ round, week, body }).select().single());
}

// Email notices (COMPASS-04). Sent by the server; the app only says what just happened.
export async function notify(kind, ids) {
  try {
    const c = await sb();
    const { data } = await c.auth.getSession();
    if (!data.session) return;
    await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token }, body: JSON.stringify({ kind, ...ids }) });
  } catch (e) { /* a notice is a courtesy; never block the person */ }
}
export async function getEmailPref() {
  const c = await sb();
  const rows = ok(await c.from("email_prefs").select("notify").limit(1));
  return rows[0] ? rows[0].notify : true;
}
export async function setEmailPref(on) {
  const c = await sb();
  ok(await c.from("email_prefs").upsert({ notify: on, updated_at: new Date().toISOString() }));
}

// Apps linked to this journal (COMPASS-05: CLUB 24E).
export async function listLinks() { const c = await sb(); return ok(await c.from("links").select("club_user,app,email,linked_at")); }
export async function unlinkApp(clubUser) { const c = await sb(); ok(await c.from("links").delete().eq("club_user", clubUser)); }

// Church care (COMPASS-06).
export async function careOverview() { const c = await sb(); return ok(await c.rpc("care_overview")); }
export async function listCareNotes() { const c = await sb(); return ok(await c.from("care_notes").select("*").order("created_at", { ascending: false }).limit(500)); }
export async function addCareNote(link, body) { const c = await sb(); return ok(await c.from("care_notes").insert({ link, body }).select().single()); }
export async function markCareRead(ids) {
  if (!ids.length) return;
  const c = await sb();
  ok(await c.from("care_notes").update({ read_at: new Date().toISOString() }).in("id", ids.slice(0, 200)));
}
export async function deleteCareNote(id) { const c = await sb(); ok(await c.from("care_notes").delete().eq("id", id)); }
export async function setShowProgress(id, on) { const c = await sb(); ok(await c.from("partners").update({ show_progress: on }).eq("id", id)); }
