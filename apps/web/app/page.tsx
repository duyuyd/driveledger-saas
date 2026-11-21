import Link from "next/link";
import { ArrowUpRight, BookUser, CarFront, ChartNoAxesCombined, Route } from "lucide-react";
import { createClient } from "@/lib/supabase";

export default async function Home() {
  const db = await createClient();
  const { data } = await db.from("platform_settings").select("key,value").in("key",["site_title","hero_title","hero_description","feature_registration","developer_name"]);
  const s = Object.fromEntries((data ?? []).map(x => [x.key,x.value])) as Record<string,unknown>;
  const title = typeof s.site_title === "string" ? s.site_title : "DriveLedger";
  const hero = typeof s.hero_title === "string" ? s.hero_title : "Quản lý dạy lái xe thông minh";
  const desc = typeof s.hero_description === "string" ? s.hero_description : "Quản lý học viên, lịch dạy và tài chính.";
  return <>
    <header style={{ background:"white", borderBottom:"1px solid var(--border)" }}>
      <div style={{ maxWidth:1200, margin:"auto",padding:"16px 22px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <Link href="/" className="brand" style={{color:"var(--ink)"}}><span className="brand-mark"><CarFront size={21}/></span>{title}</Link>
        <Link className="btn btn-outline" href="/login">Đăng nhập <ArrowUpRight size={17}/></Link>
      </div>
    </header>
    <main style={{ maxWidth:1200,margin:"auto",padding:"0 22px" }}>
      <div className="hero"><div><span className="kicker">Nền tảng SaaS cho đào tạo lái xe</span><h1>{hero}</h1><p>{desc}</p>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:24}}>
          <Link href="/login" className="btn">{s.feature_registration === false ? "Đăng nhập" : "Bắt đầu quản lý"} <ArrowUpRight size={18}/></Link>
        </div><p style={{fontSize:13,marginTop:16}}>Dữ liệu tổ chức được phân tách. QR thanh toán không đồng nghĩa giao dịch đã được ngân hàng xác nhận.</p></div>
      <div className="hero-visual"><div className="panel"><span className="kicker">Các phân hệ chính</span>
        {[{Icon:BookUser,label:"Học viên & hồ sơ"},{Icon:CarFront,label:"Xe và lịch dạy"},{Icon:Route,label:"Nhật ký hành trình GPS"},{Icon:ChartNoAxesCombined,label:"Sổ thu chi minh bạch"}].map(({Icon,label})=><div key={label} style={{display:"flex",alignItems:"center",gap:15,padding:"18px 4px",borderBottom:"1px solid var(--border)"}}><div style={{color:"var(--brand)"}}><Icon size={24}/></div><b>{label}</b></div>)}
      </div></div></div>
    </main>
    <footer style={{padding:"22px",textAlign:"center",borderTop:"1px solid var(--border)",marginTop:40,fontSize:13,color:"var(--muted)"}}>
      Phát triển bởi {typeof s.developer_name === "string" ? s.developer_name : "NPT duy"} · {new Date().getFullYear()}
    </footer>
  </>;
}
