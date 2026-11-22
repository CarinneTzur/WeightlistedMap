export const isStaging = typeof __STAGING_BUILD__ !== "undefined" && __STAGING_BUILD__;
const productionHost = "ovuiqnqaoxmjsfilceon.supabase.co";
export function getBackendConfig(env, staging) {
 const url = staging ? env.VITE_STAGING_SUPABASE_URL : env.VITE_SUPABASE_URL;
 const key = staging ? env.VITE_STAGING_SUPABASE_ANON_KEY : env.VITE_SUPABASE_ANON_KEY;
 if (!url || !key) return null;
 try {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") return null;
  if (staging && (parsed.hostname === productionHost || url === env.VITE_SUPABASE_URL)) return null;
  return { url, key };
 } catch { return null; }
}
