"use client";
import { useQuery } from "@tanstack/react-query";
import type { LaunchRow } from "@/lib/indexer";

export function useLaunches(limit = 60) {
  return useQuery({
    queryKey: ["launches", limit],
    queryFn: async () => {
      const res = await fetch(`/api/launches?limit=${limit}`, { cache: "default" });
      const json = (await res.json()) as { rows: LaunchRow[]; warning?: string };
      if (!res.ok || (json.warning && json.rows.length === 0)) {
        throw new Error(json.warning || "Could not load launches");
      }
      return json.rows;
    },
    staleTime: 45_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: (previous) => previous,
  });
}
