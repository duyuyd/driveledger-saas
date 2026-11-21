import Link from "next/link";
import { CarFront, ShieldCheck } from "lucide-react";
import { signIn, signUp } from "@/app/actions";
import { createClient } from "@/lib/supabase";
import { redirect } from "next/navigation";

export default async function Login({ searchParams }: { searchParams: Promise<{error?:string;registered?:string}> }) {
  const db = await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(user) redirect("/dashboard");
  const params=await searchParams;
  return <div className="auth-wrap"><div className="panel">
    <Link href="/" className="brand" style={{color:"var(--ink)"}}><span className="brand-mark"><CarFront size={21}/></span>DriveLedger</Link>
    <h1 className="page-title" style={{marginTop:27}}>Đăng nhập hoặc đăng ký</h1>
    <p className="subtitle">Một tài khoản để truy cập website và ứng dụng di động.</p>
    {params.registered && <p className="notice">Đã gửi yêu cầu đăng ký. Hãy kiểm tra email xác nhận trước khi đăng nhập.</p>}
    {params.error && <p className="notice error">Không xác thực được. Kiểm tra email, mật khẩu hoặc liên kết xác nhận.</p>}
    <form action={signIn} style={{display:"grid",gap:14,marginTop:25}}>
      <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" name="email" required autoComplete="username"/></div>
      <div className="field"><label htmlFor="password">Mật khẩu</label><input id="password" type="password" name="password" minLength={8} required autoComplete="current-password"/></div>
      <button className="btn" type="submit">Đăng nhập</button>
      <button className="btn btn-outline" formAction={signUp} type="submit">Đăng ký tài khoản mới</button>
    </form>
    <p className="subtitle" style={{display:"flex",alignItems:"center",gap:6,marginTop:22}}><ShieldCheck size={16}/> Mỗi tổ chức có dữ liệu độc lập, bảo vệ bởi Supabase RLS.</p>
  </div></div>;
}
