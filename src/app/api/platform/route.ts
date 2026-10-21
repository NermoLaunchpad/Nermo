import { NextResponse } from "next/server";
import { getPlatformRow } from "@/lib/indexer";
import { PLATFORM } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  const row = await getPlatformRow(PLATFORM.ca);
  return NextResponse.json(
    { ca: PLATFORM.ca, row },
    { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=300" } },
  );
}
