import { createClient } from "@supabase/supabase-js";
import { getBackendConfig, isStaging } from "./environment";

const config = getBackendConfig(import.meta.env, isStaging);
const supabaseUrl = config?.url;
const supabaseAnonKey = config?.key;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
	? createClient(supabaseUrl, supabaseAnonKey)
	: null;

export function requireSupabase() {
	if (!supabase) {
		throw new Error(
			"Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel to enable coach applications.",
		);
	}

	return supabase;
}
