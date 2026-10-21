"use client";
import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

function hashKey(key: QueryKey) {
  return JSON.stringify(key, (_, v) => {
    if (typeof v === "bigint") return `${v}n`;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce<Record<string, unknown>>((o, k) => ((o[k] = (v as Record<string, unknown>)[k]), o), {});
    }
    return v;
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
            /* On-chain values are BigInt, which JSON.stringify rejects. Hash keys safely so a BigInt
               in any query key can never crash the page. */
            queryKeyHashFn: hashKey,
          },
        },
      }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
