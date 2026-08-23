import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

async function removeUserFolder(
	adminClient: ReturnType<typeof createClient>,
	bucket: string,
	prefix: string,
) {
	const { data, error } = await adminClient.storage.from(bucket).list(prefix, {
		limit: 1000,
	});
	if (error) throw error;
	const paths = (data || []).map((item) => `${prefix}/${item.name}`);
	if (!paths.length) return;
	const { error: removeError } = await adminClient.storage
		.from(bucket)
		.remove(paths);
	if (removeError) throw removeError;
}

Deno.serve(async (request) => {
	if (request.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders });
	}
	if (request.method !== "POST") {
		return jsonResponse({ error: "Method not allowed." }, 405);
	}

	const supabaseUrl = Deno.env.get("SUPABASE_URL");
	const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
	const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (!supabaseUrl || !anonKey || !serviceRoleKey) {
		return jsonResponse({ error: "Account deletion is not configured." }, 500);
	}

	const authorization = request.headers.get("Authorization") || "";
	const userClient = createClient(supabaseUrl, anonKey, {
		global: { headers: { Authorization: authorization } },
	});
	const { data: userData, error: userError } = await userClient.auth.getUser();
	if (userError || !userData.user) {
		return jsonResponse({ error: "You must be signed in to delete your account." }, 401);
	}

	try {
		const adminClient = createClient(supabaseUrl, serviceRoleKey, {
			auth: { autoRefreshToken: false, persistSession: false },
		});
		const userId = userData.user.id;
		await Promise.all([
			removeUserFolder(adminClient, "client-profile-photos", `clients/${userId}`),
			removeUserFolder(adminClient, "coach-photos", `applications/${userId}`),
		]);
		const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
		if (deleteError) throw deleteError;
		return jsonResponse({ ok: true });
	} catch (error) {
		return jsonResponse(
			{
				error:
					error instanceof Error
						? error.message
						: "The account could not be deleted.",
			},
			500,
		);
	}
});
