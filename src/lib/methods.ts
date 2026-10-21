import type { Address } from "viem";
import { eqAddr } from "./format";

export type MethodId = "zero-tax" | "buyback" | "charity" | "creator-tax" | "auto-dev-burn";

export type MethodDef = {
  id: MethodId;
  code: "ZERO_TAX" | "BUYBACK_LOCK" | "CHARITY" | "CREATOR_TAX" | "AUTO_DEV_BURN";
  name: string;
  short: string;
  line: string;
  card: string;
  mechanics: string[];
};

/** Single source of truth for Method copy. Rename here and it changes everywhere. */
export const METHODS: MethodDef[] = [
  {
    id: "zero-tax",
    code: "ZERO_TAX",
    name: "Zero Tax",
    short: "Zero Tax",
    line: "No creator tax.",
    card: "Launch with 0% creator tax.",
    mechanics: [
      "Creator tax is fixed at 0% for the launch.",
      "The standard Pons V2 fee still applies.",
      "An optional developer buy can execute atomically in the same launch transaction.",
    ],
  },
  {
    id: "buyback",
    code: "BUYBACK_LOCK",
    name: "Buyback & Lock",
    short: "Buyback",
    line: "Buy back the launched token from fees and lock it.",
    card: "Automatically buy back and lock supply.",
    mechanics: [
      "Pons V2 uses part of the creator-side fee share to buy the launched token back from the market.",
      "Bought-back tokens are locked in the Pons Buyback Vault and vest over five years. They are locked, not burned.",
      "The creator or the Pons protocol owner can switch buybacks off after launch. The token page shows it if that happens.",
      "An optional developer buy can execute atomically in the same launch transaction.",
    ],
  },
  {
    id: "charity",
    code: "CHARITY",
    name: "Charity",
    short: "Charity",
    line: "Route creator-side fees to a charity.",
    card: "Send launch fees to a selected charity.",
    mechanics: [
      "The launch uses the Pons Charity contracts. An ownerless distributor created for the token receives the creator-side fees.",
      "The distributor pays the charity automatically. Only the Pons protocol owner can change a fee recipient, and only after a public three-day notice, which this site flags.",
      "An optional developer buy can execute atomically in the same launch transaction.",
    ],
  },
  {
    id: "creator-tax",
    code: "CREATOR_TAX",
    name: "Creator Tax",
    short: "Creator Tax",
    line: "Set a creator tax from 0% to 10%.",
    card: "Choose a creator tax up to 10%.",
    mechanics: [
      "The creator chooses a tax between 0% and 10% before launch.",
      "The selected rate is written into the Pons V2 launch and cannot be raised later.",
      "An optional developer buy can execute atomically in the same launch transaction.",
    ],
  },
  {
    id: "auto-dev-burn",
    code: "AUTO_DEV_BURN",
    name: "Auto Dev Burn",
    short: "Dev Burn",
    line: "Your opening buy goes straight to the burn address.",
    card: "Burn your opening buy in the launch transaction.",
    mechanics: [
      "The developer buy executes in the same transaction that creates the token, so nobody can trade ahead of it.",
      "Every token it buys is sent straight to the dead address 0x…dEaD, where no one holds the key.",
      "The tokens never touch the developer wallet and are out of circulation for good.",
    ],
  },
];

export const METHOD_BY_ID = Object.fromEntries(METHODS.map((m) => [m.id, m])) as Record<MethodId, MethodDef>;

export const MAX_METHOD_TAX_BPS = 1000;

/* ---------- Legacy Method tag ----------
 * Early test launches wrote a tag into the description. New launches never do. The parser below
 * only strips such a tag so it is not shown to visitors.
 */
export type MethodTag = {
  m: MethodId;
  bps?: number;
  n?: string;
  w?: Address;
  dev?: string;
};

const TAG_RE = /\[pons-method:1((?:\|[a-z]+=[^|\]]*)+)\]\s*$/;
const clean = (s: string) => s.replace(/[|\]\[\n\r]/g, " ").trim().slice(0, 64);

export function encodeTag(t: MethodTag) {
  const parts = [`m=${t.m}`];
  if (t.bps !== undefined) parts.push(`bps=${t.bps}`);
  if (t.n) parts.push(`n=${clean(t.n)}`);
  if (t.w) parts.push(`w=${t.w}`);
  if (t.dev) parts.push(`dev=${clean(t.dev)}`);
  return `[pons-method:1|${parts.join("|")}]`;
}

export function withTag(description: string, t: MethodTag) {
  const body = description.trim();
  return body ? `${body}\n\n${encodeTag(t)}` : encodeTag(t);
}

export function parseTag(description?: string): { tag?: MethodTag; body: string } {
  if (!description) return { body: "" };
  const match = description.match(TAG_RE);
  if (!match) return { body: description };
  const kv = Object.fromEntries(
    match[1]
      .split("|")
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i), p.slice(i + 1)];
      }),
  );
  // The retired Auto Dev Buy option was not a burn Method. Do not relabel
  // those historical launches as Auto Dev Burn. Without a current
  // Method tag they are classified from their live Pons V2 economics.
  if (kv.m === "auto-dev-buy") return { body: description.slice(0, match.index).trim() };
  const method = kv.m;
  if (!METHODS.some((m) => m.id === method)) return { body: description };
  return {
    body: description.slice(0, match.index).trim(),
    tag: {
      m: method as MethodId,
      bps: kv.bps !== undefined ? Number(kv.bps) : undefined,
      n: kv.n || undefined,
      w: /^0x[0-9a-fA-F]{40}$/.test(kv.w ?? "") ? (kv.w as Address) : undefined,
      dev: kv.dev || undefined,
    },
  };
}

export type LiveTerms = {
  creatorTaxBps: number;
  buybackEnabled: boolean;
  creatorFeeRecipient: Address;
  deployer: Address;
  viaRouter: boolean;
  /** Opening-buy token recipient when launch provenance has been loaded. */
  devBuyRecipient?: Address;
  /** Distributor from the Pons Charity registry, when the token was launched there. */
  charityDistributor?: Address;
};

export type Classification = {
  method: MethodId;
  source: "onchain";
  checks: { ok: boolean; label: string }[];
};

/**
 * Resolve a token's Method purely from what the contracts record. Nothing is written into the
 * token's description, so the classification is the same for every Pons V2 launch.
 */
export function classify(live: LiveTerms): Classification {
  const burned = !!live.devBuyRecipient && eqAddr(live.devBuyRecipient, "0x000000000000000000000000000000000000dEaD");
  const method: MethodId = live.charityDistributor
    ? "charity"
    : live.buybackEnabled
      ? "buyback"
      : live.creatorTaxBps > 0
        ? "creator-tax"
        : burned
          ? "auto-dev-burn"
          : "zero-tax";
  return { method, source: "onchain", checks: baseChecks(method, live) };
}

function baseChecks(method: MethodId, live: LiveTerms) {
  const c: { ok: boolean; label: string }[] = [];
  const tax = live.creatorTaxBps;
  switch (method) {
    case "zero-tax":
      c.push({ ok: tax === 0, label: tax === 0 ? "Creator tax is 0%, fixed at launch" : `Creator tax is ${tax / 100}%` });
      c.push({ ok: !live.buybackEnabled, label: live.buybackEnabled ? "Buyback has been switched on" : "Buyback is off" });
      break;
    case "buyback":
      c.push({ ok: live.buybackEnabled, label: live.buybackEnabled ? "Buyback & Lock is active" : "Buybacks have been switched off since launch" });
      c.push({ ok: true, label: `Creator tax ${tax / 100}%` });
      break;
    case "charity": {
      const reg = live.charityDistributor;
      c.push({ ok: !!reg, label: reg ? "Registered in the Pons Charity launchpad" : "Not found in the Pons Charity registry" });
      if (reg) {
        const same = eqAddr(reg, live.creatorFeeRecipient);
        c.push({ ok: same, label: same ? "Fees route to its charity distributor" : "Fee recipient no longer matches the charity distributor" });
      }
      break;
    }
    case "creator-tax":
      c.push({ ok: tax <= MAX_METHOD_TAX_BPS, label: `Creator tax ${tax / 100}%, fixed at launch` });
      break;
    case "auto-dev-burn":
      c.push({ ok: live.viaRouter, label: live.viaRouter ? "Opening buy executed in the launch transaction" : "Launch-and-buy transaction not found" });
      c.push({ ok: true, label: "Opening-buy tokens went straight to the burn address" });
      c.push({ ok: tax === 0, label: `Creator tax ${tax / 100}%` });
      break;
  }
  return c;
}
