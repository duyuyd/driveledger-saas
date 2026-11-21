import Link from "next/link";
import { ArrowUpRight, BookUser, CalendarClock, Wallet, TrendingUp } from "lucide-react";
import { authContext, amountVnd } from "@/lib/context";
import { createOrganization } from "@/app/actions";
import { Feedback } from "./feedback";
function monthStart():string {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit"}).formatToParts(new Date());
  const y=parts.find(p=>p.type==="year")?.value ?? "2026";
  const m=parts.find(p=>p.type==="month")?.value ?? "01";
  return `${y}-${m}-01`;
}
export default async function Dashboard({searchParams}:{searchParams:Promise<{error?:string;saved?:string}>}){
  const {client,organization,user}=await authContext();
  const feedback=await searchParams;
  if(!organization) return <>
    <div className="topbar"><div><h1 className="page-title">Tạo tổ chức đầu tiên</h1><p className="subtitle">Mỗi khách hàng sử dụng một không gian dữ liệu độc lập.</p></div></div>
    <Feedback {...feedback}/><section className="panel" style={{maxWidth:620}}>
      <form action={createOrganization} className="form-grid">
        <div className="field field-full"><label htmlFor="name">Tên giáo viên / trung tâm</label><input id="name" name="name" required minLength={2} maxLength={120} placeholder="Tên kinh doanh"/></div>
        <div className="field-full"><button className="btn">Tạo tổ chức</button></div>
      </form>
    </section>
  </>;
  const month=monthStart();
  const [reportRes,lessonRes]=await Promise.all([
    client.rpc("get_month_summary",{p_org:organization.id,p_month:month}).single(),
    client.from("lessons").select("id,starts_at,status,students(full_name)").eq("organization_id",organization.id).order("starts_at",{ascending:false}).limit(6),
  ]);
  const queryError=reportRes.error||lessonRes.error;
  if(queryError)throw new Error(queryError.message);
  const income=Number(reportRes.data?.income_vnd??0);
  const expense=Number(reportRes.data?.expense_vnd??0);
  const km=Number(reportRes.data?.gps_distance_m??0)/1000;
  const cards=[
    {name:"Tổng thu đã xác nhận",value:amountVnd(income),icon:Wallet,note:"Trong tháng hiện tại"},
    {name:"Tổng chi đã xác nhận",value:amountVnd(expense),icon:TrendingUp,note:"Trong tháng hiện tại"},
    {name:"Lợi nhuận thuần",value:amountVnd(income-expense),icon:ArrowUpRight,note:"Thu − Chi (chưa tính thuế)"},
    {name:"Học viên đang quản lý",value:String(reportRes.data?.student_count??0),icon:BookUser,note:`GPS đã ghi: ${km.toLocaleString("vi-VN",{maximumFractionDigits:1})} km`},
  ];
  return <>
    <div className="topbar"><div><h1 className="page-title">Tổng quan</h1><p className="subtitle">{organization.name} · {user.email}</p></div><Link className="btn" href="/dashboard/students">Thêm học viên <ArrowUpRight size={17}/></Link></div>
    <Feedback {...feedback}/>
    <div className="grid-stats">{cards.map(({name,value,note,icon:Icon})=><div className="panel" key={name}><span className="stat-name">{name}</span><div className="stat-value">{value}</div><div className="stat-extra"><Icon size={14} style={{display:"inline",verticalAlign:"-3px",marginRight:5,color:"var(--brand)"}}/>{note}</div></div>)}</div>
    <div className="panel"><div className="section-row"><h2 className="section-title">Lịch dạy gần đây</h2><Link href="/dashboard/lessons" className="btn btn-outline">Xem toàn bộ</Link></div>
      {lessonRes.data?.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Học viên</th><th>Thời gian</th><th>Trạng thái</th></tr></thead><tbody>{lessonRes.data.map(l=><tr key={l.id}><td>{Array.isArray(l.students)?l.students[0]?.full_name:(l.students as {full_name:string}|null)?.full_name}</td><td>{new Date(l.starts_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</td><td><span className="tag">{l.status}</span></td></tr>)}</tbody></table></div>:<p className="empty"><CalendarClock style={{verticalAlign:"-4px"}} size={19}/> Chưa có lịch dạy. Hãy tạo lịch để bắt đầu quản lý.</p>}
    </div>
  </>;
}
