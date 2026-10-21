"use client";
import { useAppKit } from "@reown/appkit/react";
import { useEffect, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { robinhood } from "@/lib/chain";
import { short } from "@/lib/format";

/** Brand-styled trigger for the Reown AppKit modal (WalletConnect, MetaMask, Rabby, Coinbase, mobile QR). */
export function ConnectButton({ block }: { block?: boolean }) {
  const { address, isConnected, chainId, status } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { open } = useAppKit();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const cls = `btn btn-sm${block ? " btn-block" : ""}`;

  if (!mounted || status === "reconnecting") return <button className={cls} disabled>Connect Wallet</button>;

  if (isConnected && chainId !== robinhood.id)
    return (
      <button className={cls} disabled={switching} onClick={() => switchChain({ chainId: robinhood.id })}>
        {switching ? "Switching…" : "Switch to Robinhood Chain"}
      </button>
    );

  if (isConnected)
    return (
      <button className={cls} onClick={() => open({ view: "Account" })} aria-label="Wallet account">
        <span style={{ width: 8, height: 8, borderRadius: 9, background: "#a9dcb8", boxShadow: "0 0 8px #a9dcb8" }} />
        {short(address)}
      </button>
    );

  return (
    <button className={cls} disabled={status === "connecting"} onClick={() => open({ view: "Connect" })}>
      {status === "connecting" ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
