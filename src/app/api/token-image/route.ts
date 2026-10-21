import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Public, cacheable delivery endpoint for token logos held in the private Blob store. */
export async function GET(req: Request) {
  const pathname = new URL(req.url).searchParams.get("pathname")?.trim();
  if (!pathname || !pathname.startsWith("token-images/") || pathname.includes("..")) {
    return NextResponse.json({ error: "Invalid image path." }, { status: 400 });
  }

  const storeId = process.env.BLOB_STORE_ID?.trim();
  if (!storeId) return new NextResponse("Image store unavailable.", { status: 503 });

  try {
    const result = await get(pathname, {
      access: "private",
      storeId,
      ...(process.env.BLOB_READ_WRITE_TOKEN?.trim()
        ? { token: process.env.BLOB_READ_WRITE_TOKEN.trim() }
        : {}),
    });

    if (!result || result.statusCode !== 200) return new NextResponse("Image not found.", { status: 404 });

    return new NextResponse(result.stream, {
      status: 200,
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Vercel Blob token image read failed", error);
    return new NextResponse("Image temporarily unavailable.", { status: 502 });
  }
}
