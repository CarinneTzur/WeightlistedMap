import { isSupabaseConfigured, supabase } from "../lib/supabase";

const DIRECT_THREADS_KEY = "weightlisted.directMessageThreads";
const SERVICE_REQUESTS_KEY = "weightlisted.serviceRequests";
const COACH_DEMO_SEEDED_KEY = "weightlisted.coachWorkspaceDemoSeeded.v6";

export const DIRECT_MESSAGES_CHANGED_EVENT = "weightlisted:direct-messages-changed";
export const SERVICE_REQUESTS_CHANGED_EVENT = "weightlisted:service-requests-changed";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const backendWarnings = new Set();
let realtimeSubscriptionId = 0;

function isUuid(value) {
	return UUID_PATTERN.test(String(value || ""));
}

function remoteJson(value) {
	try {
		return JSON.parse(JSON.stringify(value, (key, item) => {
			if (key === "file") return undefined;
			if (key === "url" && String(item || "").startsWith("blob:")) return undefined;
			return item;
		}));
	} catch {
		return value;
	}
}

function warnBackendOnce(label, error) {
	if (backendWarnings.has(label)) return;
	backendWarnings.add(label);
	console.warn(`Marketplace backend ${label} is unavailable; the local cache is still active.`, error);
}

function queueBackendRpc(label, rpcName, args) {
	if (!isSupabaseConfigured || !supabase) return;
	Promise.resolve()
		.then(async () => {
			const { data: authData } = await supabase.auth.getUser();
			if (!authData.user) return;
			const { error } = await supabase.rpc(rpcName, remoteJson(args));
			if (error) throw error;
			await syncMarketplaceData();
		})
		.catch((error) => warnBackendOnce(label, error));
}

function readStoredList(key) {
	if (typeof window === "undefined") return [];
	try {
		const value = JSON.parse(window.localStorage.getItem(key) || "[]");
		return Array.isArray(value) ? value : [];
	} catch {
		return [];
	}
}

function writeStoredList(key, eventName, items) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(key, JSON.stringify(items));
		window.dispatchEvent(new CustomEvent(eventName));
	} catch {
		// Keep the in-memory UI usable when storage is unavailable.
	}
}

function mergeRemoteItems(localItems, remoteItems) {
	const remoteIds = new Set(remoteItems.map((item) => item?.id).filter(Boolean));
	return [
		...remoteItems,
		...localItems.filter((item) => !remoteIds.has(item?.id)),
	].sort(byMostRecent).slice(0, 100);
}

function mapRemoteConversation(row) {
	return {
		...(row?.payload || {}),
		id: row.id,
		coachId: row.coach_application_id,
		relationshipStatus: row.relationship_status,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		readByClientAt: row.read_by_client_at,
		readByCoachAt: row.read_by_coach_at,
	};
}

function mapRemoteServiceRequest(row) {
	return {
		...(row?.payload || {}),
		id: row.id,
		requestStatus: row.request_status,
		paymentStatus: row.payment_status,
		payoutStatus: row.payout_status,
		passedByCoachIds: row.passed_by_coach_ids || row?.payload?.passedByCoachIds || [],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		readByClientAt: row.read_by_client_at,
		readByCoachAt: row.read_by_coach_at,
		claimedAt: row.claimed_at || row?.payload?.claimedAt || null,
	};
}

export async function syncMarketplaceData() {
	if (!isSupabaseConfigured || !supabase) return false;
	const { data: authData, error: authError } = await supabase.auth.getUser();
	if (authError) throw authError;
	if (!authData.user) return false;

	const [conversationResult, requestResult] = await Promise.all([
		supabase
			.from("marketplace_conversations")
			.select("id,coach_application_id,relationship_status,payload,read_by_client_at,read_by_coach_at,created_at,updated_at")
			.order("updated_at", { ascending: false })
			.limit(100),
		supabase
			.from("marketplace_service_requests")
			.select("id,request_status,payment_status,payout_status,passed_by_coach_ids,payload,read_by_client_at,read_by_coach_at,claimed_at,created_at,updated_at")
			.order("updated_at", { ascending: false })
			.limit(100),
	]);
	if (conversationResult.error) throw conversationResult.error;
	if (requestResult.error) throw requestResult.error;

	const remoteThreads = (conversationResult.data || []).map(mapRemoteConversation);
	const remoteRequests = (requestResult.data || []).map(mapRemoteServiceRequest);
	writeStoredList(
		DIRECT_THREADS_KEY,
		DIRECT_MESSAGES_CHANGED_EVENT,
		mergeRemoteItems(readStoredList(DIRECT_THREADS_KEY), remoteThreads),
	);
	writeStoredList(
		SERVICE_REQUESTS_KEY,
		SERVICE_REQUESTS_CHANGED_EVENT,
		mergeRemoteItems(readStoredList(SERVICE_REQUESTS_KEY), remoteRequests),
	);
	return true;
}

export function refreshMarketplaceData() {
	return syncMarketplaceData().catch((error) => {
		warnBackendOnce("sync", error);
		return false;
	});
}

export function subscribeMarketplaceData(onChange) {
	if (!isSupabaseConfigured || !supabase) return () => {};
	realtimeSubscriptionId += 1;
	const channel = supabase
		.channel(`marketplace-ui-${realtimeSubscriptionId}`)
		.on("postgres_changes", { event: "*", schema: "public", table: "marketplace_conversations" }, () => {
			void refreshMarketplaceData().then(() => onChange?.());
		})
		.on("postgres_changes", { event: "*", schema: "public", table: "marketplace_service_requests" }, () => {
			void refreshMarketplaceData().then(() => onChange?.());
		})
		.subscribe();
	return () => {
		void supabase.removeChannel(channel);
	};
}

export function clearMarketplaceLocalCache() {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(DIRECT_THREADS_KEY);
		window.localStorage.removeItem(SERVICE_REQUESTS_KEY);
		window.localStorage.removeItem(COACH_DEMO_SEEDED_KEY);
	} catch {
		// Sign-out should still proceed when browser storage is unavailable.
	}
	window.dispatchEvent(new CustomEvent(DIRECT_MESSAGES_CHANGED_EVENT));
	window.dispatchEvent(new CustomEvent(SERVICE_REQUESTS_CHANGED_EVENT));
}

function byMostRecent(left, right) {
	return new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0);
}

function compactProfile(client = {}) {
	return {
		id: client.id || client.userId || "",
		fullName: client.fullName || client.name || "Weightlisted client",
		avatarUrl: client.avatarUrl || client.avatar_url || "",
		city: client.city || "",
		gymName: client.gymName || client.gym_name || "",
		trainingFocus: client.trainingFocus || client.training_focus || [],
		trainingNote: client.trainingNote || client.training_note || "",
		profileVisible: client.profileVisible ?? client.profile_visible ?? true,
	};
}

function loadAllDirectMessageThreads() {
	return readStoredList(DIRECT_THREADS_KEY).sort(byMostRecent);
}

export function getClientRelationshipStatus(thread) {
	return ["pending", "accepted", "declined"].includes(thread?.relationshipStatus)
		? thread.relationshipStatus
		: "pending";
}

export function loadDirectMessageThreads({ view = "user", userId = "", coachId = "" } = {}) {
	const threads = loadAllDirectMessageThreads();
	if (view === "coach") {
		if (!coachId) return [];
		return threads.filter(
			(thread) => thread.coachId === coachId && thread.client?.profileVisible !== false,
		);
	}
	if (!userId) return [];
	return threads.filter((thread) => thread.client?.id === userId);
}

export function loadDirectMessageThread(coachId, { userId = "" } = {}) {
	return loadDirectMessageThreads({ view: "user", userId })
		.find((thread) => thread.coachId === coachId) || null;
}

export function loadDirectMessageThreadById(threadId, access = {}) {
	return loadDirectMessageThreads(access).find((thread) => thread.id === threadId) || null;
}

export function appendDirectMessage(coach, message, client = {}) {
	const now = message.createdAt || new Date().toISOString();
	const threads = loadAllDirectMessageThreads();
	const clientProfile = compactProfile(client);
	if (!clientProfile.id) throw new Error("Sign in before saving a conversation.");
	const existing = threads.find(
		(thread) => thread.coachId === coach.id && thread.client?.id === clientProfile.id,
	);
	const nextThread = {
		id: existing?.id || `direct-${clientProfile.id}-${coach.id}`,
		type: "direct",
		coachId: coach.id,
		coachName: coach.name,
		coachTitle: coach.title,
		coachHeadshot: coach.headshot,
		client: clientProfile,
		relationshipStatus: existing?.relationshipStatus || "pending",
		relationshipRequestedAt: existing?.relationshipRequestedAt || now,
		createdAt: existing?.createdAt || now,
		updatedAt: now,
		readByClientAt: now,
		readByCoachAt: existing?.readByCoachAt || null,
		unreadForClient: existing?.unreadForClient || 0,
		unreadForCoach: (existing?.unreadForCoach || 0) + (message.sender === "client" ? 1 : 0),
		messages: [...(existing?.messages || []), message].slice(-100),
	};
	writeStoredList(DIRECT_THREADS_KEY, DIRECT_MESSAGES_CHANGED_EVENT, [
		nextThread,
		...threads.filter((thread) => thread.id !== nextThread.id),
	].slice(0, 50));
	if (isUuid(coach.id)) {
		queueBackendRpc("conversation write", "create_or_append_marketplace_conversation", {
			p_coach_application_id: coach.id,
			p_message: message,
			p_client_snapshot: clientProfile,
		});
	}
	return nextThread;
}

export function updateClientRelationship(threadId, relationshipStatus) {
	if (!["pending", "accepted", "declined"].includes(relationshipStatus)) {
		throw new Error("Choose a valid client relationship status.");
	}
	const threads = loadAllDirectMessageThreads();
	const existing = threads.find((thread) => thread.id === threadId);
	if (!existing) return null;
	const now = new Date().toISOString();
	const nextThread = {
		...existing,
		relationshipStatus,
		relationshipUpdatedAt: now,
		updatedAt: now,
		unreadForClient: (existing.unreadForClient || 0) + 1,
	};
	writeStoredList(
		DIRECT_THREADS_KEY,
		DIRECT_MESSAGES_CHANGED_EVENT,
		threads.map((thread) => (thread.id === threadId ? nextThread : thread)),
	);
	queueBackendRpc("relationship update", "set_marketplace_relationship", {
		p_conversation_id: threadId,
		p_relationship_status: relationshipStatus,
	});
	return nextThread;
}

export function appendDirectMessageReply(threadId, message) {
	const now = message.createdAt || new Date().toISOString();
	const threads = loadAllDirectMessageThreads();
	const existing = threads.find((thread) => thread.id === threadId);
	if (!existing) return null;
	const nextThread = {
		...existing,
		updatedAt: now,
		readByCoachAt: now,
		unreadForCoach: 0,
		unreadForClient: (existing.unreadForClient || 0) + 1,
		messages: [...(existing.messages || []), { ...message, sender: "coach", createdAt: now }].slice(-100),
	};
	writeStoredList(DIRECT_THREADS_KEY, DIRECT_MESSAGES_CHANGED_EVENT, [
		nextThread,
		...threads.filter((thread) => thread.id !== threadId),
	].slice(0, 50));
	queueBackendRpc("coach message", "append_marketplace_conversation_message", {
		p_conversation_id: threadId,
		p_message: message,
	});
	return nextThread;
}

export function markDirectMessageThreadRead(threadId, reader = "coach") {
	const threads = loadAllDirectMessageThreads();
	const existing = threads.find((thread) => thread.id === threadId);
	if (!existing) return null;
	const now = new Date().toISOString();
	const nextThread = {
		...existing,
		...(reader === "coach"
			? { unreadForCoach: 0, readByCoachAt: now }
			: { unreadForClient: 0, readByClientAt: now }),
	};
	writeStoredList(
		DIRECT_THREADS_KEY,
		DIRECT_MESSAGES_CHANGED_EVENT,
		threads.map((thread) => (thread.id === threadId ? nextThread : thread)),
	);
	queueBackendRpc("conversation read state", "mark_marketplace_conversation_read", {
		p_conversation_id: threadId,
	});
	return nextThread;
}

function loadAllServiceRequests() {
	return readStoredList(SERVICE_REQUESTS_KEY).sort(byMostRecent);
}

export function loadServiceRequests({ view = "user", userId = "", coachId = "" } = {}) {
	const requests = loadAllServiceRequests();
	if (view === "coach") {
		if (!coachId) return [];
		return requests.filter((request) => {
			if (request.client?.profileVisible === false) return false;
			if (request.claimedBy?.id === coachId) return true;
			return (
				request.requestStatus === "matching" &&
				request.paymentStatus === "paid" &&
				!(request.passedByCoachIds || []).includes(coachId)
			);
		});
	}
	if (!userId) return [];
	return requests.filter((request) => request.client?.id === userId);
}

function saveServiceRequestLocal(request) {
	const requests = loadAllServiceRequests();
	const now = request.updatedAt || request.createdAt || new Date().toISOString();
	const nextRequest = { ...request, updatedAt: now };
	writeStoredList(SERVICE_REQUESTS_KEY, SERVICE_REQUESTS_CHANGED_EVENT, [
		nextRequest,
		...requests.filter((item) => item.id !== request.id),
	].slice(0, 50));
	return nextRequest;
}

export function saveServiceRequest(request) {
	const nextRequest = saveServiceRequestLocal(request);
	queueBackendRpc("service request creation", "create_marketplace_service_request", {
		p_request: nextRequest,
	});
	return nextRequest;
}

export function updateServiceRequest(requestId, patchOrUpdater) {
	const requests = loadAllServiceRequests();
	const existing = requests.find((item) => item.id === requestId);
	if (!existing) return null;
	const patch = typeof patchOrUpdater === "function" ? patchOrUpdater(existing) : patchOrUpdater;
	const nextRequest = saveServiceRequestLocal({ ...existing, ...(patch || {}), updatedAt: new Date().toISOString() });
	queueBackendRpc("service request update", "update_marketplace_service_request", {
		p_request_id: requestId,
		p_patch: patch || {},
	});
	return nextRequest;
}

export function appendServiceRequestMessage(requestId, message) {
	const request = loadAllServiceRequests().find((item) => item.id === requestId);
	if (!request) return null;
	const now = message.createdAt || new Date().toISOString();
	const nextRequest = saveServiceRequestLocal({
		...request,
		updatedAt: now,
		messages: [...(request.messages || []), message].slice(-100),
		unreadForCoach: message.sender === "client" ? (request.unreadForCoach || 0) + 1 : 0,
		unreadForClient: message.sender === "coach" ? (request.unreadForClient || 0) + 1 : request.unreadForClient || 0,
	});
	queueBackendRpc("service request message", "append_marketplace_service_message", {
		p_request_id: requestId,
		p_message: message,
	});
	return nextRequest;
}

export function claimServiceRequest(requestId, coach) {
	const request = loadAllServiceRequests().find((item) => item.id === requestId);
	if (!request) throw new Error("This request is no longer available.");
	if (request.requestStatus !== "matching" || request.paymentStatus !== "paid") {
		throw new Error("Another coach accepted this request or payment is not complete.");
	}
	const nextRequest = saveServiceRequestLocal({
		...request,
		requestStatus: "claimed",
		availabilityStatus: "claimed",
		claimedAt: new Date().toISOString(),
		claimedBy: {
			id: coach.id,
			name: coach.name,
			title: coach.title,
			avatarUrl: coach.avatarUrl || "",
		},
		updatedAt: new Date().toISOString(),
	});
	if (isUuid(coach.id)) {
		queueBackendRpc("service request claim", "claim_marketplace_service_request", {
			p_request_id: requestId,
			p_coach_application_id: coach.id,
		});
	}
	return nextRequest;
}

export function passServiceRequest(requestId, coachId) {
	const request = loadAllServiceRequests().find((item) => item.id === requestId);
	if (!request) return null;
	const nextRequest = saveServiceRequestLocal({
		...request,
		passedByCoachIds: [...new Set([...(request.passedByCoachIds || []), coachId])],
		updatedAt: new Date().toISOString(),
	});
	if (isUuid(coachId)) {
		queueBackendRpc("service request pass", "pass_marketplace_service_request", {
			p_request_id: requestId,
			p_coach_application_id: coachId,
		});
	}
	return nextRequest;
}

export function markServiceRequestRead(requestId, reader = "coach") {
	const request = loadAllServiceRequests().find((item) => item.id === requestId);
	if (!request) return null;
	const nextRequest = saveServiceRequestLocal({
		...request,
		...(reader === "coach"
			? { unreadForCoach: 0, readByCoachAt: new Date().toISOString() }
			: { unreadForClient: 0, readByClientAt: new Date().toISOString() }),
	});
	queueBackendRpc("service request read state", "mark_marketplace_service_request_read", {
		p_request_id: requestId,
	});
	return nextRequest;
}

export async function markServiceRequestPaidByAdmin(requestId, paymentReference = "") {
	if (!supabase) throw new Error("Supabase is not configured.");
	const { data, error } = await supabase.rpc("mark_marketplace_service_request_paid", {
		p_request_id: requestId,
		p_payment_reference: paymentReference,
	});
	if (error) throw error;
	await syncMarketplaceData();
	return Array.isArray(data) ? mapRemoteServiceRequest(data[0]) : data;
}

export async function loadAdminMarketplaceOverview() {
	if (!supabase) throw new Error("Supabase is not configured.");
	const [conversationResult, requestResult] = await Promise.all([
		supabase
			.from("marketplace_conversations")
			.select("id,coach_application_id,relationship_status,payload,read_by_client_at,read_by_coach_at,created_at,updated_at")
			.order("updated_at", { ascending: false })
			.limit(50),
		supabase
			.from("marketplace_service_requests")
			.select("id,request_status,payment_status,payout_status,passed_by_coach_ids,payload,read_by_client_at,read_by_coach_at,claimed_at,created_at,updated_at")
			.order("updated_at", { ascending: false })
			.limit(50),
	]);
	if (conversationResult.error) throw conversationResult.error;
	if (requestResult.error) throw requestResult.error;
	return {
		conversations: (conversationResult.data || []).map(mapRemoteConversation),
		serviceRequests: (requestResult.data || []).map(mapRemoteServiceRequest),
	};
}

function minutesAgo(minutes) {
	return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function daysFromNow(days) {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return date.toISOString().slice(0, 10);
}

export function ensureCoachWorkspaceDemoData(coach = {}) {
	if (typeof window === "undefined" || !import.meta.env.DEV) return;
	const coachId = coach.id || "local-weightlisted-coach";
	const seedOwner = `${coachId}:v6`;
	try {
		if (window.localStorage.getItem(COACH_DEMO_SEEDED_KEY) === seedOwner) return;
	} catch {
		return;
	}

	const existingThreads = loadAllDirectMessageThreads();
	const demoThreads = [
		{
			id: "coach-demo-thread-alicia",
			type: "direct",
			relationshipStatus: "pending",
			coachId,
			coachName: coach.name || "Weightlisted Founder",
			client: {
				id: "demo-client-alicia",
				fullName: "Alicia Moreno",
				city: "Austin, TX",
				gymName: "Eastside Barbell",
				trainingFocus: ["Powerlifting", "Technique"],
				trainingNote: "Preparing for my first sanctioned meet and working on squat depth.",
				profileVisible: true,
			},
			createdAt: minutesAgo(90),
			updatedAt: minutesAgo(12),
			unreadForCoach: 2,
			unreadForClient: 0,
			messages: [
				{ id: "demo-message-a1", sender: "client", text: "Hi! I found your profile through Weightlisted. Do you work with first-time powerlifting competitors?", createdAt: minutesAgo(90), attachments: [] },
				{ id: "demo-message-a2", sender: "client", text: "I’m especially looking for help with attempt selection and confidence under meet commands.", createdAt: minutesAgo(12), attachments: [] },
			],
		},
		{
			id: "coach-demo-thread-jordan",
			type: "direct",
			relationshipStatus: "accepted",
			coachId,
			coachName: coach.name || "Weightlisted Founder",
			client: {
				id: "demo-client-jordan",
				fullName: "Jordan Lee",
				city: "Brooklyn, NY",
				gymName: "Harbor Strength",
				trainingFocus: ["Bodybuilding", "Nutrition"],
				trainingNote: "Returning to consistent training after a long break.",
				profileVisible: true,
			},
			createdAt: minutesAgo(1440),
			updatedAt: minutesAgo(220),
			unreadForCoach: 0,
			unreadForClient: 0,
			messages: [
				{ id: "demo-message-j1", sender: "client", text: "Would online coaching work if I train at a commercial gym?", createdAt: minutesAgo(1440), attachments: [] },
				{ id: "demo-message-j2", sender: "coach", text: "Absolutely. Your gym setup and schedule are enough for me to tailor the plan.", createdAt: minutesAgo(220), attachments: [] },
			],
		},
		{
			id: "coach-demo-v3-thread-camila",
			type: "direct",
			relationshipStatus: "pending",
			coachId,
			coachName: coach.name || "Weightlisted Founder",
			client: {
				id: "demo-v3-client-camila",
				fullName: "Camila Ross",
				city: "Miami, FL",
				gymName: "Iron District Miami",
				trainingFocus: ["Bodybuilding", "Competition Prep"],
				trainingNote: "Preparing for a first wellness show and building confidence with posing.",
				profileVisible: true,
			},
			createdAt: minutesAgo(210),
			updatedAt: minutesAgo(34),
			unreadForCoach: 1,
			unreadForClient: 0,
			messages: [
				{ id: "demo-v3-message-camila-1", sender: "client", text: "Could you help me make my quarter turns look less stiff before my next check-in?", createdAt: minutesAgo(34), attachments: [] },
			],
		},
		{
			id: "coach-demo-v3-thread-marcus",
			type: "direct",
			relationshipStatus: "accepted",
			coachId,
			coachName: coach.name || "Weightlisted Founder",
			client: {
				id: "demo-v3-client-marcus",
				fullName: "Marcus Reed",
				city: "Chicago, IL",
				gymName: "South Loop Strength",
				trainingFocus: ["General Fitness", "Strength"],
				trainingNote: "Training around a busy travel schedule and trying to stay consistent.",
				profileVisible: true,
			},
			createdAt: minutesAgo(2880),
			updatedAt: minutesAgo(55),
			unreadForCoach: 0,
			unreadForClient: 0,
			messages: [
				{ id: "demo-v3-message-marcus-1", sender: "client", text: "Three check-ins this week would help me stay on track while I’m traveling.", createdAt: minutesAgo(180), attachments: [] },
				{ id: "demo-v3-message-marcus-2", sender: "coach", text: "That works. Send me your planned training days and I’ll check in after each one.", createdAt: minutesAgo(55), attachments: [] },
			],
		},
		{
			id: "coach-demo-v3-thread-priya",
			type: "direct",
			relationshipStatus: "accepted",
			coachId,
			coachName: coach.name || "Weightlisted Founder",
			client: {
				id: "demo-v3-client-priya",
				fullName: "Priya Shah",
				city: "Seattle, WA",
				gymName: "Rain City Barbell",
				trainingFocus: ["Olympic Weightlifting", "Technique"],
				trainingNote: "Improving consistency in the snatch and preparing for a local meet.",
				profileVisible: true,
			},
			createdAt: minutesAgo(4320),
			updatedAt: minutesAgo(780),
			unreadForCoach: 0,
			unreadForClient: 0,
			messages: [
				{ id: "demo-v3-message-priya-1", sender: "client", text: "Thanks again—the cue about staying over the bar made a huge difference.", createdAt: minutesAgo(780), attachments: [] },
			],
		},
		{
			id: "coach-demo-v5-thread-devon",
			type: "direct",
			relationshipStatus: "accepted",
			coachId,
			coachName: coach.name || "Weightlisted Founder",
			client: {
				id: "demo-v5-client-devon",
				fullName: "Devon Carter",
				city: "Dallas, TX",
				gymName: "Oak Cliff Barbell",
				trainingFocus: ["Powerlifting", "Competition Prep"],
				trainingNote: "Building toward a 600-pound deadlift and planning a fall meet.",
				profileVisible: true,
			},
			createdAt: minutesAgo(17280),
			updatedAt: minutesAgo(8),
			unreadForCoach: 3,
			unreadForClient: 0,
			messages: [
				{ id: "demo-v5-message-devon-1", sender: "coach", text: "Send me your top set after training and let me know how the new stance feels.", createdAt: minutesAgo(1440), attachments: [] },
				{ id: "demo-v5-message-devon-2", sender: "client", text: "The new stance felt much stronger off the floor.", createdAt: minutesAgo(24), attachments: [] },
				{ id: "demo-v5-message-devon-3", sender: "client", text: "I uploaded the 475 set. My grip started slipping on the fourth rep.", createdAt: minutesAgo(12), attachments: [] },
				{ id: "demo-v5-message-devon-4", sender: "client", text: "Should I use straps for the back-off sets this week?", createdAt: minutesAgo(8), attachments: [] },
			],
		},
		{
			id: "coach-demo-v5-thread-maya",
			type: "direct",
			relationshipStatus: "pending",
			coachId,
			coachName: coach.name || "Weightlisted Founder",
			client: {
				id: "demo-v5-client-maya",
				fullName: "Maya Thompson",
				city: "Denver, CO",
				gymName: "Mile High Fitness",
				trainingFocus: ["General Fitness", "Nutrition"],
				trainingNote: "Looking for structure, sustainable fat loss, and consistent weekly check-ins.",
				profileVisible: true,
			},
			createdAt: minutesAgo(310),
			updatedAt: minutesAgo(42),
			unreadForCoach: 2,
			unreadForClient: 0,
			messages: [
				{ id: "demo-v5-message-maya-1", sender: "client", text: "I’m looking for a coach who can keep nutrition simple and work around shift work.", createdAt: minutesAgo(310), attachments: [] },
				{ id: "demo-v5-message-maya-2", sender: "client", text: "Would weekly check-ins plus a three-day lifting plan be something you offer?", createdAt: minutesAgo(42), attachments: [] },
			],
		},
		{
			id: "coach-demo-v5-thread-ethan",
			type: "direct",
			relationshipStatus: "accepted",
			coachId,
			coachName: coach.name || "Weightlisted Founder",
			client: {
				id: "demo-v5-client-ethan",
				fullName: "Ethan Brooks",
				city: "Boston, MA",
				gymName: "Back Bay Iron",
				trainingFocus: ["Bodybuilding", "Hypertrophy"],
				trainingNote: "Adding upper-body size while managing recurring elbow irritation.",
				profileVisible: true,
			},
			createdAt: minutesAgo(30240),
			updatedAt: minutesAgo(360),
			unreadForCoach: 0,
			unreadForClient: 0,
			messages: [
				{ id: "demo-v5-message-ethan-1", sender: "client", text: "The cable variations felt much better on my elbows this week.", createdAt: minutesAgo(520), attachments: [] },
				{ id: "demo-v5-message-ethan-2", sender: "coach", text: "Great. Keep those in for another week and send your rep notes after Saturday.", createdAt: minutesAgo(360), attachments: [] },
			],
		},
		{
			id: "coach-demo-v5-thread-sofia",
			type: "direct",
			relationshipStatus: "pending",
			coachId,
			coachName: coach.name || "Weightlisted Founder",
			client: {
				id: "demo-v5-client-sofia",
				fullName: "Sofia Nguyen",
				city: "San Diego, CA",
				gymName: "Pacific Weightlifting",
				trainingFocus: ["Olympic Weightlifting", "Technique"],
				trainingNote: "New to competing and struggling to receive cleans confidently.",
				profileVisible: true,
			},
			createdAt: minutesAgo(190),
			updatedAt: minutesAgo(65),
			unreadForCoach: 1,
			unreadForClient: 0,
			messages: [
				{ id: "demo-v5-message-sofia-1", sender: "client", text: "I’ve trained weightlifting for nine months and want guidance before signing up for my first meet.", createdAt: minutesAgo(65), attachments: [] },
			],
		},
		{
			id: "coach-demo-v5-thread-noah",
			type: "direct",
			relationshipStatus: "accepted",
			coachId,
			coachName: coach.name || "Weightlisted Founder",
			client: {
				id: "demo-v5-client-noah",
				fullName: "Noah Williams",
				city: "Atlanta, GA",
				gymName: "Peachtree Performance",
				trainingFocus: ["Sports Performance", "Speed"],
				trainingNote: "College soccer player focused on acceleration and lower-body durability.",
				profileVisible: true,
			},
			createdAt: minutesAgo(20160),
			updatedAt: minutesAgo(95),
			unreadForCoach: 1,
			unreadForClient: 0,
			messages: [
				{ id: "demo-v5-message-noah-1", sender: "coach", text: "How did the first sprint session feel after your deload?", createdAt: minutesAgo(180), attachments: [] },
				{ id: "demo-v5-message-noah-2", sender: "client", text: "Fast and pain-free. Hamstrings felt good through all six starts.", createdAt: minutesAgo(95), attachments: [] },
			],
		},
		{
			id: "coach-demo-v5-thread-lena",
			type: "direct",
			relationshipStatus: "accepted",
			coachId,
			coachName: coach.name || "Weightlisted Founder",
			client: {
				id: "demo-v5-client-lena",
				fullName: "Lena Ortiz",
				city: "Phoenix, AZ",
				gymName: "Desert Strength Club",
				trainingFocus: ["Recreational Strength", "General Fitness"],
				trainingNote: "Training for strength and energy while balancing parenting and work.",
				profileVisible: true,
			},
			createdAt: minutesAgo(40320),
			updatedAt: minutesAgo(1500),
			unreadForCoach: 0,
			unreadForClient: 0,
			messages: [
				{ id: "demo-v5-message-lena-1", sender: "client", text: "I got all three sessions done this week, even with the schedule change.", createdAt: minutesAgo(1600), attachments: [] },
				{ id: "demo-v5-message-lena-2", sender: "coach", text: "That consistency is the win. We’ll add load gradually next week.", createdAt: minutesAgo(1500), attachments: [] },
			],
		},
		{
			id: "coach-demo-v5-thread-darius",
			type: "direct",
			relationshipStatus: "pending",
			coachId,
			coachName: coach.name || "Weightlisted Founder",
			client: {
				id: "demo-v5-client-darius",
				fullName: "Darius King",
				city: "Philadelphia, PA",
				gymName: "Broad Street Barbell",
				trainingFocus: ["Powerlifting", "Strength"],
				trainingNote: "Intermediate lifter looking for long-term programming and meet-day guidance.",
				profileVisible: true,
			},
			createdAt: minutesAgo(520),
			updatedAt: minutesAgo(205),
			unreadForCoach: 1,
			unreadForClient: 0,
			messages: [
				{ id: "demo-v5-message-darius-1", sender: "client", text: "Do you take intermediate lifters who need both programming and meet-day support?", createdAt: minutesAgo(205), attachments: [] },
			],
		},
		{
			id: "coach-demo-v5-thread-zoe",
			type: "direct",
			relationshipStatus: "accepted",
			coachId,
			coachName: coach.name || "Weightlisted Founder",
			client: {
				id: "demo-v5-client-zoe",
				fullName: "Zoe Bennett",
				city: "Portland, OR",
				gymName: "Rose City Training",
				trainingFocus: ["Nutrition", "General Fitness"],
				trainingNote: "Improving strength and fueling habits without tracking every meal.",
				profileVisible: true,
			},
			createdAt: minutesAgo(50400),
			updatedAt: minutesAgo(30),
			unreadForCoach: 2,
			unreadForClient: 0,
			messages: [
				{ id: "demo-v5-message-zoe-1", sender: "client", text: "Breakfast has been consistent all week and training energy is noticeably better.", createdAt: minutesAgo(45), attachments: [] },
				{ id: "demo-v5-message-zoe-2", sender: "client", text: "Can we review easy lunch options at the next check-in?", createdAt: minutesAgo(30), attachments: [] },
			],
		},
	];
	const demoThreadById = new Map(demoThreads.map((thread) => [thread.id, thread]));
	const upgradedExistingThreads = existingThreads.map((thread) => {
		const demoThread = demoThreadById.get(thread.id);
		if (!demoThread || thread.relationshipStatus) return thread;
		return { ...thread, relationshipStatus: demoThread.relationshipStatus };
	});
	writeStoredList(DIRECT_THREADS_KEY, DIRECT_MESSAGES_CHANGED_EVENT, [
		...upgradedExistingThreads,
		...demoThreads.filter((demo) => !existingThreads.some((item) => item.id === demo.id)),
	]);

	const existingRequests = loadAllServiceRequests();
	const demoRequests = [
		{
			id: "coach-demo-request-form",
			serviceCategory: "quick_help",
			requestType: "form_review",
			specialties: ["powerlifting", "strength_training"],
			delivery: "async_remote",
			requestStatus: "matching",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "available",
			client: demoThreads[0].client,
			details: { discipline: "powerlifting", attemptType: "Training attempt", description: "Please check my squat depth and whether my hips are rising too quickly out of the bottom.", price: { currency: "USD", label: "$4", amount: 4 }, coachPayout: { currency: "USD", label: "$3.20", amount: 3.2 } },
			attachments: [{ id: "demo-attachment-squat", kind: "video", name: "squat-set-3.mp4", size: 18400000, mimeType: "video/mp4", status: "uploaded" }],
			createdAt: minutesAgo(18),
			updatedAt: minutesAgo(18),
			messages: [],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-request-accountability",
			serviceCategory: "accountability",
			requestType: "nutrition_accountability",
			specialties: ["general_fitness"],
			delivery: "async_remote",
			requestStatus: "matching",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "available",
			client: demoThreads[1].client,
			details: { duration: "A few days", description: "I want short evening check-ins to stay consistent with meal prep and protein targets.", price: { currency: "USD", label: "$8", amount: 8 }, coachPayout: { currency: "USD", label: "$6.40", amount: 6.4 } },
			attachments: [],
			createdAt: minutesAgo(46),
			updatedAt: minutesAgo(46),
			messages: [],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-request-session",
			serviceCategory: "session",
			requestType: "technique_session",
			specialties: ["powerlifting"],
			delivery: "live_remote",
			requestStatus: "claimed",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "claimed",
			claimedBy: { id: coachId, name: coach.name || "Weightlisted Founder", title: coach.title || "Coach", avatarUrl: coach.avatarUrl || "" },
			client: demoThreads[0].client,
			details: { discipline: "powerlifting", scheduledDate: daysFromNow(3), scheduledTime: "18:30", description: "I would like a 30-minute session focused on bench setup and leg drive.", price: { currency: "USD", label: "$15", amount: 15 }, coachPayout: { currency: "USD", label: "$12", amount: 12 }, scheduleStatus: "pending" },
			attachments: [],
			createdAt: minutesAgo(160),
			updatedAt: minutesAgo(80),
			messages: [{ id: "demo-service-message-1", sender: "client", text: "The requested time is flexible by about an hour if needed.", createdAt: minutesAgo(80) }],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-request-complete",
			serviceCategory: "competition",
			requestType: "Post-Meet Review",
			specialties: ["powerlifting"],
			delivery: "async_remote",
			requestStatus: "completed",
			paymentStatus: "paid",
			payoutStatus: "paid",
			availabilityStatus: "closed",
			claimedBy: { id: coachId, name: coach.name || "Weightlisted Founder", title: coach.title || "Coach", avatarUrl: coach.avatarUrl || "" },
			client: demoThreads[0].client,
			details: { sport: "powerlifting", eventDate: daysFromNow(7), description: "Review what went well and how I should structure the next block.", price: { currency: "USD", label: "$8", amount: 8 }, coachPayout: { currency: "USD", label: "$6.40", amount: 6.4 } },
			attachments: [],
			createdAt: minutesAgo(10080),
			updatedAt: minutesAgo(4320),
			messages: [{ id: "demo-service-message-complete", sender: "coach", text: "Your biggest win was consistent execution. I left three priorities for the next block above.", createdAt: minutesAgo(4320) }],
		},
		{
			id: "coach-demo-v3-request-posing",
			serviceCategory: "quick_help",
			requestType: "posing_review",
			specialties: ["bodybuilding", "competition_prep"],
			delivery: "async_remote",
			requestStatus: "matching",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "available",
			client: demoThreads.find((thread) => thread.id === "coach-demo-v3-thread-camila").client,
			details: { discipline: "bodybuilding", description: "Please review my front and side quarter turns and give me two or three corrections to practice this week.", price: { currency: "USD", label: "$5", amount: 5 }, coachPayout: { currency: "USD", label: "$4", amount: 4 } },
			attachments: [{ id: "demo-v3-attachment-posing", kind: "video", name: "quarter-turns.mp4", size: 12100000, mimeType: "video/mp4", status: "uploaded" }],
			createdAt: minutesAgo(22),
			updatedAt: minutesAgo(22),
			messages: [],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-v3-request-training",
			serviceCategory: "quick_help",
			requestType: "training_feedback",
			specialties: ["general_fitness", "strength_training"],
			delivery: "async_remote",
			requestStatus: "matching",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "available",
			client: demoThreads.find((thread) => thread.id === "coach-demo-v3-thread-marcus").client,
			details: { discipline: "recreational_strength", description: "Can you help me choose which three lifts to prioritize when I only have 40 minutes in the hotel gym?", price: { currency: "USD", label: "$6", amount: 6 }, coachPayout: { currency: "USD", label: "$4.80", amount: 4.8 } },
			attachments: [],
			createdAt: minutesAgo(38),
			updatedAt: minutesAgo(38),
			messages: [],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-v3-request-accountability-active",
			serviceCategory: "accountability",
			requestType: "training_accountability",
			specialties: ["general_fitness", "strength_training"],
			delivery: "async_remote",
			requestStatus: "claimed",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "claimed",
			claimedBy: { id: coachId, name: coach.name || "Weightlisted Founder", title: coach.title || "Coach", avatarUrl: coach.avatarUrl || "" },
			client: demoThreads.find((thread) => thread.id === "coach-demo-v3-thread-marcus").client,
			details: { duration: "One week", description: "Check in after my three planned workouts and help me adjust if travel disrupts the schedule.", price: { currency: "USD", label: "$10", amount: 10 }, coachPayout: { currency: "USD", label: "$8", amount: 8 } },
			attachments: [],
			createdAt: minutesAgo(1440),
			updatedAt: minutesAgo(55),
			messages: [
				{ id: "demo-v3-service-message-marcus-1", sender: "client", text: "Workout one is done. I had to swap the barbell rows for dumbbells, but everything else went to plan.", createdAt: minutesAgo(55) },
			],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-v3-request-technique-complete",
			serviceCategory: "quick_help",
			requestType: "form_review",
			specialties: ["olympic_weightlifting", "strength_training"],
			delivery: "async_remote",
			requestStatus: "completed",
			paymentStatus: "paid",
			payoutStatus: "paid",
			availabilityStatus: "closed",
			claimedBy: { id: coachId, name: coach.name || "Weightlisted Founder", title: coach.title || "Coach", avatarUrl: coach.avatarUrl || "" },
			client: demoThreads.find((thread) => thread.id === "coach-demo-v3-thread-priya").client,
			details: { discipline: "olympic_weightlifting", attemptType: "Training attempt", description: "Review my snatch from the hang and help me stop jumping forward.", price: { currency: "USD", label: "$4", amount: 4 }, coachPayout: { currency: "USD", label: "$3.20", amount: 3.2 } },
			attachments: [{ id: "demo-v3-attachment-snatch", kind: "video", name: "hang-snatch.mp4", size: 9600000, mimeType: "video/mp4", status: "uploaded" }],
			createdAt: minutesAgo(5760),
			updatedAt: minutesAgo(780),
			messages: [
				{ id: "demo-v3-service-message-priya-1", sender: "coach", text: "Stay over the bar a fraction longer and finish vertically before moving your feet. Your final two reps were already much closer.", createdAt: minutesAgo(900) },
				{ id: "demo-v3-service-message-priya-2", sender: "client", text: "That cue clicked right away—thank you!", createdAt: minutesAgo(780) },
			],
			unreadForCoach: 0,
		},
		{
			id: "coach-demo-v5-request-maya-nutrition",
			serviceCategory: "accountability",
			requestType: "nutrition_accountability",
			specialties: ["general_fitness", "nutrition"],
			delivery: "async_remote",
			requestStatus: "matching",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "available",
			client: demoThreads.find((thread) => thread.id === "coach-demo-v5-thread-maya").client,
			details: { duration: "One week", description: "Check in with me after dinner and help me keep protein and meal prep simple during night shifts.", price: { currency: "USD", label: "$15", amount: 15 }, coachPayout: { currency: "USD", label: "$12", amount: 12 } },
			attachments: [],
			createdAt: minutesAgo(14),
			updatedAt: minutesAgo(14),
			messages: [],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-v5-request-sofia-clean",
			serviceCategory: "quick_help",
			requestType: "form_review",
			specialties: ["olympic_weightlifting", "technique"],
			delivery: "async_remote",
			requestStatus: "matching",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "available",
			client: demoThreads.find((thread) => thread.id === "coach-demo-v5-thread-sofia").client,
			details: { discipline: "olympic_weightlifting", attemptType: "Training attempt", description: "My elbows are slow through on heavier cleans. Please review these two angles and suggest one drill.", price: { currency: "USD", label: "$4", amount: 4 }, coachPayout: { currency: "USD", label: "$3.20", amount: 3.2 } },
			attachments: [
				{ id: "demo-v5-attachment-clean-side", kind: "video", name: "clean-side-view.mp4", size: 8100000, mimeType: "video/mp4", status: "uploaded" },
				{ id: "demo-v5-attachment-clean-front", kind: "video", name: "clean-front-view.mp4", size: 7600000, mimeType: "video/mp4", status: "uploaded" },
			],
			createdAt: minutesAgo(29),
			updatedAt: minutesAgo(29),
			messages: [],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-v5-request-darius-meet",
			serviceCategory: "competition",
			requestType: "Meet Prep",
			specialties: ["powerlifting", "competition_prep"],
			delivery: "async_remote",
			requestStatus: "matching",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "available",
			client: demoThreads.find((thread) => thread.id === "coach-demo-v5-thread-darius").client,
			details: { sport: "powerlifting", eventDate: daysFromNow(24), description: "Help me choose conservative openers and a simple final-week plan for my second meet.", price: { currency: "USD", label: "$10", amount: 10 }, coachPayout: { currency: "USD", label: "$8", amount: 8 } },
			attachments: [{ id: "demo-v5-attachment-attempt-sheet", kind: "image", name: "recent-top-sets.jpg", size: 1200000, mimeType: "image/jpeg", status: "uploaded" }],
			createdAt: minutesAgo(51),
			updatedAt: minutesAgo(51),
			messages: [],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-v5-request-ethan-posing",
			serviceCategory: "quick_help",
			requestType: "posing_review",
			specialties: ["bodybuilding", "competition_prep"],
			delivery: "async_remote",
			requestStatus: "matching",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "available",
			client: demoThreads.find((thread) => thread.id === "coach-demo-v5-thread-ethan").client,
			details: { discipline: "bodybuilding", description: "Please review my relaxed front pose and lat spread. I lose my waist when I flare my lats.", price: { currency: "USD", label: "$5", amount: 5 }, coachPayout: { currency: "USD", label: "$4", amount: 4 } },
			attachments: [{ id: "demo-v5-attachment-lat-spread", kind: "video", name: "front-poses.mp4", size: 10600000, mimeType: "video/mp4", status: "uploaded" }],
			createdAt: minutesAgo(73),
			updatedAt: minutesAgo(73),
			messages: [],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-v5-request-lena-workout",
			serviceCategory: "session",
			requestType: "workout_guidance",
			specialties: ["recreational_strength", "general_fitness"],
			delivery: "live_remote",
			requestStatus: "matching",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "available",
			client: demoThreads.find((thread) => thread.id === "coach-demo-v5-thread-lena").client,
			details: { discipline: "recreational_strength", scheduledDate: daysFromNow(5), scheduledTime: "07:00", description: "Walk me through a short full-body workout and help me choose starting weights for a new gym.", price: { currency: "USD", label: "$18", amount: 18 }, coachPayout: { currency: "USD", label: "$14.40", amount: 14.4 }, scheduleStatus: "pending" },
			attachments: [],
			createdAt: minutesAgo(96),
			updatedAt: minutesAgo(96),
			messages: [],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-v5-request-zoe-nutrition",
			serviceCategory: "accountability",
			requestType: "nutrition_accountability",
			specialties: ["nutrition", "general_fitness"],
			delivery: "async_remote",
			requestStatus: "matching",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "available",
			client: demoThreads.find((thread) => thread.id === "coach-demo-v5-thread-zoe").client,
			details: { duration: "A few days", description: "Help me plan three repeatable lunches that support training without calorie tracking.", price: { currency: "USD", label: "$8", amount: 8 }, coachPayout: { currency: "USD", label: "$6.40", amount: 6.4 } },
			attachments: [],
			createdAt: minutesAgo(125),
			updatedAt: minutesAgo(125),
			messages: [],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-v5-request-devon-deadlift-active",
			serviceCategory: "quick_help",
			requestType: "attempt_review",
			specialties: ["powerlifting", "strength_training"],
			delivery: "async_remote",
			requestStatus: "in_progress",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "claimed",
			claimedBy: { id: coachId, name: coach.name || "Weightlisted Founder", title: coach.title || "Coach", avatarUrl: coach.avatarUrl || "" },
			client: demoThreads.find((thread) => thread.id === "coach-demo-v5-thread-devon").client,
			details: { discipline: "powerlifting", attemptType: "Training attempt", description: "Review my 475-pound deadlift set and tell me whether the grip issue is technical or just fatigue.", price: { currency: "USD", label: "$5", amount: 5 }, coachPayout: { currency: "USD", label: "$4", amount: 4 } },
			attachments: [{ id: "demo-v5-attachment-deadlift", kind: "video", name: "deadlift-475x4.mp4", size: 14200000, mimeType: "video/mp4", status: "uploaded" }],
			createdAt: minutesAgo(620),
			updatedAt: minutesAgo(8),
			messages: [{ id: "demo-v5-service-message-devon-1", sender: "client", text: "The first three reps felt secure. The bar started rolling on the fourth.", createdAt: minutesAgo(8) }],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-v5-request-noah-session-active",
			serviceCategory: "session",
			requestType: "technique_session",
			specialties: ["sports_performance", "speed"],
			delivery: "live_remote",
			requestStatus: "claimed",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "claimed",
			claimedBy: { id: coachId, name: coach.name || "Weightlisted Founder", title: coach.title || "Coach", avatarUrl: coach.avatarUrl || "" },
			client: demoThreads.find((thread) => thread.id === "coach-demo-v5-thread-noah").client,
			details: { discipline: "other", scheduledDate: daysFromNow(2), scheduledTime: "16:30", description: "Review acceleration mechanics and first-step position during a focused remote session.", price: { currency: "USD", label: "$15", amount: 15 }, coachPayout: { currency: "USD", label: "$12", amount: 12 }, scheduleStatus: "confirmed" },
			attachments: [],
			createdAt: minutesAgo(1320),
			updatedAt: minutesAgo(95),
			messages: [{ id: "demo-v5-service-message-noah-1", sender: "coach", text: "Your requested time is confirmed. Have space for three short starts on camera.", createdAt: minutesAgo(95) }],
			unreadForCoach: 0,
		},
		{
			id: "coach-demo-v5-request-ethan-training-active",
			serviceCategory: "quick_help",
			requestType: "training_feedback",
			specialties: ["bodybuilding", "hypertrophy"],
			delivery: "async_remote",
			requestStatus: "delivered",
			paymentStatus: "paid",
			payoutStatus: "pending",
			availabilityStatus: "claimed",
			claimedBy: { id: coachId, name: coach.name || "Weightlisted Founder", title: coach.title || "Coach", avatarUrl: coach.avatarUrl || "" },
			client: demoThreads.find((thread) => thread.id === "coach-demo-v5-thread-ethan").client,
			details: { discipline: "bodybuilding", description: "Review my current push day and suggest substitutions that are easier on my elbows.", price: { currency: "USD", label: "$6", amount: 6 }, coachPayout: { currency: "USD", label: "$4.80", amount: 4.8 } },
			attachments: [{ id: "demo-v5-attachment-push-day", kind: "image", name: "push-day-notes.jpg", size: 980000, mimeType: "image/jpeg", status: "uploaded" }],
			createdAt: minutesAgo(2280),
			updatedAt: minutesAgo(360),
			messages: [
				{ id: "demo-v5-service-message-ethan-1", sender: "coach", text: "I sent three substitutions and adjusted the pressing order. Try it once before marking this finished.", createdAt: minutesAgo(400) },
				{ id: "demo-v5-service-message-ethan-2", sender: "client", text: "This looks much better. I’ll run it tonight.", createdAt: minutesAgo(360) },
			],
			unreadForCoach: 1,
		},
		{
			id: "coach-demo-v5-request-sofia-jerk-complete",
			serviceCategory: "quick_help",
			requestType: "form_review",
			specialties: ["olympic_weightlifting", "technique"],
			delivery: "async_remote",
			requestStatus: "completed",
			paymentStatus: "paid",
			payoutStatus: "paid",
			availabilityStatus: "closed",
			claimedBy: { id: coachId, name: coach.name || "Weightlisted Founder", title: coach.title || "Coach", avatarUrl: coach.avatarUrl || "" },
			client: demoThreads.find((thread) => thread.id === "coach-demo-v5-thread-sofia").client,
			details: { discipline: "olympic_weightlifting", attemptType: "Training attempt", description: "Review my split jerk footwork and help me stop landing too narrow.", price: { currency: "USD", label: "$4", amount: 4 }, coachPayout: { currency: "USD", label: "$3.20", amount: 3.2 } },
			attachments: [{ id: "demo-v5-attachment-jerk", kind: "video", name: "split-jerk-footwork.mp4", size: 7200000, mimeType: "video/mp4", status: "uploaded" }],
			createdAt: minutesAgo(8640),
			updatedAt: minutesAgo(7200),
			messages: [{ id: "demo-v5-service-message-sofia-complete", sender: "coach", text: "Use the tape-mark drill for two weeks and keep the dip vertical. Your final rep was the target position.", createdAt: minutesAgo(7200) }],
			unreadForCoach: 0,
		},
		{
			id: "coach-demo-v5-request-maya-accountability-complete",
			serviceCategory: "accountability",
			requestType: "training_accountability",
			specialties: ["general_fitness", "strength_training"],
			delivery: "async_remote",
			requestStatus: "completed",
			paymentStatus: "paid",
			payoutStatus: "paid",
			availabilityStatus: "closed",
			claimedBy: { id: coachId, name: coach.name || "Weightlisted Founder", title: coach.title || "Coach", avatarUrl: coach.avatarUrl || "" },
			client: demoThreads.find((thread) => thread.id === "coach-demo-v5-thread-maya").client,
			details: { duration: "A few days", description: "Keep me accountable to two short workouts during a demanding work stretch.", price: { currency: "USD", label: "$8", amount: 8 }, coachPayout: { currency: "USD", label: "$6.40", amount: 6.4 } },
			attachments: [],
			createdAt: minutesAgo(12960),
			updatedAt: minutesAgo(10080),
			messages: [{ id: "demo-v5-service-message-maya-complete", sender: "client", text: "Both workouts are done. The short check-ins helped a lot.", createdAt: minutesAgo(10080) }],
			unreadForCoach: 0,
		},
		{
			id: "coach-demo-v5-request-darius-meet-complete",
			serviceCategory: "competition",
			requestType: "Post-Meet Review",
			specialties: ["powerlifting", "competition_prep"],
			delivery: "async_remote",
			requestStatus: "completed",
			paymentStatus: "paid",
			payoutStatus: "paid",
			availabilityStatus: "closed",
			claimedBy: { id: coachId, name: coach.name || "Weightlisted Founder", title: coach.title || "Coach", avatarUrl: coach.avatarUrl || "" },
			client: demoThreads.find((thread) => thread.id === "coach-demo-v5-thread-darius").client,
			details: { sport: "powerlifting", eventDate: daysFromNow(-35), description: "Review my attempt selection and help identify priorities for the next training block.", price: { currency: "USD", label: "$8", amount: 8 }, coachPayout: { currency: "USD", label: "$6.40", amount: 6.4 } },
			attachments: [{ id: "demo-v5-attachment-meet-results", kind: "image", name: "meet-results.jpg", size: 1600000, mimeType: "image/jpeg", status: "uploaded" }],
			createdAt: minutesAgo(43200),
			updatedAt: minutesAgo(38880),
			messages: [{ id: "demo-v5-service-message-darius-complete", sender: "coach", text: "Your openers were appropriate. The main opportunity is building more confidence with second attempts before meet day.", createdAt: minutesAgo(38880) }],
			unreadForCoach: 0,
		},
	];
	writeStoredList(SERVICE_REQUESTS_KEY, SERVICE_REQUESTS_CHANGED_EVENT, [
		...existingRequests,
		...demoRequests.filter((demo) => !existingRequests.some((item) => item.id === demo.id)),
	]);

	try {
		window.localStorage.setItem(COACH_DEMO_SEEDED_KEY, seedOwner);
	} catch {
		// Demo data is optional.
	}
}
