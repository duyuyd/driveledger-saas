import { authContext, amountVnd } from "@/lib/context";
import { createLesson } from "@/app/actions";
import { Feedback } from "../feedback";
export default async function Lessons({searchParams}:{searchParams:Promise<{error?:string;saved?:string}>}){
  const {client,organization}=await authContext(); const feedback=await searchParams;
  if(!organization)return <p className="notice">Vào Tổng quan để tạo tổ chức trước.</p>;
  const [students,vehicles,lessons]=await Promise.all([
    client.from("students").select("id,full_name").eq("organization_id",organization.id).eq("archived",false).order("full_name"),
    client.from("vehicles").select("id,plate").eq("organization_id",organization.id).eq("active",true).order("plate"),
    client.from("lessons").select("id,starts_at,ends_at,status,fee_vnd,students(full_name),vehicles(plate)").eq("organization_id",organization.id).order("starts_at",{ascending:false}).limit(100),
  ]);
  const error=students.error||vehicles.error||lessons.error;if(error)throw new Error(error.message);
  return <><div className="topbar"><div><h1 className="page-title">Lịch dạy</h1><p className="subtitle">Đặt giờ, chọn học viên, xe và học phí dự kiến.</p></div></div><Feedback {...feedback}/>
    <div className="panel" style={{marginBottom:20}}><h2 className="section-title" style={{marginBottom:18}}>Đặt buổi học</h2><form action={createLesson} className="form-grid"><input type="hidden" name="organization_id" value={organization.id}/>
      <div className="field"><label>Học viên *</label><select name="student_id" required defaultValue=""><option value="" disabled>Chọn học viên</option>{students.data?.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
      <div className="field"><label>Xe</label><select name="vehicle_id" defaultValue=""><option value="">Không gắn xe</option>{vehicles.data?.map(v=><option key={v.id} value={v.id}>{v.plate}</option>)}</select></div>
      <div className="field"><label>Bắt đầu (giờ Việt Nam) *</label><input type="datetime-local" name="starts_at" required/></div>
      <div className="field"><label>Kết thúc (giờ Việt Nam) *</label><input type="datetime-local" name="ends_at" required/></div>
      <div className="field"><label>Học phí dự kiến (VND)</label><input type="number" name="fee_vnd" min="0" step="1" defaultValue="0"/></div>
      <div className="field"><label>Ghi chú</label><input name="notes" maxLength={2000}/></div>
      <div className="field-full"><button className="btn">Lưu lịch dạy</button></div>
    </form></div>
    <div className="panel"><h2 className="section-title">Các buổi học</h2>{lessons.data?.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Học viên</th><th>Ngày / giờ</th><th>Xe</th><th>Phí dự kiến</th><th>Trạng thái</th></tr></thead><tbody>{lessons.data.map(l=><tr key={l.id}><td>{(l.students as unknown as {full_name:string}|null)?.full_name??"—"}</td><td>{new Date(l.starts_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</td><td>{(l.vehicles as unknown as {plate:string}|null)?.plate??"—"}</td><td>{amountVnd(l.fee_vnd)}</td><td><span className="tag">{l.status}</span></td></tr>)}</tbody></table></div>:<p className="empty">Chưa có lịch dạy nào.</p>}</div>
  </>;
}
