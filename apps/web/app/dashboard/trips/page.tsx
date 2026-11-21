import { authContext } from "@/lib/context";
import { Route } from "lucide-react";
export default async function Trips(){
  const {client,organization}=await authContext();
  if(!organization)return <p className="notice">Vào Tổng quan để tạo tổ chức trước.</p>;
  const {data,error}=await client.from("trips")
    .select("id,started_at,finished_at,status,distance_m,students(full_name),vehicles(plate)")
    .eq("organization_id",organization.id).order("started_at",{ascending:false}).limit(100);
  if(error)throw new Error(error.message);
  return <><div className="topbar"><div><h1 className="page-title">Hành trình GPS</h1><p className="subtitle">Điện thoại ghi vị trí thực, máy chủ tính lại khoảng cách sau khi kết thúc.</p></div></div>
  <p className="notice">📍 Mở ứng dụng di động, chọn GPS → Bắt đầu chuyến đi. Theo dõi trong khi ứng dụng đang mở. Khoảng cách là ước tính từ GPS, không phải số liệu kiểm định công-tơ-mét.</p>
  <div className="panel"><h2 className="section-title">Lịch sử hành trình</h2>
    {data?.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Bắt đầu</th><th>Học viên</th><th>Xe</th><th>Quãng đường</th><th>Trạng thái</th></tr></thead><tbody>{data.map(t=><tr key={t.id}>
      <td>{new Date(t.started_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</td>
      <td>{(t.students as unknown as {full_name:string}|null)?.full_name??"—"}</td>
      <td>{(t.vehicles as unknown as {plate:string}|null)?.plate??"—"}</td>
      <td><b>{(Number(t.distance_m)/1000).toLocaleString("vi-VN",{maximumFractionDigits:2})} km</b></td>
      <td><span className={t.status==="completed"?"tag good":"tag pending"}>{t.status==="completed"?"Hoàn thành":"Đang ghi"}</span></td>
    </tr>)}</tbody></table></div>:<p className="empty"><Route size={18} style={{display:"inline",verticalAlign:"-4px"}}/> Chưa có chuyến đi GPS nào.</p>}
  </div></>;
}
