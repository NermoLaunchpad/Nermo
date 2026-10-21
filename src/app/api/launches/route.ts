import { NextResponse } from "next/server";
import { getLaunches } from "@/lib/indexer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const raw = Number(new URL(req.url).searchParams.get("limit") || 60);
  const limit = Math.min(Math.max(Number.isFinite(raw) ? raw : 60, 1), 200);
  try {
    const { rows, source } = await getLaunches(limit);
    return NextResponse.json(
      { rows, source },
      {
        headers: {
          // Let Vercel's CDN answer repeated Explore requests without invoking
          // the indexer every few seconds. Stale data is preferable to a rate-limit error.
          "cache-control": "public, s-maxage=30, stale-while-revalidate=300",
        },
      },
    );
  } catch (e) {
    // Return a normal response so the UI stays usable during a short explorer
    // outage instead of exposing raw RPC/provider errors to visitors.
    return NextResponse.json(
      { rows: [], source: "unavailable", warning: (e as Error).message },
      { status: 200, headers: { "cache-control": "public, s-maxage=5, stale-while-revalidate=60" } },
    );
  }
}
