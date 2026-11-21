import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey?.startsWith("sb_publishable_")) {
    return NextResponse.json({ error: "Backend is not configured" }, { status: 503 });
  }
  return NextResponse.json({ url, publishableKey }, {
    headers: { "Cache-Control": "no-store" },
  });
}
