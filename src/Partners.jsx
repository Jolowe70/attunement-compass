import { useState, useEffect } from "react";
import * as DB from "./supa.js";
import { S } from "./Journey.jsx";
import { fmt } from "./strings-journey.js";

const GOLD = "#C9A84C", BLUE = "#7B9EBE", GREEN = "#82C9A0", RED = "#E07B6A";
const PROVERBS_11_14 = "Proverbs 11:14";
const inviteLink = (code) => location.origin + "/?invite=" + code;

// A conversation of counsel under one entry: the owner and the partners it was shared with.
export function CounselThread({ J, me, entryId, items, canWrite, isOwner, onChanged }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setErr("");
    try { await DB.addCounsel(entryId, text.trim().slice(0, 1000)); setText(""); await onChanged(); }
    catch (x) { setErr(J.errorLoad); }
    setBusy(false);
  }
  async function del(id) { try { await DB.deleteCounsel(id); await onChanged(); } catch (x) { setErr(J.errorLoad); } }
  if (!items.length && !canWrite) return null;
  return (
    <div style={{ marginTop: 10, borderLeft: "2px solid " + BLUE + "55", paddingLeft: 12 }} data-testid="counsel">
      <div style={{ ...S.small, color: BLUE, marginBottom: 6 }}>{J.counselTitle}</div>
      {items.map((c) => (
        <div key={c.id} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#8A9EC0" }}>
            {c.author === me ? J.you : c.author_name || J.you} · {new Date(c.created_at).toLocaleDateString()}
            {(c.author === me || isOwner) && <button onClick={() => del(c.id)} style={{ ...S.link, fontSize: 11.5, color: "#8A5A50", marginLeft: 10 }}>{J.del}</button>}
          </div>
          <p style={{ ...S.text, fontSize: 14 }}>{c.body}</p>
        </div>
      ))}
      {canWrite && (
        <form onSubmit={send} data-form="counsel" style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={J.writeCounsel} style={{ ...S.input, marginBottom: 0, fontSize: 14, padding: "9px 12px" }} />
          <button type="submit" disabled={busy || !text.trim()} style={{ ...S.btn(BLUE), width: "auto", padding: "9px 14px", fontSize: 13 }}>{J.sendCounsel}</button>
        </form>
      )}
      {err && <p style={{ ...S.small, color: RED }}>{err}</p>}
    </div>
  );
}

// The person's own partners, and invitations they have sent.
export function PartnersCard({ J, owned, invites, defaultName, reload }) {
  const [role, setRole] = useState(null);
  const [name, setName] = useState(defaultName || "");
  useEffect(() => { if (defaultName && !name) setName(defaultName); }, [defaultName]);
  const [made, setMade] = useState(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function make() {
    if (!name.trim()) return;
    setBusy(true); setErr("");
    try { const code = await DB.createInvite(role, name.trim()); setMade(code); await reload(); }
    catch (x) { setErr(/max_partners/.test(x.message) ? J.maxPartners : /max_invites/.test(x.message) ? J.maxInvites : J.errorLoad); }
    setBusy(false);
  }
  async function copy(code) {
    try { await navigator.clipboard.writeText(inviteLink(code)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (x) { /* clipboard blocked */ }
  }
  function share(code) {
    const text = fmt(J.inviteMsg, { name: name || defaultName || "", link: inviteLink(code) });
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
  }
  async function remove(p) {
    if (!window.confirm(fmt(J.confirmRemove, { name: p.partner_name }))) return;
    try { await DB.endPartnership(p.id); await reload(); } catch (x) { setErr(J.errorLoad); }
  }
  async function cancel(code) { try { await DB.cancelInvite(code); if (made === code) setMade(null); await reload(); } catch (x) { setErr(J.errorLoad); } }

  const full = owned.length >= 3;
  return (
    <div style={S.card(BLUE)} data-testid="partners">
      <div style={S.label}>{J.partnersTitle}</div>
      <p style={{ ...S.text, fontSize: 14, marginBottom: 10 }}>{J.partnersWhy}</p>
      <p style={{ ...S.verse, fontSize: 14 }}>"{J.counselVerse}" <span style={{ fontStyle: "normal", fontSize: 12, color: BLUE }}>— {PROVERBS_11_14} · KJV</span></p>

      {owned.length === 0 && <p style={{ ...S.small, margin: "8px 0" }}>{J.noPartners}</p>}
      {owned.map((p) => (
        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid #1A2840" }}>
          <div><span style={{ color: "#F0E6CC" }}>{p.partner_name}</span> <span style={{ fontSize: 12, color: BLUE }}>· {J.roleNames[p.role]}</span></div>
          <button style={{ ...S.link, fontSize: 12.5, color: "#8A5A50" }} onClick={() => remove(p)}>{J.remove}</button>
        </div>
      ))}

      {invites.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...S.small, marginBottom: 4 }}>{J.openInvites}</div>
          {invites.map((i) => (
            <div key={i.code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "#8A9EC0" }}>{J.roleNames[i.role]} · {new Date(i.expires_at).toLocaleDateString()}</span>
              <span style={{ display: "flex", gap: 12 }}>
                <button style={{ ...S.link, fontSize: 12.5 }} onClick={() => copy(i.code)}>{copied ? J.copied : J.copy}</button>
                <button style={{ ...S.link, fontSize: 12.5, color: "#8A5A50" }} onClick={() => cancel(i.code)}>{J.cancel}</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {made && (
        <div style={{ marginTop: 12, padding: "12px 14px", border: "1px solid " + GREEN + "55", borderRadius: 10, background: GREEN + "0A" }} data-testid="invitelink">
          <p style={{ ...S.text, fontSize: 13.5, color: GREEN, marginBottom: 8 }}>{J.inviteReady}</p>
          <div style={{ fontFamily: "monospace", fontSize: 12.5, color: "#B8C9E0", wordBreak: "break-all", marginBottom: 10 }}>{inviteLink(made)}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => copy(made)} style={{ ...S.btn(GOLD), width: "auto", flex: "1 1 120px", fontSize: 13 }}>{copied ? J.copied : J.copy}</button>
            <button onClick={() => share(made)} style={{ ...S.btn(GREEN), width: "auto", flex: "1 1 120px", fontSize: 13 }}>{navigator.share ? J.shareLink : J.shareWhatsApp}</button>
          </div>
        </div>
      )}

      {!full && !role && (
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={() => { setRole("partner"); setMade(null); }} style={{ ...S.btn(BLUE), width: "auto", flex: "1 1 140px", fontSize: 13.5 }}>{J.invitePartner}</button>
          <button onClick={() => { setRole("pastor"); setMade(null); }} style={{ ...S.btn(GOLD), width: "auto", flex: "1 1 140px", fontSize: 13.5 }}>{J.invitePastor}</button>
        </div>
      )}
      {!full && role && !made && (
        <div style={{ marginTop: 14 }}>
          <input style={S.input} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={J.yourNameForInvite} aria-label={J.yourNameForInvite} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setRole(null)} style={S.quiet}>{J.cancel}</button>
            <button disabled={busy || !name.trim()} onClick={make} style={{ ...S.btn(role === "pastor" ? GOLD : BLUE, true), flex: 1, width: "auto" }}>{J.makeLink}</button>
          </div>
        </div>
      )}
      {made && <button onClick={() => { setMade(null); setRole(null); }} style={{ ...S.link, marginTop: 10, fontSize: 12.5 }}>{J.done}</button>}
      {full && <p style={{ ...S.small, marginTop: 10 }}>{J.maxPartners}</p>}
      {err && <p style={{ ...S.small, color: RED, marginTop: 8 }}>{err}</p>}
    </div>
  );
}

// Opening an invitation link.
export function InviteAccept({ J, code, user, defaultName, onDone }) {
  const [info, setInfo] = useState(undefined);
  const [name, setName] = useState(defaultName || "");
  useEffect(() => { if (defaultName && !name) setName(defaultName); }, [defaultName]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [okMsg, setOkMsg] = useState(false);
  useEffect(() => { DB.inviteInfo(code).then(setInfo).catch(() => setInfo(null)); }, [code, user && user.id]);
  async function accept() {
    setBusy(true); setMsg("");
    try { const owner = await DB.acceptInvite(code, name.trim()); setOkMsg(true); setMsg(fmt(J.accepted, { name: owner })); setTimeout(() => onDone(true), 1200); }
    catch (x) { setMsg(/self/.test(x.message) ? J.inviteSelf : /max_partners|invalid/.test(x.message) ? J.inviteInvalid : J.errorLoad); }
    setBusy(false);
  }
  if (info === undefined) return null;
  const bad = !info || info.status === "used" || info.status === "expired";
  return (
    <div style={S.card(GOLD)} data-testid="invite">
      <div style={S.label}>{J.inviteTitle}</div>
      {bad && <p style={S.text}>{J.inviteInvalid}</p>}
      {!bad && info.status === "self" && <p style={S.text}>{J.inviteSelf}</p>}
      {!bad && info.status === "ok" && (
        <>
          <p style={{ ...S.text, marginBottom: 12 }}>{fmt(J.inviteText, { name: info.owner_name, role: J.roleLower[info.role] })}</p>
          {!user && <p style={{ ...S.small, color: GOLD }}>{J.inviteSignIn}</p>}
          {user && (
            <>
              <input style={S.input} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={J.yourNameForPartner} aria-label={J.yourNameForPartner} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => onDone(false)} style={S.quiet}>{J.decline}</button>
                <button disabled={busy || !name.trim()} onClick={accept} style={{ ...S.btn(GOLD, true), flex: 1, width: "auto" }}>{J.accept}</button>
              </div>
            </>
          )}
        </>
      )}
      {(bad || (info && info.status === "self")) && <button onClick={() => onDone(false)} style={{ ...S.quiet, marginTop: 10 }}>{J.back}</button>}
      {msg && <p style={{ ...S.text, color: okMsg ? GREEN : RED, marginTop: 10 }}>{msg}</p>}
    </div>
  );
}

// People who invited me: their shared entries and our counsel.
export function WalkingWith({ T, J, me, walking, shared, counsel, reload }) {
  async function stop(p) {
    if (!window.confirm(fmt(J.confirmStop, { name: p.owner_name }))) return;
    try { await DB.endPartnership(p.id); await reload(); } catch (x) { /* shown on next load */ }
  }
  if (!walking.length) return null;
  return (
    <div style={S.card(GREEN)} data-testid="walking">
      <div style={S.label}>{J.walkingTitle}</div>
      <p style={{ ...S.small, marginBottom: 12 }}>{J.walkingWhy}</p>
      {walking.map((p) => {
        const theirs = shared.filter((e) => e.user_id === p.owner);
        return (
          <div key={p.id} style={{ borderTop: "1px solid #1A2840", padding: "12px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ color: "#F0E6CC", fontFamily: "'Cormorant Garamond',serif", fontSize: 18 }}>{p.owner_name}</span>
              <span style={{ fontSize: 12, color: GREEN }}>{fmt(J.walkingWithRole, { name: p.owner_name, role: J.roleLower[p.role] })}</span>
            </div>
            {theirs.length === 0 && <p style={S.small}>{J.nothingShared}</p>}
            {theirs.slice(0, 10).map((e) => {
              const src = e.my_source || e.source;
              return (
                <div key={e.id} style={{ margin: "10px 0 14px" }} data-testid="sharedentry">
                  <div style={{ fontSize: 12, color: "#5A7090", marginBottom: 4 }}>{e.local_date}{src ? " · " + T.sources[src] : ""}</div>
                  <p style={{ ...S.text, fontSize: 14 }}>{e.signal}</p>
                  {e.step && <p style={{ ...S.small, marginTop: 4 }}>{J.step}: {e.step} · {J.statusLabels[e.step_status]}</p>}
                  {(e.passages || []).length > 0 && <p style={{ ...S.small, marginTop: 4, color: BLUE }}>{e.passages.map((x) => x.ref).join(" · ")}</p>}
                  <CounselThread J={J} me={me} entryId={e.id} items={counsel.filter((c) => c.entry_id === e.id)} canWrite isOwner={false} onChanged={reload} />
                </div>
              );
            })}
            <button style={{ ...S.link, fontSize: 12.5, color: "#8A5A50" }} onClick={() => stop(p)}>{fmt(J.stopWalking, { name: p.owner_name })}</button>
          </div>
        );
      })}
    </div>
  );
}
