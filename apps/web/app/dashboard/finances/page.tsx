import { randomUUID } from "node:crypto";
import { createTransaction, confirmPendingTransaction } from "@/app/actions";
import { authContext, amountVnd } from "@/lib/context";
import { Feedback } from "../feedback";
export default async function Finances({searchParams}:{searchParams:Promise<{error?:string;saved?:string}>}){
  const {client,organization}=await authContext(); const feedback=await searchParams;
  if(!organization)return <p className="notice">Vào Tổng quan để tạo tổ chức trước.</p>;
  const [ledger,students] = await Promise.all([
    client.from("transactions").select("id,kind,status,category,amount_vnd,method,reference,note,recorded_at,students(full_name)").eq("organization_id",organization.id).order("recorded_at",{ascending:false}).limit(100),
    client.from("students").select("id,full_name").eq("organization_id",organization.id).eq("archived",false).order("full_name"),
  ]);
  if(ledger.error||students.error)throw new Error((ledger.error||students.error)!.message);
  return <><div className="topbar"><div><h1 className="page-title">Sổ thu chi</h1><p className="subtitle">Giao dịch có trạng thái; chỉ khoản đã xác nhận được tính vào báo cáo.</p></div></div><Feedback {...feedback}/>
    <section className="panel" style={{marginBottom:20}}><h2 className="section-title" style={{marginBottom:18}}>Ghi giao dịch</h2>
      <form action={createTransaction} className="form-grid">
        <input type="hidden" name="organization_id" value={organization.id}/><input type="hidden" name="idempotency_key" value={randomUUID()}/>
        <div className="field"><label>Loại giao dịch</label><select name="kind" defaultValue="income"><option value="income">Khoản thu</option><option value="expense">Khoản chi</option></select></div>
        <div className="field"><label>Số tiền (VND) *</label><input type="number" name="amount_vnd" min="1" step="1" required/></div>
        <div className="field"><label>Danh mục *</label><input name="category" required placeholder="Học phí / Xăng xe / Bảo trì..." maxLength={60}/></div>
        <div className="field"><label>Học viên liên quan</label><select name="student_id" defaultValue=""><option value="">Không gắn học viên</option>{students.data?.map(s=><option value={s.id} key={s.id}>{s.full_name}</option>)}</select></div>
        <div className="field"><label>Phương thức</label><select name="method" defaultValue="cash"><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option><option value="other">Khác</option></select></div>
        <div className="field"><label>Trạng thái</label><select name="status" defaultValue="confirmed"><option value="confirmed">Đã xác nhận</option><option value="pending">Chờ đối soát</option></select></div>
        <div className="field"><label>Mã giao dịch ngân hàng (bắt buộc khi xác nhận chuyển khoản)</label><input name="reference" maxLength={120}/></div>
        <div className="field"><label>Ghi chú</label><input name="note" maxLength={2000}/></div>
        <div className="field-full"><p className="subtitle">⚠️ Không tự đánh dấu “đã nhận tiền” chỉ vì đã gửi mã QR. Giao dịch đã ghi không thể sửa/xóa; điều chỉnh bằng bút toán bù.</p><button className="btn">Lưu giao dịch</button></div>
      </form>
    </section><section className="panel"><h2 className="section-title">Giao dịch gần đây</h2>
      {ledger.data?.some(t=>t.status==="pending")&&<div style={{marginTop:18,marginBottom:18}}><h3 className="section-title">Đối soát các khoản đang chờ</h3>
        {ledger.data.filter(t=>t.status==="pending").map(t=><form action={confirmPendingTransaction} className="form-grid" style={{padding:"13px 0",borderBottom:"1px solid var(--border)"}} key={t.id}>
          <input type="hidden" name="organization_id" value={organization.id}/><input type="hidden" name="transaction_id" value={t.id}/>
          <div><b>{amountVnd(t.amount_vnd)} · {t.category}</b><p className="subtitle">Chỉ xác nhận sau khi kiểm tra sao kê hoặc đã nhận tiền mặt.</p></div>
          <div style={{display:"flex",gap:8,alignItems:"end"}}><div className="field" style={{flex:1}}><label>Mã sao kê (nếu chuyển khoản)</label><input name="reference" maxLength={120}/></div><button className="btn">Xác nhận</button></div>
        </form>)}
      </div>}
      {ledger.data?.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Thời gian</th><th>Loại</th><th>Danh mục / học viên</th><th>Số tiền</th><th>Trạng thái</th></tr></thead><tbody>{ledger.data.map(t=><tr key={t.id}><td>{new Date(t.recorded_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</td><td>{t.kind==="income"?"Thu":"Chi"}</td><td>{t.category}{(t.students as unknown as {full_name:string}|null)?.full_name?` · ${(t.students as unknown as {full_name:string}).full_name}`:""}</td><td style={{fontWeight:700,color:t.kind==="income"?"#087b5d":"#ba433c"}}>{t.kind==="income"?"+":"−"}{amountVnd(t.amount_vnd)}</td><td><span className={t.status==="confirmed"?"tag good":"tag pending"}>{t.status==="confirmed"?"Đã xác nhận":"Chờ đối soát"}</span></td></tr>)}</tbody></table></div>:<p className="empty">Chưa có giao dịch nào.</p>}
    </section>
  </>;
}
