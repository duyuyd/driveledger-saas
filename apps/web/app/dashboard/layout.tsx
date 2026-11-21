import Link from "next/link";
import { Banknote, BookUser, CalendarClock, CarFront, ChartColumnIncreasing, ClipboardList, LayoutDashboard, Route, Settings, LogOut } from "lucide-react";
import { authContext } from "@/lib/context";
import { signOut } from "@/app/actions";
import type { ReactNode } from "react";
const menu = [
  {href:"/dashboard",label:"Tổng quan",Icon:LayoutDashboard},
  {href:"/dashboard/students",label:"Học viên",Icon:BookUser},
  {href:"/dashboard/vehicles",label:"Xe tập lái",Icon:CarFront},
  {href:"/dashboard/lessons",label:"Lịch dạy",Icon:CalendarClock},
  {href:"/dashboard/finances",label:"Sổ thu chi",Icon:Banknote},
  {href:"/dashboard/invoices",label:"Hóa đơn & VietQR",Icon:ClipboardList},
  {href:"/dashboard/trips",label:"Hành trình GPS",Icon:Route},
  {href:"/dashboard/settings",label:"Cài đặt",Icon:Settings},
];
export default async function DashboardLayout({children}:{children:ReactNode}){
  const {user,organization,client}=await authContext();
  const {data:siteSettings}=await client.from("platform_settings").select("key,value").in("key",["site_title","developer_name"]);
  const settings=Object.fromEntries((siteSettings??[]).map(s=>[s.key,s.value]));
  const siteTitle=typeof settings.site_title==="string"?settings.site_title:"DriveLedger";
  const developer=typeof settings.developer_name==="string"?settings.developer_name:"NPT duy";
  return <div className="shell">
    <aside className="sidebar"><Link className="brand" href="/"><span className="brand-mark"><CarFront size={21}/></span>{siteTitle}</Link>
      <nav className="nav" aria-label="Menu quản lý">{menu.map(({href,label,Icon})=><Link href={href} key={href}><Icon size={18}/>{label}</Link>)}</nav>
      <div style={{marginTop:"auto",borderTop:"1px solid #2a3952",paddingTop:18}}><p style={{fontSize:12,color:"#a6b5cd"}}>{organization?.name ?? "Chưa tạo tổ chức"}</p><p style={{fontSize:12,wordBreak:"break-word"}}>{user.email}</p>
        <p style={{fontSize:11,color:"#a6b5cd"}}>Phát triển bởi {developer}</p><form action={signOut}><button style={{background:"transparent",border:0,color:"#d9e5fa",display:"flex",gap:8,alignItems:"center"}}><LogOut size={16}/> Đăng xuất</button></form>
      </div>
    </aside><main className="main">{children}</main>
    <nav className="mobile-nav" aria-label="Menu điện thoại">{menu.map(({href,label,Icon})=><Link href={href} key={href}><Icon size={21}/>{label}</Link>)}</nav>
  </div>;
}
