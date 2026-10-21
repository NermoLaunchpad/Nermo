"use client";
import type { MethodId } from "@/lib/methods";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { useLaunches } from "@/components/useLaunches";

export function MethodTokens({ id }: { id: MethodId }) {
  const { data, isLoading } = useLaunches(60);
  const rows = (data ?? []).filter((t) => t.method === id);
  return (
    <>
      <div className="grid g-3">
        {isLoading && Array.from({ length: 3 }, (_, i) => <TokenCardSkeleton key={i} />)}
        {rows.map((t) => <TokenCard key={t.token} t={t} />)}
      </div>
      {data && rows.length === 0 && <div className="glass panel muted">No recent launches use this Method yet.</div>}
    </>
  );
}
