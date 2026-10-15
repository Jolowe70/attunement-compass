import { useState, useEffect, useRef } from "react";
import * as Bible from "./bible.js";

// One passage: the exact KJV words from /kjv, why it speaks to this signal, and the whole chapter on request.
export default function PassageCard({ p, T }) {
  const [chapter, setChapter] = useState(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    // Open the chapter at the passage itself, not at verse 1.
    const box = boxRef.current;
    if (!open || !box) return;
    const first = box.querySelector("[data-hl]");
    if (first) box.scrollTop = Math.max(0, first.offsetTop - 12);
  }, [open, chapter]);
  async function toggle() {
    if (open) { setOpen(false); return; }
    if (!chapter) {
      try {
        const c = await Bible.passage({ ...p.ref, v1: 0, v2: 0 }, 200);
        if (c.ok) setChapter(c);
      } catch (e) { return; }
    }
    setOpen(true);
  }
  const verseStyle = { margin: "0 0 6px", fontSize: 15.5, color: "#B8C9E0", lineHeight: 1.82, fontStyle: "italic" };
  const num = (n) => <sup style={{ color: "#7B9EBE", fontStyle: "normal", fontSize: 10.5, marginRight: 4 }}>{n}</sup>;
  return (
    <div style={{ border: "1px solid #7B9EBE33", borderRadius: 14, padding: "20px 22px", background: "#7B9EBE07", marginBottom: 12 }}>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: "#7B9EBE", marginBottom: 8 }}>{p.label} <span style={{ fontSize: 12, color: "#4A6080" }}>· KJV</span></div>
      {!open && p.verses.map(([n, text]) => <p key={n} style={verseStyle}>{num(n)}{text}</p>)}
      {open && chapter && (
        <div ref={boxRef} style={{ position: "relative", maxHeight: 420, overflowY: "auto", paddingRight: 6, margin: "4px 0 6px" }}>
          {chapter.verses.map(([n, text]) => {
            const hl = n >= p.ref.v1 && n <= p.ref.v2;
            return <p key={n} data-hl={hl ? "1" : undefined} style={{ ...verseStyle, fontStyle: "normal", fontSize: 15, color: hl ? "#F0E6CC" : "#8A9EC0", background: hl ? "#C9A84C14" : "transparent", borderLeft: hl ? "2px solid #C9A84C" : "2px solid transparent", padding: "2px 8px", margin: 0 }}>{num(n)}{text}</p>;
          })}
        </div>
      )}
      {p.why && <p style={{ margin: "6px 0 10px", fontSize: 13.5, color: "#8A9EC0", lineHeight: 1.65, borderTop: "1px solid #1E2D4A", paddingTop: 10 }}>{p.why}</p>}
      {p.ref.v1 > 0 && (
        <button onClick={toggle} style={{ background: "transparent", border: "none", padding: 0, color: "#C9A84C", fontSize: 13, fontFamily: "'Lora',serif", textDecoration: "underline", cursor: "pointer" }}>
          {open ? T.hideChapter : T.readChapter}
        </button>
      )}
    </div>
  );
}


// Look up Selah's references in the bundled KJV; anything that is not a real passage is dropped.
export async function lookupPassages(list, max = 8) {
  const found = await Promise.all((list || []).map(async (x) => {
    try {
      const p = await Bible.passage(x.ref, max);
      return p.ok ? { ...p, why: x.why } : null;
    } catch (e) { return null; }
  }));
  return found.filter(Boolean);
}
