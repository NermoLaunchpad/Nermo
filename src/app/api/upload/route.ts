import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = /^image\/(png|jpe?g|gif|webp)$/;

function safeBaseName(name: string) {
  const cleaned = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || "token-image";
}

function extension(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/gif") return "gif";
  if (type === "image/webp") return "webp";
  return "bin";
}

type PinataV3Response = { data?: { cid?: string } };

async function uploadToPinata(file: File, jwt: string) {
  const body = new FormData();
  body.append("file", file, file.name || "token-image");
  body.append("network", "public");
  body.append("name", file.name || "token-image");

  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body,
    cache: "no-store",
  });
  const raw = await res.text();
  let json: PinataV3Response | null = null;
  try { json = raw ? JSON.parse(raw) as PinataV3Response : null; } catch {}
  if (!res.ok || !json?.data?.cid) throw new Error(`Pinata upload failed (${res.status}).`);
  return { uri: `ipfs://${json.data.cid}`, provider: "pinata-v3" };
}

/**
 * Accepts a local token image.
 *
 * Primary storage is the Vercel Blob store connected to this project. The
 * user's store is private, so the stable public logo URL points at
 * /api/token-image, which streams that object through the Nermo domain.
 * Authentication to Blob uses Vercel OIDC automatically. No long-lived Blob
 * read/write token is required for a connected project.
 */
/* Best-effort abuse guard: at most 10 uploads per IP per 10 minutes on each server instance. */
const hits = new Map<string, number[]>();
function limited(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > 10;
}

/** Checks the file's real signature so a renamed non-image cannot be stored as a logo. */
async function isRealImage(file: File) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const gif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return png || jpg || gif || webp;
}

export async function POST(req: Request) {
  if (limited(req)) return NextResponse.json({ error: "Too many uploads. Wait a few minutes and try again." }, { status: 429 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No image file received." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No image file received." }, { status: 400 });
  if (!ALLOWED.test(file.type)) return NextResponse.json({ error: "Use PNG, JPG, GIF or WEBP." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Images must be under 4 MB." }, { status: 400 });
  if (!(await isRealImage(file))) return NextResponse.json({ error: "That file is not a valid PNG, JPG, GIF or WEBP image." }, { status: 400 });

  const storeId = process.env.BLOB_STORE_ID?.trim();
  if (storeId) {
    try {
      const pathname = `token-images/${safeBaseName(file.name)}-${crypto.randomUUID()}.${extension(file.type)}`;
      const blob = await put(pathname, file, {
        access: "private",
        addRandomSuffix: false,
        contentType: file.type,
        storeId,
        ...(process.env.BLOB_READ_WRITE_TOKEN?.trim()
          ? { token: process.env.BLOB_READ_WRITE_TOKEN.trim() }
          : {}),
      });

      /* The logo URL is written on-chain for good, so it always uses the canonical domain rather
         than whichever preview or vercel.app host served this request. */
      const publicUrl = new URL("/api/token-image", SITE.url);
      publicUrl.searchParams.set("pathname", blob.pathname);
      return NextResponse.json({
        uri: publicUrl.toString(),
        url: publicUrl.toString(),
        provider: "vercel-blob-private-oidc",
      });
    } catch (error) {
      console.error("Vercel Blob token image upload failed", error);
      return NextResponse.json(
        { error: "Image upload failed. The connected Vercel Blob store could not accept the file. Redeploy the project after connecting the Blob store." },
        { status: 502 },
      );
    }
  }

  // Optional fallback for projects that still use Pinata.
  const pinataJwt = process.env.PINATA_JWT?.trim();
  if (pinataJwt) {
    try {
      return NextResponse.json(await uploadToPinata(file, pinataJwt));
    } catch (error) {
      console.error("Pinata token image upload failed", error);
      return NextResponse.json({ error: "Image upload failed through Pinata." }, { status: 502 });
    }
  }

  return NextResponse.json(
    { error: "Image uploads are not connected. Connect a Vercel Blob store to this project and redeploy." },
    { status: 501 },
  );
}
