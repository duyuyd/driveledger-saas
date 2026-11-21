import "./globals.css";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase";
import type { CSSProperties, ReactNode } from "react";

export const dynamic = "force-dynamic";

const backendConfigured = () => Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://") &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

export async function generateMetadata(): Promise<Metadata> {
  if (!backendConfigured()) return {
    title: "DriveLedger | NPT duy",
    description: "Hệ thống quản lý dạy lái xe đang chuẩn bị kết nối cơ sở dữ liệu riêng.",
    robots: { index: false, follow: false },
  };
  const db = await createClient();
  const { data } = await db.from("platform_settings").select("value").eq("key", "site_title").maybeSingle();
  return { title: typeof data?.value === "string" ? data.value : "DriveLedger", description: "Nền tảng quản lý giáo viên và trung tâm dạy lái xe" };
}

function NotConfigured() {
  return <html lang="vi"><body>
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#f3f7ff"}}>
      <section style={{maxWidth:620,background:"white",border:"1px solid #e0e7ff",padding:36,borderRadius:20,boxShadow:"0 18px 60px #192b5012"}}>
        <p style={{color:"#2463eb",fontWeight:700,letterSpacing:1}}>NPT DUY · SOFTWARE</p>
        <h1 style={{fontSize:40,margin:"10px 0 18px",color:"#172554"}}>DriveLedger</h1>
        <p style={{fontSize:19,lineHeight:1.5,color:"#334155"}}>Quản lý học viên, xe tập lái, lịch dạy, GPS và sổ thu chi.</p>
        <p style={{fontSize:14,lineHeight:1.8,color:"#64748b"}}>Website đã được triển khai nhưng chưa mở dịch vụ: cơ sở dữ liệu Supabase riêng và xác thực chưa cấu hình. Không có tài khoản hoặc dữ liệu mẫu được tạo giả.</p>
        <p style={{fontSize:12,color:"#64748b",marginTop:30}}>Nhà phát triển: <strong>NPT duy</strong></p>
      </section>
    </main>
  </body></html>;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  if (!backendConfigured()) return <NotConfigured />;
  const db = await createClient();
  const { data } = await db.from("platform_settings").select("value").eq("key", "brand_color").maybeSingle();
  const hex = typeof data?.value === "string" && /^#[0-9a-fA-F]{6}$/.test(data.value) ? data.value : "#2563eb";
  return <html lang="vi"><body style={{ "--brand": hex } as CSSProperties}>{children}</body></html>;
}
