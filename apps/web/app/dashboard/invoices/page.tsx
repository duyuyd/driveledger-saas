import { randomUUID } from "node:crypto";
import { createInvoice, createTransaction } from "@/app/actions";
import { authContext, amountVnd } from "@/lib/context";
import { getVietQrUrl } from "@/lib/vietqr.mjs";
import { Feedback } from "../feedback";
export default async function Invoices({searchParams}:{searchParams:Promise<{error?:string;saved?:string}>}){
  const {client,organization}=await authContext(); const feedback=await searchParams;
  if(!organization)return <p className="notice">Vào Tổng quan để tạo tổ chức trước.</p>;
  const [invoices,students]=await Promise.all([
    client.from("invoice_balances").select("id,code,amount_vnd,confirmed_vnd,due_at,note,student_id").eq("organization_id",organization.id).order("created_at",{ascending:false}).limit(50),
    client.from("students").select("id,full_name").eq("organization_id",organization.id).order("full_name"),
  ]);
  if(invoices.error||students.error)throw new Error((invoices.error||students.error)!.message);
  const nameById=new Map((students.data??[]).map(s=>[s.id,s.full_name]));
  const hasBank=Boolean(organization.bank_bin&&organization.bank_account&&organization.bank_account_name);
  return <><div className="topbar"><div><h1 className="page-title">Hóa đơn & VietQR</h1><p className="subtitle">Tạo yêu cầu thanh toán, đối soát thủ công và ngăn thanh toán vượt số dư.</p></div></div><Feedback {...feedback}/>
    {!hasBank&&<p className="notice">Cần cấu hình ngân hàng nhận tiền trong phần Cài đặt để phát hành mã VietQR.</p>}
    <section className="panel" style={{marginBottom:20}}><h2 className="section-title" style={{marginBottom:18}}>Phát hành hóa đơn</h2>
      <form action={createInvoice} className="form-grid"><input type="hidden" name="organization_id" value={organization.id}/>
        <div className="field"><label>Học viên *</label><select name="student_id" required defaultValue=""><option value="" disabled>Chọn học viên</option>{students.data?.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
        <div className="field"><label>Số tiền phải thu (VND) *</label><input type="number" name="amount_vnd" min="1" step="1" required/></div>
        <div className="field"><label>Hạn thanh toán</label><input type="date" name="due_at"/></div>
        <div className="field"><label>Diễn giải</label><input name="note" maxLength={2000}/></div>
        <div className="field-full"><button className="btn">Phát hành</button></div>
      </form>
    </section>
    <div style={{display:"grid",gap:16}}>{invoices.data?.length?invoices.data.map(inv=>{
      const remaining=Math.max(0,Number(inv.amount_vnd)-Number(inv.confirmed_vnd));
      const qr=hasBank&&remaining>0?getVietQrUrl({bankBin:organization.bank_bin!,account:organization.bank_account!,accountName:organization.bank_account_name!,amountVnd:remaining,reference:inv.code}):null;
      return <section className="panel" key={inv.id}>
        <div className="section-row"><div><h2 className="section-title">{inv.code}</h2><p className="subtitle">{nameById.get(inv.student_id)||"Học viên"} · {inv.due_at?`Hạn: ${inv.due_at}`:"Chưa đặt hạn"}</p></div><span className={remaining===0?"tag good":"tag pending"}>{remaining===0?"Đã thu đủ":"Chưa thu đủ"}</span></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:22}}>
          <div><p className="stat-name">Tổng hóa đơn</p><p className="stat-value">{amountVnd(inv.amount_vnd)}</p><p className="stat-name">Đã đối soát: {amountVnd(inv.confirmed_vnd)}</p><p style={{fontWeight:800,color:"var(--brand)"}}>Còn phải thu: {amountVnd(remaining)}</p><p className="subtitle">{inv.note}</p>
            {remaining>0&&<form action={createTransaction} className="form-grid" style={{marginTop:16}}>
              <input type="hidden" name="organization_id" value={organization.id}/><input type="hidden" name="invoice_id" value={inv.id}/>
              <input type="hidden" name="student_id" value={inv.student_id}/><input type="hidden" name="kind" value="income"/>
              <input type="hidden" name="category" value="Học phí"/><input type="hidden" name="redirect_to" value="invoices"/>
              <input type="hidden" name="idempotency_key" value={randomUUID()}/>
              <div className="field field-full"><label>Khoản thu xác nhận (VND)</label><input name="amount_vnd" type="number" min="1" max={remaining} defaultValue={remaining} required/></div>
              <div className="field"><label>Phương thức</label><select name="method" defaultValue="transfer"><option value="transfer">Chuyển khoản</option><option value="cash">Tiền mặt</option></select></div>
              <div className="field"><label>Trạng thái</label><select name="status" defaultValue="pending"><option value="pending">Chờ đối soát</option><option value="confirmed">Đã kiểm tra ngân hàng</option></select></div>
              <div className="field field-full"><label>Mã tham chiếu từ sao kê khi xác nhận chuyển khoản</label><input name="reference" maxLength={120}/></div>
              <div className="field-full"><button className="btn">Ghi nhận giao dịch</button></div>
            </form>}
          </div>
          <div style={{textAlign:"center"}}>{qr?<><img src={qr} alt={`VietQR thanh toán hóa đơn ${inv.code}`} width={220} height={280} style={{maxWidth:"100%",objectFit:"contain"}}/><p className="subtitle">Chỉ là mã yêu cầu chuyển khoản. Không tự xác nhận đã nhận tiền.</p></>:<div className="notice">{remaining===0?"Hóa đơn đã thu đủ":"Chưa cấu hình tài khoản nhận tiền"}</div>}</div>
        </div>
      </section>;
    }):<p className="empty panel">Chưa có hóa đơn nào. Phát hành hóa đơn từ biểu mẫu phía trên.</p>}</div>
  </>;
}
