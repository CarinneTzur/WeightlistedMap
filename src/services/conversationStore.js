const DIRECT_THREADS_KEY = "weightlisted.directMessageThreads";
const SERVICE_REQUESTS_KEY = "weightlisted.serviceRequests";
const COACH_DEMO_SEEDED_KEY = "weightlisted.coachWorkspaceDemoSeeded.v2";

export const DIRECT_MESSAGES_CHANGED_EVENT = "weightlisted:direct-messages-changed";
export const SERVICE_REQUESTS_CHANGED_EVENT = "weightlisted:service-requests-changed";

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

export function saveServiceRequest(request) {
	const requests = loadAllServiceRequests();
	const now = request.updatedAt || request.createdAt || new Date().toISOString();
	const nextRequest = { ...request, updatedAt: now };
	writeStoredList(SERVICE_REQUESTS_KEY, SERVICE_REQUESTS_CHANGED_EVENT, [
		nextRequest,
		...requests.filter((item) => item.id !== request.id),
	].slice(0, 50));
	return nextRequest;
}

export function updateServiceRequest(requestId, patchOrUpdater) {
	const requests = loadAllServiceRequests();
	const existing = requests.find((item) => item.id === requestId);
	if (!existing) return null;
	const patch = typeof patchOrUpdater === "function" ? patchOrUpdater(existing) : patchOrUpdater;
	return saveServiceRequest({ ...existing, ...(patch || {}), updatedAt: new Date().toISOString() });
}

export function appendServiceRequestMessage(requestId, message) {
	const request = loadAllServiceRequests().find((item) => item.id === requestId);
	if (!request) return null;
	const now = message.createdAt || new Date().toISOString();
	return saveServiceRequest({
		...request,
		updatedAt: now,
		messages: [...(request.messages || []), message].slice(-100),
		unreadForCoach: message.sender === "client" ? (request.unreadForCoach || 0) + 1 : 0,
		unreadForClient: message.sender === "coach" ? (request.unreadForClient || 0) + 1 : request.unreadForClient || 0,
	});
}

export function claimServiceRequest(requestId, coach) {
	const request = loadAllServiceRequests().find((item) => item.id === requestId);
	if (!request) throw new Error("This request is no longer available.");
	if (request.requestStatus !== "matching" || request.paymentStatus !== "paid") {
		throw new Error("Another coach accepted this request or payment is not complete.");
	}
	return saveServiceRequest({
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
}

export function passServiceRequest(requestId, coachId) {
	return updateServiceRequest(requestId, (request) => ({
		passedByCoachIds: [...new Set([...(request.passedByCoachIds || []), coachId])],
	}));
}

export function markServiceRequestRead(requestId, reader = "coach") {
	return updateServiceRequest(requestId, {
		...(reader === "coach"
			? { unreadForCoach: 0, readByCoachAt: new Date().toISOString() }
			: { unreadForClient: 0, readByClientAt: new Date().toISOString() }),
	});
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
	const seedOwner = `${coachId}:v2`;
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
	];
	writeStoredList(DIRECT_THREADS_KEY, DIRECT_MESSAGES_CHANGED_EVENT, [
		...existingThreads,
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
