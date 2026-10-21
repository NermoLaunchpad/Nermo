import { parseAbi, zeroAddress, type Address, type Hex } from "viem";

/**
 * Pons Charity (github.com/ponscharity, MIT). Live contracts on Robinhood Chain.
 * The Charity Method launches through this launchpad so fees reach Donate.gg listed charities
 * through an ownerless per-launch distributor.
 */
export const CHARITY_LAUNCHPAD = "0xF1755477b2931E6e8fc2B0f6b7d66B4AA7EeEfE3" as Address;
export const REMIT_VAULT = "0x7F954db64FeC530C679c6b093a139eFB8089D7D2" as Address;
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
export const ZERO_ID = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

export const charityLaunchpadAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct LaunchParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
  "struct Entry { address token; address curve; address distributor; address charity; address creator; address pairToken; uint16 charityBps; uint64 launchedAt; bytes32 charityId; }",
  "struct CharityTerms { address charity; bytes32 charityId; address creatorPayout; uint16 charityBps; }",
  "struct DevBuy { uint256 quoteIn; uint256 minTokensOut; }",
  "function launch(LaunchParams params, uint256 launchConfigId, address pairToken, address charity, bytes32 charityId, address creatorPayout, uint16 charityBps) payable returns (address token, address curve, address distributor)",
  "function launchWithBuy(LaunchParams params, uint256 launchConfigId, address pairToken, CharityTerms terms, DevBuy devBuy, address[] snipeTaxExemptions) payable returns (address token, address curve, address distributor)",
  "function count() view returns (uint256)",
  "function page(uint256 offset, uint256 limit) view returns (Entry[])",
  "function entryOf(address token) view returns (Entry)",
  "function isCharityLaunch(address token) view returns (bool)",
  "function minCharityBps() view returns (uint16)",
  "error LaunchesClosed()",
  "error CharityShareTooSmall(uint16 asked, uint16 floorRequired)",
  "error ZeroAddress()",
  "error PairTokenNotApproved(address pairToken)",
  "error EconomicsMoved(bytes32 pinned, bytes32 live)",
  "error DevBuyUnavailable()",
  "error NativeValueMismatch(uint256 supplied, uint256 expected)",
]);

export const distributorAbi = parseAbi([
  "function totalToCharity(address asset) view returns (uint256)",
  "function totalToOps(address asset) view returns (uint256)",
  "function pending(address asset) view returns (uint256)",
  "function charityBps() view returns (uint16)",
]);

export const CHARITY_ERROR_TEXT: Record<string, string> = {
  LaunchesClosed: "Pons has public launches switched off right now. Try again once they reopen.",
  CharityShareTooSmall: "The charity share is below the Pons Charity minimum.",
  EconomicsMoved: "Pons changed the launch terms since you reviewed them. Review again and retry.",
  DevBuyUnavailable: "The dev buy route is unavailable right now. Launch without a dev buy or retry later.",
};

/** Only ETH and USDG can leave the chain for a charity; other pairs are sold to USDG first. */
export const remitAssetFor = (pair: Address): Address =>
  pair.toLowerCase() === zeroAddress || pair.toLowerCase() === USDG.toLowerCase() ? pair : USDG;

/** Pairs the Pons Charity keeper can currently pay out from. */
export const charityPairAllowed = (pair: Address) =>
  pair.toLowerCase() === zeroAddress || pair.toLowerCase() === USDG.toLowerCase();

export type Charity = { name: string; slug: string; configId: Hex; logo: string; place: string; mission: string };
type Row = { n: string; s: string; c: Hex; l: string; p: string; m: string };

let cache: Charity[] | null = null;
let inflight: Promise<Charity[]> | null = null;

export function loadCharities(): Promise<Charity[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch("/charities.json")
    .then((r) => {
      if (!r.ok) throw new Error("Charity directory unavailable");
      return r.json() as Promise<Row[]>;
    })
    .then((rows) => (cache = rows.map((x) => ({ name: x.n, slug: x.s, configId: x.c, logo: x.l, place: x.p, mission: x.m }))))
    .finally(() => (inflight = null));
  return inflight;
}

export function searchCharities(all: Charity[], q: string, limit = 30) {
  const n = q.trim().toLowerCase();
  if (!n) return all.slice(0, limit);
  return all
    .map((c) => {
      const name = c.name.toLowerCase();
      const s = name === n ? 0 : name.startsWith(n) ? 1 : name.includes(n) ? 2 : c.mission.toLowerCase().includes(n) ? 3 : -1;
      return { c, s };
    })
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .slice(0, limit)
    .map((x) => x.c);
}

export const charityPage = (slug: string) => `https://www.donate.gg/charities/${slug}`;
export const ponsCharityTokenPage = (token: string) => `https://ponscharity.family/token/${token}`;
