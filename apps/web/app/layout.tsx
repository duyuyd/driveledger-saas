import "./globals.css";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase";
import type { CSSProperties, ReactNode } from "react";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const db = await createClient();
  const { data } = await db.from("platform_settings").select("value").eq("key", "site_title").maybeSingle();
  return { title: typeof data?.value === "string" ? data.value : "DriveLedger", description: "Nền tảng quản lý giáo viên và trung tâm dạy lái xe" };
}
export default async function RootLayout({ children }: { children: ReactNode }) {
  const db = await createClient();
  const { data } = await db.from("platform_settings").select("value").eq("key", "brand_color").maybeSingle();
  const hex = typeof data?.value === "string" && /^#[0-9a-fA-F]{6}$/.test(data.value) ? data.value : "#2563eb";
  return <html lang="vi"><body style={{ "--brand": hex } as CSSProperties}>{children}</body></html>;
}
