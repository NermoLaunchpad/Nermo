"use client";
import Link from "next/link";
import { Suspense } from "react";
import { CopyButton } from "@/components/CopyButton";
import { EXPLORER } from "@/lib/chain";
import { PLATFORM, platformBuyUrl, SITE } from "@/lib/site";
import TokenView from "./[address]/TokenView";

export function PlatformToken() {
  const ca = PLATFORM.ca;
  const buy = platformBuyUrl();
  return (
    <section className="wrap section">
      <Link href="/explore" className="small muted">← Explore</Link>

      <div className="glass panel platform-hero" style={{ marginTop: 16 }}>
        <div className="platform-mark"><img src="/brand/nermo-mark.png" alt="" /></div>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="chip platform">★ Platform token</span>
            <span className="chip neutral">{ca ? "Live on Pons V2" : "Launching soon"}</span>
          </div>
          <h1 className="h1" style={{ fontSize: "clamp(44px, 6vw, 84px)", marginTop: 16 }}>${PLATFORM.symbol}</h1>
          <p className="tagline" style={{ margin: "10px 0 0", fontSize: 18 }}>{PLATFORM.tagline}</p>
          <p className="muted" style={{ maxWidth: 620, marginTop: 14 }}>{PLATFORM.description}</p>

          <div className="ca-box">
            <span className="eyebrow" style={{ fontSize: 10 }}>Contract address</span>
            <span className="mono ca-text">{ca ?? "Published here at launch"}</span>
          </div>

          <div className="row" style={{ flexWrap: "wrap", marginTop: 16 }}>
            {buy ? (
              <a className="btn btn-lg btn-primary" href={buy} target="_blank" rel="noreferrer">Buy ${PLATFORM.symbol} ↗</a>
            ) : (
              <button className="btn btn-lg btn-primary" disabled>Buy ${PLATFORM.symbol} · Soon</button>
            )}
            {ca ? <CopyButton text={ca} className="btn btn-lg" /> : <button className="btn btn-lg" disabled>Copy CA</button>}
            {ca && <a className="btn btn-lg" href={`${EXPLORER}/token/${ca}`} target="_blank" rel="noreferrer">Blockscout</a>}
            {SITE.x && <a className="btn btn-lg" href={SITE.x} target="_blank" rel="noreferrer">X ↗</a>}
            {SITE.telegram && <a className="btn btn-lg" href={SITE.telegram} target="_blank" rel="noreferrer">Telegram ↗</a>}
          </div>
        </div>
      </div>

      {ca ? (
        <div style={{ marginTop: 16 }}>
          <Suspense fallback={<div className="glass panel skeleton" style={{ height: 360 }} />}>
            <TokenView address={ca} embedded />
          </Suspense>
        </div>
      ) : (
        <div className="grid g-3" style={{ marginTop: 16 }}>
          {[
            ["Fair launch", `$${PLATFORM.symbol} launches on the Pons V2 bonding curve like every other token here, with no presale.`],
            ["Fixed supply", "Pons V2 mints exactly 1,000,000,000 tokens at launch. Nobody can mint more."],
            ["Official address", "The contract address appears on this page first. Always check it here before you buy."],
          ].map(([t, b]) => (
            <div key={t} className="glass panel">
              <div className="h3">{t}</div>
              <p className="muted small" style={{ marginBottom: 0 }}>{b}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
