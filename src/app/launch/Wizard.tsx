"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  decodeEventLog,
  formatUnits,
  isAddress,
  parseUnits,
  toHex,
  zeroAddress,
  type Address,
} from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { MethodBadge } from "@/components/MethodBadge";
import { MethodIcon } from "@/components/MethodIcon";
import { TokenLogo } from "@/components/TokenLogo";
import { EXPLORER, robinhood } from "@/lib/chain";
import { fmtAmount, fmtPct, short } from "@/lib/format";
import { MAX_METHOD_TAX_BPS, METHOD_BY_ID, METHODS, type MethodId } from "@/lib/methods";
import { BURN_ADDRESS, explainError, factoryAbi, PAIR_ASSETS, PONS, PONS_ERRORS, routerAbi } from "@/lib/pons";
import { makeSalt } from "@/lib/origin";
import { CHARITY_LAUNCHPAD, charityLaunchpadAbi, REMIT_VAULT, ZERO_ID, type Charity } from "@/lib/charity";
import { CharityPicker } from "@/components/CharityPicker";

type Socials = { twitter: string; telegram: string; discord: string; website: string; farcaster: string };
const EMPTY_SOCIALS: Socials = { twitter: "", telegram: "", discord: "", website: "", farcaster: "" };
const STEPS = ["Token", "Method", "Configure", "Review", "Launch"];
const FACTORY_ABI = [...factoryAbi, ...PONS_ERRORS];
const ROUTER_ABI = [...routerAbi, ...PONS_ERRORS];

export default function Wizard() {
  const router = useRouter();
  const params = useSearchParams();
  const { address, isConnected, chainId } = useAccount();
  const client = usePublicClient({ chainId: robinhood.id });
  const { data: wallet } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState("");
  const [socials, setSocials] = useState<Socials>(EMPTY_SOCIALS);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");

  const initial = params.get("method") as MethodId | null;
  const [method, setMethod] = useState<MethodId | null>(initial && METHOD_BY_ID[initial] ? initial : null);
  const [taxBps, setTaxBps] = useState(300);
  const [taxRecipient, setTaxRecipient] = useState("");
  const [charityMode, setCharityMode] = useState<"directory" | "wallet">("directory");
  const [charityPick, setCharityPick] = useState<Charity | null>(null);
  const [charityName, setCharityName] = useState("");
  const [charityWallet, setCharityWallet] = useState("");
  const charityShare = 10_000;
  const charityTax = 0;
  const [devBuy, setDevBuy] = useState("0");
  const [slippage, setSlippage] = useState(5);
  // Nermo uses the native ETH pair so launch + optional dev buy always
  // requires a single wallet transaction. ERC-20 pairs would require a prior approval.
  const pair = zeroAddress as Address;
  const [configId, setConfigId] = useState<bigint | null>(null);

  const [status, setStatus] = useState<"idle" | "signing" | "pending" | "done" | "error">("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [txErr, setTxErr] = useState("");
  const [touched, setTouched] = useState(false);

  /* ---------- protocol reads ---------- */
  const protocol = useQuery({
    queryKey: ["pons-protocol"],
    enabled: !!client,
    queryFn: async () => {
      const c = client!;
      const [enabled, minCharity] = await Promise.all([
        c.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "launchEnabled" }).catch(() => true),
        c.readContract({ address: CHARITY_LAUNCHPAD, abi: charityLaunchpadAbi, functionName: "minCharityBps" }).catch(() => 5000),
      ]);
      const [launchFee, maxTax, count, forwarder] = await Promise.all([
        c.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "launchFee" }),
        c.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "maxCreatorTaxBps" }),
        c.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "launchConfigCount" }),
        c.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "launchForwarder" }).catch(() => PONS.launchAndBuy),
      ]);
      const configs = await Promise.all(
        Array.from({ length: Number(count) }, (_, i) =>
          c.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "getLaunchConfig", args: [BigInt(i)] }).then((cfg) => ({ id: BigInt(i), ...cfg })),
        ),
      );
      return { launchFee, maxTax: Number(maxTax), enabled, minCharity: Number(minCharity), forwarder: forwarder as Address, configs: configs.filter((x) => x.enabled) };
    },
    staleTime: 60_000,
  });

  const gate = useQuery({
    queryKey: ["can-launch", address],
    enabled: !!client && !!address,
    queryFn: () => client!.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "canLaunch", args: [address!] }),
  });

  const isCharity = method === "charity";
  const allowedToLaunch = isCharity ? protocol.data?.enabled !== false : gate.data !== false;
  const minCharity = protocol.data?.minCharity ?? 5000;

  useEffect(() => {
    if (configId === null && protocol.data?.configs.length) setConfigId(protocol.data.configs[0].id);
  }, [protocol.data, configId]);

  const cfg = protocol.data?.configs.find((c) => c.id === configId);
  const pairAsset = PAIR_ASSETS[0];
  const taxCap = Math.min(MAX_METHOD_TAX_BPS, protocol.data?.maxTax ?? MAX_METHOD_TAX_BPS);

  /* ---------- economics ---------- */
  const economics = useMemo(() => {
    if (!cfg) return null;
    return { phantom: cfg.phantomQuote, threshold: cfg.graduationThreshold, supply: cfg.supply, feeBps: cfg.curveFeeBps, decimals: 18 };
  }, [cfg]);

  const devQuote = useMemo(() => {
    if (!devBuy || !economics || economics.phantom === 0n) return null;
    let quoteIn: bigint;
    try { quoteIn = parseUnits(devBuy, 18); } catch { return null; }
    if (quoteIn <= 0n) return null;
    const { phantom, threshold, supply, feeBps } = economics;
    const reserved = (supply * phantom) / (phantom + threshold);
    const sellable = supply - reserved;
    const creatorTaxForBuy = method === "creator-tax" ? taxBps : 0;
    const fee = (quoteIn * feeBps) / 10_000n;
    const creatorTax = (quoteIn * BigInt(creatorTaxForBuy)) / 10_000n;
    const net = quoteIn - fee - creatorTax;
    let tokensOut = (net * supply) / (phantom + net);
    const clamped = tokensOut > sellable;
    if (clamped) tokensOut = sellable;
    const minOut = (tokensOut * BigInt(10_000 - Math.round(slippage * 100))) / 10_000n;
    return { quoteIn, tokensOut, minOut, clamped, share: Number((tokensOut * 10_000n) / supply) / 100 };
  }, [economics, devBuy, slippage, method, taxBps]);

  /* ---------- validation ---------- */
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Add a token name.";
    else if (name.length > 32) e.name = "Keep the name to 32 characters.";
    if (!symbol.trim()) e.symbol = "Add a ticker.";
    else if (!/^[A-Z0-9]{1,10}$/.test(symbol)) e.symbol = "Use 1 to 10 capital letters or digits.";
    if (description.length > 500) e.description = "Keep the description under 500 characters.";
    if (logo && !/^(ipfs:\/\/|https:\/\/)/.test(logo)) e.logo = "Use an ipfs:// or https:// link.";
    if (method === "charity") {
      if (charityMode === "directory" && !charityPick) e.charityName = "Choose a charity from the directory.";
      if (charityMode === "wallet") {
        if (!charityName.trim()) e.charityName = "Name the charity.";
        if (!isAddress(charityWallet) || charityWallet === zeroAddress) e.charityWallet = "Enter the charity's own wallet address.";
        else if (address && charityWallet.toLowerCase() === address.toLowerCase()) e.charityWallet = "The charity wallet cannot be your own wallet.";
      }
      if (charityShare < minCharity) e.charityShare = "The configured charity share is below the Pons Charity minimum.";
    }
    if (method === "creator-tax") {
      if (taxBps < 0 || taxBps > taxCap) e.taxBps = `Choose between 0% and ${taxCap / 100}%.`;
      if (taxRecipient && !isAddress(taxRecipient)) e.taxRecipient = "Enter a valid address or leave blank to use your wallet.";
    }
    if (method === "auto-dev-burn" && !devQuote) e.devBuy = "Auto Dev Burn needs a developer buy. Enter an amount to burn.";
    if (devBuy.trim() && economics) {
      try {
        const q = parseUnits(devBuy, 18);
        if (q > 0n && !devQuote) e.devBuy = "Enter a valid developer buy amount.";
        if (q > 0n && method !== "charity" && protocol.data?.forwarder === zeroAddress) e.devBuy = "Pons V2 opening buys are temporarily unavailable.";
      } catch {
        e.devBuy = "Enter a valid developer buy amount or 0 to skip.";
      }
    }
    return e;
  }, [name, symbol, description, logo, method, charityMode, charityPick, charityName, charityWallet, charityShare, minCharity, taxBps, taxRecipient, devBuy, devQuote, economics, taxCap, address, protocol.data?.forwarder]);

  const stepValid = [
    !errors.name && !errors.symbol && !errors.description && !errors.logo,
    !!method,
    !Object.keys(errors).some((k) => ["charityName", "charityWallet", "charityShare", "charityTax", "charityPayout", "taxBps", "taxRecipient", "devBuy"].includes(k)),
    true,
    true,
  ];

  /* ---------- build params ---------- */
  function buildParams(expectedEconomics: `0x${string}`) {
    const me = address!;
    let recipient: Address = me;
    let creatorTaxBps = 0;
    let buybackEnabled = false;
    if (method === "buyback") buybackEnabled = true;
    if (method === "charity") {
      recipient = zeroAddress; // overwritten on-chain by the new CharityDistributor
      creatorTaxBps = 0;
    }
    if (method === "creator-tax") {
      recipient = (taxRecipient && isAddress(taxRecipient) ? taxRecipient : me) as Address;
      creatorTaxBps = taxBps;
    }
    return {
      name: name.trim(),
      symbol: symbol.trim(),
      logo: logo.trim(),
      description: description.trim(),
      socials: {
        twitter: socials.twitter.trim(),
        telegram: socials.telegram.trim(),
        discord: socials.discord.trim(),
        website: socials.website.trim(),
        farcaster: socials.farcaster.trim(),
      },
      creatorFeeRecipient: recipient,
      creatorTaxBps,
      buybackEnabled,
      expectedEconomics,
      salt: makeSalt(),
    };
  }

  function charityTerms() {
    const charity = (charityMode === "directory" ? REMIT_VAULT : charityWallet) as Address;
    const charityId = (charityMode === "directory" ? charityPick!.configId : ZERO_ID) as `0x${string}`;
    return { charity, charityId, creatorPayout: zeroAddress as Address, charityBps: charityShare };
  }

  const openingBuyRecipient = method === "auto-dev-burn" ? BURN_ADDRESS : address;
  /* The launcher is exempted from the Pons opening snipe tax automatically. Any other recipient,
     including the burn address, must be declared or the opening buy can be taxed and revert. */
  const openingBuyExemptions: Address[] = method === "auto-dev-burn" ? [BURN_ADDRESS] : [];
  const openingBuyRouter = protocol.data?.forwarder ?? PONS.launchAndBuy;

  const gas = useQuery({
    queryKey: ["launch-gas", step, method, address, configId?.toString(), pair, devQuote?.quoteIn.toString(), charityMode, charityPick?.configId, charityShare, charityTax],
    enabled: step === 3 && !!client && !!address && !!protocol.data && configId !== null && allowedToLaunch && (isCharity || gate.data === true),
    retry: false,
    queryFn: async () => {
      const c = client!;
      const eco = await c.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "previewLaunchEconomics", args: [configId!, pair] });
      const p = buildParams(eco);
      const gasPrice = await c.getGasPrice();
      const fee = protocol.data!.launchFee;
      let units: bigint;
      if (method === "charity") {
        const t = charityTerms();
        const buy = devQuote?.quoteIn ?? 0n;
        const value = fee + buy;
        units = buy > 0n
          ? await c.estimateContractGas({ account: address!, address: CHARITY_LAUNCHPAD, abi: charityLaunchpadAbi, functionName: "launchWithBuy", args: [p, configId!, pair, t, { quoteIn: buy, minTokensOut: devQuote?.minOut ?? 0n }, address ? [address] : []], value })
          : await c.estimateContractGas({ account: address!, address: CHARITY_LAUNCHPAD, abi: charityLaunchpadAbi, functionName: "launch", args: [p, configId!, pair, t.charity, t.charityId, t.creatorPayout, t.charityBps], value });
      } else if (devQuote) {
        units = await c.estimateContractGas({
          account: address!, address: openingBuyRouter, abi: ROUTER_ABI, functionName: "launchAndBuy",
          args: [p, configId!, pair, devQuote.quoteIn, devQuote.minOut, openingBuyRecipient!, openingBuyExemptions],
          value: fee + devQuote.quoteIn,
        });
      } else {
        units = await c.estimateContractGas({
          account: address!, address: PONS.factory, abi: FACTORY_ABI, functionName: "launchToken",
          args: [p, configId!, pair], value: fee,
        });
      }
      return units * gasPrice;
    },
  });

  /* ---------- launch ---------- */
  async function launch() {
    if (!client || !wallet || !address || configId === null || !protocol.data) return;
    setTxErr("");
    try {
      if (chainId !== robinhood.id) await switchChainAsync({ chainId: robinhood.id });
      if (method === "charity") {
        const open = await client.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "launchEnabled" });
        if (!open) throw new Error("Pons has public launches switched off right now. Try again once they reopen.");
      } else {
        const allowed = await client.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "canLaunch", args: [address] });
        if (!allowed) throw new Error("Pons V2 launches are currently whitelist-only, and this wallet is not on the list.");
      }
      const [eco, fee] = await Promise.all([
        client.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "previewLaunchEconomics", args: [configId, pair] }),
        client.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "launchFee" }),
      ]);
      const p = buildParams(eco);
      let hash: `0x${string}`;

      if (method === "charity") {
        const t = charityTerms();
        const buy = devQuote?.quoteIn ?? 0n;
        setStatus("signing");
        const value = fee + buy;
        if (buy > 0n) {
          const { request } = await client.simulateContract({
            account: address, address: CHARITY_LAUNCHPAD, abi: charityLaunchpadAbi, functionName: "launchWithBuy",
            args: [p, configId, pair, t, { quoteIn: buy, minTokensOut: devQuote?.minOut ?? 0n }, address ? [address] : []], value,
          });
          hash = await wallet.writeContract({ ...request, chain: robinhood });
        } else {
          const { request } = await client.simulateContract({
            account: address, address: CHARITY_LAUNCHPAD, abi: charityLaunchpadAbi, functionName: "launch",
            args: [p, configId, pair, t.charity, t.charityId, t.creatorPayout, t.charityBps], value,
          });
          hash = await wallet.writeContract({ ...request, chain: robinhood });
        }
      } else if (devQuote) {
        if (openingBuyRouter === zeroAddress) throw new Error("Pons V2 opening buys are temporarily unavailable.");
        setStatus("signing");
        const { request } = await client.simulateContract({
          account: address, address: openingBuyRouter, abi: ROUTER_ABI, functionName: "launchAndBuy",
          args: [p, configId, pair, devQuote.quoteIn, devQuote.minOut, openingBuyRecipient!, openingBuyExemptions],
          value: fee + devQuote.quoteIn,
        });
        hash = await wallet.writeContract({ ...request, chain: robinhood });
      } else {
        setStatus("signing");
        const { request } = await client.simulateContract({
          account: address, address: PONS.factory, abi: FACTORY_ABI, functionName: "launchToken",
          args: [p, configId, pair], value: fee,
        });
        hash = await wallet.writeContract({ ...request, chain: robinhood });
      }
      setTxHash(hash);
      setStatus("pending");
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The launch transaction reverted.");
      let token: Address | undefined;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== PONS.factory.toLowerCase()) continue;
        try {
          const ev = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
          if (ev.eventName === "TokenLaunched") token = ev.args.token;
        } catch {}
      }
      setStatus("done");
      if (token) router.push(`/token/${token}?launched=1`);
    } catch (e) {
      setStatus("error");
      setTxErr(explainError(e));
    }
  }

  async function upload(file: File) {
    setUploading(true);
    setUploadErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setLogo(json.uri || json.url || "");
    } catch (e) {
      setUploadErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const next = () => {
    setTouched(true);
    if (stepValid[step]) { setTouched(false); setStep((s) => Math.min(3, s + 1)); }
  };
  const err = (k: string) => touched && errors[k] ? <span className="err-text">{errors[k]}</span> : null;
  const m = method ? METHOD_BY_ID[method] : null;
  const effectiveTax = method === "charity" ? charityTax : method === "creator-tax" ? taxBps : 0;
  const charityLabel = charityMode === "directory" ? charityPick?.name ?? "" : charityName;

  /* ---------- render ---------- */
  return (
    <section className="wrap section">
      <div className="between" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Launch</div>
          <h1 className="h2" style={{ marginTop: 10 }}>Launch your token, your way.</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>Choose a method. Set your parameters. Launch with purpose.</p>
        </div>
        <ol className="steps" style={{ listStyle: "none", padding: 0, margin: 0 }} aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className={`step${i === step ? " on" : ""}${i < step ? " done" : ""}`}><i>{i < step ? "✓" : i + 1}</i>{s}</li>
          ))}
        </ol>
      </div>

      {protocol.data?.enabled === false && (
        <div className="notice warn" style={{ marginTop: 20 }}>Pons has public launches switched off right now, so every launch will be rejected until they reopen.</div>
      )}
      {isConnected && !isCharity && gate.data === false && protocol.data?.enabled !== false && (
        <div className="notice warn" style={{ marginTop: 20 }}>
          Pons V2 is in whitelist-only mode, and {short(address)} is not whitelisted. You can prepare your launch, but the factory will reject it until Pons opens public launches or whitelists this wallet.
        </div>
      )}
      {protocol.error && <div className="notice bad" style={{ marginTop: 20 }}>Could not read Pons V2 on Robinhood Chain. Check the RPC setting and reload.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 20, marginTop: 24 }} className="launch-grid">
        <div className="glass panel">
          {step === 0 && (
            <div className="grid" style={{ gap: 18 }}>
              <h2 className="h3">Create your token</h2>
              <div className="grid g-2">
                <div className="field">
                  <label className="label" htmlFor="name">Token name</label>
                  <input id="name" className={`input${touched && errors.name ? " err" : ""}`} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Water" />
                  {err("name")}
                </div>
                <div className="field">
                  <label className="label" htmlFor="symbol">Ticker</label>
                  <div className="input-affix">
                    <input id="symbol" className={`input${touched && errors.symbol ? " err" : ""}`} value={symbol} maxLength={10} onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="WATER" style={{ paddingLeft: 26 }} />
                    <span className="affix" style={{ left: 14, right: "auto" }}>$</span>
                  </div>
                  {err("symbol")}
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="desc">Description</label>
                <textarea id="desc" className="textarea" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="What is this token about?" />
                <span className="hint">{description.length}/500</span>
                {err("description")}
              </div>
              <div className="field">
                <span className="label">Image</span>
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <TokenLogo logo={logo} symbol={symbol || "N"} large />
                  <div style={{ flex: 1 }} className="grid">
                    <label className={`btn btn-sm${uploading ? " disabled" : ""}`} style={{ width: "fit-content" }}>
                      {uploading ? "Uploading image…" : logo ? "Replace image" : "Choose image"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        hidden
                        disabled={uploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) upload(file);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {logo && !uploading && <span className="small" style={{ color: "var(--green-deep)" }}>✓ Image uploaded and ready</span>}
                    {uploadErr && <span className="err-text">{uploadErr}</span>}
                    <span className="hint">PNG, JPG, GIF or WEBP · maximum 4 MB.</span>
                    {err("logo")}
                  </div>
                </div>
              </div>
              <div className="grid g-2">
                {(Object.keys(EMPTY_SOCIALS) as (keyof Socials)[]).map((k) => (
                  <div className="field" key={k}>
                    <label className="label" htmlFor={k} style={{ textTransform: "capitalize" }}>{k === "twitter" ? "X" : k}</label>
                    <input id={k} className="input" value={socials[k]} onChange={(e) => setSocials({ ...socials, [k]: e.target.value })} placeholder={k === "twitter" ? "https://x.com/…" : k === "telegram" ? "https://t.me/…" : "https://…"} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid" style={{ gap: 16 }}>
              <h2 className="h3">Choose your Method</h2>
              <p className="muted small" style={{ margin: 0 }}>This becomes part of your token&apos;s identity and cannot change after launch.</p>
              <div className="grid" style={{ gap: 12 }} role="radiogroup" aria-label="Launch method">
                {METHODS.map((x) => (
                  <button key={x.id} role="radio" aria-checked={method === x.id} className={`glass method-card${method === x.id ? " selected" : ""}`} onClick={() => setMethod(x.id)}>
                    <span className="orb"><MethodIcon id={x.id} /></span>
                    <span style={{ flex: 1 }}>
                      <div className="name">{x.name}</div>
                      <div className="muted small">{x.card}</div>
                    </span>
                    {method === x.id && <span className="chip">Selected</span>}
                  </button>
                ))}
              </div>
              {touched && !method && <span className="err-text">Choose a Method to continue.</span>}
            </div>
          )}

          {step === 2 && m && (
            <div className="grid" style={{ gap: 18 }}>
              <div className="row"><span className="orb"><MethodIcon id={m.id} /></span><div><h2 className="h3">Configure {m.name}</h2><div className="muted small">{m.line}</div></div></div>

              {method === "zero-tax" && (
                <div className="notice info">Creator tax is fixed at 0%. The standard Pons V2 trading fee still applies.</div>
              )}

              {method === "buyback" && (
                <div className="notice info">
                  Buyback &amp; Lock starts enabled. Pons V2 uses part of the creator-side fee share to buy the launched token back and lock it in the Buyback Vault.
                </div>
              )}

              {method === "charity" && (
                <>
                  <div className="glass tabs" role="tablist" style={{ width: "fit-content" }}>
                    <button className={charityMode === "directory" ? "on" : ""} onClick={() => setCharityMode("directory")}>Charity directory</button>
                    <button className={charityMode === "wallet" ? "on" : ""} onClick={() => setCharityMode("wallet")}>Charity&apos;s own wallet</button>
                  </div>
                  {charityMode === "directory" ? (
                    <div className="field">
                      <span className="label">Charity</span>
                      <CharityPicker value={charityPick} onChange={setCharityPick} />
                      <span className="hint">Choose a listed charity. Its creator-side fee allocation is routed through the Pons Charity contracts.</span>
                      {err("charityName")}
                    </div>
                  ) : (
                    <>
                      <div className="field">
                        <label className="label" htmlFor="cn">Charity name</label>
                        <input id="cn" className={`input${touched && errors.charityName ? " err" : ""}`} value={charityName} maxLength={48} onChange={(e) => setCharityName(e.target.value)} placeholder="Water Foundation" />
                        {err("charityName")}
                      </div>
                      <div className="field">
                        <label className="label" htmlFor="cw">Charity wallet</label>
                        <input id="cw" className={`input mono${touched && errors.charityWallet ? " err" : ""}`} value={charityWallet} onChange={(e) => setCharityWallet(e.target.value.trim())} placeholder="0x…" />
                        <span className="hint">Use the charity&apos;s own published wallet address.</span>
                        {err("charityWallet")}
                      </div>
                    </>
                  )}
                  <div className="notice info">100% of the creator-side fee allocation is routed to the selected charity. Creator tax is 0%.</div>
                </>
              )}

              {method === "creator-tax" && (
                <>
                  <div className="field">
                    <label className="label" htmlFor="tx">Creator tax: {fmtPct(taxBps)}</label>
                    <input id="tx" type="range" min={0} max={taxCap} step={25} value={taxBps} onChange={(e) => setTaxBps(Number(e.target.value))} />
                    <div className="between tiny faint"><span>0%</span><span>Maximum {taxCap / 100}%</span></div>
                    {err("taxBps")}
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="tr">Creator tax recipient</label>
                    <input id="tr" className={`input mono${touched && errors.taxRecipient ? " err" : ""}`} value={taxRecipient} onChange={(e) => setTaxRecipient(e.target.value.trim())} placeholder={address ?? "Your wallet"} />
                    <span className="hint">Leave blank to use your connected wallet.</span>
                    {err("taxRecipient")}
                  </div>
                </>
              )}

              {method === "auto-dev-burn" && (
                <div className="notice warn" style={{ display: "block" }}>
                  Every token your developer buy purchases is sent straight to the dead address <span className="mono" style={{ wordBreak: "break-all" }}>{BURN_ADDRESS}</span>. The tokens never reach your wallet and can never be recovered.
                </div>
              )}

              <div className="glass card" style={{ display: "grid", gap: 14 }}>
                <div>
                  <div className="label">Developer buy at launch</div>
                  <div className="small muted">{method === "auto-dev-burn" ? "Required for Auto Dev Burn. This is the amount of ETH whose tokens will be burned." : "Optional for every Method. Leave it at 0 to launch without an opening buy."}</div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="dev">Developer buy</label>
                  <div className="input-affix">
                    <input id="dev" className={`input${touched && errors.devBuy ? " err" : ""}`} inputMode="decimal" placeholder="0.00" value={devBuy} onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ""))} />
                    <span className="affix">ETH</span>
                  </div>
                  <span className="hint">Token creation and the opening buy settle atomically in the same transaction, so there is no tradable gap between them.</span>
                  {err("devBuy")}
                </div>
                {devQuote && (
                  <div className="kv">
                    <div><div className="k">Expected tokens</div><div className="v mono">{fmtAmount(devQuote.tokensOut)}</div></div>
                    <div><div className="k">Share of supply</div><div className="v mono">{devQuote.share.toFixed(2)}%</div></div>
                    <div><div className="k">Destination</div><div className="v mono">{method === "auto-dev-burn" ? short(BURN_ADDRESS) : short(address) || "Connect wallet"}</div></div>
                    <div><div className="k">Execution</div><div className="v">Same launch transaction</div></div>
                  </div>
                )}
                <div className="field">
                  <label className="label" htmlFor="slip">Opening-buy slippage: {slippage}%</label>
                  <input id="slip" type="range" min={1} max={20} step={1} value={slippage} onChange={(e) => setSlippage(Number(e.target.value))} />
                </div>
                {devQuote?.clamped && <div className="notice warn">This amount reaches the curve&apos;s sellable limit. Any unused ETH is refunded inside the same transaction.</div>}
              </div>


              <details>
                <summary className="small muted" style={{ cursor: "pointer" }}>Advanced: launch configuration</summary>
                <div className="grid g-2" style={{ marginTop: 14 }}>
                  <div className="field">
                    <span className="label">Pair asset</span>
                    <div className="input mono" style={{ display: "flex", alignItems: "center" }}>ETH</div>
                    <span className="hint">Fixed to native ETH to preserve the one-transaction launch flow.</span>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="cfg">Launch configuration</label>
                    <select id="cfg" className="select" value={configId?.toString() ?? ""} onChange={(e) => setConfigId(BigInt(e.target.value))}>
                      {protocol.data?.configs.map((c) => <option key={c.id.toString()} value={c.id.toString()}>Config {c.id.toString()} · {fmtPct(Number(c.curveFeeBps))} curve fee</option>)}
                    </select>
                  </div>
                </div>
              </details>
            </div>
          )}

          {step === 3 && m && (
            <div className="grid" style={{ gap: 18 }}>
              <h2 className="h3">Review launch</h2>
              <dl className="review">
                <dt>Token</dt><dd>{name} (${symbol})</dd>
                <dt>Method</dt><dd><MethodBadge id={m.id} /></dd>
                <dt>Wallet</dt><dd className="mono">{address ?? "Not connected"}</dd>
                <dt>Pair asset</dt><dd>{pairAsset.symbol}</dd>
                <dt>Creator tax</dt><dd>{fmtPct(effectiveTax)}</dd>
                {method === "charity" ? (
                  <>
                    <dt>Charity</dt><dd>{charityLabel}{charityMode === "wallet" ? ` · ${short(charityWallet)}` : " · via Donate.gg"}</dd>
                    <dt>Charity share</dt><dd>100% of creator-side fee allocation</dd>
                    <dt>Fee routing</dt><dd>Selected charity</dd>
                  </>
                ) : (
                  <><dt>Fee recipient</dt><dd className="mono">{method === "creator-tax" && taxRecipient ? taxRecipient : address ?? ""}</dd></>
                )}
                <dt>Buyback &amp; Lock</dt><dd>{method === "buyback" ? "Enabled" : "Off"}</dd>
                <dt>Developer buy</dt><dd>{devQuote ? `${devBuy} ETH for about ${fmtAmount(devQuote.tokensOut)} ${symbol}${method === "auto-dev-burn" ? `, sent directly to ${short(BURN_ADDRESS)}` : ""}` : "None"}</dd>
                <dt>Execution</dt><dd>One wallet transaction</dd>
                <dt>Curve fee</dt><dd>{cfg ? fmtPct(Number(cfg.curveFeeBps)) : "…"} standard Pons fee</dd>
                <dt>Graduates at</dt><dd>{economics ? `${Number(formatUnits(economics.threshold, economics.decimals)).toLocaleString("en-GB")} ETH raised` : "…"}</dd>
                <dt>Launch fee</dt><dd>{protocol.data ? `${formatUnits(protocol.data.launchFee, 18)} ETH` : "…"}</dd>
                <dt>Estimated gas</dt><dd>{gas.data !== undefined ? `${fmtAmount(gas.data, 18, 6)} ETH` : gas.isLoading ? "Estimating…" : gas.error ? explainError(gas.error) : "Connect to estimate"}</dd>
                <dt>Total from wallet</dt><dd>{protocol.data ? `${formatUnits(protocol.data.launchFee + (devQuote?.quoteIn ?? 0n), 18)} ETH plus gas` : "…"}</dd>
              </dl>
              {method === "charity" && <p className="tiny faint" style={{ margin: 0 }}>Launched through the Pons Charity launchpad {short(CHARITY_LAUNCHPAD)}. Donations for this token also appear on ponscharity.family.</p>}
              {!isConnected ? (
                <ConnectButton block />
              ) : (
                <button className="btn btn-lg btn-primary btn-block" disabled={status === "signing" || status === "pending" || !allowedToLaunch} onClick={launch}>
                  {status === "signing" ? "Confirm one transaction in your wallet…" : status === "pending" ? "Launching…" : "Launch Token →"}
                </button>
              )}
              {txHash && <a className="small" href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: "var(--green-deep)" }}>View transaction on Blockscout</a>}
              {txErr && <div className="notice bad">{txErr}</div>}
            </div>
          )}

          {step < 3 && (
            <div className="between" style={{ marginTop: 26 }}>
              <button className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</button>
              <button className="btn btn-primary" onClick={next}>Continue →</button>
            </div>
          )}
          {step === 3 && status !== "pending" && (
            <button className="btn" style={{ marginTop: 16 }} onClick={() => setStep(2)}>Back</button>
          )}
        </div>

        <aside className="stack">
          <div className="eyebrow">Token card preview</div>
          <div className="glass token-card">
            <div className="row">
              <TokenLogo logo={logo} symbol={symbol || "N"} />
              <div style={{ minWidth: 0 }}>
                <div className="h3">{name || "Token name"}</div>
                <div className="small faint">${symbol || "TICKER"}</div>
              </div>
            </div>
            {m ? <div className="row" style={{ gap: 6, flexWrap: "wrap" }}><MethodBadge id={m.id} />{effectiveTax > 0 && <span className="chip neutral">Tax {effectiveTax / 100}%</span>}</div> : <span className="chip neutral">Method not chosen</span>}
            <p className="small muted" style={{ margin: 0 }}>{description || "Your description appears here."}</p>
            <div className="progress"><span style={{ width: "2%" }} /></div>
          </div>
          {m && (
            <div className="glass card">
              <div className="eyebrow" style={{ marginBottom: 10 }}>What holders see</div>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{m.mechanics.map((x) => <li key={x} style={{ marginBottom: 6 }}>{x}</li>)}</ul>
            </div>
          )}
        </aside>
      </div>
      <style>{`@media (max-width: 960px){ .launch-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
