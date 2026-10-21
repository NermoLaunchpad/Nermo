import "server-only";
import { decodeEventLog, getAddress, isAddress, parseAbiItem, zeroAddress, type Address, type Hex } from "viem";
import { serverClient } from "./chain";
import { classify, parseTag, type MethodId } from "./methods";
import { curveAbi, factoryAbi, PONS, tokenAbi } from "./pons";
import { CHARITY_LAUNCHPAD, charityLaunchpadAbi } from "./charity";
import { launchedOnSite } from "./origin";

export type LaunchRow = {
  /** True when the launch transaction carries the Nermo salt marker. */
  viaSite: boolean;
  token: Address;
  curve: Address;
  deployer: Address;
  creatorFeeRecipient: Address;
  pairToken: Address;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  socials: { twitter: string; telegram: string; discord: string; website: string; farcaster: string };
  creatorTaxBps: number;
  buybackEnabled: boolean;
  phase: number;
  graduationThreshold: string;
  raised: string;
  quoteReserve: string;
  tokenReserve: string;
  blockNumber: string;
  txHash: Hex;
  timestamp: number;
  viaRouter: boolean;
  method: MethodId;
  source: "onchain";
  intact: boolean;
};

type RawLaunch = {
  token: Address;
  curve: Address;
  deployer: Address;
  pairToken: Address;
  blockNumber: bigint;
  txHash: Hex;
  threshold: bigint;
  launchedAt?: number;
  hint?: { name?: string; symbol?: string; logo?: string };
};

const TOKEN_LAUNCHED = "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";
const ROUTER_LAUNCHED = "0xdcacba5e347ae7abd91cb519eb877af8fa7774e347b85dd3ddcd24a2ba8cdf37";
const BLOCKSCOUT = process.env.BLOCKSCOUT_URL || "https://robinhoodchain.blockscout.com";

// Fast public discovery feed. Every candidate is verified against the Pons V2
// factory before it is returned, so this is only a discovery accelerator and
// never the trust root. Override it with PONS_FEED_URL if desired.
const PONS_FEEDS = [
  process.env.PONS_FEED_URL || "https://www.ponsvolumebot.com/api/v1/launches",
  "https://www.ponsvolumebot.net/api/v1/launches",
];

const LAUNCH_EVENT = parseAbiItem("event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)");
const ROUTER_EVENT = parseAbiItem("event Launched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)");

let cache: { at: number; rows: LaunchRow[]; source: string; requested: number } | null = null;
let inFlight: Promise<{ rows: LaunchRow[]; source: string }> | null = null;
let inFlightLimit = 0;
const TTL = Number(process.env.LAUNCH_CACHE_MS || 60_000);

type BsLog = {
  data: Hex;
  topics: (Hex | null)[];
  block_number?: number;
  transaction_hash?: Hex;
  blockNumber?: string;
  transactionHash?: Hex;
  timeStamp?: string;
};

type PonsFeedItem = {
  token?: string;
  name?: string;
  symbol?: string;
  logo?: string;
  block?: number | string;
  blockNumber?: number | string;
  at?: number | string;
  timestamp?: number | string;
  txHash?: Hex;
  transactionHash?: Hex;
};

function parseFeedTime(v: number | string | undefined) {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "number") return v > 10_000_000_000 ? Math.floor(v / 1000) : Math.floor(v);
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return n > 10_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
  }
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

/**
 * Fetch the newest Pons launch addresses from a lightweight public feed.
 * We then verify every address with factory.getLaunchedToken(), so a bad or
 * stale feed cannot make a non-Pons token appear in the UI.
 */
async function fromPonsFeed(limit: number) {
  const want = Math.min(Math.max(limit, 1), 60);
  let lastError: unknown;
  for (const base of [...new Set(PONS_FEEDS)]) {
    try {
      const url = `${base}${base.includes("?") ? "&" : "?"}limit=${want}`;
      const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
      if (!res.ok) throw new Error(`Pons feed ${res.status}`);
      const json = (await res.json()) as { items?: PonsFeedItem[]; launches?: PonsFeedItem[] } | PonsFeedItem[];
      const items = Array.isArray(json) ? json : Array.isArray(json.items) ? json.items : Array.isArray(json.launches) ? json.launches : [];
      const launches: RawLaunch[] = [];
      for (const item of items) {
        if (!item.token || !isAddress(item.token)) continue;
        let blockNumber = 0n;
        try { blockNumber = BigInt(item.blockNumber ?? item.block ?? 0); } catch {}
        launches.push({
          token: getAddress(item.token),
          curve: zeroAddress,
          deployer: zeroAddress,
          pairToken: zeroAddress,
          blockNumber,
          txHash: (item.transactionHash ?? item.txHash ?? "0x") as Hex,
          threshold: 0n,
          launchedAt: parseFeedTime(item.at ?? item.timestamp),
          hint: { name: item.name, symbol: item.symbol, logo: item.logo },
        });
      }
      if (launches.length) return { launches, routed: new Set<string>() };
      throw new Error("Pons feed returned no launches");
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Pons launch feed unavailable");
}

/**
 * Use Blockscout's Etherscan-compatible log endpoint first. It supports topic
 * filtering, so we fetch only launch events instead of paging through every
 * log emitted by the contracts. This avoids the expensive eth_getLogs scan
 * that was hitting Robinhood's public RPC rate limit.
 */
async function blockscoutEventLogs(address: string, topic0: string, limit: number): Promise<BsLog[]> {
  const q = new URLSearchParams({
    module: "logs",
    action: "getLogs",
    address,
    fromBlock: "0",
    toBlock: "latest",
    topic0,
    page: "1",
    offset: String(Math.min(Math.max(limit, 50), 1000)),
  });
  const res = await fetch(`${BLOCKSCOUT}/api?${q}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Blockscout ${res.status}`);
  const json = (await res.json()) as { status?: string; message?: string; result?: BsLog[] | string };
  if (!Array.isArray(json.result)) throw new Error(typeof json.result === "string" ? json.result : json.message || "Blockscout log query failed");
  return json.result;
}

/** Backup Blockscout v2 endpoint. Still no chain RPC scan. */
async function blockscoutV2Logs(address: string, topic0: string, maxPages: number) {
  const out: BsLog[] = [];
  let params = "";
  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(`${BLOCKSCOUT}/api/v2/addresses/${address}/logs${params}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Blockscout ${res.status}`);
    const json = (await res.json()) as { items: BsLog[]; next_page_params: Record<string, string | number> | null };
    for (const l of json.items) if (l.topics?.[0]?.toLowerCase() === topic0) out.push(l);
    if (!json.next_page_params) break;
    params = "?" + new URLSearchParams(Object.entries(json.next_page_params).map(([k, v]) => [k, String(v)])).toString();
  }
  return out;
}

function bsBlockNumber(l: BsLog) {
  return BigInt(l.blockNumber ?? l.block_number ?? 0);
}
function bsTxHash(l: BsLog) {
  return (l.transactionHash ?? l.transaction_hash ?? "0x") as Hex;
}
function bsTimestamp(l: BsLog) {
  if (!l.timeStamp) return undefined;
  try { return Number(BigInt(l.timeStamp)); } catch { return undefined; }
}

function decodeLaunch(l: { data: Hex; topics: (Hex | null)[]; blockNumber: bigint; txHash: Hex; launchedAt?: number }): RawLaunch | null {
  try {
    const ev = decodeEventLog({
      abi: factoryAbi,
      eventName: "TokenLaunched",
      data: l.data,
      topics: l.topics.filter(Boolean) as [Hex, ...Hex[]],
    });
    return {
      token: getAddress(ev.args.token),
      curve: getAddress(ev.args.curve),
      deployer: getAddress(ev.args.deployer),
      pairToken: getAddress(ev.args.pairToken),
      threshold: ev.args.graduationThreshold,
      blockNumber: l.blockNumber,
      txHash: l.txHash,
      launchedAt: l.launchedAt,
    };
  } catch {
    return null;
  }
}

async function fromBlockscout(limit: number) {
  let launchLogs: BsLog[];
  let routerLogs: BsLog[];
  try {
    [launchLogs, routerLogs] = await Promise.all([
      blockscoutEventLogs(PONS.factory, TOKEN_LAUNCHED, Math.max(limit * 2, 100)),
      blockscoutEventLogs(PONS.launchAndBuy, ROUTER_LAUNCHED, Math.max(limit * 2, 100)).catch(() => [] as BsLog[]),
    ]);
  } catch {
    const pages = Math.ceil(limit / 50) + 2;
    [launchLogs, routerLogs] = await Promise.all([
      blockscoutV2Logs(PONS.factory, TOKEN_LAUNCHED, pages),
      blockscoutV2Logs(PONS.launchAndBuy, ROUTER_LAUNCHED, pages).catch(() => [] as BsLog[]),
    ]);
  }

  const launches = launchLogs
    .map((l) => decodeLaunch({
      data: l.data,
      topics: l.topics,
      blockNumber: bsBlockNumber(l),
      txHash: bsTxHash(l),
      launchedAt: bsTimestamp(l),
    }))
    .filter((x): x is RawLaunch => !!x)
    .sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1));
  const routed = new Set(routerLogs.map((l) => bsTxHash(l).toLowerCase()));
  return { launches, routed };
}

/**
 * Optional emergency fallback. Disabled by default because the public RPC has
 * a tight eth_getLogs rate limit. Set ALLOW_RPC_INDEXER_FALLBACK=true only
 * when RPC_URL points to a dedicated provider.
 */
async function fromRpc(limit: number) {
  const client = serverClient();
  const latest = await client.getBlockNumber();
  const window = BigInt(process.env.LOG_WINDOW || 1_999);
  const maxWindows = Number(process.env.LOG_MAX_WINDOWS || 20);
  const launches: RawLaunch[] = [];
  const routed = new Set<string>();
  let to = latest;
  for (let i = 0; i < maxWindows && launches.length < limit && to > 0n; i++) {
    const from = to > window ? to - window : 0n;
    const [logs, rlogs] = await Promise.all([
      client.getLogs({ address: PONS.factory, event: LAUNCH_EVENT, fromBlock: from, toBlock: to }),
      client.getLogs({ address: PONS.launchAndBuy, event: ROUTER_EVENT, fromBlock: from, toBlock: to }),
    ]);
    for (const l of rlogs) routed.add(l.transactionHash!.toLowerCase());
    for (const l of logs.reverse()) {
      const d = decodeLaunch({ data: l.data, topics: l.topics as Hex[], blockNumber: l.blockNumber!, txHash: l.transactionHash! });
      if (d) launches.push(d);
    }
    if (from === 0n) break;
    to = from - 1n;
  }
  return { launches, routed };
}

/** Pons Charity keeps an on-chain register, so its launches never depend on log history. */
async function charityRegistry(limit: number) {
  const client = serverClient();
  try {
    const total = await client.readContract({ address: CHARITY_LAUNCHPAD, abi: charityLaunchpadAbi, functionName: "count" });
    const want = total < BigInt(limit) ? total : BigInt(limit);
    const pages: Promise<readonly { token: Address; curve: Address; distributor: Address; creator: Address; pairToken: Address; launchedAt: bigint }[]>[] = [];
    for (let o = 0n; o < want; o += 50n) pages.push(client.readContract({ address: CHARITY_LAUNCHPAD, abi: charityLaunchpadAbi, functionName: "page", args: [o, 50n] }));
    return (await Promise.all(pages)).flat();
  } catch {
    return [];
  }
}

/** A launch's origin never changes, so it is looked up once per token and kept. */
const originCache = new Map<string, boolean>();
async function originOf(client: ReturnType<typeof serverClient>, token: string, txHash: Hex, legacyTag: boolean) {
  const key = token.toLowerCase();
  if (legacyTag) return true;
  if (originCache.has(key)) return originCache.get(key)!;
  if (!txHash || txHash === "0x") return false;
  const tx = await client.getTransaction({ hash: txHash }).catch(() => null);
  if (!tx) return false;
  const site = launchedOnSite(tx.input);
  originCache.set(key, site);
  if (originCache.size > 20_000) originCache.clear();
  return site;
}

async function enrich(raw: RawLaunch[], routed: Set<string>, charity: Map<string, Address>): Promise<LaunchRow[]> {
  const client = serverClient();

  // First verify every discovered token against the actual Pons V2 factory.
  // This lets us use fast external discovery without trusting it for identity.
  const rows = await Promise.all(
    raw.map(async (r) => {
      const rec = await client
        .readContract({ address: PONS.factory, abi: factoryAbi, functionName: "getLaunchedToken", args: [r.token] })
        .catch(() => null);
      if (!rec?.exists || rec.token.toLowerCase() !== r.token.toLowerCase()) return null;

      const curve = getAddress(rec.curve);
      const needName = !r.hint?.name;
      const needSymbol = !r.hint?.symbol;
      const [nameRead, symbolRead, info, reserves, real] = await Promise.all([
        needName ? client.readContract({ address: r.token, abi: tokenAbi, functionName: "name" }).catch(() => "Unknown") : Promise.resolve(r.hint!.name!),
        needSymbol ? client.readContract({ address: r.token, abi: tokenAbi, functionName: "symbol" }).catch(() => "???") : Promise.resolve(r.hint!.symbol!),
        client.readContract({ address: r.token, abi: tokenAbi, functionName: "getTokenInfo" }).catch(() => null),
        client.readContract({ address: curve, abi: curveAbi, functionName: "getReserves" }).catch(() => [0n, 0n] as const),
        client.readContract({ address: curve, abi: curveAbi, functionName: "realQuoteReserve" }).catch(() => 0n),
      ]);
      // Auto Dev Burn is recognised from the launch itself: a launch-and-buy whose opening buy
      // was delivered to the dead address.
      let devBuyRecipient: Address | undefined;
      if (routed.has(r.txHash.toLowerCase())) {
        const receipt = await client.getTransactionReceipt({ hash: r.txHash }).catch(() => null);
        for (const log of receipt?.logs ?? []) {
          if (log.address.toLowerCase() !== curve.toLowerCase()) continue;
          try {
            const ev = decodeEventLog({ abi: curveAbi, data: log.data, topics: log.topics });
            if (ev.eventName === "CurveBuy") { devBuyRecipient = ev.args.recipient; break; }
          } catch {}
        }
      }
      const legacyTag = /\[pons-method:1\|/.test(info?.[2] ?? "");
      const viaSite = await originOf(client, r.token, r.txHash, legacyTag);
      return { r, rec, curve, name: nameRead, symbol: symbolRead, info, reserves, real, devBuyRecipient, viaSite };
    }),
  );

  return rows.filter((x): x is NonNullable<typeof x> => !!x).map(({ r, rec, curve, name, symbol, info, reserves, real, devBuyRecipient, viaSite }) => {
    // Strip a legacy tag from early test launches; new launches never write one.
    const { body } = parseTag(info?.[2] ?? "");
    const viaRouter = routed.has(r.txHash.toLowerCase());
    const cls = classify(
      {
        creatorTaxBps: Number(rec.creatorTaxBps),
        buybackEnabled: rec.buybackEnabled,
        creatorFeeRecipient: rec.creatorFeeRecipient,
        deployer: rec.deployer,
        viaRouter,
        charityDistributor: charity.get(r.token.toLowerCase()),
        devBuyRecipient,
      },
    );
    const graduatedRaise = rec.phase >= 1 ? rec.graduationThreshold : real;
    const social = info?.[3];
    return {
      viaSite,
      token: r.token,
      curve,
      deployer: getAddress(rec.deployer),
      creatorFeeRecipient: getAddress(rec.creatorFeeRecipient),
      pairToken: getAddress(rec.pairToken),
      name: name || r.hint?.name || "Unknown",
      symbol: symbol || r.hint?.symbol || "???",
      logo: info?.[1] || r.hint?.logo || "",
      description: body,
      socials: {
        twitter: social?.twitter ?? "",
        telegram: social?.telegram ?? "",
        discord: social?.discord ?? "",
        website: social?.website ?? "",
        farcaster: social?.farcaster ?? "",
      },
      creatorTaxBps: Number(rec.creatorTaxBps),
      buybackEnabled: rec.buybackEnabled,
      phase: Number(rec.phase),
      graduationThreshold: (r.threshold || rec.graduationThreshold).toString(),
      raised: graduatedRaise.toString(),
      quoteReserve: reserves[0].toString(),
      tokenReserve: reserves[1].toString(),
      blockNumber: r.blockNumber.toString(),
      txHash: r.txHash,
      timestamp: r.launchedAt ?? Number(rec.sweptAt || 0n),
      viaRouter,
      method: cls.method,
      source: cls.source,
      intact: cls.checks.every((c) => c.ok),
    } satisfies LaunchRow;
  });
}

async function refreshLaunches(limit: number): Promise<{ rows: LaunchRow[]; source: string }> {
  const merged = new Map<string, RawLaunch>();
  const routed = new Set<string>();
  const sources: string[] = [];

  // 1) Fast newest-launch discovery. Candidates are verified on-chain in enrich().
  try {
    const feed = await fromPonsFeed(Math.min(limit, 60));
    for (const launch of feed.launches) merged.set(launch.token.toLowerCase(), launch);
    for (const tx of feed.routed) routed.add(tx);
    if (feed.launches.length) sources.push("pons-feed");
  } catch {}

  // 2) Blockscout can extend the history beyond the feed and provides tx hashes.
  // Failure here is non-fatal if the verified feed already supplied launches.
  try {
    const bs = await fromBlockscout(limit);
    for (const launch of bs.launches) {
      const key = launch.token.toLowerCase();
      const existing = merged.get(key);
      // Prefer Blockscout's tx hash/block data but keep feed metadata hints/time.
      merged.set(key, existing ? { ...existing, ...launch, launchedAt: existing.launchedAt ?? launch.launchedAt, hint: existing.hint } : launch);
    }
    for (const tx of bs.routed) routed.add(tx);
    if (bs.launches.length) sources.push("blockscout");
  } catch {}

  // 3) Dedicated RPC is an emergency fallback only. It stays disabled unless
  // explicitly opted in, so the public Robinhood endpoint is never hammered.
  if (!merged.size && process.env.ALLOW_RPC_INDEXER_FALLBACK === "true") {
    const rpc = await fromRpc(Math.min(limit, 60));
    for (const launch of rpc.launches) merged.set(launch.token.toLowerCase(), launch);
    for (const tx of rpc.routed) routed.add(tx);
    if (rpc.launches.length) sources.push("rpc");
  }

  if (!merged.size) {
    if (cache?.rows.length) return { rows: cache.rows.slice(0, limit), source: "stale-cache" };
    throw new Error("Launch discovery is temporarily unavailable. Pons V2 itself is still online.");
  }

  const data = { launches: [...merged.values()], routed };
  const src = sources.join("+") || "verified-feed";
  const registry = await charityRegistry(limit);
  const charity = new Map(registry.map((e) => [e.token.toLowerCase(), e.distributor] as const));
  const byToken = new Map(data.launches.map((l) => [l.token.toLowerCase(), l]));
  for (const e of registry) {
    if (!byToken.has(e.token.toLowerCase())) {
      byToken.set(e.token.toLowerCase(), {
        token: getAddress(e.token),
        curve: getAddress(e.curve),
        deployer: getAddress(e.creator),
        pairToken: getAddress(e.pairToken),
        blockNumber: 0n,
        txHash: "0x",
        threshold: 0n,
        launchedAt: Number(e.launchedAt),
      });
    }
  }
  const unique = [...byToken.values()]
    .sort((a, b) => {
      if (a.launchedAt && b.launchedAt) return b.launchedAt - a.launchedAt;
      return a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1;
    })
    .slice(0, limit);
  const rows = (await enrich(unique, data.routed, charity)).sort((a, b) => {
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    const ab = BigInt(a.blockNumber), bb = BigInt(b.blockNumber);
    return ab === bb ? 0 : bb > ab ? 1 : -1;
  });
  cache = { at: Date.now(), rows, source: src, requested: limit };
  return { rows, source: src };
}

let platformCache: { at: number; row: LaunchRow | null } | null = null;

/** The $NERMO platform token, read directly by address so it can always be pinned. */
export async function getPlatformRow(ca: Address | null): Promise<LaunchRow | null> {
  if (!ca) return null;
  if (platformCache && Date.now() - platformCache.at < 30_000) return platformCache.row;
  try {
    const client = serverClient();
    const rec = await client.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "getLaunchedToken", args: [ca] });
    if (!rec.exists) {
      platformCache = { at: Date.now(), row: null };
      return null;
    }
    const [row] = await enrich(
      [{ token: getAddress(ca), curve: rec.curve, deployer: rec.deployer, pairToken: rec.pairToken, blockNumber: 0n, txHash: "0x", threshold: rec.graduationThreshold }],
      new Set(),
      new Map(),
    );
    platformCache = { at: Date.now(), row: row ?? null };
    return row ?? null;
  } catch {
    return platformCache?.row ?? null;
  }
}

export async function getLaunches(limit = 60): Promise<{ rows: LaunchRow[]; source: string }> {
  limit = Math.max(1, Math.min(limit, 200));
  if (cache && Date.now() - cache.at < TTL && cache.requested >= limit) {
    return { rows: cache.rows.slice(0, limit), source: "cache" };
  }

  // Deduplicate simultaneous homepage/explore/API requests in one server
  // instance so they do not all hit Blockscout/RPC at once. If a larger
  // request arrives while a smaller refresh is running, let the smaller one
  // finish and then perform one larger refresh.
  if (!inFlight) {
    inFlightLimit = limit;
    inFlight = refreshLaunches(limit).finally(() => { inFlight = null; inFlightLimit = 0; });
  }
  const result = await inFlight;
  if (inFlightLimit >= limit || (cache && cache.requested >= limit)) {
    return { rows: result.rows.slice(0, limit), source: result.source };
  }
  return refreshLaunches(limit);
}
