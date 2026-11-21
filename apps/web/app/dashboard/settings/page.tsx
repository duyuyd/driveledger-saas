import { authContext } from "@/lib/context";
import { saveOrganizationSettings, savePlatformSettings, addExistingMember } from "@/app/actions";
import { Feedback } from "../feedback";
export default async function Settings({searchParams}:{searchParams:Promise<{error?:string;saved?:string}>}){
  const {client,organization,user}=await authContext();const feedback=await searchParams;
  if(!organization)return <p className="notice">Vào Tổng quan để tạo tổ chức trước.</p>;
  const [profile,platform] = await Promise.all([
    client.from("profiles").select("system_role").eq("user_id",user.id).maybeSingle(),
    client.from("platform_settings").select("key,value"),
  ]);
  if(profile.error||platform.error)throw new Error((profile.error||platform.error)!.message);
  const cfg=Object.fromEntries((platform.data??[]).map(p=>[p.key,p.value])) as Record<string,unknown>;
  const owner=user.id===organization.owner_id;
  const staff=owner?await client.rpc("list_org_members",{p_org:organization.id}):null;
  if(staff?.error)throw new Error(staff.error.message);
  return <><div className="topbar"><div><h1 className="page-title">Cài đặt</h1><p className="subtitle">Thông tin kinh doanh, tài khoản nhận VietQR, cấu hình thương hiệu.</p></div></div><Feedback {...feedback}/>
    <section className="panel" style={{marginBottom:20}}><h2 className="section-title" style={{marginBottom:18}}>Tổ chức</h2>
      <form action={saveOrganizationSettings} className="form-grid"><input type="hidden" name="organization_id" value={organization.id}/>
        <div className="field"><label>Tên tổ chức</label><input name="name" defaultValue={organization.name} minLength={2} maxLength={120} required/></div>
        <div className="field"><label>Màu chủ đạo</label><input name="primary_color" type="color" defaultValue={organization.primary_color}/></div>
        <div className="field"><label>Mã ngân hàng BIN (6 chữ số)</label><input name="bank_bin" inputMode="numeric" pattern="[0-9]{6}" defaultValue={organization.bank_bin??""}/></div>
        <div className="field"><label>Số tài khoản nhận tiền</label><input name="bank_account" inputMode="numeric" defaultValue={organization.bank_account??""}/></div>
        <div className="field field-full"><label>Họ tên chủ tài khoản</label><input name="bank_account_name" defaultValue={organization.bank_account_name??""}/></div>
        <div className="field-full"><p className="subtitle">Kiểm tra lại thông tin ngân hàng trước khi phát hành QR. Thay đổi tài khoản không làm QR cũ đã được gửi đi tự cập nhật.</p><button className="btn">Lưu cấu hình tổ chức</button></div>
      </form>
    </section>
    {owner&&<section className="panel" style={{marginBottom:20}}><h2 className="section-title" style={{marginBottom:18}}>Nhân viên của tổ chức</h2>
      <p className="subtitle">Người được mời cần đăng ký bằng email trên hệ thống trước. Hỗ trợ quản lý, giáo viên, kế toán và người xem.</p>
      <form action={addExistingMember} className="form-grid" style={{marginTop:16}}><input type="hidden" name="organization_id" value={organization.id}/>
        <div className="field"><label>Email tài khoản đã đăng ký</label><input name="email" type="email" required/></div>
        <div className="field"><label>Phân quyền</label><select name="role" defaultValue="instructor"><option value="instructor">Giáo viên</option><option value="manager">Quản lý</option><option value="accountant">Kế toán</option><option value="viewer">Chỉ xem</option></select></div>
        <div className="field-full"><button className="btn">Thêm / cập nhật nhân viên</button></div>
      </form>
      {staff?.data?.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Email</th><th>Vai trò</th></tr></thead><tbody>{staff.data.map((m:{user_id:string;email:string;role:string})=><tr key={m.user_id}><td>{m.email}</td><td>{m.role}</td></tr>)}</tbody></table></div>:<p className="empty">Chưa có nhân viên.</p>}
    </section>}
    {profile.data?.system_role==="super_admin"&&<section className="panel"><h2 className="section-title" style={{marginBottom:18}}>Super Admin · Cấu hình toàn nền tảng</h2><form action={savePlatformSettings} className="form-grid">
      <div className="field"><label>Tên thương hiệu</label><input name="site_title" defaultValue={String(cfg.site_title??"")} required/></div>
      <div className="field"><label>Màu nền tảng</label><input name="brand_color" type="color" defaultValue={String(cfg.brand_color??"#2563eb")}/></div>
      <div className="field field-full"><label>Tiêu đề trang chủ</label><input name="hero_title" defaultValue={String(cfg.hero_title??"")} required/></div>
      <div className="field field-full"><label>Mô tả trang chủ</label><textarea name="hero_description" rows={3} defaultValue={String(cfg.hero_description??"")} required/></div>
      <div className="field-full"><label style={{display:"flex",alignItems:"center",gap:9}}><input style={{width:18,height:18}} name="feature_registration" type="checkbox" defaultChecked={cfg.feature_registration!==false}/> Cho phép đăng ký tài khoản mới qua website</label></div>
      <div className="field-full"><button className="btn">Lưu cấu hình hệ thống</button></div>
    </form></section>}
  </>;
}
