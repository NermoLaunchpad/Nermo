"use client";
import { useQuery } from "@tanstack/react-query";
import type { LaunchRow } from "@/lib/indexer";
import { PLATFORM } from "@/lib/site";

export function usePlatform() {
  return useQuery({
    queryKey: ["platform", PLATFORM.ca],
    enabled: !!PLATFORM.ca,
    queryFn: async () => ((await (await fetch("/api/platform")).json()) as { row: LaunchRow | null }).row,
    staleTime: 45_000,
    refetchInterval: 60_000,
  });
}
