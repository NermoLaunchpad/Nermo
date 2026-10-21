"use client";
import { useMemo, useState } from "react";
import { METHODS, type MethodId } from "@/lib/methods";
import { MethodIcon } from "@/components/MethodIcon";
import { PlatformCard, TokenCard, TokenCardSkeleton, marketCap, progressOf } from "@/components/TokenCard";
import { usePlatform } from "@/components/usePlatform";
import { isPlatformToken } from "@/lib/site";
import { useLaunches } from "@/components/useLaunches";

type Sort = "new" | "progress" | "mcap";

export default function Explore() {
  const [limit, setLimit] = useState(60);
  const { data, isLoading, error, isFetching } = useLaunches(limit);
  const [tab, setTab] = useState<MethodId | "all">("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [onlySite, setOnlySite] = useState(false);
  const platform = usePlatform();

  const rows = useMemo(() => {
    let r = (data ?? []).filter((t) => !isPlatformToken(t.token));
    if (tab !== "all") r = r.filter((t) => t.method === tab);
    if (onlySite) r = r.filter((t) => t.viaSite);
    const s = q.trim().toLowerCase();
    if (s) r = r.filter((t) => t.name.toLowerCase().includes(s) || t.symbol.toLowerCase().includes(s) || t.token.toLowerCase() === s);
    const out = [...r];
    if (sort === "progress") out.sort((a, b) => progressOf(b) - progressOf(a));
    if (sort === "mcap") out.sort((a, b) => (marketCap(b) > marketCap(a) ? 1 : -1));
    return out;
  }, [data, tab, q, sort, onlySite]);

  const count = (id: MethodId) => (data ?? []).filter((t) => t.method === id).length;

  return (
    <section className="wrap section">
      <div className="eyebrow">Methods explorer</div>
      <h1 className="h2" style={{ marginTop: 10 }}>Browse by launch mechanics</h1>
      <p className="muted" style={{ maxWidth: 640 }}>Every Pons V2 launch on Robinhood Chain, grouped by Method. Each token&apos;s Method is read from its on-chain launch terms.</p>

      <div className="glass tabs" style={{ marginTop: 22 }} role="tablist">
        <button className={tab === "all" ? "on" : ""} onClick={() => setTab("all")} role="tab" aria-selected={tab === "all"}>All <span className="faint mono">{data?.length ?? ""}</span></button>
        {METHODS.map((m) => (
          <button key={m.id} className={tab === m.id ? "on" : ""} onClick={() => setTab(m.id)} role="tab" aria-selected={tab === m.id}>
            <MethodIcon id={m.id} size={15} /> {m.short} <span className="faint mono">{data ? count(m.id) : ""}</span>
          </button>
        ))}
      </div>

      <div className="row" style={{ marginTop: 16, flexWrap: "wrap" }}>
        <input className="input" style={{ maxWidth: 340 }} placeholder="Search name, ticker or address" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tokens" />
        <select className="select" style={{ width: 200 }} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="new">Newest</option>
          <option value="progress">Closest to graduation</option>
          <option value="mcap">Market cap</option>
        </select>
        <label className="row small muted" style={{ gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={onlySite} onChange={(e) => setOnlySite(e.target.checked)} /> Launched on Nermo only
        </label>
      </div>

      {error && <div className="notice bad" style={{ marginTop: 16 }}>Launches could not be loaded. {(error as Error).message}</div>}
      <div className="grid g-3" style={{ marginTop: 22 }}>
        {isLoading && Array.from({ length: 9 }, (_, i) => <TokenCardSkeleton key={i} />)}
        {tab === "all" && !q.trim() && !onlySite && <PlatformCard row={platform.data} />}
        {rows.map((t) => <TokenCard key={t.token} t={t} />)}
      </div>
      {data && rows.length === 0 && <div className="glass panel muted" style={{ marginTop: 22 }}>No tokens match this filter.</div>}
      {data && data.length >= limit && limit < 180 && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
          <button className="btn" disabled={isFetching} onClick={() => setLimit((n) => Math.min(180, n + 60))}>
            {isFetching ? "Loading…" : "Load more launches"}
          </button>
        </div>
      )}
    </section>
  );
}
