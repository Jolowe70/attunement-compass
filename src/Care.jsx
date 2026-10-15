// Church care (COMPASS-06): a pastor sees everyone in their care in one place, with who needs a word first.
// Progress shows only when the person allows it; the words of an entry only when they share it.
import { useState } from "react";
import * as DB from "./supa.js";
import { S, AuthBox } from "./Journey.jsx";
import { CounselThread } from "./Partners.jsx";
import { fmt } from "./strings-journey.js";
import { localDate } from "./journey.js";

const GOLD = "#C9A84C", BLUE = "#7B9EBE", GREEN = "#82C9A0", RED = "#E07B6A";
const DAY = 86400000;

function daysSince(dateStr, today = localDate()) {
  if (!dateStr) return null;
  return Math.round((new Date(today + "T12:00:00") - new Date(String(dateStr).slice(0, 10) + "T12:00:00")) / DAY);
}
export function whenText(J, d) {
  if (d === null) return "";
  return d <= 0 ? J.careToday : d === 1 ? J.careYesterday : fmt(J.careDaysAgo, { n: d });
}

// Shared entries from this person still waiting for my word (shared in the last 30 days, nothing from me since).
export function awaitingWord(me, owner, shared, counsel, now = Date.now()) {
  return shared.filter((e) => e.user_id === owner && e.shared_at && now - new Date(e.shared_at).getTime() < 30 * DAY &&
    !counsel.some((c) => c.entry_id === e.id && c.author === me && new Date(c.created_at) >= new Date(e.shared_at)));
}

// Everything the care list needs about one person, and how urgently they need attention.
export function careRow(me, p, ov, shared, counsel, notes, today = localDate(), now = Date.now()) {
  const waiting = awaitingWord(me, p.owner, shared, counsel, now).length;
  const unread = notes.filter((n) => n.link === p.id && n.author !== me && !n.read_at).length;
  const progress = !!(ov && ov.show_progress);
  const begun = progress && ov.round != null;
  const quietDays = begun && ov.last_practised ? daysSince(ov.last_practised, today) : null;
  const complete = begun && ov.practised >= 30;
  const quiet = quietDays !== null && quietDays >= 7 && !complete;
  const score = unread * 4 + waiting * 3 + (quiet ? 2 : 0) + (begun && ov.steps_not_yet > 0 ? 1 : 0);
  return { p, ov, waiting, unread, progress, begun, quietDays, quiet, complete, score };
}

// A conversation between a person and someone walking with them, outside any one entry.
export function CareNotes({ J, me, link, notes, reload, compact }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mine = notes.filter((n) => n.link === link).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setErr("");
    try {
      const row = await DB.addCareNote(link, text.trim().slice(0, 1000));
      setText(""); DB.notify("care", { note_id: row.id }); await reload();
    } catch (x) { setErr(/too_many/.test(x.message || "") ? J.notesTooMany : J.errorLoad); }
    setBusy(false);
  }
  async function del(id) { try { await DB.deleteCareNote(id); await reload(); } catch (x) { setErr(J.errorLoad); } }
  return (
    <div style={{ marginTop: 10, borderLeft: "2px solid " + GOLD + "55", paddingLeft: 12 }} data-testid="carenotes">
      {!compact && <div style={{ ...S.small, color: GOLD, marginBottom: 6 }}>{J.notesTitle}</div>}
      {mine.length === 0 && <p style={{ ...S.small, marginBottom: 6 }}>{J.notesEmpty}</p>}
      {mine.slice(-20).map((n) => (
        <div key={n.id} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#8A9EC0" }}>
            {n.author === me ? J.you : n.author_name} · {new Date(n.created_at).toLocaleDateString()}
            {n.author === me && <button onClick={() => del(n.id)} style={{ ...S.link, fontSize: 11.5, color: "#8A5A50", marginLeft: 10 }}>{J.del}</button>}
          </div>
          <p style={{ ...S.text, fontSize: 14, whiteSpace: "pre-wrap" }}>{n.body}</p>
        </div>
      ))}
      <form onSubmit={send} data-form="carenote" style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={J.notesWrite} aria-label={J.notesWrite} style={{ ...S.input, marginBottom: 0, fontSize: 14, padding: "9px 12px" }} />
        <button type="submit" disabled={busy || !text.trim()} style={{ ...S.btn(GOLD), width: "auto", padding: "9px 14px", fontSize: 13 }}>{J.notesSend}</button>
      </form>
      {err && <p style={{ ...S.small, color: RED, marginTop: 6 }}>{err}</p>}
    </div>
  );
}

// At the top of My Journey: new words from a pastor or partner.
export function NewWords({ J, me, notes, partners, reload }) {
  const [replyTo, setReplyTo] = useState(null);
  const unread = notes.filter((n) => n.author !== me && !n.read_at && partners.some((p) => p.id === n.link));
  if (!unread.length && !replyTo) return null;
  async function markRead(ids) { try { await DB.markCareRead(ids); await reload(); } catch (x) { /* try again later */ } }
  const links = [...new Set(unread.map((n) => n.link).concat(replyTo ? [replyTo] : []))];
  return (
    <div style={S.card(GOLD)} data-testid="newwords">
      <div style={S.label}>{J.newWordsTitle}</div>
      {links.map((link) => {
        const these = unread.filter((n) => n.link === link).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        return (
          <div key={link} style={{ borderTop: "1px solid #1A2840", padding: "10px 0" }}>
            {these.map((n) => (
              <div key={n.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: GOLD }}>{n.author_name} · {new Date(n.created_at).toLocaleDateString()}</div>
                <p style={{ ...S.text, whiteSpace: "pre-wrap" }}>{n.body}</p>
              </div>
            ))}
            {replyTo === link ? (
              <CareNotes J={J} me={me} link={link} notes={notes} reload={async () => { await reload(); }} compact />
            ) : (
              <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
                <button style={S.link} onClick={() => { setReplyTo(link); markRead(these.map((n) => n.id)); }}>{J.reply}</button>
                <button style={{ ...S.link, color: "#8A9EC0" }} onClick={() => markRead(these.map((n) => n.id))}>{J.markRead}</button>
              </div>
            )}
          </div>
        );
      })}
      {replyTo && <button style={{ ...S.link, marginTop: 8, fontSize: 12.5 }} onClick={() => setReplyTo(null)}>{J.done}</button>}
    </div>
  );
}

// In My Journey, for a pastor: a short summary that opens the care view.
export function CareSummary({ J, me, walking, shared, counsel, onOpen }) {
  const pastoral = walking.filter((p) => p.role === "pastor");
  if (!pastoral.length) return null;
  const w = pastoral.filter((p) => awaitingWord(me, p.owner, shared, counsel).length > 0).length;
  return (
    <div style={S.card(GOLD)} data-testid="caresummary">
      <div style={S.label}>{J.careTitle}</div>
      <p style={{ ...S.text, marginBottom: 12 }}>{fmt(J.careSummary, { n: pastoral.length, w })}</p>
      <button onClick={onOpen} style={S.btn(GOLD, true)}>{J.careOpenView}</button>
    </div>
  );
}

function Badge({ color, children }) {
  return <span style={{ fontSize: 11.5, color, border: "1px solid " + color + "66", borderRadius: 20, padding: "2px 9px", whiteSpace: "nowrap" }}>{children}</span>;
}

function Person({ T, J, me, r, shared, counsel, notes, reload }) {
  const [open, setOpen] = useState(false);
  const { p, ov } = r;
  const theirs = shared.filter((e) => e.user_id === p.owner);
  async function openUp() {
    const next = !open; setOpen(next);
    if (next) {
      const ids = notes.filter((n) => n.link === p.id && n.author !== me && !n.read_at).map((n) => n.id);
      if (ids.length) { try { await DB.markCareRead(ids); await reload(); } catch (x) { /* later */ } }
    }
  }
  async function stop() {
    if (!window.confirm(fmt(J.confirmStop, { name: p.owner_name }))) return;
    try { await DB.endPartnership(p.id); await reload(); } catch (x) { /* shown on next load */ }
  }
  let status;
  if (!r.progress) status = J.careProgressPrivate;
  else if (!r.begun) status = J.careNoJourney;
  else {
    const day = r.complete ? fmt(J.careRoundDone, { n: ov.round }) : fmt(J.careDay, { n: Math.min(30, ov.practised + (r.quietDays === 0 ? 0 : 1)) });
    const last = ov.last_practised ? fmt(J.careLast, { when: whenText(J, r.quietDays) }) : "";
    status = [day, last].filter(Boolean).join(" · ");
  }
  return (
    <div style={{ borderTop: "1px solid #1A2840", padding: "12px 0" }} data-testid="careperson">
      <button onClick={openUp} aria-expanded={open} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span style={{ color: "#F0E6CC", fontFamily: "'Cormorant Garamond',serif", fontSize: 19 }}>{p.owner_name}</span>
          <span style={{ fontSize: 12, color: "#5A7090" }}>{open ? "▾" : "▸"}</span>
        </div>
        <div style={{ fontSize: 13, color: "#8A9EC0", marginTop: 2 }}>{status}</div>
        {r.begun && (ov.steps_done > 0 || ov.steps_not_yet > 0) && <div style={{ fontSize: 12.5, color: "#5A7090", marginTop: 2 }}>{fmt(J.careSteps, { done: ov.steps_done, notYet: ov.steps_not_yet })}</div>}
        {(r.unread > 0 || r.waiting > 0 || r.quiet) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {r.unread > 0 && <Badge color={GOLD}>✉ {fmt(J.careBadgeUnread, { n: r.unread })}</Badge>}
            {r.waiting > 0 && <Badge color={BLUE}>{fmt(J.careBadgeWord, { n: r.waiting })}</Badge>}
            {r.quiet && <Badge color={RED}>{fmt(J.careBadgeQuiet, { n: r.quietDays })}</Badge>}
          </div>
        )}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <CareNotes J={J} me={me} link={p.id} notes={notes} reload={reload} />
          <div style={{ ...S.small, color: GREEN, margin: "14px 0 4px" }}>{J.careShared}</div>
          {theirs.length === 0 && <p style={S.small}>{J.careNothingShared}</p>}
          {theirs.slice(0, 10).map((e) => {
            const src = e.my_source || e.source;
            return (
              <div key={e.id} style={{ margin: "8px 0 14px" }} data-testid="sharedentry">
                <div style={{ fontSize: 12, color: "#5A7090", marginBottom: 4 }}>{e.local_date}{src ? " · " + T.sources[src] : ""}</div>
                <p style={{ ...S.text, fontSize: 14 }}>{e.signal}</p>
                {e.step && <p style={{ ...S.small, marginTop: 4 }}>{J.step}: {e.step} · {J.statusLabels[e.step_status]}</p>}
                {(e.passages || []).length > 0 && <p style={{ ...S.small, marginTop: 4, color: BLUE }}>{e.passages.map((x) => x.ref).join(" · ")}</p>}
                <CounselThread J={J} me={me} entryId={e.id} items={counsel.filter((c) => c.entry_id === e.id)} canWrite isOwner={false} onChanged={reload} />
              </div>
            );
          })}
          <button style={{ ...S.link, fontSize: 12.5, color: "#8A5A50", marginTop: 6 }} onClick={stop}>{fmt(J.stopWalking, { name: p.owner_name })}</button>
        </div>
      )}
    </div>
  );
}

export default function CareView({ T, J, user, loading, walking, overview, shared, counsel, notes, reload, onBack }) {
  const me = user ? user.id : null;
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const pastoral = walking.filter((p) => p.role === "pastor");
  const rows = pastoral.map((p) => careRow(me, p, overview.find((o) => o.id === p.id), shared, counsel, notes))
    .sort((a, b) => b.score - a.score || a.p.owner_name.localeCompare(b.p.owner_name));
  const counts = { word: rows.filter((r) => r.waiting > 0).length, quiet: rows.filter((r) => r.quiet).length, unread: rows.filter((r) => r.unread > 0).length };
  const shown = rows.filter((r) => (filter === "all" || (filter === "word" && r.waiting > 0) || (filter === "quiet" && r.quiet) || (filter === "unread" && r.unread > 0)) &&
    (!q.trim() || r.p.owner_name.toLowerCase().includes(q.trim().toLowerCase())));
  const chip = (key, label, n) => (
    <button key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}
      style={{ background: filter === key ? GOLD + "22" : "transparent", border: "1px solid " + (filter === key ? GOLD + "88" : "#2A3A5C"), borderRadius: 20, padding: "5px 12px", color: filter === key ? GOLD : "#8A9EC0", fontSize: 12.5, cursor: "pointer", fontFamily: "'Lora',serif" }}>
      {label}{n !== undefined ? " · " + n : ""}
    </button>
  );
  return (
    <div style={{ animation: "fadeUp 0.45s ease forwards" }} data-testid="care">
      <div style={S.card(GOLD)}>
        <div style={S.label}>{J.careTitle}</div>
        <p style={{ ...S.text, marginBottom: 10 }}>{J.careWhy}</p>
        <p style={{ ...S.verse, fontSize: 14 }}>"{J.careVerse}" <span style={{ fontStyle: "normal", fontSize: 12, color: BLUE }}>— {J.careVerseRef} · KJV</span></p>
      </div>
      {!user && <AuthBox J={J} title={J.signInPageTitle} text={J.signInPageText} />}
      {user && loading && <p style={S.small}>{J.loading}</p>}
      {user && !loading && pastoral.length === 0 && <div style={S.card()}><p style={S.text}>{J.careEmpty}</p></div>}
      {user && !loading && pastoral.length > 0 && (
        <div style={S.card()}>
          <div style={{ ...S.title, fontSize: 22 }} data-testid="carecount">{fmt(J.careCount, { n: pastoral.length })}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 12px" }}>
            {chip("all", J.careFilterAll)}
            {chip("word", J.careFilterWord, counts.word)}
            {chip("unread", J.careFilterUnread, counts.unread)}
            {chip("quiet", J.careFilterQuiet, counts.quiet)}
          </div>
          {pastoral.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={J.careSearch} aria-label={J.careSearch} style={{ ...S.input, fontSize: 14, padding: "9px 12px" }} />}
          {shown.length === 0 && <p style={{ ...S.small, padding: "10px 0" }}>{J.careNoMatch}</p>}
          {shown.map((r) => <Person key={r.p.id} T={T} J={J} me={me} r={r} shared={shared} counsel={counsel} notes={notes} reload={reload} />)}
        </div>
      )}
      <button onClick={onBack} style={{ ...S.quiet, width: "100%" }}>{J.back}</button>
    </div>
  );
}
