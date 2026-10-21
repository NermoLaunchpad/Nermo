import { formatUnits, type Address } from "viem";
import { IPFS_GATEWAY } from "./chain";

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function fmtAmount(v: bigint | undefined, decimals = 18, max = 4) {
  if (v === undefined) return "…";
  const n = Number(formatUnits(v, decimals));
  if (n === 0) return "0";
  if (n < 1 / 10 ** max) return `<${(1 / 10 ** max).toFixed(max)}`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-GB", { maximumFractionDigits: max });
}

export function fmtPct(bps: number | bigint) {
  const n = Number(bps) / 100;
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2).replace(/0$/, "")}%`;
}

export function logoUrl(logo?: string) {
  if (!logo) return "";
  if (logo.startsWith("ipfs://")) return IPFS_GATEWAY + logo.slice(7).replace(/^ipfs\//, "");
  if (logo.startsWith("https://") || logo.startsWith("data:image/")) return logo;
  return "";
}

/** Every URL worth trying for a logo, so one slow IPFS gateway does not leave a blank icon. */
export function logoCandidates(logo?: string): string[] {
  if (!logo) return [];
  const l = logo.trim();
  if (l.startsWith("ipfs://")) {
    const cid = l.slice(7).replace(/^ipfs\//, "");
    return [...new Set([IPFS_GATEWAY, "https://dweb.link/ipfs/", "https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/"])].map((g) => g + cid);
  }
  if (/^(https:\/\/|data:image\/|\/)/.test(l)) return [l];
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})/.test(l)) return logoCandidates(`ipfs://${l}`);
  return [];
}

export function ago(ts?: number) {
  if (!ts) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const eqAddr = (a?: Address | string, b?: Address | string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Readable price for tiny values: 0.0₈168 instead of 1.68e-9. */
export function fmtPrice(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1) return n.toLocaleString("en-GB", { maximumFractionDigits: 4 });
  if (n >= 0.0001) return n.toPrecision(4).replace(/0+$/, "");
  const [mant, exp] = n.toExponential(3).split("e-");
  const zeros = Number(exp) - 1;
  const digits = mant.replace(".", "").replace(/0+$/, "");
  const sub = String(zeros).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]).join("");
  return `0.0${sub}${digits}`;
}
