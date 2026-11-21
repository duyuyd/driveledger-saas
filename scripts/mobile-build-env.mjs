import { appendFile } from "node:fs/promises";

const web = new URL(process.env.EXPO_PUBLIC_WEB_URL || "https://driveledger-saas.vercel.app");
if (web.protocol !== "https:" || web.username || web.password) throw new Error("An HTTPS web origin is required");
const response = await fetch(new URL("/api/mobile-config", web.origin), {
  redirect: "error", signal: AbortSignal.timeout(20_000),
});
if (!response.ok) throw new Error(`Mobile configuration returned HTTP ${response.status}`);
const { url, publishableKey } = await response.json();
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) ||
    !/^sb_publishable_[a-zA-Z0-9_-]+$/.test(publishableKey)) {
  throw new Error("Invalid public Supabase configuration");
}
const health = await fetch(`${url}/rest/v1/platform_settings?key=eq.developer_name&select=value`, {
  headers: { apikey: publishableKey }, signal: AbortSignal.timeout(20_000),
});
if (!health.ok || (await health.json())[0]?.value !== "NPT duy") {
  throw new Error("DriveLedger database did not answer the branding check");
}
await appendFile(process.env.GITHUB_ENV, [
  `EXPO_PUBLIC_WEB_URL=${web.origin}`,
  `EXPO_PUBLIC_SUPABASE_URL=${url}`,
  `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`, "",
].join("\n"));
