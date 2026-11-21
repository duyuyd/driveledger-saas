import { authContext } from "@/lib/context";
import { createVehicle } from "@/app/actions";
import { Feedback } from "../feedback";
export default async function Vehicles({searchParams}:{searchParams:Promise<{error?:string;saved?:string}>}){
  const {client,organization}=await authContext(); const feedback=await searchParams;
  if(!organization)return <p className="notice">Vào Tổng quan để tạo tổ chức trước.</p>;
  const {data,error}=await client.from("vehicles").select("id,plate,model,active").eq("organization_id",organization.id).order("created_at",{ascending:false}).limit(100);
  if(error)throw new Error(error.message);
  return <><div className="topbar"><div><h1 className="page-title">Xe tập lái</h1><p className="subtitle">Quản lý đội xe và phục vụ tính km GPS theo xe.</p></div></div><Feedback {...feedback}/>
  <div className="panel" style={{marginBottom:20}}><h2 className="section-title" style={{marginBottom:18}}>Thêm phương tiện</h2><form action={createVehicle} className="form-grid"><input type="hidden" name="organization_id" value={organization.id}/>
    <div className="field"><label>Biển số *</label><input name="plate" required minLength={5} maxLength={20}/></div>
    <div className="field"><label>Hãng / dòng xe</label><input name="model" maxLength={120}/></div>
    <div className="field-full"><button className="btn">Lưu xe</button></div></form></div>
  <div className="panel"><h2 className="section-title">Đội xe ({data?.length??0})</h2>{data?.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Biển số</th><th>Dòng xe</th><th>Trạng thái</th></tr></thead><tbody>{data.map(v=><tr key={v.id}><td><b>{v.plate}</b></td><td>{v.model||"—"}</td><td><span className={v.active?"tag good":"tag pending"}>{v.active?"Đang sử dụng":"Ngừng sử dụng"}</span></td></tr>)}</tbody></table></div>:<p className="empty">Chưa có xe nào.</p>}</div>
  </>;
}
