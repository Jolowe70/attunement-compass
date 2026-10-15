import { useState, useEffect } from "react";
import * as DB from "./supa.js";
import { journeyState, weekEntries, pendingStep, patterns, DOMAIN_KEYS, localDate } from "./journey.js";
import PassageCard, { lookupPassages } from "./PassageCard.jsx";
import { fmt } from "./strings-journey.js";
import { PartnersCard, InviteAccept, WalkingWith, CounselThread, EmailNotices } from "./Partners.jsx";

// Exact King James words used on these screens.
export const ROMANS_8_1 = { ref: "Romans 8:1", text: "There is therefore now no condemnation to them which are in Christ Jesus, who walk not after the flesh, but after the Spirit." };
export const JOHN_10_27 = { ref: "John 10:27", text: "My sheep hear my voice, and I know them, and they follow me." };

const GOLD = "#C9A84C", BLUE = "#7B9EBE", GREEN = "#82C9A0", RED = "#E07B6A";
const SOURCE_COLOR = { truth: GREEN, error: RED, unclear: GOLD };
export const S = {
  card: (c = "#2A3A5C") => ({ border: "1px solid " + c + "55", borderRadius: 14, padding: "20px 22px", background: c + "0A", marginBottom: 16 }),
  label: { fontSize: 10.5, letterSpacing: "0.2em", color: "#5A7090", textTransform: "uppercase", marginBottom: 10, fontFamily: "'Cormorant Garamond',serif" },
  title: { fontFamily: "'Cormorant Garamond',serif", fontWeight: 400, fontSize: 26, margin: "0 0 8px", color: "#F0E6CC" },
  text: { margin: 0, fontSize: 14.5, color: "#B8C9E0", lineHeight: 1.7 },
  small: { margin: 0, fontSize: 12.5, color: "#5A7090", lineHeight: 1.6 },
  input: { width: "100%", background: "#0D1829", border: "1px solid #1E2D4A", borderRadius: 8, padding: "12px 14px", color: "#D4E0F0", fontSize: 15, fontFamily: "'Lora',serif", marginBottom: 10 },
  btn: (c = GOLD, solid = false) => ({ width: "100%", background: solid ? c + "22" : c + "11", border: "1px solid " + c + "66", borderRadius: 10, padding: "13px 18px", color: c, fontSize: 15, fontFamily: "'Cormorant Garamond',serif", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }),
  quiet: { background: "transparent", border: "1px solid #1E2D4A", borderRadius: 10, padding: "11px 16px", color: "#5A7090", fontSize: 14, fontFamily: "'Cormorant Garamond',serif", cursor: "pointer" },
  link: { background: "transparent", border: "none", padding: 0, color: GOLD, fontSize: 13.5, fontFamily: "'Lora',serif", textDecoration: "underline", cursor: "pointer" },
  verse: { margin: "0 0 6px", fontSize: 15.5, color: "#B8C9E0", lineHeight: 1.8, fontStyle: "italic" },
};

export function Verse({ v }) {
  return (
    <div style={S.card(BLUE)}>
      <p style={S.verse}>"{v.text}"</p>
      <div style={{ fontSize: 13, color: BLUE }}>{v.ref} · KJV</div>
    </div>
  );
}

// "Did you take your one step?" Grace either way (ebook, afterword).
export function StepCheck({ entry, J, onSet }) {
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  async function choose(status) {
    setBusy(true);
    try { await onSet(entry, status); setAnswer(status); } catch (e) { /* leave it for next time */ }
    setBusy(false);
  }
  if (answer === "released") return null;
  return (
    <div style={S.card(GREEN)} data-testid="stepcheck">
      <div style={{ ...S.label, color: "#4A7A60" }}>{J.stepTitle}</div>
      <p style={{ ...S.text, color: GREEN, fontFamily: "'Cormorant Garamond',serif", fontSize: 17, marginBottom: 12 }}>{entry.step}</p>
      {!answer && (
        <>
          <p style={{ ...S.text, marginBottom: 12 }}>{J.stepAsk}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button disabled={busy} onClick={() => choose("done")} style={{ ...S.btn(GREEN, true), flex: "1 1 120px", width: "auto", fontSize: 13.5 }}>{J.stepDone}</button>
            <button disabled={busy} onClick={() => choose("not_yet")} style={{ ...S.btn(GOLD), flex: "1 1 100px", width: "auto", fontSize: 13.5 }}>{J.stepNotYet}</button>
            <button disabled={busy} onClick={() => choose("released")} style={{ ...S.quiet, flex: "1 1 100px" }}>{J.stepRelease}</button>
          </div>
        </>
      )}
      {answer === "done" && <p style={S.text}>{J.stepDoneMsg}</p>}
      {answer === "not_yet" && (
        <div>
          <p style={{ ...S.verse, marginTop: 4 }}>"{ROMANS_8_1.text}" <span style={{ fontStyle: "normal", fontSize: 12.5, color: BLUE }}>— {ROMANS_8_1.ref}</span></p>
          <p style={S.text}>{J.stepGrace}</p>
        </div>
      )}
    </div>
  );
}

export function DayDots({ count }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 6, margin: "12px 0 8px" }} aria-hidden="true">
      {Array.from({ length: 30 }).map((_, i) => {
        const stage = i < 10 ? GOLD : i < 20 ? BLUE : GREEN;
        const done = i < count;
        return <div key={i} style={{ aspectRatio: "1", borderRadius: "50%", background: done ? stage : "transparent", border: "1px solid " + (done ? stage : "#2A3A5C"), opacity: done ? 0.9 : 1 }} />;
      })}
    </div>
  );
}

function AuthBox({ J, onError }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (mode !== "forgot" && pw.length < 8) { setMsg(J.pwShort); return; }
    setBusy(true); setMsg("");
    try {
      if (mode === "forgot") {
        await DB.resetPassword(email.trim());
        setMsg(J.resetSent);
      } else if (mode === "signup") {
        const d = await DB.signUp(email.trim(), pw);
        if (!d.session) setMsg(J.checkEmail);
      } else {
        await DB.signIn(email.trim(), pw);
      }
    } catch (err) {
      setMsg(mode === "forgot" ? J.resetSent : J.authError); // never reveal whether an email has an account
      if (onError) onError(err);
    }
    setBusy(false);
  }
  return (
    <div style={S.card(GOLD)}>
      <div style={S.label}>{J.signInTitle}</div>
      <p style={{ ...S.small, marginBottom: 14 }}>{J.signInText}</p>
      {DB.googleOn && (
        <button onClick={() => DB.signInGoogle()} style={{ ...S.btn(BLUE), marginBottom: 14, textTransform: "none", letterSpacing: "0.04em" }}>{J.google}</button>
      )}
      <form onSubmit={submit} data-form="auth">
        <input style={S.input} type="email" name="email" autoComplete="email" required placeholder={J.email} value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode !== "forgot" && <input style={S.input} type="password" name="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required placeholder={J.password} value={pw} onChange={(e) => setPw(e.target.value)} />}
        {msg && <p style={{ ...S.text, color: msg === J.checkEmail || msg === J.resetSent ? GREEN : RED, fontSize: 13.5, marginBottom: 10 }}>{msg}</p>}
        <button type="submit" disabled={busy} style={S.btn(GOLD, true)}>{mode === "signup" ? J.createAccount : mode === "forgot" ? J.sendReset : J.signIn}</button>
      </form>
      <div style={{ textAlign: "center", marginTop: 12, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <button style={S.link} onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMsg(""); }}>{mode === "signup" ? J.toSignIn : J.toCreate}</button>
        {mode === "signin" && <button style={{ ...S.link, color: "#8A9EC0" }} onClick={() => { setMode("forgot"); setMsg(""); }}>{J.forgot}</button>}
        {mode === "forgot" && <button style={{ ...S.link, color: "#8A9EC0" }} onClick={() => { setMode("signin"); setMsg(""); }}>{J.signIn}</button>}
      </div>
    </div>
  );
}

// Shown after someone opens the reset link from their email.
function NewPassword({ J, onDone }) {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (pw.length < 8) { setMsg(J.pwShort); return; }
    setBusy(true); setMsg("");
    try { await DB.updatePassword(pw); setMsg(J.pwSaved); setTimeout(onDone, 1500); }
    catch (err) { setMsg(J.errorLoad); }
    setBusy(false);
  }
  return (
    <div style={S.card(GOLD)} data-testid="newpw">
      <div style={S.title}>{J.newPwTitle}</div>
      <form onSubmit={save} data-form="newpw">
        <input style={S.input} type="password" name="newpassword" autoComplete="new-password" required placeholder={J.newPw} value={pw} onChange={(e) => setPw(e.target.value)} />
        {msg && <p style={{ ...S.text, color: msg === J.pwSaved ? GREEN : RED, fontSize: 13.5, marginBottom: 10 }}>{msg}</p>}
        <button type="submit" disabled={busy} style={S.btn(GOLD, true)}>{J.savePw}</button>
      </form>
    </div>
  );
}

function Bars({ title, rows }) {
  const total = rows.reduce((a, r) => a + r.n, 0);
  if (!total) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...S.small, marginBottom: 6 }}>{title}</div>
      {rows.filter((r) => r.n > 0).map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ flex: "0 0 38%", fontSize: 13, color: "#B8C9E0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
          <div style={{ flex: 1, height: 8, background: "#1A2840", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: Math.round((r.n / total) * 100) + "%", height: "100%", background: r.color || GOLD, borderRadius: 4 }} />
          </div>
          <div style={{ flex: "0 0 28px", textAlign: "right", fontSize: 12.5, color: "#8A9EC0" }}>{r.n}</div>
        </div>
      ))}
    </div>
  );
}

function EntryRow({ e, T, J, me, onDelete, canShare, counsel, reload }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function toggleShare() {
    setBusy(true);
    try {
      const nowShared = !e.shared;
      await DB.setShared(e.id, nowShared);
      if (nowShared) DB.notify("share", { entry_id: e.id });
      await reload();
    } catch (x) { /* shown on next load */ }
    setBusy(false);
  }
  const src = e.my_source || e.source;
  const domain = T.domains[DOMAIN_KEYS.indexOf(e.domain)] || "";
  return (
    <div style={{ borderTop: "1px solid #1A2840", padding: "14px 0" }} data-testid="entry">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#5A7090" }}>{e.local_date}{e.day_no ? " · " + fmt(J.dayOf, { n: e.day_no }) : ""}{domain ? " · " + domain : ""}</span>
        {src && <span style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: "0.06em", color: SOURCE_COLOR[src] }}>{T.sources[src]}</span>}
      </div>
      <p style={{ ...S.text, fontSize: 14, display: open ? "block" : "-webkit-box", WebkitLineClamp: open ? "unset" : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.signal}</p>
      {e.step && <p style={{ ...S.small, marginTop: 6 }}>{J.step}: {e.step} · <span style={{ color: e.step_status === "done" ? GREEN : "#8A9EC0" }}>{J.statusLabels[e.step_status]}</span></p>}
      {open && (
        <div style={{ marginTop: 10 }}>
          {e.prayer && <p style={{ ...S.verse, fontSize: 14.5, color: "#D4C890" }}>"{e.prayer}"</p>}
          {(e.passages || []).map((p) => <p key={p.ref} style={{ ...S.small, marginBottom: 4 }}><span style={{ color: BLUE }}>{p.ref}</span> — {p.why}</p>)}
          {e.community && <p style={{ ...S.small, marginTop: 6 }}>{e.community}</p>}
        </div>
      )}
      {(e.shared || counsel.length > 0) && <CounselThread J={J} me={me} entryId={e.id} items={counsel} canWrite={e.shared} isOwner onChanged={reload} />}
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        {(canShare || e.shared) && (
          <span style={{ fontSize: 11.5, color: e.shared ? GREEN : "#5A7090" }} data-testid="sharestate">{e.shared ? "● " + J.sharedLabel : "○ " + J.privateLabel}</span>
        )}
        {(canShare || e.shared) && <button disabled={busy} style={{ ...S.link, fontSize: 12.5, color: BLUE }} onClick={toggleShare} data-testid="sharetoggle">{e.shared ? J.shareOff : J.shareOn}</button>}
        <button style={{ ...S.link, fontSize: 12.5 }} onClick={() => setOpen(!open)}>{open ? J.showLess : J.showMore}</button>
        <button style={{ ...S.link, fontSize: 12.5, color: "#8A5A50" }} onClick={() => { if (window.confirm(J.confirmDel)) onDelete(e); }}>{J.del}</button>
      </div>
    </div>
  );
}

function Reflection({ T, J, lang, journey, state, entries, askCompass }) {
  const [saved, setSaved] = useState(undefined);
  const [found, setFound] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [crisis, setCrisis] = useState(false);
  const list = weekEntries(entries, journey.round, state.week);

  useEffect(() => {
    let live = true;
    setSaved(undefined); setFound([]);
    DB.getReflection(journey.round, state.week).then((r) => { if (live) setSaved(r); }).catch(() => { if (live) setSaved(null); });
    return () => { live = false; };
  }, [journey.round, state.week]);
  useEffect(() => {
    if (saved && saved.body) lookupPassages(saved.body.passages).then(setFound);
  }, [saved]);

  async function reflect() {
    setBusy(true); setErr("");
    try {
      const r = await askCompass({
        action: "reflect", lang, week: state.week,
        entries: list.slice(0, 14).map((e) => ({ domain: e.domain, pressure: e.pressure, source: e.my_source || e.source, step: e.step_status, signal: e.signal })),
      });
      if (r.crisis) { setCrisis(true); setBusy(false); return; }
      const body = { themes: r.themes, reflection: r.reflection, passages: r.passages, focus: r.focus };
      try { setSaved(await DB.saveReflection(journey.round, state.week, body)); }
      catch (e) { setSaved({ body }); }
    } catch (e) {
      setErr(e.message === "busy" ? T.errorBusy : e.message === "timeout" ? T.errorTimeout : T.errorGeneral);
    }
    setBusy(false);
  }

  if (crisis) return (<div style={S.card(GOLD)} role="alert"><div style={S.title}>{T.crisisTitle}</div><p style={S.text}>{T.crisisText}</p></div>);
  return (
    <div style={S.card(BLUE)} data-testid="reflection">
      <div style={S.label}>{J.reflectTitle}</div>
      {saved === undefined && <p style={S.small}>{J.loading}</p>}
      {saved && saved.body && (
        <div>
          {saved.body.themes && saved.body.themes.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...S.small, marginBottom: 6 }}>{J.themes}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {saved.body.themes.map((t) => <span key={t} style={{ fontSize: 12.5, color: GOLD, border: "1px solid " + GOLD + "55", borderRadius: 999, padding: "3px 10px" }}>{t}</span>)}
              </div>
            </div>
          )}
          <p style={{ ...S.text, marginBottom: 14 }}>{saved.body.reflection}</p>
          {found.map((p) => <PassageCard key={p.label} p={p} T={T} />)}
          {saved.body.focus && (<><div style={{ ...S.small, marginBottom: 4 }}>{J.focus}</div><p style={{ ...S.text, color: GREEN }}>{saved.body.focus}</p></>)}
        </div>
      )}
      {saved === null && (list.length >= 3
        ? <button disabled={busy} onClick={reflect} style={S.btn(BLUE)}>{busy ? J.reflecting : J.reflectBtn}</button>
        : <p style={S.small}>{J.reflectNeed}</p>)}
      {err && <p style={{ ...S.text, color: RED, fontSize: 13.5, marginTop: 10 }}>{err}</p>}
    </div>
  );
}

export default function JourneyView({ T, J, lang, user, journey, entries, loading, error, recovery, onRecovered, reload, onBack, onTest, onStepSet, askCompass,
  partners = [], invites = [], shared = [], counsel = [], inviteCode, onInviteDone }) {
  const me = user ? user.id : null;
  const owned = partners.filter((p) => p.owner === me);
  const walking = partners.filter((p) => p.partner === me);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [allEntries, setAllEntries] = useState(false);
  const [name, setName] = useState("");
  const state = journeyState(journey, entries);
  const step = pendingStep(entries);
  const pat = patterns(state ? entries.filter((e) => e.round === journey.round) : entries);

  async function begin() {
    setBusy(true);
    setActionError("");
    try { await DB.startJourney(lang, name.trim()); await reload(); } catch (e) { setActionError(J.errorLoad); }
    setBusy(false);
  }
  async function another() {
    setBusy(true);
    setActionError("");
    try { await DB.newRound(journey); await reload(); } catch (e) { setActionError(J.errorLoad); }
    setBusy(false);
  }
  async function del(e) {
    setActionError("");
    try { await DB.deleteEntry(e.id); await reload(); } catch (err) { setActionError(J.errorLoad); }
  }
  async function delAll() {
    if (!window.confirm(J.confirmDelAll)) return;
    setActionError("");
    try { await DB.deleteEverything(user.id); await reload(); } catch (err) { setActionError(J.errorLoad); }
  }

  const pitch = (
    <div style={S.card(GOLD)}>
      <div style={S.title}>{J.pitchTitle}</div>
      <p style={{ ...S.text, marginBottom: 12 }}>{J.pitch}</p>
      {J.plan.map((p, i) => <p key={i} style={{ ...S.text, fontSize: 14, color: [GOLD, BLUE, GREEN][i], marginBottom: 4 }}>{p}</p>)}
      <p style={{ ...S.small, fontStyle: "italic", marginTop: 10 }}>"{J.goal}"</p>
    </div>
  );

  return (
    <div style={{ animation: "fadeUp 0.45s ease forwards" }} data-testid="journey">
      {user && recovery && <NewPassword J={J} onDone={onRecovered} />}
      {inviteCode && <InviteAccept J={J} code={inviteCode} user={user} defaultName={journey && journey.display_name} onDone={onInviteDone} />}
      {/* Those someone has asked to walk with come first: it is usually why they opened this page. */}
      {user && !loading && <WalkingWith T={T} J={J} me={me} walking={walking} shared={shared} counsel={counsel} reload={reload} />}
      {(error || actionError) && <p role="alert" style={{ ...S.text, color: RED, fontSize: 13.5, marginBottom: 14 }}>{actionError || error}</p>}

      {!user && (<>{pitch}<AuthBox J={J} /><p style={S.small}>{J.privacy}</p></>)}

      {user && loading && <p style={S.small}>{J.loading}</p>}

      {user && !loading && !journey && (
        <>
          {pitch}
          <input style={S.input} placeholder={J.name} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <button disabled={busy} onClick={begin} style={{ ...S.btn(GOLD, true), marginBottom: 16 }}>{J.begin}</button>
        </>
      )}

      {user && !loading && journey && state && (
        <>
          {state.complete ? (
            <div style={S.card(GREEN)}>
              <div style={S.title}>{J.completeTitle}</div>
              <DayDots count={30} />
              <p style={{ ...S.verse, marginTop: 8 }}>"{JOHN_10_27.text}" <span style={{ fontStyle: "normal", fontSize: 12.5, color: BLUE }}>— {JOHN_10_27.ref}</span></p>
              <p style={{ ...S.text, marginBottom: 14 }}>{J.completeText}</p>
              <button disabled={busy} onClick={another} style={S.btn(GREEN, true)}>{J.anotherRound}</button>
            </div>
          ) : (
            <div style={S.card(GOLD)}>
              <div style={S.label}>{J.pitchTitle}{journey.display_name ? " · " + journey.display_name : ""}</div>
              <div style={{ ...S.title, fontSize: 32 }} data-testid="dayof">{fmt(J.dayOf, { n: state.day })}</div>
              <div style={{ fontSize: 15, color: { guided: GOLD, compare: BLUE, self: GREEN }[state.mode], marginBottom: 4 }}>{J.modes[state.mode]}</div>
              <p style={S.small}>{J.modeHelp[state.mode]}</p>
              <DayDots count={state.practised} />
              <p style={{ ...S.small, marginBottom: 14 }}>{fmt(J.practiced, { n: state.practised })}</p>
              <button onClick={onTest} style={S.btn(GOLD, true)}>{J.testToday}</button>
            </div>
          )}

          {step && <StepCheck key={step.id} entry={step} J={J} onSet={onStepSet} />}

          <Reflection T={T} J={J} lang={lang} journey={journey} state={state} entries={entries} askCompass={askCompass} />

          {pat.total > 0 && (
            <div style={S.card()}>
              <div style={S.label}>{J.patternsTitle}</div>
              <Bars title={J.domainsTop} rows={Object.entries(pat.domains).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => ({ label: T.domains[DOMAIN_KEYS.indexOf(k)] || k, n }))} />
              <Bars title={J.pressureMix} rows={["urgent", "gentle", "unclear"].map((k) => ({ label: J.pressures[k], n: pat.pressures[k] || 0, color: { urgent: RED, gentle: GREEN, unclear: GOLD }[k] }))} />
              <Bars title={J.sourceMix} rows={["truth", "error", "unclear"].map((k) => ({ label: T.sources[k], n: pat.sources[k] || 0, color: SOURCE_COLOR[k] }))} />
              <Bars title={J.stepsTaken} rows={["done", "not_yet", "released", "pending"].map((k) => ({ label: J.statusLabels[k], n: pat.steps[k] || 0, color: k === "done" ? GREEN : "#5A7090" }))} />
              {pat.compared > 0 && <p style={S.small}>{fmt(J.agreement, { a: pat.agree, b: pat.compared })}</p>}
            </div>
          )}
        </>
      )}

      {user && !loading && <PartnersCard J={J} owned={owned} invites={invites} defaultName={journey && journey.display_name} reload={reload} />}
      {user && !loading && (owned.length > 0 || walking.length > 0) && <EmailNotices J={J} />}

      {user && !loading && (
        <div style={S.card()}>
          <div style={S.label}>{J.journalTitle}</div>
          {entries.length === 0 && <p style={S.small}>{J.empty}</p>}
          {(allEntries ? entries : entries.slice(0, 10)).map((e) => <EntryRow key={e.id} e={e} T={T} J={J} me={me} onDelete={del} canShare={owned.length > 0} counsel={counsel.filter((c) => c.entry_id === e.id)} reload={reload} />)}
          {entries.length > 10 && (
            <div style={{ borderTop: "1px solid #1A2840", paddingTop: 12, textAlign: "center" }}>
              <button style={S.link} onClick={() => setAllEntries(!allEntries)}>{allEntries ? J.showLess : J.showMore + " (" + (entries.length - 10) + ")"}</button>
            </div>
          )}
        </div>
      )}

      {user && !loading && (
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <p style={{ ...S.small, marginBottom: 14 }}>{J.privacy}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button style={S.quiet} onClick={() => DB.signOut()}>{J.signOut}</button>
            {(entries.length > 0 || journey) && <button style={{ ...S.quiet, color: "#8A5A50", borderColor: "#3A2A2A" }} onClick={delAll}>{J.delAll}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export { localDate };
