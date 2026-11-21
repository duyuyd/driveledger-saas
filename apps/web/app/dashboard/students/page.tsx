import { authContext } from "@/lib/context";
import { createStudent } from "@/app/actions";
import { Feedback } from "../feedback";
export default async function Students({searchParams}:{searchParams:Promise<{error?:string;saved?:string}>}){
  const {client,organization}=await authContext(); const feedback=await searchParams;
  if(!organization)return <p className="notice">Vào Tổng quan để tạo tổ chức trước.</p>;
  const {data,error}=await client.from("student_mileage").select("id,full_name,phone,license_class,target_km,completed_distance_m").eq("organization_id",organization.id).eq("archived",false).order("full_name",{ascending:true}).limit(100);
  if(error)throw new Error(error.message);
  return <><div className="topbar"><div><h1 className="page-title">Học viên</h1><p className="subtitle">Hồ sơ riêng, hạng bằng và chỉ tiêu km thực hành.</p></div></div><Feedback {...feedback}/>
    <div className="panel" style={{marginBottom:20}}><h2 className="section-title" style={{marginBottom:18}}>Tạo hồ sơ mới</h2>
      <form action={createStudent} className="form-grid"><input type="hidden" name="organization_id" value={organization.id}/>
        <div className="field"><label>Họ tên *</label><input name="full_name" minLength={2} required maxLength={150}/></div>
        <div className="field"><label>Số điện thoại</label><input name="phone" type="tel" maxLength={30}/></div>
        <div className="field"><label>Hạng bằng</label><input name="license_class" maxLength={20} defaultValue="B"/></div>
        <div className="field"><label>Mục tiêu thực hành (km)</label><input name="target_km" type="number" min="0" max="100000" step="0.1" defaultValue="0"/></div>
        <div className="field field-full"><label>Ghi chú</label><textarea name="notes" rows={2} maxLength={2000}/></div>
        <div className="field-full"><button className="btn">Lưu học viên</button></div>
      </form>
    </div><div className="panel"><h2 className="section-title">Danh sách học viên ({data?.length??0}{data?.length===100?"+":""})</h2>
      {data?.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Họ tên</th><th>Điện thoại</th><th>Hạng</th><th>GPS đã ghi / Chỉ tiêu km</th></tr></thead><tbody>{data.map(s=><tr key={s.id}><td><strong>{s.full_name}</strong></td><td>{s.phone||"—"}</td><td><span className="tag">{s.license_class}</span></td><td>{(Number(s.completed_distance_m)/1000).toLocaleString("vi-VN",{maximumFractionDigits:1})} / {Number(s.target_km).toLocaleString("vi-VN")}</td></tr>)}</tbody></table></div>:<p className="empty">Chưa có học viên nào.</p>}
    </div>
  </>;
}
