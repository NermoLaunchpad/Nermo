"use client";
import { useEffect, useMemo, useState } from "react";
import { charityPage, loadCharities, searchCharities, type Charity } from "@/lib/charity";

export function CharityPicker({ value, onChange }: { value: Charity | null; onChange: (c: Charity | null) => void }) {
  const [all, setAll] = useState<Charity[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(!value);

  useEffect(() => {
    loadCharities().then(setAll).catch((e) => setErr((e as Error).message));
  }, []);
  const results = useMemo(() => (all ? searchCharities(all, q) : []), [all, q]);

  if (value && !open)
    return (
      <div className="glass card row" style={{ alignItems: "center" }}>
        {value.logo ? <img src={value.logo} alt="" width={44} height={44} style={{ borderRadius: 12, objectFit: "contain", background: "#fff" }} onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : <span className="token-logo">♡</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{value.name}</div>
          <div className="tiny faint">{value.place} · <a href={charityPage(value.slug)} target="_blank" rel="noreferrer" style={{ color: "var(--green-deep)" }}>View on Donate.gg</a></div>
        </div>
        <button className="btn btn-sm" onClick={() => setOpen(true)}>Change</button>
      </div>
    );

  return (
    <div className="glass card">
      <input className="input" placeholder="Search 2,705 charities by name or cause" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search charities" autoFocus={!!value} />
      {err && <p className="err-text">{err}</p>}
      {!all && !err && <div className="skeleton" style={{ height: 120, marginTop: 10 }} />}
      <div style={{ maxHeight: 300, overflowY: "auto", marginTop: 10, display: "grid", gap: 6 }} role="listbox">
        {results.map((c) => (
          <button
            key={c.configId}
            role="option"
            aria-selected={value?.configId === c.configId}
            className="row"
            style={{ textAlign: "left", padding: 10, borderRadius: 12, border: "1px solid var(--line)", color: "var(--ink)", background: value?.configId === c.configId ? "var(--mint)" : "rgba(255,255,255,.03)", cursor: "pointer" }}
            onClick={() => { onChange(c); setOpen(false); }}
          >
            {c.logo ? <img src={c.logo} alt="" width={32} height={32} style={{ borderRadius: 8, objectFit: "contain", background: "#fff", flex: "none" }} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : <span style={{ width: 32 }} />}
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{c.name}</span>
              <span className="tiny faint" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 520 }}>{c.place}</span>
            </span>
          </button>
        ))}
        {all && results.length === 0 && <p className="small muted" style={{ margin: 8 }}>No charity matches that search.</p>}
      </div>
    </div>
  );
}
