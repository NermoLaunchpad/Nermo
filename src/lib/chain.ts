import { createPublicClient, defineChain, http } from "viem";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

export const EXPLORER = robinhood.blockExplorers.default.url;
export const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io/ipfs/";

/** Server-side client for the indexer. JSON-RPC batching keeps enrichment to a few requests. */
export function serverClient() {
  const url = process.env.RPC_URL || RPC_URL;
  return createPublicClient({
    chain: robinhood,
    transport: http(url, { retryCount: 1, timeout: 12_000 }),
    // A larger Multicall3 batch turns dozens of token metadata/reserve reads
    // into only a few eth_call requests, which is much friendlier to the
    // rate-limited public Robinhood RPC.
    batch: { multicall: { batchSize: 16_384, wait: 12 } },
  });
}

export const ponsTokenUrl = (a: string) => `https://www.ponsfamily.com/launchpad/${a}`;
