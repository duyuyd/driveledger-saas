"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase";
import { authContext, parseVnd, str, uuidOrNull } from "@/lib/context";

function fail(path: string, err: unknown): never {
  // Do not send stack traces or arbitrary DB internals to end users.
  const message = err instanceof Error ? err.message : "Không lưu được dữ liệu";
  const known = ["Trùng lịch giáo viên", "Amount exceeds remaining invoice balance", "invoice belongs to different organization", "student belongs to different organization", "vehicle belongs to different organization", "Mã", "Số", "Không", "Tên", "Chưa", "Hãy", "Chỉ", "Vui", "Loại", "Trạng", "Phương", "Cần", "Hạn"];
  const safe = known.some(word=>message.startsWith(word)) && message.length<=150
    ? message : "Không lưu được dữ liệu. Kiểm tra thông tin và quyền truy cập.";
  redirect(`${path}?error=${encodeURIComponent(safe)}`);
}
function ok(path: string): never { revalidatePath("/dashboard", "layout"); redirect(`${path}?saved=1`); }
function check(error: {message:string}|null) { if (error) throw new Error(error.message); }
async function resolveOrg(form: FormData) {
  const ctx = await authContext();
  const id = uuidOrNull(form.get("organization_id"));
  if (!id) throw new Error("Chưa chọn tổ chức");
  const {data,error} = await ctx.client.from("organizations").select("id,owner_id").eq("id",id).single();
  check(error);
  if (!data) throw new Error("Không có quyền truy cập tổ chức");
  return { ...ctx, organizationId:id, isOwner:data.owner_id===ctx.user.id };
}
function positiveKm(value: FormDataEntryValue|null) {
  const raw = String(value ?? "0");
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new Error("Mục tiêu km không hợp lệ");
  return Math.round(n*10)/10;
}
function localVnDateTime(raw:string):string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) throw new Error("Thời gian không hợp lệ");
  const ms=Date.parse(raw+"+07:00");
  if (!Number.isFinite(ms)) throw new Error("Thời gian không hợp lệ");
  return new Date(ms).toISOString();
}
export async function signIn(form:FormData) {
  const client=await createClient();
  const {error}=await client.auth.signInWithPassword({email:str(form,"email").toLowerCase(),password:str(form,"password",300)});
  if(error) redirect("/login?error=credentials");
  redirect("/dashboard");
}
export async function signUp(form:FormData) {
  const client=await createClient();
  const {data:flag} = await client.from("platform_settings").select("value").eq("key","feature_registration").maybeSingle();
  if(flag?.value===false) redirect("/login?error=registration_disabled");
  const password=str(form,"password",300);
  if(password.length<8) redirect("/login?error=password");
  const email=str(form,"email").toLowerCase();
  const site=(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/,"");
  const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:`${site}/auth/callback`}});
  if(error) redirect("/login?error=signup");
  if(data.session) redirect("/dashboard");
  redirect("/login?registered=1");
}
export async function signOut() {
  const client=await createClient();
  await client.auth.signOut();
  redirect("/login");
}
export async function createOrganization(form:FormData) {
  try {
    const {client,user}=await authContext();
    const name=str(form,"name",120);
    if(name.length<2) throw new Error("Tên tổ chức phải có ít nhất 2 ký tự");
    const {error}=await client.from("organizations").insert({name,owner_id:user.id});
    check(error);
  } catch(err) { fail("/dashboard",err); }
  ok("/dashboard");
}
export async function createStudent(form:FormData) {
  const path="/dashboard/students";
  try {
    const {client,organizationId}=await resolveOrg(form);
    const name=str(form,"full_name",150);
    if(name.length<2) throw new Error("Cần nhập họ tên học viên");
    const {error}=await client.from("students").insert({
      organization_id:organizationId,full_name:name,phone:str(form,"phone",30),
      license_class:str(form,"license_class",20)||"B",target_km:positiveKm(form.get("target_km")),
      notes:str(form,"notes",2000),
    });
    check(error);
  } catch(err) { fail(path,err); }
  ok(path);
}
export async function createVehicle(form:FormData) {
  const path="/dashboard/vehicles";
  try {
    const {client,organizationId}=await resolveOrg(form);
    const plate=str(form,"plate",20).replace(/\s+/g,"").toUpperCase();
    if(plate.length<5) throw new Error("Biển số xe không hợp lệ");
    const {error}=await client.from("vehicles").insert({organization_id:organizationId,plate,model:str(form,"model",120)});
    check(error);
  } catch(err) { fail(path,err); }
  ok(path);
}
export async function createLesson(form:FormData) {
  const path="/dashboard/lessons";
  try {
    const {client,user,organizationId}=await resolveOrg(form);
    const studentId=uuidOrNull(form.get("student_id"));
    if(!studentId) throw new Error("Chưa chọn học viên");
    const start=localVnDateTime(str(form,"starts_at",22));
    const end=localVnDateTime(str(form,"ends_at",22));
    if(new Date(end).getTime()<=new Date(start).getTime()) throw new Error("Giờ kết thúc phải sau giờ bắt đầu");
    const fee=str(form,"fee_vnd",20);
    const {error}=await client.from("lessons").insert({
      organization_id:organizationId,student_id:studentId,vehicle_id:uuidOrNull(form.get("vehicle_id")),
      instructor_id:user.id, starts_at:start,ends_at:end,fee_vnd:fee ? parseVnd(form.get("fee_vnd")):0,
      notes:str(form,"notes",2000),
    });
    check(error);
  } catch(err) { fail(path,err); }
  ok(path);
}
export async function createInvoice(form:FormData) {
  const path="/dashboard/invoices";
  try {
    const {client,organizationId}=await resolveOrg(form);
    const studentId=uuidOrNull(form.get("student_id"));
    if(!studentId) throw new Error("Chưa chọn học viên");
    const due=str(form,"due_at",10);
    if(due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Hạn thanh toán không hợp lệ");
    const code=`HD-${randomUUID().replace(/-/g,"").slice(0,12).toUpperCase()}`;
    const {error}=await client.from("invoices").insert({organization_id:organizationId,student_id:studentId,
      code,amount_vnd:parseVnd(form.get("amount_vnd")),due_at:due||null,note:str(form,"note",2000)});
    check(error);
  } catch(err) { fail(path,err); }
  ok(path);
}
export async function createTransaction(form:FormData) {
  const path=str(form,"redirect_to",80)==="invoices"?"/dashboard/invoices":"/dashboard/finances";
  try {
    const {client,user,organizationId}=await resolveOrg(form);
    const kind=str(form,"kind",10);
    const status=str(form,"status",10);
    const method=str(form,"method",10);
    if(!["income","expense"].includes(kind)) throw new Error("Loại giao dịch không hợp lệ");
    if(!["pending","confirmed"].includes(status)) throw new Error("Trạng thái không hợp lệ");
    if(!["cash","transfer","other"].includes(method)) throw new Error("Phương thức thanh toán không hợp lệ");
    const key=uuidOrNull(form.get("idempotency_key"));
    if(!key) throw new Error("Mã yêu cầu không hợp lệ");
    const category=str(form,"category",60);
    if(category.length<2) throw new Error("Danh mục phải có ít nhất 2 ký tự");
    const {error}=await client.from("transactions").insert({
      organization_id:organizationId,invoice_id:uuidOrNull(form.get("invoice_id")),
      student_id:uuidOrNull(form.get("student_id")),kind,status,method,category,
      amount_vnd:parseVnd(form.get("amount_vnd")),note:str(form,"note",2000),
      reference:str(form,"reference",120)||null,created_by:user.id,idempotency_key:key,
    });
    if(error?.code==="23505") {
      const prior = await client.from("transactions")
        .select("id,kind,status,amount_vnd,invoice_id")
        .eq("organization_id",organizationId).eq("idempotency_key",key).maybeSingle();
      if(prior.error||!prior.data||prior.data.kind!==kind||prior.data.status!==status||
         Number(prior.data.amount_vnd)!==parseVnd(form.get("amount_vnd"))||
         prior.data.invoice_id!==uuidOrNull(form.get("invoice_id"))) {
        throw new Error("Giao dịch bị trùng mã tham chiếu hoặc xung đột dữ liệu");
      }
    } else check(error);
  } catch(err) { fail(path,err); }
  ok(path);
}
export async function saveOrganizationSettings(form:FormData) {
  const path="/dashboard/settings";
  try {
    const {client,organizationId,isOwner}=await resolveOrg(form);
    if(!isOwner) throw new Error("Chỉ chủ sở hữu được đổi cấu hình tổ chức");
    const primary=str(form,"primary_color",7);
    if(!/^#[0-9a-fA-F]{6}$/.test(primary)) throw new Error("Mã màu không hợp lệ");
    const bank_bin=str(form,"bank_bin",6),bank_account=str(form,"bank_account",25),bank_account_name=str(form,"bank_account_name",120);
    if((bank_bin||bank_account||bank_account_name)&&(!/^\d{6}$/.test(bank_bin)||!/^\d{5,25}$/.test(bank_account)||!bank_account_name))
      throw new Error("Vui lòng nhập đầy đủ mã BIN (6 số), số tài khoản và tên người nhận");
    const {error}=await client.from("organizations").update({
      name:str(form,"name",120),primary_color:primary,
      bank_bin:bank_bin||null,bank_account:bank_account||null,bank_account_name:bank_account_name||null,
    }).eq("id",organizationId);
    check(error);
  } catch(err) { fail(path,err); }
  ok(path);
}
export async function savePlatformSettings(form:FormData) {
  const path="/dashboard/settings";
  try {
    const {client}=await authContext();
    const entries = [
      ["site_title",str(form,"site_title",80)],
      ["hero_title",str(form,"hero_title",150)],
      ["hero_description",str(form,"hero_description",300)],
      ["brand_color",str(form,"brand_color",7)],
      ["feature_registration",form.get("feature_registration")==="on"]
    ] as const;
    if(!/^#[0-9a-fA-F]{6}$/.test(entries[3][1])) throw new Error("Mã màu không hợp lệ");
    for (const [key,value] of entries) {
      if(typeof value === "string" && !value.trim()) throw new Error("Không để trống cấu hình nền tảng");
      const {error,data}=await client.from("platform_settings").update({value}).eq("key",key).select("key").single();
      check(error);
      if(!data)throw new Error("Không có quyền quản trị hệ thống"); // RLS permits only super_admin.
    }
  } catch(err) { fail(path,err); }
  revalidatePath("/","layout");
  ok(path);
}

export async function addExistingMember(form:FormData){
  const path="/dashboard/settings";
  try{
    const {client,organizationId,isOwner}=await resolveOrg(form);
    if(!isOwner)throw new Error("Chỉ chủ sở hữu được thêm nhân viên");
    const email=str(form,"email",254).toLowerCase();
    const role=str(form,"role",20);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Email nhân viên không hợp lệ");
    if(!["manager","instructor","accountant","viewer"].includes(role))throw new Error("Vai trò không hợp lệ");
    const {error}=await client.rpc("add_existing_member",{p_org:organizationId,p_email:email,p_role:role});
    check(error);
  }catch(err){fail(path,err);}
  ok(path);
}

export async function confirmPendingTransaction(form:FormData) {
  const path=str(form,"redirect_to",80)==="invoices"?"/dashboard/invoices":"/dashboard/finances";
  try {
    const {client,organizationId}=await resolveOrg(form);
    const id=uuidOrNull(form.get("transaction_id"));
    if(!id)throw new Error("Mã giao dịch không hợp lệ");
    const {data:row,error:lookupError}=await client.from("transactions").select("id").eq("id",id).eq("organization_id",organizationId).single();
    check(lookupError);if(!row)throw new Error("Không tìm thấy giao dịch");
    const {error}=await client.rpc("confirm_pending_transaction",{
      p_transaction_id:id,p_bank_reference:str(form,"reference",120)||null
    });
    check(error);
  } catch(err) { fail(path,err); }
  ok(path);
}
