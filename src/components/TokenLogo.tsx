"use client";
import { useEffect, useState } from "react";
import { logoCandidates } from "@/lib/format";

export function TokenLogo({ logo, symbol, large }: { logo?: string; symbol: string; large?: boolean }) {
  const list = logoCandidates(logo);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [logo]);
  const cls = `token-logo${large ? " lg" : ""}`;
  if (i >= list.length) return <div className={cls} aria-hidden>{symbol.slice(0, 2).toUpperCase()}</div>;
  return <img className={cls} src={list[i]} alt={`${symbol} logo`} loading="lazy" onError={() => setI((n) => n + 1)} />;
}
