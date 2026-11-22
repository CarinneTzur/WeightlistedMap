export const isStaging = typeof __STAGING_BUILD__ !== "undefined" && __STAGING_BUILD__;
const productionHost = "ovuiqnqaoxmjsfilceon.supabase.co";
// Browser-safe publishable credentials for the isolated staging project.
// Authorization still comes from Supabase Auth and database RLS.
const stagingBackend = {
 url: "https://zimtgpfxddttxytattmd.supabase.co",
 key: "sb_publishable_GrqStFyU0RfgVnjHnM4DSA_BXJvOPB7",
};
export function getBackendConfig(env, staging) {
 const hasStagingOverride = Boolean(env.VITE_STAGING_SUPABASE_URL || env.VITE_STAGING_SUPABASE_ANON_KEY);
 const url = staging ? (hasStagingOverride ? env.VITE_STAGING_SUPABASE_URL : stagingBackend.url) : env.VITE_SUPABASE_URL;
 const key = staging ? (hasStagingOverride ? env.VITE_STAGING_SUPABASE_ANON_KEY : stagingBackend.key) : env.VITE_SUPABASE_ANON_KEY;
 if (!url || !key) return null;
 try {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") return null;
  if (staging && (parsed.hostname === productionHost || url === env.VITE_SUPABASE_URL)) return null;
  return { url, key };
 } catch { return null; }
}
