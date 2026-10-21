"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { formatUnits, isAddress, maxUint256, parseUnits, zeroAddress, type Address } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { MethodBadge } from "@/components/MethodBadge";
import { MethodIcon } from "@/components/MethodIcon";
import { TokenLogo } from "@/components/TokenLogo";
import { EXPLORER, ponsTokenUrl, robinhood } from "@/lib/chain";
import { CHARITY_LAUNCHPAD, charityLaunchpadAbi, charityPage, distributorAbi, loadCharities, ponsCharityTokenPage, REMIT_VAULT, remitAssetFor, ZERO_ID } from "@/lib/charity";
import { ago, eqAddr, fmtAmount, fmtPct, fmtPrice, short } from "@/lib/format";
import { CopyButton } from "@/components/CopyButton";
import { isPlatformToken, platformBuyUrl } from "@/lib/site";
import { classify, METHOD_BY_ID, parseTag } from "@/lib/methods";
import { BURN_ADDRESS, curveAbi, escrowAbi, explainError, factoryAbi, pairInfo, PHASE_LABEL, PONS, PONS_ERRORS, tokenAbi, TOKEN_SUPPLY, vaultAbi } from "@/lib/pons";

const BPS = 10_000n;
const CURVE_ABI = [...curveAbi, ...PONS_ERRORS];

type Provenance = { found: boolean; txHash?: `0x${string}`; timestamp?: number; viaRouter?: boolean; devBuy?: { quoteIn: string; tokensOut: string; buyer: string } | null; viaSite?: boolean };


async function loadToken(c: NonNullable<ReturnType<typeof usePublicClient>>, token: Address) {
  const rec = await c.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "getLaunchedToken", args: [token] });
  if (!rec.exists) return null;
  const onCurve = rec.phase === 0;
  const [name, symbol, info, reserves, real, sellable, ready, feeBps, pending, pendingTax] = await Promise.all([
    c.readContract({ address: token, abi: tokenAbi, functionName: "name" }),
    c.readContract({ address: token, abi: tokenAbi, functionName: "symbol" }),
    c.readContract({ address: token, abi: tokenAbi, functionName: "getTokenInfo" }).catch(() => null),
    c.readContract({ address: rec.curve, abi: curveAbi, functionName: "getReserves" }).catch(() => [0n, 0n] as const),
    c.readContract({ address: rec.curve, abi: curveAbi, functionName: "realQuoteReserve" }).catch(() => 0n),
    onCurve ? c.readContract({ address: rec.curve, abi: curveAbi, functionName: "sellableTokens" }) : Promise.resolve(0n),
    onCurve ? c.readContract({ address: rec.curve, abi: curveAbi, functionName: "readyToGraduate" }) : Promise.resolve(true),
    c.readContract({ address: rec.curve, abi: curveAbi, functionName: "feeBps" }).catch(() => 0n),
    c.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "pendingCreatorFeeRecipient", args: [token] }).catch(() => null),
    c.readContract({ address: rec.curve, abi: curveAbi, functionName: "creatorTaxBalance" }).catch(() => 0n),
  ]);
  const registered = await c.readContract({ address: CHARITY_LAUNCHPAD, abi: charityLaunchpadAbi, functionName: "isCharityLaunch", args: [token] }).catch(() => false);
  let charity: null | { distributor: Address; charity: Address; charityId: `0x${string}`; charityBps: number; raised: bigint; pendingCharity: bigint } = null;
  if (registered) {
    const e = await c.readContract({ address: CHARITY_LAUNCHPAD, abi: charityLaunchpadAbi, functionName: "entryOf", args: [token] });
    const [raised, pendingCharity] = await Promise.all([
      c.readContract({ address: e.distributor, abi: distributorAbi, functionName: "totalToCharity", args: [remitAssetFor(rec.pairToken)] }).catch(() => 0n),
      c.readContract({ address: e.distributor, abi: distributorAbi, functionName: "pending", args: [rec.pairToken] }).catch(() => 0n),
    ]);
    charity = { distributor: e.distributor, charity: e.charity, charityId: e.charityId, charityBps: Number(e.charityBps), raised, pendingCharity };
  }
  return { rec, name, symbol, info, reserves, real, sellable, ready, feeBps, pending, pendingTax, charity };
}
type TokenData = NonNullable<Awaited<ReturnType<typeof loadToken>>>;

export default function TokenView({ address: raw, embedded }: { address: string; embedded?: boolean }) {
  const token = raw as Address;
  const client = usePublicClient({ chainId: robinhood.id });
  const justLaunched = useSearchParams().get("launched") === "1";

  const data = useQuery({
    queryKey: ["token", token],
    enabled: !!client && isAddress(raw),
    refetchInterval: 12_000,
    queryFn: () => loadToken(client!, token),
  });

  const prov = useQuery({
    queryKey: ["prov", token],
    enabled: isAddress(raw),
    queryFn: async () => (await (await fetch(`/api/token/${token}`)).json()) as Provenance,
    staleTime: 5 * 60_000,
  });

  const d = data.data;
  const parsed = useMemo(() => parseTag(d?.info?.[2]), [d?.info]);
  const cls = useMemo(() => {
    if (!d) return null;
    return classify(
      {
        creatorTaxBps: Number(d.rec.creatorTaxBps),
        buybackEnabled: d.rec.buybackEnabled,
        creatorFeeRecipient: d.rec.creatorFeeRecipient,
        deployer: d.rec.deployer,
        viaRouter: !!prov.data?.viaRouter,
        devBuyRecipient: prov.data?.devBuy?.buyer && isAddress(prov.data.devBuy.buyer) ? (prov.data.devBuy.buyer as Address) : undefined,
        charityDistributor: d.charity?.distributor,
      },
    );
  }, [d, prov.data?.viaRouter, prov.data?.devBuy?.buyer]);

  if (!isAddress(raw)) return <Shell embedded={embedded}><div className="notice bad">That is not a valid token address.</div></Shell>;
  if (data.isLoading) return <Shell embedded={embedded}><div className="glass panel skeleton" style={{ height: 360 }} /></Shell>;
  if (data.error) return <Shell embedded={embedded}><div className="notice bad">Could not read this token from Robinhood Chain. {explainError(data.error)}</div></Shell>;
  if (!d || !cls) return <Shell embedded={embedded}><div className="glass panel">This address is not a Pons V2 launch. Check the token address and try again.</div></Shell>;

  const pair = pairInfo(d.rec.pairToken);
  const [qr, tr] = d.reserves;
  const price = tr === 0n ? 0 : Number(formatUnits(qr, pair.decimals)) / Number(formatUnits(tr, 18));
  const mcap = tr === 0n ? 0n : (qr * TOKEN_SUPPLY) / tr;
  const threshold = d.rec.graduationThreshold;
  const raised = d.rec.phase >= 1 ? threshold : d.real;
  const progress = threshold === 0n ? 0 : Math.min(1, Number((raised * 10_000n) / threshold) / 10_000);
  const m = METHOD_BY_ID[cls.method];
  const s = d.info?.[3];
  const links = s ? ([["X ↗", s.twitter], ["Telegram", s.telegram], ["Discord", s.discord], ["Website", s.website], ["Farcaster", s.farcaster]] as const).filter(([, u]) => /^https?:\/\//.test(u)) : [];
  const platform = isPlatformToken(d.rec.token);
  const hasPendingCto = d.pending && d.pending[0] !== zeroAddress;

  return (
    <Shell embedded={embedded}>
      {justLaunched && <div className="notice info" style={{ marginBottom: 16 }}>Your token is live. Share the address, not the name: {d.rec.token}</div>}
      {!embedded && <div className="glass panel token-head" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 22, alignItems: "center" }}>
        <TokenLogo logo={d.info?.[1]} symbol={d.symbol} large />
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <h1 className="h2">{d.name}</h1>
            <span className="h3 faint">${d.symbol}</span>
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {platform && <span className="chip platform">★ Platform token</span>}
            <MethodBadge id={cls.method} broken={!cls.checks.every((c) => c.ok)} />
            {prov.data?.viaSite && <span className="chip">✓ Launched on Nermo</span>}
            <span className="chip neutral">{PHASE_LABEL[d.rec.phase]}</span>
            <span className="chip neutral">Pair {pair.symbol}</span>
            <button className="chip neutral mono" style={{ cursor: "pointer" }} onClick={() => navigator.clipboard.writeText(d.rec.token)} title="Copy token address">{short(d.rec.token)} ⧉</button>
          </div>
          {parsed.body && <p className="muted" style={{ margin: "14px 0 0", maxWidth: 720, whiteSpace: "pre-wrap" }}>{parsed.body}</p>}
          {links.length > 0 && <div className="row small" style={{ gap: 14, marginTop: 10, flexWrap: "wrap" }}>{links.map(([l, u]) => <a key={l} href={u} target="_blank" rel="noreferrer noopener" style={{ color: "var(--green-deep)", fontWeight: 600 }}>{l}</a>)}</div>}
        </div>
        <div className="grid" style={{ gap: 8 }}>
          <a className="btn btn-sm btn-primary" href={platform ? platformBuyUrl()! : ponsTokenUrl(d.rec.token)} target="_blank" rel="noreferrer">Buy on Pons ↗</a>
          <CopyButton text={d.rec.token} />
          <a className="btn btn-sm" href={`${EXPLORER}/token/${d.rec.token}`} target="_blank" rel="noreferrer">Blockscout</a>
        </div>
      </div>}

      <div className="grid g-4" style={{ marginTop: 16 }}>
        <Stat l="Price" v={`${fmtPrice(price)} ${pair.symbol}`} />
        <Stat l="Market cap" v={`${fmtAmount(mcap, pair.decimals, 3)} ${pair.symbol}`} />
        <Stat l="Creator tax" v={fmtPct(Number(d.rec.creatorTaxBps))} />
        <Stat l="Trading fee" v={fmtPct(Number(d.feeBps))} />
      </div>

      <div className="glass panel" style={{ marginTop: 16 }}>
        <div className="between small" style={{ marginBottom: 10 }}>
          <span className="muted">Graduation progress</span>
          <span className="mono">{fmtAmount(raised, pair.decimals)} / {fmtAmount(threshold, pair.decimals)} {pair.symbol} · {(progress * 100).toFixed(1)}%</span>
        </div>
        <div className="progress" style={{ height: 12 }}><span style={{ width: `${Math.max(1.5, progress * 100)}%` }} /></div>
        <p className="tiny faint" style={{ margin: "10px 0 0" }}>When the curve sells out, the launch graduates into a Uniswap v4 pool with permanently locked liquidity.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 380px", gap: 16, marginTop: 16 }} className="token-grid">
        <div className="glass panel">
          <div className="row" style={{ marginBottom: 16 }}>
            <span className="orb"><MethodIcon id={m.id} /></span>
            <div>
              <div className="eyebrow">Launch method</div>
              <div className="h3" style={{ marginTop: 4 }}>{m.name}</div>
            </div>
          </div>
          <MethodPanel method={m.id} d={d} tag={parsed.tag} prov={prov.data} pairSymbol={pair.symbol} pairDecimals={pair.decimals} />
          {prov.data?.devBuy && m.id !== "auto-dev-burn" && (
            <>
              <hr className="rule" style={{ margin: "20px 0" }} />
              <div className="eyebrow" style={{ marginBottom: 10 }}>Developer buy at launch</div>
              <div className="kv">
                <div><div className="k">Amount</div><div className="v mono">{fmtAmount(BigInt(prov.data.devBuy.quoteIn), pair.decimals)} {pair.symbol}</div></div>
                <div><div className="k">Tokens</div><div className="v mono">{fmtAmount(BigInt(prov.data.devBuy.tokensOut))}</div></div>
                <div><div className="k">Share of supply</div><div className="v mono">{`${(Number((BigInt(prov.data.devBuy.tokensOut) * 10_000n) / TOKEN_SUPPLY) / 100).toFixed(2)}%`}</div></div>
                <div><div className="k">Recipient</div><div className="v mono">{short(prov.data.devBuy.buyer)}</div></div>
              </div>
            </>
          )}
          <hr className="rule" style={{ margin: "20px 0" }} />
          <div className="eyebrow" style={{ marginBottom: 10 }}>Method integrity</div>
          <div className="grid" style={{ gap: 8 }}>
            {cls.checks.map((c) => (
              <div key={c.label} className="check"><span className={`dot ${c.ok ? "ok" : "no"}`}>{c.ok ? "✓" : "!"}</span>{c.label}</div>
            ))}
            <div className="check"><span className="dot ok">✓</span>Creator tax and pair asset are immutable in Pons V2</div>
            {hasPendingCto && <div className="check"><span className="dot no">!</span>A fee recipient change to {short(d.pending![0])} is proposed, effective {new Date(Number(d.pending![1]) * 1000).toLocaleString("en-GB")}</div>}
          </div>
        </div>

        <div className="stack">
          {d.rec.phase === 0 ? (
            <TradePanel token={d.rec.token} curve={d.rec.curve} pair={d.rec.pairToken} symbol={d.symbol} ready={d.ready} onDone={() => data.refetch()} />
          ) : (
            <div className="glass panel">
              <div className="h3">{d.rec.phase === 2 ? "Trading on Uniswap v4" : "Graduating"}</div>
              <p className="muted small">{d.rec.phase === 2 ? "This token has graduated. Its liquidity is locked for good and it trades in its Uniswap v4 pool." : "The curve has sold out and the pool is being created. Trading resumes on Uniswap v4 shortly."}</p>
              <a className="btn btn-block" href={ponsTokenUrl(d.rec.token)} target="_blank" rel="noreferrer">Trade on Pons</a>
            </div>
          )}
          <CreatorFees d={d} pairSymbol={pair.symbol} pairDecimals={pair.decimals} onDone={() => data.refetch()} />
          <div className="glass card small">
            <div className="kv">
              <div><div className="k">Creator</div><div className="v mono"><a href={`${EXPLORER}/address/${d.rec.deployer}`} target="_blank" rel="noreferrer">{short(d.rec.deployer)}</a></div></div>
              <div><div className="k">Fee recipient</div><div className="v mono"><a href={`${EXPLORER}/address/${d.rec.creatorFeeRecipient}`} target="_blank" rel="noreferrer">{short(d.rec.creatorFeeRecipient)}</a></div></div>
              <div><div className="k">Curve</div><div className="v mono"><a href={`${EXPLORER}/address/${d.rec.curve}`} target="_blank" rel="noreferrer">{short(d.rec.curve)}</a></div></div>
              <div><div className="k">Launched</div><div className="v">{prov.data?.txHash ? <a href={`${EXPLORER}/tx/${prov.data.txHash}`} target="_blank" rel="noreferrer">{ago(prov.data.timestamp)}</a> : "…"}</div></div>
            </div>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 960px){ .token-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </Shell>
  );
}

function Shell({ children, embedded }: { children: React.ReactNode; embedded?: boolean }) {
  if (embedded) return <div>{children}</div>;
  return (
    <section className="wrap section">
      <Link href="/explore" className="small muted">← Explore</Link>
      <div style={{ marginTop: 16 }}>{children}</div>
    </section>
  );
}

function Stat({ l, v }: { l: string; v: string }) {
  return <div className="glass card stat"><div className="l">{l}</div><div className="mono" style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>{v}</div></div>;
}

function MethodPanel({ method, d, tag, prov, pairSymbol, pairDecimals }: { method: string; d: TokenData; tag?: ReturnType<typeof parseTag>["tag"]; prov?: Provenance; pairSymbol: string; pairDecimals: number }) {
  const client = usePublicClient({ chainId: robinhood.id });
  const vault = useQuery({
    queryKey: ["vault", d.rec.token],
    enabled: method === "buyback" && !!client,
    queryFn: async () => {
      const c = client!;
      const read = (fn: "totalLocked" | "totalReleased" | "vestedAmount" | "releasable" | "vestingStart") => c.readContract({ address: PONS.buybackVault, abi: vaultAbi, functionName: fn, args: [d.rec.token] });
      const [locked, released, vested, releasable, start, duration] = await Promise.all([
        read("totalLocked"), read("totalReleased"), read("vestedAmount"), read("releasable"), read("vestingStart"),
        c.readContract({ address: PONS.buybackVault, abi: vaultAbi, functionName: "VESTING_DURATION" }),
      ]);
      return { locked, released, vested, releasable, start, duration };
    },
  });
  const escrow = useQuery({
    queryKey: ["escrow", d.rec.creatorFeeRecipient, d.rec.pairToken],
    enabled: (method === "charity" || method === "creator-tax") && !!client,
    queryFn: () =>
      d.rec.pairToken === zeroAddress
        ? client!.readContract({ address: PONS.feeEscrow, abi: escrowAbi, functionName: "balanceOf", args: [d.rec.creatorFeeRecipient] })
        : client!.readContract({ address: PONS.feeEscrow, abi: escrowAbi, functionName: "balanceOfToken", args: [d.rec.creatorFeeRecipient, d.rec.pairToken] }),
  });

  const tax = Number(d.rec.creatorTaxBps);
  switch (method) {
    case "zero-tax":
      return <p className="muted" style={{ margin: 0 }}>Creator tax is {fmtPct(tax)}. Traders pay the standard Pons fee and nothing else.</p>;
    case "buyback": {
      const v = vault.data;
      const pct = v && v.locked > 0n ? Number((v.vested * 10_000n) / v.locked) / 100 : 0;
      return (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Part of the creator&apos;s fee share buys the token back from the market. Bought-back tokens are locked in the Pons Buyback Vault and vest over five years.</p>
          <div className="kv">
            <div><div className="k">Status</div><div className="v">{d.rec.buybackEnabled ? "Active" : "Switched off"}</div></div>
            <div><div className="k">Tokens locked</div><div className="v mono">{v ? fmtAmount(v.locked) : "…"}</div></div>
            <div><div className="k">Vested</div><div className="v mono">{v ? `${fmtAmount(v.vested)} (${pct.toFixed(2)}%)` : "…"}</div></div>
            <div><div className="k">Released</div><div className="v mono">{v ? fmtAmount(v.released) : "…"}</div></div>
          </div>
          <a className="small" style={{ display: "inline-block", marginTop: 12, color: "var(--green-deep)", fontWeight: 600 }} href={`${EXPLORER}/address/${PONS.buybackVault}`} target="_blank" rel="noreferrer">Buyback Vault on Blockscout</a>
        </>
      );
    }
    case "auto-dev-burn": {
      const burnVerified = !!prov?.devBuy && eqAddr(prov.devBuy.buyer, BURN_ADDRESS);
      return (
        <>
          <p className="muted" style={{ marginTop: 0 }}>When a developer buy is used, the purchased tokens are burned automatically in the launch transaction.</p>
          <div className="kv">
            <div><div className="k">Initial dev buy</div><div className="v mono">{prov?.devBuy ? `${fmtAmount(BigInt(prov.devBuy.quoteIn), pairDecimals)} ${pairSymbol}` : tag?.dev ? tag.dev : "None"}</div></div>
            <div><div className="k">Tokens burned</div><div className="v mono">{prov?.devBuy ? fmtAmount(BigInt(prov.devBuy.tokensOut)) : "—"}</div></div>
            <div><div className="k">Share of supply</div><div className="v mono">{prov?.devBuy ? `${(Number((BigInt(prov.devBuy.tokensOut) * 10_000n) / TOKEN_SUPPLY) / 100).toFixed(2)}%` : "—"}</div></div>
            
          </div>
          {prov?.devBuy && !burnVerified && <div className="notice bad" style={{ marginTop: 14 }}>The opening buy was not burned as expected.</div>}
        </>
      );
    }
    case "charity":
      return <CharityPanel d={d} tagName={tag?.n} pairSymbol={pairSymbol} pairDecimals={pairDecimals} />;
    case "creator-tax":
      return (
        <>
          <p className="muted" style={{ marginTop: 0 }}>The creator receives a {fmtPct(tax)} tax on every trade. The rate is fixed and can never be raised.</p>
          <div className="kv">
            <div><div className="k">Creator tax</div><div className="v mono">{fmtPct(tax)}</div></div>
            <div><div className="k">Recipient</div><div className="v mono">{short(d.rec.creatorFeeRecipient)}</div></div>
            <div><div className="k">Claimable now</div><div className="v mono">{escrow.data !== undefined ? `${fmtAmount(escrow.data, pairDecimals)} ${pairSymbol}` : "…"}</div></div>
            <div><div className="k">Accruing on curve</div><div className="v mono">{fmtAmount(d.pendingTax, pairDecimals)} {pairSymbol}</div></div>
          </div>
        </>
      );
  }
  return null;
}

function TradePanel({ token, curve, pair, symbol, ready, onDone }: { token: Address; curve: Address; pair: Address; symbol: string; ready: boolean; onDone: () => void }) {
  const { address, isConnected, chainId } = useAccount();
  const client = usePublicClient({ chainId: robinhood.id });
  const { data: wallet } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const qc = useQueryClient();
  const p = pairInfo(pair);
  const native = pair === zeroAddress;
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(2);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const bal = useQuery({
    queryKey: ["bal", address, token, pair],
    enabled: !!client && !!address,
    refetchInterval: 15_000,
    queryFn: async () => {
      const c = client!;
      const [q, t] = await Promise.all([
        native ? c.getBalance({ address: address! }) : c.readContract({ address: pair, abi: tokenAbi, functionName: "balanceOf", args: [address!] }),
        c.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [address!] }),
      ]);
      return { q, t };
    },
  });

  const amt = useMemo(() => {
    try { return amount ? parseUnits(amount, side === "buy" ? p.decimals : 18) : 0n; } catch { return 0n; }
  }, [amount, side, p.decimals]);

  const quote = useQuery({
    queryKey: ["quote", curve, side, amt.toString(), address],
    enabled: !!client && amt > 0n,
    queryFn: async () => {
      const c = client!;
      const read = <T,>(functionName: string, args?: unknown[]) => c.readContract({ address: curve, abi: curveAbi, functionName: functionName as never, args: args as never }) as Promise<T>;
      const [[qr, tr], sellable, feeBps, taxBps] = await Promise.all([
        read<readonly [bigint, bigint]>("getReserves"), read<bigint>("sellableTokens"), read<bigint>("feeBps"), read<bigint>("creatorTaxBps"),
      ]);
      if (side === "sell") {
        const gross = (amt * qr) / (tr + amt);
        return { out: gross - (gross * feeBps) / BPS - (gross * taxBps) / BPS, snipe: 0n, refund: 0n };
      }
      /* Not every deployed curve exposes a snipe tax view. A missing view must not block trading. */
      let snipe = address ? await read<bigint>("currentSnipeTaxBps", [address]).catch(() => 0n) : 0n;
      if (snipe > 0n) { const cap = BPS - feeBps - taxBps - 100n; if (snipe > cap) snipe = cap; }
      const net = amt - (amt * feeBps) / BPS - (amt * taxBps) / BPS - (amt * snipe) / BPS;
      let out = (net * tr) / (qr + net);
      let spent = amt;
      if (out > sellable) {
        out = sellable;
        const netIn = (sellable * qr) / (tr - sellable) + 1n;
        const div = BPS - feeBps - taxBps - snipe;
        const grossed = (netIn * BPS + div - 1n) / div;
        spent = grossed < amt ? grossed : amt;
      }
      return { out, snipe, refund: amt - spent };
    },
  });

  async function ensureAllowance(asset: Address, spender: Address, need: bigint) {
    const cur = await client!.readContract({ address: asset, abi: tokenAbi, functionName: "allowance", args: [address!, spender] });
    if (cur >= need) return;
    setBusy("Approving…");
    const h = await wallet!.writeContract({ address: asset, abi: tokenAbi, functionName: "approve", args: [spender, maxUint256], chain: robinhood, account: address! });
    await client!.waitForTransactionReceipt({ hash: h });
  }

  async function submit() {
    if (!client || !wallet || !address || !quote.data || amt === 0n) return;
    setMsg(null);
    try {
      if (chainId !== robinhood.id) await switchChainAsync({ chainId: robinhood.id });
      const minOut = (quote.data.out * BigInt(10_000 - Math.round(slip * 100))) / BPS;
      let hash: `0x${string}`;
      if (side === "buy") {
        if (!native) await ensureAllowance(pair, curve, amt);
        setBusy("Confirm in your wallet…");
        const { request } = await client.simulateContract({ account: address, address: curve, abi: CURVE_ABI, functionName: "buy", args: [amt, minOut, address], value: native ? amt : 0n });
        hash = await wallet.writeContract({ ...request, chain: robinhood });
      } else {
        await ensureAllowance(token, curve, amt);
        setBusy("Confirm in your wallet…");
        const { request } = await client.simulateContract({ account: address, address: curve, abi: CURVE_ABI, functionName: "sell", args: [amt, minOut, address] });
        hash = await wallet.writeContract({ ...request, chain: robinhood });
      }
      setBusy("Settling…");
      const r = await client.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("The trade reverted.");
      setMsg({ ok: true, text: side === "buy" ? `Bought ${symbol}.` : `Sold ${symbol}.` });
      setAmount("");
      qc.invalidateQueries({ queryKey: ["bal"] });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: explainError(e) });
    } finally {
      setBusy("");
    }
  }

  const sellBlocked = side === "sell" && ready;
  const balance = side === "buy" ? bal.data?.q : bal.data?.t;
  const insufficient = balance !== undefined && amt > balance;

  return (
    <div className="glass panel">
      <div className="glass tabs" style={{ width: "100%", display: "flex" }} role="tablist">
        <button className={side === "buy" ? "on" : ""} style={{ flex: 1, justifyContent: "center" }} onClick={() => { setSide("buy"); setAmount(""); }}>Buy</button>
        <button className={side === "sell" ? "on" : ""} style={{ flex: 1, justifyContent: "center" }} onClick={() => { setSide("sell"); setAmount(""); }}>Sell</button>
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <div className="between"><label className="label" htmlFor="amt">You pay</label><button className="tiny faint" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => balance !== undefined && setAmount(formatUnits(side === "buy" && native ? (balance > 10n ** 15n ? balance - 10n ** 15n : 0n) : balance, side === "buy" ? p.decimals : 18))}>Balance {fmtAmount(balance, side === "buy" ? p.decimals : 18)}</button></div>
        <div className="input-affix">
          <input id="amt" className={`input mono${insufficient ? " err" : ""}`} inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
          <span className="affix">{side === "buy" ? p.symbol : symbol}</span>
        </div>
        {insufficient && <span className="err-text">Not enough balance.</span>}
      </div>
      <div className="glass card small" style={{ marginTop: 12 }}>
        <div className="between"><span className="muted">You receive about</span><span className="mono">{quote.data ? `${fmtAmount(quote.data.out, side === "buy" ? 18 : p.decimals)} ${side === "buy" ? symbol : p.symbol}` : "…"}</span></div>
        <div className="between" style={{ marginTop: 6 }}><span className="muted">Slippage</span>
          <select className="select" style={{ width: 90, padding: "4px 8px" }} value={slip} onChange={(e) => setSlip(Number(e.target.value))} aria-label="Slippage">{[0.5, 1, 2, 5, 10].map((x) => <option key={x} value={x}>{x}%</option>)}</select>
        </div>
        {quote.data && quote.data.snipe > 0n && <div className="notice warn" style={{ marginTop: 10 }}>Opening snipe tax is {fmtPct(quote.data.snipe)} right now. It decays to zero within seconds of launch.</div>}
        {quote.data && quote.data.refund > 0n && <div className="notice info" style={{ marginTop: 10 }}>This buy completes the curve. {fmtAmount(quote.data.refund, p.decimals)} {p.symbol} is refunded.</div>}
      </div>
      {sellBlocked && <div className="notice warn" style={{ marginTop: 12 }}>The curve has sold out, so selling is paused until the pool opens on Uniswap v4.</div>}
      <div style={{ marginTop: 14 }}>
        {!isConnected ? <ConnectButton block /> : (
          <button className="btn btn-lg btn-primary btn-block" disabled={!!busy || amt === 0n || !quote.data || insufficient || sellBlocked} onClick={submit}>
            {busy || (side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`)}
          </button>
        )}
      </div>
      {msg && <div className={`notice ${msg.ok ? "info" : "bad"}`} style={{ marginTop: 12 }}>{msg.text}</div>}
    </div>
  );
}

function CharityPanel({ d, tagName, pairSymbol, pairDecimals }: { d: TokenData; tagName?: string; pairSymbol: string; pairDecimals: number }) {
  const listed = d.charity && d.charity.charityId !== ZERO_ID;
  const dir = useQuery({ queryKey: ["charities"], enabled: !!listed, queryFn: loadCharities, staleTime: Infinity });
  const hit = listed ? dir.data?.find((c) => c.configId.toLowerCase() === d.charity!.charityId.toLowerCase()) : undefined;
  if (!d.charity)
    return <p className="muted" style={{ margin: 0 }}>This token names a charity in its description but is not in the Pons Charity registry, so its fees are not routed by a charity distributor. Treat the claim with caution.</p>;
  const remit = remitAssetFor(d.rec.pairToken);
  const remitSym = remit === d.rec.pairToken ? pairSymbol : "USDG";
  const remitDec = remit === d.rec.pairToken ? pairDecimals : 6;
  const name = hit?.name ?? tagName ?? (listed ? "Listed charity" : "Charity wallet");
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>{fmtPct(d.charity.charityBps)} of the creator side of every trading fee goes to {name}, through an ownerless distributor.</p>
      <div className="kv">
        <div><div className="k">Charity</div><div className="v">{hit ? <a href={charityPage(hit.slug)} target="_blank" rel="noreferrer">{hit.name}</a> : name}</div></div>
        <div><div className="k">Route</div><div className="v">{listed ? "Donate.gg via Pons Charity" : <a className="mono" href={`${EXPLORER}/address/${d.charity.charity}`} target="_blank" rel="noreferrer">Direct to {short(d.charity.charity)}</a>}</div></div>
        <div><div className="k">Sent to charity</div><div className="v mono">{fmtAmount(d.charity.raised, remitDec)} {remitSym}</div></div>
        <div><div className="k">Waiting to be collected</div><div className="v mono">{fmtAmount(d.charity.pendingCharity, pairDecimals)} {pairSymbol}</div></div>
        <div><div className="k">Distributor</div><div className="v mono"><a href={`${EXPLORER}/address/${d.charity.distributor}`} target="_blank" rel="noreferrer">{short(d.charity.distributor)}</a></div></div>
        <div><div className="k">Creator tax</div><div className="v mono">{fmtPct(Number(d.rec.creatorTaxBps))}</div></div>
      </div>
      <a className="small" style={{ display: "inline-block", marginTop: 12, color: "var(--green-deep)", fontWeight: 600 }} href={ponsCharityTokenPage(d.rec.token)} target="_blank" rel="noreferrer">Donation ledger and fee collection on Pons Charity</a>
      {listed && d.charity.charity.toLowerCase() !== REMIT_VAULT.toLowerCase() && <p className="tiny faint">This listed charity pays an address other than the known remit vault.</p>}
    </>
  );
}

/** Shown only to the fee recipient or original creator: sweep curve fees and claim from the Pons escrow. */
function CreatorFees({ d, pairSymbol, pairDecimals, onDone }: { d: TokenData; pairSymbol: string; pairDecimals: number; onDone: () => void }) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: robinhood.id });
  const { data: wallet } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isRecipient = eqAddr(address, d.rec.creatorFeeRecipient);
  const isDeployer = eqAddr(address, d.rec.deployer);
  const native = d.rec.pairToken === zeroAddress;

  const state = useQuery({
    queryKey: ["creator-fees", d.rec.token, address],
    enabled: !!client && !!address && (isRecipient || isDeployer),
    refetchInterval: 20_000,
    queryFn: async () => {
      const c = client!;
      const [claimable, feeBal] = await Promise.all([
        native
          ? c.readContract({ address: PONS.feeEscrow, abi: escrowAbi, functionName: "balanceOf", args: [address!] })
          : c.readContract({ address: PONS.feeEscrow, abi: escrowAbi, functionName: "balanceOfToken", args: [address!, d.rec.pairToken] }),
        d.rec.phase === 0 ? c.readContract({ address: d.rec.curve, abi: curveAbi, functionName: "quoteFeeBalance" }).catch(() => 0n) : Promise.resolve(0n),
      ]);
      return { claimable, unswept: feeBal + d.pendingTax };
    },
  });

  if (!address || (!isRecipient && !isDeployer) || !state.data) return null;
  const canSweep = isDeployer && d.rec.phase === 0 && !d.rec.buybackEnabled && state.data.unswept > 0n;

  async function run(kind: "sweep" | "claim") {
    if (!client || !wallet || !address) return;
    setMsg(null);
    try {
      if (chainId !== robinhood.id) await switchChainAsync({ chainId: robinhood.id });
      setBusy("Confirm in your wallet…");
      const { request } =
        kind === "sweep"
          ? await client.simulateContract({ account: address, address: d.rec.curve, abi: [...curveAbi, ...PONS_ERRORS], functionName: "sweepFees", args: [0n] })
          : native
            ? await client.simulateContract({ account: address, address: PONS.feeEscrow, abi: escrowAbi, functionName: "claim" })
            : await client.simulateContract({ account: address, address: PONS.feeEscrow, abi: escrowAbi, functionName: "claimToken", args: [d.rec.pairToken] });
      const hash = await wallet.writeContract({ ...request, chain: robinhood } as Parameters<typeof wallet.writeContract>[0]);
      setBusy("Settling…");
      const r = await client.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("The transaction reverted.");
      setMsg({ ok: true, text: kind === "sweep" ? "Fees moved to the Pons escrow. You can claim them now." : "Fees claimed to your wallet." });
      state.refetch();
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: explainError(e) });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="glass card">
      <div className="eyebrow" style={{ marginBottom: 10 }}>Your creator fees</div>
      <div className="kv">
        <div><div className="k">Claimable now</div><div className="v mono">{fmtAmount(state.data.claimable, pairDecimals)} {pairSymbol}</div></div>
        <div><div className="k">Still on the curve</div><div className="v mono">{fmtAmount(state.data.unswept, pairDecimals)} {pairSymbol}</div></div>
      </div>
      <p className="tiny faint" style={{ margin: "10px 0 0" }}>Claimable covers every Pons launch paying this wallet. Graduated launches collect fees in the Uniswap v4 hook and are swept by Pons.</p>
      <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
        {canSweep && <button className="btn btn-sm" disabled={!!busy} onClick={() => run("sweep")}>Sweep curve fees</button>}
        {isRecipient && <button className="btn btn-sm btn-primary" disabled={!!busy || state.data.claimable === 0n} onClick={() => run("claim")}>{busy || "Claim fees"}</button>}
      </div>
      {msg && <div className={`notice ${msg.ok ? "info" : "bad"}`} style={{ marginTop: 10 }}>{msg.text}</div>}
    </div>
  );
}
