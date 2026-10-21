import Link from "next/link";
import { PLATFORM } from "@/lib/site";
import { formatUnits } from "viem";
import type { LaunchRow } from "@/lib/indexer";
import { ago, fmtAmount } from "@/lib/format";
import { pairInfo, PHASE_LABEL, TOKEN_SUPPLY } from "@/lib/pons";
import { MethodBadge } from "./MethodBadge";
import { TokenLogo } from "./TokenLogo";

export function progressOf(t: Pick<LaunchRow, "raised" | "graduationThreshold" | "phase">) {
  if (t.phase >= 1) return 1;
  const th = BigInt(t.graduationThreshold);
  return th === 0n ? 0 : Math.min(1, Number((BigInt(t.raised) * 10_000n) / th) / 10_000);
}

export function marketCap(t: Pick<LaunchRow, "quoteReserve" | "tokenReserve">) {
  const q = BigInt(t.quoteReserve), tk = BigInt(t.tokenReserve);
  return tk === 0n ? 0n : (q * TOKEN_SUPPLY) / tk;
}

export function TokenCard({ t, pinned }: { t: LaunchRow; pinned?: boolean }) {
  const pair = pairInfo(t.pairToken);
  const p = progressOf(t);
  return (
    <Link href={pinned ? "/token" : `/token/${t.token}`} className={`glass token-card${pinned ? " pinned" : ""}`}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <TokenLogo logo={t.logo} symbol={t.symbol} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="h3" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
          <div className="small faint">${t.symbol} · {ago(t.timestamp)}</div>
        </div>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        {pinned && <span className="chip platform">★ Platform token</span>}
        <MethodBadge id={t.method} broken={!t.intact} />
        {t.creatorTaxBps > 0 && <span className="chip neutral">Tax {t.creatorTaxBps / 100}%</span>}
      </div>
      <div className="kv">
        <div><div className="k">Market cap</div><div className="v mono">{t.phase >= 2 ? "On Uniswap" : `${fmtAmount(marketCap(t), pair.decimals, 3)} ${pair.symbol}`}</div></div>
        <div><div className="k">Raised</div><div className="v mono">{fmtAmount(BigInt(t.raised), pair.decimals, 3)} / {Number(formatUnits(BigInt(t.graduationThreshold), pair.decimals)).toLocaleString("en-GB", { maximumFractionDigits: 2 })}</div></div>
      </div>
      <div>
        <div className="between tiny faint" style={{ marginBottom: 6 }}>
          <span>{PHASE_LABEL[t.phase] ?? "Unknown"}</span>
          <span className="mono">{(p * 100).toFixed(1)}%</span>
        </div>
        <div className="progress"><span style={{ width: `${Math.max(2, p * 100)}%` }} /></div>
      </div>
    </Link>
  );
}

export function TokenCardSkeleton() {
  return (
    <div className="glass token-card" aria-hidden>
      <div className="row"><div className="skeleton" style={{ width: 52, height: 52, borderRadius: 16 }} /><div style={{ flex: 1 }}><div className="skeleton" style={{ height: 16, width: "60%" }} /><div className="skeleton" style={{ height: 12, width: "40%", marginTop: 8 }} /></div></div>
      <div className="skeleton" style={{ height: 24, width: 130 }} />
      <div className="skeleton" style={{ height: 38 }} />
      <div className="skeleton" style={{ height: 8 }} />
    </div>
  );
}

/** Always first in Explore: the live $NERMO card, or a placeholder until its address is set. */
export function PlatformCard({ row }: { row?: LaunchRow | null }) {
  if (row) return <TokenCard t={row} pinned />;
  return (
    <Link href="/token" className="glass token-card pinned">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <img className="token-logo" src="/brand/nermo-icon.png" alt="" style={{ objectFit: "cover" }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="h3">{PLATFORM.name}</div>
          <div className="small faint">${PLATFORM.symbol} · {PLATFORM.ca ? "Loading" : "Launching soon"}</div>
        </div>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><span className="chip platform">★ Platform token</span></div>
      <p className="small muted" style={{ margin: 0 }}>{PLATFORM.tagline}</p>
      <div className="progress"><span style={{ width: "2%" }} /></div>
    </Link>
  );
}
