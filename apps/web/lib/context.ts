import { redirect } from "next/navigation";
import { createClient } from "./supabase";

export async function authContext() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: organization, error: orgError } = await client
    .from("organizations")
    .select("id,name,owner_id,bank_bin,bank_account,bank_account_name,primary_color")
    .order("created_at", { ascending: true })
    .limit(1).maybeSingle();
  if (orgError) throw new Error(orgError.message);
  return { client, user, organization };
}

export function amountVnd(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

export function parseVnd(value: FormDataEntryValue | null): number {
  const s = String(value ?? "").trim();
  if (!/^\d+$/.test(s)) throw new Error("Số tiền phải là số nguyên VND không âm");
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1 || n > 9_000_000_000_000) throw new Error("Số tiền không hợp lệ");
  return n;
}

export function str(form: FormData, key: string, max = 300): string {
  const s = String(form.get(key) ?? "").trim();
  if (s.length > max) throw new Error(`${key} vượt giới hạn ký tự`);
  return s;
}

export function uuidOrNull(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "");
  if (!s) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw new Error("ID không hợp lệ");
  return s;
}
