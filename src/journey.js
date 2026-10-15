// The rules of the 30-Day Attunement, kept apart from the screens so they can be tested.
// Days count by days PRACTISED, not calendar days: missing a day never skips part of the training.

export const DOMAIN_KEYS = ["relationships", "work", "inner", "social", "financial", "health", "ministry", "family", "other"];
export const TEST_KEYS = ["christological", "canonical", "character", "corporate"];

export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

// The training wheels come off in three stages (ebook, chapter 7).
export function modeForDay(day) {
  if (day <= 10) return "guided";
  if (day <= 20) return "compare";
  return "self";
}

export function journeyState(journey, entries, today = localDate()) {
  if (!journey) return null;
  const mine = (entries || []).filter((e) => e.round === journey.round);
  const dates = [...new Set(mine.map((e) => e.local_date))].sort();
  const practisedToday = dates.includes(today);
  const practised = dates.length;
  const complete = practised >= 30;
  const day = complete ? 30 : practisedToday ? practised : practised + 1;
  const week = Math.min(5, Math.ceil(day / 7));
  return { round: journey.round, practised, practisedToday, complete, day, mode: modeForDay(day), week, dates };
}

// Entries recorded during a given week of the round (days 1–7, 8–14, …; week 5 is days 29–30).
export function weekEntries(entries, round, week) {
  const lo = (week - 1) * 7 + 1, hi = week === 5 ? 30 : week * 7;
  return (entries || []).filter((e) => e.round === round && e.day_no >= lo && e.day_no <= hi);
}

// The step to ask about: the latest unchecked step from an earlier day, or from more than three hours ago, within the past week.
export function pendingStep(entries, now = new Date(), today = localDate(now)) {
  const weekAgo = now.getTime() - 7 * 86400000;
  return (entries || []).find((e) => e.step && e.step_status === "pending" &&
    new Date(e.created_at).getTime() > weekAgo &&
    (e.local_date < today || now.getTime() - new Date(e.created_at).getTime() > 3 * 3600000)) || null;
}

// The person's own reading of the four tests.
export function selfSource(my) {
  const vals = TEST_KEYS.map((k) => my[k]);
  const fails = vals.filter((v) => v === "misaligned").length;
  const unsure = vals.filter((v) => v === "unclear").length;
  if (fails >= 2) return "error";
  if (fails === 0 && unsure <= 1) return "truth";
  return "unclear";
}

function count(list, key) {
  const m = {};
  for (const x of list) { const k = x[key] || ""; if (k) m[k] = (m[k] || 0) + 1; }
  return m;
}

export function patterns(entries) {
  const list = entries || [];
  const steps = { done: 0, not_yet: 0, released: 0, pending: 0 };
  for (const e of list) if (e.step) steps[e.step_status] = (steps[e.step_status] || 0) + 1;
  let agree = 0, compared = 0;
  for (const e of list) {
    if (!e.my_tests || !e.tests) continue;
    for (const k of TEST_KEYS) {
      const mineR = e.my_tests[k], guideR = e.tests[k] && e.tests[k].result;
      if (!mineR || !guideR) continue;
      compared++; if (mineR === guideR) agree++;
    }
  }
  const sources = {};
  for (const e of list) { const s = e.my_source || e.source; if (s) sources[s] = (sources[s] || 0) + 1; }
  return { total: list.length, domains: count(list, "domain"), pressures: count(list, "pressure"), sources, steps, agree, compared };
}
