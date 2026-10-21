"use client";
import Link from "next/link";
import { useMemo } from "react";
import { METHODS } from "@/lib/methods";
import { MethodIcon } from "@/components/MethodIcon";
import { PlatformCard, TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { usePlatform } from "@/components/usePlatform";
import { isPlatformToken } from "@/lib/site";
import { useLaunches } from "@/components/useLaunches";

const SUBS: Record<string, string> = {
  "zero-tax": "Pure community momentum",
  buyback: "Lock supply automatically",
  "auto-dev-burn": "Burn the opening dev position",
  charity: "Turn growth into good",
  "creator-tax": "Reward creators long term",
};

export default function Home() {
  const platform = usePlatform();
  const { data, isLoading, error } = useLaunches(60);
  const stats = useMemo(() => {
    const rows = data ?? [];
    return {
      total: rows.length,
      graduated: rows.filter((r) => r.phase >= 2).length,
      methods: rows.filter((r) => r.viaSite).length,
      buyback: rows.filter((r) => r.method === "buyback").length,
    };
  }, [data]);

  return (
    <>
      <section className="wrap hero">
        <div>
          <div className="eyebrow" style={{ marginBottom: 22 }}>Built on Pons V2 · Robinhood Chain</div>
          <h1 className="h1">Choose how your token launches.</h1>
          <p className="lede" style={{ marginTop: 22 }}>
            Launch tokens with different economic methods through one launchpad. Every token shows its Method, and the contracts hold it to it.
          </p>
          <div className="row" style={{ marginTop: 30, flexWrap: "wrap" }}>
            <Link href="/launch" className="btn btn-lg btn-primary">Launch Token →</Link>
            <Link href="/explore" className="btn btn-lg">Explore</Link>
          </div>
        </div>
        <div className="hero-mark"><img src="/brand/nermo-mark.png" alt="Nermo monogram" /></div>
      </section>

      <section className="wrap section" style={{ paddingTop: 8 }}>
        <div style={{ marginBottom: 18 }}>
          <div className="eyebrow">Launch methods</div>
        </div>
        <div className="grid g-5">
          {METHODS.map((m) => (
            <Link key={m.id} href={`/methods/${m.id}`} className="glass method-card">
              <span className="orb"><MethodIcon id={m.id} /></span>
              <span>
                <div className="name">{m.name}</div>
                <div className="sub">{SUBS[m.id]}</div>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap section">
        <div className="glass panel grid g-4">
          {[
            ["Recent launches", stats.total],
            ["Graduated", stats.graduated],
            ["Launched here", stats.methods],
            ["Buyback launches", stats.buyback],
          ].map(([l, n]) => (
            <div key={l} className="stat">
              <div className="n mono">{error ? "—" : isLoading ? "…" : n}</div>
              <div className="l">{l}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap section">
        <div className="between" style={{ marginBottom: 18 }}>
          <h2 className="h2">Latest launches</h2>
          <Link href="/explore" className="btn btn-sm">View all</Link>
        </div>
        {error && <div className="notice bad">Launches could not be loaded. {(error as Error).message}</div>}
        <div className="grid g-3">
          {isLoading && Array.from({ length: 6 }, (_, i) => <TokenCardSkeleton key={i} />)}
          <PlatformCard row={platform.data} />
          {data?.filter((t) => !isPlatformToken(t.token)).slice(0, 8).map((t) => <TokenCard key={t.token} t={t} />)}
        </div>
        {data && data.length === 0 && <div className="glass panel muted">No launches found yet. Be the first to <Link href="/launch" style={{ color: "var(--green-deep)", fontWeight: 600 }}>launch a token</Link>.</div>}
      </section>
    </>
  );
}
