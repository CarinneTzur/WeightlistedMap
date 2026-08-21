const DIRECT_THREADS_KEY = "weightlisted.directMessageThreads";
const SERVICE_REQUESTS_KEY = "weightlisted.serviceRequests";

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

export function loadDirectMessageThreads() {
	return readStoredList(DIRECT_THREADS_KEY).sort(byMostRecent);
}

export function loadDirectMessageThread(coachId) {
	return loadDirectMessageThreads().find((thread) => thread.coachId === coachId) || null;
}

export function appendDirectMessage(coach, message) {
	const now = message.createdAt || new Date().toISOString();
	const threads = loadDirectMessageThreads();
	const existing = threads.find((thread) => thread.coachId === coach.id);
	const nextThread = {
		id: existing?.id || `direct-${coach.id}`,
		type: "direct",
		coachId: coach.id,
		coachName: coach.name,
		coachTitle: coach.title,
		coachHeadshot: coach.headshot,
		createdAt: existing?.createdAt || now,
		updatedAt: now,
		messages: [...(existing?.messages || []), message].slice(-100),
	};
	writeStoredList(
		DIRECT_THREADS_KEY,
		DIRECT_MESSAGES_CHANGED_EVENT,
		[nextThread, ...threads.filter((thread) => thread.coachId !== coach.id)].slice(0, 50),
	);
	return nextThread;
}

export function loadServiceRequests() {
	return readStoredList(SERVICE_REQUESTS_KEY).sort(byMostRecent);
}

export function saveServiceRequest(request) {
	const requests = loadServiceRequests();
	const now = request.updatedAt || request.createdAt || new Date().toISOString();
	const nextRequest = { ...request, updatedAt: now };
	writeStoredList(
		SERVICE_REQUESTS_KEY,
		SERVICE_REQUESTS_CHANGED_EVENT,
		[nextRequest, ...requests.filter((item) => item.id !== request.id)].slice(0, 50),
	);
	return nextRequest;
}

export function appendServiceRequestMessage(requestId, message) {
	const request = loadServiceRequests().find((item) => item.id === requestId);
	if (!request) return null;
	const now = message.createdAt || new Date().toISOString();
	return saveServiceRequest({
		...request,
		updatedAt: now,
		messages: [...(request.messages || []), message].slice(-100),
	});
}
