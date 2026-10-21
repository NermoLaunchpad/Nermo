"use client";
import { createAppKit } from "@reown/appkit/react";
import { defineChain } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { http } from "wagmi";
import { RPC_URL } from "./chain";
import { REOWN_PROJECT_ID, SITE } from "./site";

/** Robinhood Chain in the shape Reown AppKit expects (CAIP network id + namespace). */
export const robinhoodAppKit = defineChain({
  id: 4663,
  caipNetworkId: "eip155:4663",
  chainNamespace: "eip155",
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

export const wagmiAdapter = new WagmiAdapter({
  projectId: REOWN_PROJECT_ID,
  networks: [robinhoodAppKit],
  transports: { [robinhoodAppKit.id]: http(RPC_URL) },
  batch: { multicall: true },
  ssr: true,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

const origin = typeof window !== "undefined" ? window.location.origin : SITE.url;

createAppKit({
  adapters: [wagmiAdapter],
  projectId: REOWN_PROJECT_ID,
  networks: [robinhoodAppKit],
  defaultNetwork: robinhoodAppKit,
  allowUnsupportedChain: false,
  metadata: {
    name: SITE.name,
    description: SITE.description,
    url: origin,
    icons: [`${origin}/brand/nermo-icon.png`],
  },
  features: { analytics: true, email: false, socials: false, swaps: false, onramp: false, send: false, history: false },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#a9dcb8",
    "--w3m-color-mix": "#000000",
    "--w3m-color-mix-strength": 40,
    "--w3m-font-family": '"Manrope Variable", Manrope, ui-sans-serif, system-ui, sans-serif',
    "--w3m-border-radius-master": "4px",
    "--w3m-z-index": 1000,
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
