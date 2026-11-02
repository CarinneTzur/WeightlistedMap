import { useEffect, useMemo, useRef, useState } from "react";
import {
	MediaDraftTray,
	MediaPickerButton,
	MessageMediaGallery,
	useLocalMediaDrafts,
} from "./ChatMedia";
import {
	COMPETITION_SPORTS,
	getRequestTypeLabel,
	TRAINING_DISCIPLINES,
} from "../services/serviceRequestModel";
import {
	COACH_APPLICATION_CHANGED_EVENT,
	loadLocalCoachPublicProfile,
	saveLocalCoachPublicProfile,
	saveMyCoachPublicProfile,
} from "../../utils/coachApplications";
import {
	appendDirectMessageReply,
	appendServiceRequestMessage,
	claimServiceRequest,
	DIRECT_MESSAGES_CHANGED_EVENT,
	ensureCoachWorkspaceDemoData,
	getClientRelationshipStatus,
	loadDirectMessageThreads,
	loadServiceRequests,
	markDirectMessageThreadRead,
	markServiceRequestRead,
	passServiceRequest,
	refreshMarketplaceData,
	SERVICE_REQUESTS_CHANGED_EVENT,
	updateClientRelationship,
	updateServiceRequest,
} from "../services/conversationStore";
import { CoachReviewManager } from "./CoachReviews";
import GymPlaceAutocomplete from "./GymPlaceAutocomplete";
import SocialLinks, { SOCIAL_PLATFORMS, SocialIcon } from "./SocialLinks";
import coachWorkspaceBackground from "../../assets/coach-workspace-background.jpg";
import coachWorkspacePortrait from "../../assets/coach-workspace-portrait.png";
import "./CoachWorkspace.css";

const NAV_ITEMS = [
	{ id: "home", label: "Home" },
	{ id: "inbox", label: "Inbox" },
	{ id: "requests", label: "Quick Services" },
	{ id: "clients", label: "Clients" },
	{ id: "profile", label: "Public profile" },
	{ id: "account", label: "Account" },
];

const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => ["home", "inbox", "requests", "clients"].includes(item.id));

function NavigationIcon({ name }) {
	const paths = {
		home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
		inbox: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
		requests: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M18 8v6M15 11h6" /></>,
		clients: <><circle cx="8.5" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M2.5 20c0-4 2.5-6 6-6s6 2 6 6M15 15c3 0 5 1.5 5 4" /></>,
		profile: <><path d="M5 20V10M12 20V4M19 20v-7M3 20h18" /></>,
		account: <><path d="M4 7h10M18 7h2M14 5v4M4 17h2M10 17h10M8 15v4M4 12h4M12 12h8M10 10v4" /></>,
		more: <><circle cx="5" cy="12" r="1.25" /><circle cx="12" cy="12" r="1.25" /><circle cx="19" cy="12" r="1.25" /></>,
	};
	return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function FullscreenIcon({ expanded = false }) {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
			{expanded ? (
				<><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></>
			) : (
				<><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>
			)}
		</svg>
	);
}

const REQUEST_STATUS_LABELS = {
	awaiting_payment: "Payment required",
	matching: "Available",
	claimed: "Active",
	in_progress: "Active",
	delivered: "Active",
	completed: "Completed",
	refunded: "Refunded",
	cancelled: "Cancelled",
	pending: "Client request",
	accepted: "Active client",
	declined: "Not accepted",
};

const CATEGORY_LABELS = {
	quick_help: "Quick Help",
	accountability: "Accountability",
	session: "Session",
	competition: "Competition",
};

const QUICK_SERVICE_FILTERS = [
	{ id: "all", label: "All" },
	{ id: "technique", label: "Technique" },
	{ id: "training", label: "Training" },
	{ id: "nutrition", label: "Nutrition" },
	{ id: "competition", label: "Competition" },
	{ id: "sessions", label: "Live sessions" },
];

function matchesQuickServiceFilter(request, filter) {
	if (filter === "all") return true;
	const requestType = String(request.requestType || "").toLowerCase();
	if (filter === "technique") return ["form_review", "attempt_review", "technique_session"].includes(requestType);
	if (filter === "training") return ["training_feedback", "training_accountability", "workout_guidance"].includes(requestType);
	if (filter === "nutrition") return requestType.includes("nutrition");
	if (filter === "competition") return request.serviceCategory === "competition" || requestType.includes("posing") || requestType.includes("competition");
	if (filter === "sessions") return request.serviceCategory === "session";
	return true;
}

function bucketQuickServiceRequests(requests, coachId) {
	const buckets = { available: [], active: [], completed: [] };
	const seenIds = new Set();

	for (const request of requests) {
		if (!request?.id || seenIds.has(request.id)) continue;
		seenIds.add(request.id);
		const claimedByThisCoach = request.claimedBy?.id === coachId;
		let bucket = null;

		if (claimedByThisCoach && ["completed", "cancelled", "refunded"].includes(request.requestStatus)) {
			bucket = "completed";
		} else if (claimedByThisCoach && ["claimed", "in_progress", "delivered"].includes(request.requestStatus)) {
			bucket = "active";
		} else if (
			!request.claimedBy?.id &&
			request.requestStatus === "matching" &&
			request.paymentStatus === "paid" &&
			!(request.passedByCoachIds || []).includes(coachId)
		) {
			bucket = "available";
		}

		if (bucket) buckets[bucket].push(request);
	}

	return buckets;
}

function getQuickServiceInboxRequests(requests, coachId) {
	return requests.filter((request) => {
		if (request?.claimedBy?.id !== coachId) return false;
		if (["claimed", "in_progress", "delivered"].includes(request.requestStatus)) return true;
		return Boolean(request.messages?.length) && request.requestStatus === "completed";
	});
}

const PROFILE_SPECIALTIES = [
	"Powerlifting",
	"Bodybuilding",
	"Olympic Weightlifting",
	"Recreational Strength",
	"General Fitness",
	"Nutrition",
	"Technique",
	"Competition Prep",
];

const USER_FACING_VALUE_LABELS = new Map(
	[...TRAINING_DISCIPLINES, ...COMPETITION_SPORTS].map((option) => [option.id, option.label]),
);

function formatUserFacingValue(value) {
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (USER_FACING_VALUE_LABELS.has(trimmed)) return USER_FACING_VALUE_LABELS.get(trimmed);
	if (!trimmed.includes("_")) return trimmed;
	return trimmed
		.replace(/_+/g, " ")
		.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function normalizeStringList(value) {
	const entries = Array.isArray(value) ? value : String(value || "").split(",");
	return entries
		.map((entry) => String(entry || "").trim())
		.filter((entry, index, list) => entry && list.findIndex((item) => item.toLowerCase() === entry.toLowerCase()) === index);
}

function initials(value) {
	return String(value || "WL")
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("") || "WL";
}

function formatDate(value, includeTime = false) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	return new Intl.DateTimeFormat(undefined, includeTime
		? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
		: { month: "short", day: "numeric", year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }
	).format(date);
}

function relativeDate(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
	if (minutes < 1) return "Now";
	if (minutes < 60) return `${minutes}m`;
	if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
	return formatDate(value);
}

function requestTitle(request) {
	return getRequestTypeLabel({
		category: request?.serviceCategory,
		requestType: request?.requestType,
	});
}

function requestFocusLabel(request) {
	const formFocus = [request?.details?.sport, request?.details?.discipline]
		.find((value) => value && String(value).toLowerCase() !== "other");
	if (formFocus) return formatUserFacingValue(formFocus);

	const secondaryFocuses = new Set(["nutrition", "technique", "competition prep"]);
	const clientFocuses = (request?.client?.trainingFocus || [])
		.map((focus) => formatUserFacingValue(focus))
		.filter(Boolean);
	const primaryClientFocus = clientFocuses.find((focus) => !secondaryFocuses.has(focus.toLowerCase()));
	if (primaryClientFocus) return primaryClientFocus;

	const requestType = String(request?.requestType || "").toLowerCase();
	if (requestType.includes("nutrition")) return "Nutrition";
	if (requestType.includes("posing")) return "Bodybuilding";
	if (requestType.includes("competition") || request?.serviceCategory === "competition") return "Competition";
	if (requestType.includes("general")) return "General Fitness";

	if (clientFocuses[0]) return clientFocuses[0];
	const specialty = (request?.specialties || []).find((value) => value && value !== "strength_training");
	return formatUserFacingValue(specialty || "General Fitness");
}

function coachIdentity(application, user, profile) {
	return {
		id: application?.id || user?.id || "weightlisted-coach",
		name: application?.fullName || profile?.full_name || user?.user_metadata?.full_name || "Weightlisted Coach",
		title: application?.coachTitle || "Weightlisted Coach",
		avatarUrl: application?.profilePhotoUrl || profile?.avatar_url || "",
	};
}

function Avatar({ client, size = 44 }) {
	const name = client?.fullName || "Weightlisted client";
	return client?.avatarUrl ? (
		<img className="coach-workspace-avatar" style={{ width: size, height: size }} src={client.avatarUrl} alt="" />
	) : (
		<span className="coach-workspace-avatar coach-workspace-avatar--fallback" style={{ width: size, height: size }} aria-hidden="true">
			{initials(name)}
		</span>
	);
}

function PageHeading({ eyebrow, title, description, action }) {
	return (
		<header className="coach-workspace-page-heading">
			<div>
				<p>{eyebrow}</p>
				<h1>{title}</h1>
				{description ? <span>{description}</span> : null}
			</div>
			{action}
		</header>
	);
}

function StatusBadge({ status }) {
	return <span className={`coach-workspace-status coach-workspace-status--${status}`}>{REQUEST_STATUS_LABELS[status] || status}</span>;
}

function EmptyState({ title, description, action }) {
	return (
		<div className="coach-workspace-empty">
			<span aria-hidden="true">✦</span>
			<strong>{title}</strong>
			<p>{description}</p>
			{action}
		</div>
	);
}

function ClientSnapshot({ client, compact = false }) {
	if (!client) return null;
	return (
		<aside className={`coach-client-snapshot${compact ? " is-compact" : ""}`}>
			{compact ? null : (
				<div className="coach-client-snapshot__identity">
					<Avatar client={client} size={54} />
					<div>
						<strong>{client.fullName || "Weightlisted client"}</strong>
						<span>{[client.city, client.gymName].filter(Boolean).join(" · ") || "Shared profile"}</span>
					</div>
				</div>
			)}
			{client.profileVisible === false ? (
				<div className="coach-client-snapshot__hidden">This client’s profile is currently hidden. History stays available, but new actions are paused.</div>
			) : (
				<>
					{client.trainingFocus?.length ? (
						<div className="coach-workspace-tags">
							{client.trainingFocus.map((focus) => <span key={focus}>{formatUserFacingValue(focus)}</span>)}
						</div>
					) : null}
					{client.trainingNote ? <p>{client.trainingNote}</p> : null}
				</>
			)}
		</aside>
	);
}

function MessageComposer({ disabled, placeholder, onSend }) {
	const [text, setText] = useState("");
	const {
		attachments,
		error,
		addFiles,
		removeAttachment,
		detachAttachments,
	} = useLocalMediaDrafts();

	function submit(event) {
		event.preventDefault();
		const trimmed = text.trim();
		if (disabled || (!trimmed && !attachments.length)) return;
		onSend(trimmed, detachAttachments());
		setText("");
	}

	return (
		<form className="coach-message-composer" onSubmit={submit}>
			<MediaDraftTray attachments={attachments} onRemove={removeAttachment} />
			{error ? <p className="coach-message-composer__error">{error}</p> : null}
			<div>
				<MediaPickerButton onFiles={addFiles} />
				<textarea
					value={text}
					onChange={(event) => setText(event.target.value)}
					placeholder={disabled ? "Messaging is paused while this profile is hidden" : placeholder}
					disabled={disabled}
					rows={1}
				/>
				<button type="submit" disabled={disabled || (!text.trim() && !attachments.length)} aria-label="Send reply">➤</button>
			</div>
		</form>
	);
}

function ConversationMessages({ messages, clientName }) {
	const listRef = useRef(null);
	useEffect(() => {
		listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight, behavior: "smooth" });
	}, [messages]);
	return (
		<div ref={listRef} className="coach-conversation-messages coach-scroll-panel">
			{messages?.length ? messages.map((message) => (
				<div key={message.id} className={`coach-conversation-message${message.sender === "coach" ? " is-coach" : " is-client"}`}>
					<span>{message.sender === "coach" ? "You" : clientName}</span>
					{message.attachments?.some((attachment) => attachment.url) ? (
						<MessageMediaGallery attachments={message.attachments.filter((attachment) => attachment.url)} />
					) : null}
					{message.attachments?.some((attachment) => !attachment.url) ? (
						<small>{message.attachments.length} saved media {message.attachments.length === 1 ? "item" : "items"}</small>
					) : null}
					{message.text ? <p>{message.text}</p> : null}
					<time>{formatDate(message.createdAt, true)}</time>
				</div>
			)) : <EmptyState title="No replies yet" description="The client’s first message will appear here." />}
		</div>
	);
}

function InboxView({ threads, requests, coach, onRefresh, fullscreen = false, onToggleFullscreen }) {
	const [activeId, setActiveId] = useState("");
	const [query, setQuery] = useState("");
	const [unreadOnly, setUnreadOnly] = useState(false);
	const inboxThreads = useMemo(() => {
		const clientConversations = threads.map((thread) => ({
			...thread,
			kind: "client",
			sourceId: thread.id,
			contextLabel: "Active client",
		}));
		const serviceConversations = getQuickServiceInboxRequests(requests, coach.id).map((request) => ({
			id: `service:${request.id}`,
			sourceId: request.id,
			kind: "service",
			client: request.client,
			messages: request.messages || [],
			updatedAt: request.updatedAt || request.createdAt,
			unreadForCoach: request.unreadForCoach || 0,
			requestStatus: request.requestStatus,
			serviceTitle: requestTitle(request),
			contextLabel: "Quick Service",
		}));
		return [...clientConversations, ...serviceConversations]
			.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
	}, [coach.id, requests, threads]);
	const visibleThreads = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return inboxThreads.filter((thread) => {
			if (unreadOnly && !thread.unreadForCoach) return false;
			if (!normalizedQuery) return true;
			const lastMessage = thread.messages?.[thread.messages.length - 1];
			return [
				thread.client?.fullName,
				thread.client?.city,
				thread.client?.gymName,
				thread.serviceTitle,
				thread.contextLabel,
				lastMessage?.text,
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase()
				.includes(normalizedQuery);
		});
	}, [inboxThreads, query, unreadOnly]);
	const activeThread = inboxThreads.find((thread) => thread.id === activeId) || inboxThreads[0] || null;

	useEffect(() => {
		if (!activeThread?.id || !activeThread.unreadForCoach) return;
		if (activeThread.kind === "service") markServiceRequestRead(activeThread.sourceId, "coach");
		else markDirectMessageThreadRead(activeThread.sourceId, "coach");
		onRefresh();
	}, [activeThread?.id, activeThread?.kind, activeThread?.sourceId, activeThread?.unreadForCoach, onRefresh]);

	function sendReply(text, attachments) {
		if (!activeThread) return;
		const message = {
			id: `coach-message-${Date.now()}`,
			sender: "coach",
			text,
			attachments: attachments.map(({ id, kind, name, size, mimeType, status, url }) => ({ id, kind, name, size, mimeType, status, url })),
			createdAt: new Date().toISOString(),
		};
		if (activeThread.kind === "service") appendServiceRequestMessage(activeThread.sourceId, message);
		else appendDirectMessageReply(activeThread.sourceId, message);
		onRefresh();
	}

	return (
		<section className={`coach-workspace-page coach-inbox-page${activeId ? " has-mobile-detail" : ""}`}>
			<PageHeading
				eyebrow="Coaching conversations"
				title="Inbox"
				description="All active-client and Quick Service conversations in one place."
				action={(
					<button type="button" className="coach-inbox-fullscreen" onClick={onToggleFullscreen} aria-label={fullscreen ? "Exit full screen inbox" : "Open inbox full screen"} title={fullscreen ? "Exit full screen" : "Full screen inbox"}>
						<FullscreenIcon expanded={fullscreen} />
						<span>{fullscreen ? "Exit full screen" : "Full screen"}</span>
					</button>
				)}
			/>
			<div className={`coach-inbox-layout${activeId ? " has-mobile-selection" : ""}`}>
				<div className="coach-thread-list coach-scroll-panel">
					<div className="coach-thread-toolbar">
						<label>
							<span aria-hidden="true">⌕</span>
							<input
								type="search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search conversations"
								aria-label="Search conversations"
							/>
						</label>
						<button
							type="button"
							className={unreadOnly ? "is-active" : ""}
							onClick={() => setUnreadOnly((value) => !value)}
							aria-pressed={unreadOnly}
							aria-label="Show unread conversations only"
						>
							<span aria-hidden="true">☷</span>
						</button>
					</div>
					{visibleThreads.length ? visibleThreads.map((thread) => {
						const lastMessage = thread.messages?.[thread.messages.length - 1];
						return (
							<button key={thread.id} type="button" className={thread.id === activeThread?.id ? "is-active" : ""} onClick={() => setActiveId(thread.id)}>
								<Avatar client={thread.client} />
								<div>
									<strong>{thread.client?.fullName || "Weightlisted client"}</strong>
									<span>{lastMessage?.text || (lastMessage?.attachments?.length ? "Media attached" : "Conversation started")}</span>
									<em className={`coach-thread-relationship${thread.kind === "service" ? " is-service" : " is-accepted"}`}>{thread.kind === "service" ? `Quick Service · ${thread.serviceTitle}` : "Active client"}</em>
								</div>
								<time>{relativeDate(thread.updatedAt)}</time>
								{thread.unreadForCoach ? <b>{thread.unreadForCoach}</b> : null}
							</button>
						);
					}) : <EmptyState title={inboxThreads.length ? "No conversations found" : "No messages yet"} description={inboxThreads.length ? "Try a different name or turn off the unread filter." : "Active-client and accepted Quick Service conversations will appear here."} />}
				</div>
				{activeThread ? (
					<div className="coach-conversation-shell">
						<button type="button" className="coach-mobile-detail-back" onClick={() => setActiveId("")}><span aria-hidden="true">←</span> Conversations</button>
						<header>
							<div><Avatar client={activeThread.client} /><div><strong>{activeThread.client?.fullName}</strong><span>{activeThread.kind === "service" ? activeThread.serviceTitle : activeThread.client?.city || "Client conversation"}</span></div></div>
							<StatusBadge status={activeThread.client?.profileVisible === false ? "cancelled" : activeThread.kind === "service" ? activeThread.requestStatus : "accepted"} />
						</header>
						<ClientSnapshot client={activeThread.client} compact />
						<ConversationMessages messages={activeThread.messages} clientName={activeThread.client?.fullName || "Client"} />
						<MessageComposer disabled={activeThread.client?.profileVisible === false} placeholder="Reply to this client" onSend={sendReply} />
					</div>
				) : (
					<div className="coach-conversation-shell">
						<EmptyState title="Your conversations live here" description="Choose an active-client or Quick Service conversation to reply." />
					</div>
				)}
			</div>
		</section>
	);
}

function DetailRow({ label, children }) {
	if (children === null || children === undefined || children === "") return null;
	return <div className="coach-request-detail-row"><span>{label}</span><strong>{children}</strong></div>;
}

function RequestMessages({ request, onRefresh }) {
	function send(text, attachments) {
		appendServiceRequestMessage(request.id, {
			id: `coach-service-message-${Date.now()}`,
			sender: "coach",
			text,
			attachments: attachments.map(({ id, kind, name, size, mimeType, status, url }) => ({ id, kind, name, size, mimeType, status, url })),
			createdAt: new Date().toISOString(),
		});
		onRefresh();
	}
	return (
		<div className="coach-request-conversation">
			<h3>Service conversation</h3>
			<ConversationMessages messages={request.messages} clientName={request.client?.fullName || "Client"} />
			<MessageComposer disabled={request.client?.profileVisible === false} placeholder="Message about this request" onSend={send} />
		</div>
	);
}

function RequestsView({ requests, coach, onRefresh, initialRequestId = "" }) {
	const [tab, setTab] = useState("available");
	const [filter, setFilter] = useState("all");
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [activeId, setActiveId] = useState(initialRequestId);
	const [notice, setNotice] = useState("");
	const [proposingTime, setProposingTime] = useState(false);
	const [proposedDate, setProposedDate] = useState("");
	const [proposedTime, setProposedTime] = useState("");
	const filterMenuRef = useRef(null);

	const requestBuckets = useMemo(() => bucketQuickServiceRequests(requests, coach.id), [coach.id, requests]);
	const available = coach.acceptingRequests === false ? [] : requestBuckets.available;
	const active = requestBuckets.active;
	const completed = requestBuckets.completed;
	const requestsForStatus = tab === "available" ? available : tab === "active" ? active : completed;
	const visibleRequests = requestsForStatus.filter((request) => matchesQuickServiceFilter(request, filter));
	const selected = visibleRequests.find((request) => request.id === activeId) || visibleRequests[0] || null;
	const activeFilterLabel = QUICK_SERVICE_FILTERS.find((option) => option.id === filter)?.label || "All";

	useEffect(() => {
		if (!filtersOpen) return undefined;
		function closeFilterMenu(event) {
			if (event.key === "Escape" || (event.type === "pointerdown" && !filterMenuRef.current?.contains(event.target))) {
				setFiltersOpen(false);
			}
		}
		document.addEventListener("pointerdown", closeFilterMenu);
		document.addEventListener("keydown", closeFilterMenu);
		return () => {
			document.removeEventListener("pointerdown", closeFilterMenu);
			document.removeEventListener("keydown", closeFilterMenu);
		};
	}, [filtersOpen]);

	useEffect(() => {
		if (!selected?.id || !selected.unreadForCoach) return;
		markServiceRequestRead(selected.id, "coach");
	}, [selected?.id, selected?.unreadForCoach]);

	function acceptRequest() {
		try {
			const accepted = claimServiceRequest(selected.id, coach);
			setNotice("Request accepted and moved to Active. You can message the client now.");
			setTab("active");
			setActiveId(accepted.id);
			onRefresh();
		} catch (error) {
			setNotice(error.message);
		}
	}

	function passRequest() {
		passServiceRequest(selected.id, coach.id);
		setNotice("Request passed. It remains available to other eligible coaches.");
		setActiveId("");
		onRefresh();
	}

	function completeRequest() {
		updateServiceRequest(selected.id, { requestStatus: "completed", availabilityStatus: "closed" });
		setNotice("Service completed and moved to Completed.");
		setTab("completed");
		setActiveId(selected.id);
		onRefresh();
	}

	function confirmSchedule() {
		updateServiceRequest(selected.id, (request) => ({ details: { ...request.details, scheduleStatus: "confirmed" } }));
		setNotice("Requested time confirmed. The client will see the confirmation.");
		onRefresh();
	}

	function submitProposedTime(event) {
		event.preventDefault();
		if (!proposedDate || !proposedTime) return;
		updateServiceRequest(selected.id, (request) => ({ details: { ...request.details, scheduleStatus: "proposed", proposedDate, proposedTime } }));
		appendServiceRequestMessage(selected.id, { id: `schedule-${Date.now()}`, sender: "coach", text: `I proposed ${formatDate(`${proposedDate}T${proposedTime}`, true)} for our session.`, createdAt: new Date().toISOString() });
		setProposingTime(false);
		setNotice("A new time was proposed to the client.");
		onRefresh();
	}

	const selectedIsActive = selected && selected.claimedBy?.id === coach.id && ["claimed", "in_progress", "delivered"].includes(selected.requestStatus);

	return (
		<section className={`coach-workspace-page coach-requests-page${activeId ? " has-mobile-detail" : ""}`}>
			<PageHeading eyebrow="One-off paid help" title="Quick Services" description="Short, paid jobs—usually under an hour. Accepting one does not add the buyer to your ongoing client roster." />
			<div className="coach-request-toolbar">
				<nav className="coach-request-tabs" aria-label="Request status">
					<button type="button" className={tab === "available" ? "is-active" : ""} onClick={() => { setTab("available"); setActiveId(""); }}>Available <span>{available.length}</span></button>
					<button type="button" className={tab === "active" ? "is-active" : ""} onClick={() => { setTab("active"); setActiveId(""); }}>Active <span>{active.length}</span></button>
					<button type="button" className={tab === "completed" ? "is-active" : ""} onClick={() => { setTab("completed"); setActiveId(""); }}>Completed <span>{completed.length}</span></button>
				</nav>
				<div className={`coach-request-filter-control${filtersOpen ? " is-open" : ""}`} ref={filterMenuRef}>
					<button type="button" className="coach-request-filter-trigger" aria-expanded={filtersOpen} aria-controls="coach-quick-service-filter-options" onClick={() => setFiltersOpen((open) => !open)}>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10m-7 6h4" /></svg>
						<span>Filters</span>
						<strong>{activeFilterLabel}</strong>
						<svg className="coach-request-filter-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>
					</button>
					{filtersOpen ? (
						<div id="coach-quick-service-filter-options" className="coach-request-filter-options" role="group" aria-label="Filter Quick Services">
							{QUICK_SERVICE_FILTERS.map((option) => (
								<button type="button" key={option.id} className={filter === option.id ? "is-active" : ""} aria-pressed={filter === option.id} onClick={() => { setFilter(option.id); setActiveId(""); setFiltersOpen(false); }}>
									{option.label}
									{filter === option.id ? <span aria-hidden="true">✓</span> : null}
								</button>
							))}
						</div>
					) : null}
				</div>
			</div>
			{notice ? <div className="coach-workspace-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>×</button></div> : null}
			<div className={`coach-requests-layout${selected ? "" : " is-empty"}${activeId ? " has-mobile-selection" : ""}`}>
				<div className="coach-request-list coach-scroll-panel">
					{visibleRequests.length ? visibleRequests.map((request) => (
						<button key={request.id} type="button" className={request.id === selected?.id ? "is-active" : ""} onClick={() => setActiveId(request.id)}>
							<div><span>{CATEGORY_LABELS[request.serviceCategory] || "Service"}</span><StatusBadge status={request.requestStatus} /></div>
							<strong>{requestTitle(request)}</strong>
							<p>{request.client?.fullName || "Weightlisted client"} · {requestFocusLabel(request)}</p>
							<footer><small>{relativeDate(request.createdAt)}</small><b>{request.details?.coachPayout?.label || request.details?.price?.label}</b></footer>
						</button>
					)) : <EmptyState title={filter === "all" ? `No ${tab} Quick Services` : `No ${QUICK_SERVICE_FILTERS.find((option) => option.id === filter)?.label.toLowerCase()} results`} description={requestsForStatus.length ? "Try another filter to see the rest of your Quick Services." : tab === "available" ? "New paid Quick Services that match your specialties will appear here." : tab === "active" ? "Accepted Quick Services stay here until you mark them complete." : "Finished Quick Services will be saved here."} />}
				</div>
				{selected ? (
					<article className="coach-request-detail coach-scroll-panel">
						<button type="button" className="coach-mobile-detail-back" onClick={() => setActiveId("")}><span aria-hidden="true">←</span> Quick Services</button>
						<header>
							<div><span>{CATEGORY_LABELS[selected.serviceCategory]}</span><h2>{requestTitle(selected)}</h2></div>
							<StatusBadge status={selected.requestStatus} />
						</header>
						<ClientSnapshot client={selected.client} />
						{selected.requestStatus === "matching" ? (
							<section className="coach-request-next-step">
								<div><span>Next step</span><strong>Accept this request to begin</strong><small>It will move to Active and open a conversation with the client.</small></div>
								<div className="coach-request-next-step-actions"><button type="button" className="is-primary" onClick={acceptRequest}>Accept request</button><button type="button" onClick={passRequest}>Pass</button></div>
							</section>
						) : selectedIsActive ? (
							<section className="coach-request-next-step is-active">
								<div><span>Active service</span><strong>Work with {selected.client?.fullName?.split(" ")[0] || "the client"} here</strong><small>Use the conversation below. When the service is finished, move it to Completed.</small></div>
								<div className="coach-request-next-step-actions"><button type="button" className="is-primary" onClick={completeRequest}>Mark service complete</button></div>
							</section>
						) : null}
						<section className="coach-request-details-card">
							<DetailRow label="Training">{formatUserFacingValue(selected.details?.discipline)}</DetailRow>
							<DetailRow label="Attempt">{selected.details?.attemptType}</DetailRow>
							<DetailRow label="Sport">{formatUserFacingValue(selected.details?.sport)}</DetailRow>
							<DetailRow label="Duration">{selected.details?.duration}</DetailRow>
							<DetailRow label="Requested time">{selected.details?.scheduledDate ? `${selected.details.scheduledDate} at ${selected.details.scheduledTime}` : ""}</DetailRow>
							<DetailRow label="Competition date">{selected.details?.eventDate}</DetailRow>
							<DetailRow label="Client paid">{selected.details?.price?.label}</DetailRow>
							<DetailRow label="Your payout">{selected.details?.coachPayout?.label || "Calculated at payout"}</DetailRow>
							<DetailRow label="Payment">{selected.paymentStatus === "paid" ? "Paid and secured" : formatUserFacingValue(selected.paymentStatus)}</DetailRow>
							<DetailRow label="What they need">{selected.details?.description}</DetailRow>
						</section>
						{selected.attachments?.length ? (
							<section className="coach-request-attachments"><h3>Client attachments</h3>{selected.attachments.map((attachment) => <button type="button" key={attachment.id}><span>{attachment.kind === "video" ? "▶" : "▧"}</span><div><strong>{attachment.name}</strong><small>{attachment.kind === "video" ? "Video for review" : "Photo for review"}</small></div></button>)}</section>
						) : null}
						{selected.serviceCategory === "session" && selectedIsActive ? (
							<section className="coach-schedule-actions">
								<h3>Session time</h3>
								<p>{selected.details?.scheduleStatus === "confirmed" ? "Confirmed with the client." : selected.details?.scheduleStatus === "proposed" ? `Proposed ${selected.details.proposedDate} at ${selected.details.proposedTime}.` : "Confirm the requested time or propose another."}</p>
								<div><button type="button" onClick={confirmSchedule}>Confirm requested time</button><button type="button" onClick={() => setProposingTime((value) => !value)}>Propose another</button></div>
								{proposingTime ? <form onSubmit={submitProposedTime}><input type="date" value={proposedDate} onChange={(event) => setProposedDate(event.target.value)} required /><input type="time" value={proposedTime} onChange={(event) => setProposedTime(event.target.value)} required /><button type="submit">Send proposal</button></form> : null}
							</section>
						) : null}
						{selected.requestStatus !== "matching" ? <RequestMessages request={selected} onRefresh={onRefresh} /> : null}
					</article>
				) : null}
			</div>
		</section>
	);
}

function ClientsView({ threads, onRefresh, onOpenInbox }) {
	const pendingThreads = threads.filter((thread) => getClientRelationshipStatus(thread) === "pending");
	const activeThreads = threads.filter((thread) => getClientRelationshipStatus(thread) === "accepted");
	const [tab, setTab] = useState(() => pendingThreads.length ? "requests" : "active");
	const [activeId, setActiveId] = useState("");
	const [clientQuery, setClientQuery] = useState("");
	const [notice, setNotice] = useState("");
	const [pendingDecision, setPendingDecision] = useState(null);
	const normalizedClientQuery = clientQuery.trim().toLowerCase();
	const matchingActiveThreads = normalizedClientQuery
		? activeThreads.filter((thread) => String(thread.client?.fullName || "").toLowerCase().includes(normalizedClientQuery))
		: activeThreads;
	const visibleThreads = tab === "requests" ? pendingThreads : matchingActiveThreads;
	const activeThread = visibleThreads.find((thread) => thread.id === activeId) || visibleThreads[0] || null;

	useEffect(() => {
		if (!pendingDecision) return undefined;
		function closeOnEscape(event) {
			if (event.key === "Escape") setPendingDecision(null);
		}
		window.addEventListener("keydown", closeOnEscape);
		return () => window.removeEventListener("keydown", closeOnEscape);
	}, [pendingDecision]);

	function requestDecision(status) {
		if (!activeThread) return;
		setPendingDecision({
			status,
			threadId: activeThread.id,
			clientName: activeThread.client?.fullName || "this client",
		});
	}

	function confirmDecision() {
		if (!pendingDecision) return;
		updateClientRelationship(pendingDecision.threadId, pendingDecision.status);
		setNotice(pendingDecision.status === "accepted" ? `${pendingDecision.clientName} is now an active coaching client.` : `${pendingDecision.clientName}’s coaching request was passed.`);
		const accepted = pendingDecision.status === "accepted";
		setPendingDecision(null);
		setActiveId("");
		if (accepted) setTab("active");
		onRefresh();
	}

	function sendClientRequestReply(text, attachments) {
		if (!activeThread) return;
		appendDirectMessageReply(activeThread.id, {
			id: `coach-client-request-message-${Date.now()}`,
			text,
			attachments: attachments.map(({ id, kind, name, size, mimeType, status, url }) => ({ id, kind, name, size, mimeType, status, url })),
			createdAt: new Date().toISOString(),
		});
		onRefresh();
	}

	return (
		<section className={`coach-workspace-page${activeId ? " has-mobile-detail" : ""}`}>
			<PageHeading eyebrow="Ongoing relationships" title="Coaching clients" description="Your long-term roster: people you coach, program for, and return to week after week." />
			<nav className="coach-request-tabs coach-client-tabs" aria-label="Coaching client status">
				<button type="button" className={tab === "requests" ? "is-active" : ""} onClick={() => { setTab("requests"); setActiveId(""); setClientQuery(""); }}>Client requests <span>{pendingThreads.length}</span></button>
				<button type="button" className={tab === "active" ? "is-active" : ""} onClick={() => { setTab("active"); setActiveId(""); }}>Active clients <span>{activeThreads.length}</span></button>
			</nav>
			{tab === "active" ? (
				<label className="coach-client-search">
					<span aria-hidden="true">⌕</span>
					<input type="search" value={clientQuery} onChange={(event) => { setClientQuery(event.target.value); setActiveId(""); }} placeholder="Search active clients by name" aria-label="Search active clients by name" />
					{clientQuery ? <button type="button" onClick={() => { setClientQuery(""); setActiveId(""); }} aria-label="Clear client search">×</button> : null}
				</label>
			) : null}
			{notice ? <div className="coach-workspace-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>×</button></div> : null}
			<div className={`coach-clients-layout${activeId ? " has-mobile-selection" : ""}`}>
				<div className="coach-client-list coach-scroll-panel">
					{visibleThreads.length ? visibleThreads.map((thread) => (
						<button key={thread.id} type="button" className={thread.id === activeThread?.id ? "is-active" : ""} onClick={() => setActiveId(thread.id)}>
							<Avatar client={thread.client} />
							<div><strong>{thread.client?.fullName || "Weightlisted client"}</strong><span>{thread.client?.city || "Shared client profile"}</span><em>{tab === "requests" ? "Wants ongoing coaching" : "Active coaching client"}</em></div>
						</button>
					)) : <EmptyState title={tab === "requests" ? "No client requests" : normalizedClientQuery ? "No client found" : "No active clients yet"} description={tab === "requests" ? "People who ask you about ongoing coaching will appear here for review." : normalizedClientQuery ? `No active client matches “${clientQuery.trim()}”.` : "Accept a coaching request to add someone to your ongoing roster."} />}
				</div>
				{activeThread ? (
					<article className="coach-client-detail coach-scroll-panel">
						<button type="button" className="coach-mobile-detail-back" onClick={() => setActiveId("")}><span aria-hidden="true">←</span> {tab === "requests" ? "Client requests" : "Active clients"}</button>
						<ClientSnapshot client={activeThread.client} />
						{tab === "requests" ? (
							<section className="coach-client-decision is-large">
								<div><span>Client request</span><strong>Accept for ongoing coaching?</strong><small>Review their goals and conversation first. Accepting adds them to Active clients; declining does not affect separate Quick Services.</small></div>
								<div><button type="button" className="is-primary" onClick={() => requestDecision("accepted")}>Accept as client</button><button type="button" onClick={() => requestDecision("declined")}>Pass on request</button></div>
							</section>
						) : (
							<section className="coach-client-roster-summary">
								<div><span>Relationship</span><strong>Ongoing coaching</strong></div>
								<div><span>Communication</span><strong>Weekly and recurring</strong></div>
								<div><span>Programming</span><strong>Long-term client work</strong></div>
							</section>
						)}
						{tab === "requests" ? (
							<section className="coach-client-request-conversation">
								<h3>Client request conversation</h3>
								<ConversationMessages messages={activeThread.messages} clientName={activeThread.client?.fullName || "Client"} />
								<MessageComposer disabled={activeThread.client?.profileVisible === false} placeholder="Reply before deciding" onSend={sendClientRequestReply} />
							</section>
						) : (
							<><h3>Client communication</h3><div className="coach-client-activity"><button type="button" onClick={() => onOpenInbox(activeThread.id)}><span>Coaching conversation</span><strong>Open messages →</strong><small>Continue the ongoing relationship</small></button></div></>
						)}
					</article>
				) : null}
			</div>
			{pendingDecision ? (
				<div className="coach-client-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="coach-client-confirm-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDecision(null); }}>
					<section>
						<span>Confirm client decision</span>
						<h2 id="coach-client-confirm-title">{pendingDecision.status === "accepted" ? `Accept ${pendingDecision.clientName} as a client?` : `Pass on ${pendingDecision.clientName}’s request?`}</h2>
						<p>{pendingDecision.status === "accepted" ? "They’ll move into Active clients and the ongoing coaching conversation will open in your inbox." : "Their request will be removed from your pending list. Any separate Quick Services remain unchanged."}</p>
						<div>
							<button type="button" onClick={() => setPendingDecision(null)}>Cancel</button>
							<button type="button" className={pendingDecision.status === "accepted" ? "is-primary" : "is-danger"} onClick={confirmDecision} autoFocus>{pendingDecision.status === "accepted" ? "Yes, accept client" : "Yes, pass request"}</button>
						</div>
					</section>
				</div>
			) : null}
		</section>
	);
}

function buildProfileDraft(application, userProfile) {
	return {
		fullName: application?.fullName || userProfile?.full_name || "Weightlisted Coach",
		title: application?.coachTitle || "Strength Coach",
		bio: application?.bio || "",
		city: application?.gymCity || application?.city || userProfile?.city || "",
		gymState: application?.gymState || application?.state || "",
		gymZip: application?.gymZip || "",
		gymName: application?.gymName || userProfile?.gym_name || "",
		gymPlaceId: application?.gymPlaceId || "",
		gymAddress: application?.gymAddress || "",
		gymLatitude: application?.latitude ?? null,
		gymLongitude: application?.longitude ?? null,
		specialties: application?.specialties || [],
		formats: [application?.inPersonCoaching ? "In person" : "", application?.onlineTraining || application?.remoteAvailable ? "Online" : ""].filter(Boolean),
		certifications: normalizeStringList(application?.certifications),
		socialLinks: Array.isArray(application?.socialLinks) ? application.socialLinks : [],
		visible: application?.profileVisible ?? true,
		acceptingRequests: application?.acceptingRequests ?? true,
		avatarUrl: application?.profilePhotoUrl || userProfile?.avatar_url || "",
	};
}

function normalizeProfileSocialLinks(socialLinks, legacyWebsite = "") {
	let normalized = (Array.isArray(socialLinks) ? socialLinks : [])
		.filter((link) => String(link?.type || "").trim() && String(link?.value || "").trim())
		.map((link) => ({ type: String(link.type).trim(), value: String(link.value).trim() }));

	if (String(legacyWebsite || "").trim()) {
		normalized = normalized.filter((link) => String(link.type).toLowerCase() !== "website");
		normalized.push({ type: "Website", value: String(legacyWebsite).trim() });
	}

	return normalized;
}

function MultiEntryPills({ label, values, onChange, placeholder }) {
	const [entry, setEntry] = useState("");
	const normalizedValues = normalizeStringList(values);

	function addEntries(rawValue) {
		const incoming = normalizeStringList(rawValue);
		if (!incoming.length) return;
		onChange(normalizeStringList([...normalizedValues, ...incoming]));
		setEntry("");
	}

	function handleKeyDown(event) {
		if (event.key === "Enter" || event.key === ",") {
			event.preventDefault();
			addEntries(entry);
			return;
		}
		if (event.key === "Backspace" && !entry && normalizedValues.length) {
			onChange(normalizedValues.slice(0, -1));
		}
	}

	return (
		<fieldset className="coach-multi-entry-field">
			<legend>{label}</legend>
			<div className="coach-multi-entry-control">
				{normalizedValues.map((value) => (
					<button
						type="button"
						className="coach-multi-entry-pill"
						key={value.toLowerCase()}
						onClick={() => onChange(normalizedValues.filter((item) => item !== value))}
						aria-label={`Remove ${value}`}
					>
						<span>{value}</span>
						<b aria-hidden="true">×</b>
					</button>
				))}
				<input
					value={entry}
					onChange={(event) => setEntry(event.target.value)}
					onKeyDown={handleKeyDown}
					onBlur={() => addEntries(entry)}
					placeholder={normalizedValues.length ? "Add another" : placeholder}
					aria-label={`Add ${label.toLowerCase()}`}
				/>
			</div>
			<small>Press Enter or comma after each entry.</small>
		</fieldset>
	);
}

function PublicProfileView({ application, userProfile, previewMode = false }) {
	const [draft, setDraft] = useState(() => {
		const baseDraft = buildProfileDraft(application, userProfile);
		const storedDraft = loadLocalCoachPublicProfile(application?.id) || {};
		const { website: legacyWebsite, ...storedProfile } = storedDraft;
		return {
			...baseDraft,
			...storedProfile,
			certifications: normalizeStringList(storedDraft.certifications ?? baseDraft.certifications),
			socialLinks: normalizeProfileSocialLinks(
				Array.isArray(storedDraft.socialLinks) ? storedDraft.socialLinks : baseDraft.socialLinks,
				legacyWebsite,
			),
		};
	});
	const [saved, setSaved] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState("");
	const isAvailableToClients = draft.visible && draft.acceptingRequests;
	const customSpecialties = draft.specialties.filter((specialty) => !PROFILE_SPECIALTIES.some((preset) => preset.toLowerCase() === String(specialty).toLowerCase()));

	function toggleList(field, value) {
		setDraft((current) => ({ ...current, [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value] }));
	}

	function getSocialValue(platform) {
		return draft.socialLinks.find((link) => String(link.type).toLowerCase() === platform.toLowerCase())?.value || "";
	}

	function updateSocialLink(platform, value) {
		setDraft((current) => {
			const existingLinks = Array.isArray(current.socialLinks) ? current.socialLinks : [];
			const matchingIndex = existingLinks.findIndex((link) => String(link.type).toLowerCase() === platform.toLowerCase());
			const nextLinks = [...existingLinks];

			if (matchingIndex >= 0) nextLinks[matchingIndex] = { type: platform, value };
			else nextLinks.push({ type: platform, value });

			return { ...current, socialLinks: nextLinks };
		});
	}

	function updateGymName(gymName) {
		setDraft((current) => ({
			...current,
			gymName,
			gymPlaceId: "",
			gymAddress: "",
			gymLatitude: null,
			gymLongitude: null,
		}));
	}

	function chooseGymPlace(gym) {
		setDraft((current) => ({
			...current,
			gymName: gym.name || current.gymName,
			gymPlaceId: gym.placeId || "",
			gymAddress: gym.address || "",
			city: gym.city || current.city,
			gymState: String(gym.state || current.gymState || "").toUpperCase().slice(0, 2),
			gymZip: String(gym.postalCode || current.gymZip || "").replace(/\D/g, "").slice(0, 5),
			gymLatitude: gym.latitude,
			gymLongitude: gym.longitude,
		}));
	}

	function chooseGymCoordinates({ latitude, longitude }) {
		setDraft((current) => ({ ...current, gymLatitude: latitude, gymLongitude: longitude }));
	}

	function updateCustomSpecialties(nextCustomSpecialties) {
		setDraft((current) => {
			const selectedPresets = current.specialties.filter((specialty) => PROFILE_SPECIALTIES.some((preset) => preset.toLowerCase() === String(specialty).toLowerCase()));
			return { ...current, specialties: normalizeStringList([...selectedPresets, ...nextCustomSpecialties]) };
		});
	}

	async function save(event) {
		event.preventDefault();
		if (draft.formats.includes("In person") && !/^\d{5}$/.test(draft.gymZip)) {
			setSaveError("Enter the gym's 5-digit ZIP code before saving an in-person profile.");
			return;
		}
		const normalizedDraft = {
			...draft,
			socialLinks: normalizeProfileSocialLinks(draft.socialLinks),
		};
		setSaving(true);
		setSaveError("");
		try {
			if (!previewMode) {
				await saveMyCoachPublicProfile(application?.id, normalizedDraft);
			}
			saveLocalCoachPublicProfile(application?.id, normalizedDraft);
			setSaved(true);
			window.setTimeout(() => setSaved(false), 2200);
		} catch (error) {
			setSaveError(error?.message || "Your public profile could not be saved. Try again.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="coach-workspace-page">
			<PageHeading eyebrow="Directory presence" title="Public profile" description="These fields control how clients find you on the map, in search, and in service matching." />
			<div className="coach-profile-editor-layout">
				<form className="coach-profile-editor" onSubmit={save}>
					<button
						type="button"
						className={`coach-profile-availability${isAvailableToClients ? " is-active" : ""}`}
						aria-pressed={isAvailableToClients}
						onClick={() => setDraft((current) => {
							const nextAvailability = !(current.visible && current.acceptingRequests);
							return { ...current, visible: nextAvailability, acceptingRequests: nextAvailability };
						})}
					>
						<i aria-hidden="true" />
						<span><strong>{isAvailableToClients ? "Visible and accepting requests" : "Hidden from clients"}</strong><small>Controls your directory listing plus new coaching and Quick Service requests.</small></span>
						<b>{isAvailableToClients ? "On" : "Off"}</b>
					</button>
					<label><span>Public name</span><input value={draft.fullName} onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))} /></label>
					<label><span>Coach title</span><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
					<label><span>Short public bio</span><textarea rows={5} value={draft.bio} onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} /></label>
					<div className="coach-profile-editor__grid"><label><span>City</span><input value={draft.city} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} /></label><label><span>State</span><input value={draft.gymState} maxLength={2} onChange={(event) => setDraft((current) => ({ ...current, gymState: event.target.value.toUpperCase().slice(0, 2) }))} placeholder="GA" /></label><label><span>ZIP code</span><input value={draft.gymZip} inputMode="numeric" autoComplete="postal-code" maxLength={5} onChange={(event) => setDraft((current) => ({ ...current, gymZip: event.target.value.replace(/\D/g, "").slice(0, 5) }))} placeholder="30318" /></label></div>
					<GymPlaceAutocomplete
						className="coach-profile-gym-field"
						label="Exact gym and map pin"
						helper="Choose a branch or save your location while physically at the gym."
						value={draft.gymName}
						placeId={draft.gymPlaceId}
						latitude={draft.gymLatitude}
						longitude={draft.gymLongitude}
						locationHint={[[draft.city, draft.gymState].filter(Boolean).join(", "), draft.gymZip].filter(Boolean).join(" ")}
						onChange={updateGymName}
						onSelect={chooseGymPlace}
						onCoordinates={chooseGymCoordinates}
					/>
					<fieldset><legend>Coaching format</legend><div className="coach-workspace-choice-pills">{["In person", "Online"].map((format) => <button type="button" key={format} className={draft.formats.includes(format) ? "is-selected" : ""} onClick={() => toggleList("formats", format)}>{format}</button>)}</div></fieldset>
					<fieldset><legend>Specialties</legend><div className="coach-workspace-choice-pills">{PROFILE_SPECIALTIES.map((specialty) => <button type="button" key={specialty} className={draft.specialties.includes(specialty) ? "is-selected" : ""} onClick={() => toggleList("specialties", specialty)}>{specialty}</button>)}</div></fieldset>
					<MultiEntryPills
						label="Add a specialty not listed"
						values={customSpecialties}
						onChange={updateCustomSpecialties}
						placeholder="Type a niche specialty"
					/>
					<MultiEntryPills
						label="Certifications"
						values={draft.certifications}
						onChange={(certifications) => setDraft((current) => ({ ...current, certifications }))}
						placeholder="Add a certification"
					/>
					<fieldset className="coach-social-editor">
						<legend>Website and social profiles</legend>
						<p>Add a handle or full profile link. Clients will be able to open it directly.</p>
						<div>
							{SOCIAL_PLATFORMS.map((platform) => (
								<label className="coach-social-field" key={platform.id}>
									<span className="coach-social-field__identity">
										<i aria-hidden="true"><SocialIcon platform={platform.id} /></i>
										<span><strong>{platform.label}</strong><small>{platform.helper}</small></span>
									</span>
									<input
										value={getSocialValue(platform.id)}
										onChange={(event) => updateSocialLink(platform.id, event.target.value)}
										type="text"
										inputMode="url"
										autoCapitalize="none"
										autoCorrect="off"
										spellCheck="false"
										placeholder={platform.placeholder}
										aria-label={`${platform.label} handle or profile link`}
									/>
								</label>
							))}
						</div>
					</fieldset>
					{saveError ? <p className="coach-profile-save-message is-error" role="alert">{saveError}</p> : null}
					{previewMode ? <p className="coach-profile-save-message">Preview changes stay in this browser.</p> : null}
					<button className="coach-workspace-primary" type="submit" disabled={saving}>{saving ? "Saving…" : saved ? "Profile saved ✓" : "Save public profile"}</button>
				</form>
				<aside className="coach-public-preview"><span>Client preview</span><div className="coach-public-preview__card"><Avatar client={{ fullName: draft.fullName, avatarUrl: draft.avatarUrl }} size={82} /><h2>{draft.fullName}</h2><p>{draft.title}</p><small>{[[draft.city, draft.gymState].filter(Boolean).join(", "), draft.gymZip, draft.gymName].filter(Boolean).join(" · ") || "Location not added"}</small><div className="coach-workspace-tags">{draft.specialties.map((specialty) => <span key={specialty}>{specialty}</span>)}</div><blockquote>{draft.bio || "Your public bio will appear here."}</blockquote><SocialLinks links={draft.socialLinks} compact /><footer><span>{draft.formats.join(" + ") || "Format not selected"}</span><b>{isAvailableToClients ? "Visible & accepting" : "Not visible"}</b></footer></div></aside>
			</div>
			<CoachReviewManager coachId={application?.id} coachName={draft.fullName} />
		</section>
	);
}

function HomeView({ coach, threads, requests, onNavigate }) {
	const acceptedClientThreads = threads.filter((thread) => getClientRelationshipStatus(thread) === "accepted");
	const serviceInboxRequests = getQuickServiceInboxRequests(requests, coach.id);
	const unread = acceptedClientThreads.reduce((total, thread) => total + (thread.unreadForCoach || 0), 0)
		+ serviceInboxRequests.reduce((total, request) => total + (request.unreadForCoach || 0), 0);
	const pendingClients = threads.filter((thread) => getClientRelationshipStatus(thread) === "pending");
	const requestBuckets = bucketQuickServiceRequests(requests, coach.id);
	const available = coach.acceptingRequests === false ? [] : requestBuckets.available;
	const active = requestBuckets.active;
	const nextSession = active.filter((request) => request.serviceCategory === "session" && request.details?.scheduledDate).sort((a, b) => `${a.details.scheduledDate}${a.details.scheduledTime}`.localeCompare(`${b.details.scheduledDate}${b.details.scheduledTime}`))[0];
	return (
		<section className="coach-workspace-page coach-home">
			<PageHeading eyebrow="Coach workspace" title={`Welcome, ${coach.name.split(" ")[0]}`} description="Everything here is driven by what clients can do on Weightlisted." action={<button type="button" className="coach-workspace-mode-button" onClick={() => onNavigate("profile")}>Preview public profile</button>} />
			<div className="coach-home-stats"><button type="button" onClick={() => onNavigate("inbox")}><span>Unread messages</span><strong>{unread}</strong><small>Open inbox →</small></button><button type="button" onClick={() => onNavigate("clients")}><span>Client requests</span><strong>{pendingClients.length}</strong><small>Review ongoing coaching requests →</small></button><button type="button" onClick={() => onNavigate("requests")}><span>Available Quick Services</span><strong>{available.length}</strong><small>Review one-off paid jobs →</small></button><button type="button" onClick={() => onNavigate("requests")}><span>Active Quick Services</span><strong>{active.length}</strong><small>Finish accepted jobs →</small></button></div>
			<div className="coach-home-grid"><section><header><div><span>Needs attention</span><h2>Today</h2></div></header>{unread ? <button type="button" onClick={() => onNavigate("inbox")}><b>{unread}</b><div><strong>Messages waiting</strong><span>Read and reply from your inbox.</span></div><i>→</i></button> : null}{pendingClients.length ? <button type="button" onClick={() => onNavigate("clients")}><b>{pendingClients.length}</b><div><strong>Ongoing coaching requests</strong><span>Review and decide who joins your client roster.</span></div><i>→</i></button> : null}{available.length ? <button type="button" onClick={() => onNavigate("requests")}><b>{available.length}</b><div><strong>Quick Services available</strong><span>Short paid jobs waiting for a coach.</span></div><i>→</i></button> : null}{nextSession ? <button type="button" onClick={() => onNavigate("requests")}><b>◷</b><div><strong>{requestTitle(nextSession)}</strong><span>{nextSession.details.scheduledDate} at {nextSession.details.scheduledTime}</span></div><i>→</i></button> : null}{!unread && !pendingClients.length && !available.length && !nextSession ? <EmptyState title="You’re caught up" description="New coaching requests, messages, and Quick Services will appear here." /> : null}</section><aside><span>Profile availability</span><h2>Ready to be discovered</h2><p>Use one control to show your profile and accept new coaching or Quick Service requests.</p><button type="button" onClick={() => onNavigate("profile")}>Manage public profile</button></aside></div>
		</section>
	);
}

function AccountView({ application, user, onExitCoachMode, onOpenClientAccount, onSignOut }) {
	return (
		<section className="coach-workspace-page">
			<PageHeading eyebrow="Weightlisted account" title="Coach account" description="Coach access belongs to the same account you use as a client." />
			<div className="coach-account-card"><div><span>Application status</span><strong>Approved</strong><p>Your coach workspace is active. If an administrator changes this status, access and directory visibility update together.</p></div><b>Approved ✓</b></div>
			<div className="coach-account-sections"><section><h2>Account view</h2><p>Switching views changes the tools you see. It does not create a separate login or change your permissions.</p><button type="button" onClick={onExitCoachMode}>Switch to User View</button></section><section><h2>User account details</h2><p>{user?.email}</p><button type="button" onClick={onOpenClientAccount}>Manage user profile</button></section><section><h2>Payouts</h2><p>Payout setup will connect to your secured payment account during the final Supabase/payment pass.</p><button type="button" disabled>Not connected</button></section><section><h2>Application record</h2><p>{application?.adminNotes || "Approved by Weightlisted."}</p><span>Application ID: {application?.id}</span></section></div>
			<button type="button" className="coach-account-signout" onClick={onSignOut}>Sign out</button>
		</section>
	);
}

export function CoachApprovalCelebration({ application, onEnter, onDismiss }) {
	return (
		<div className="coach-approval-overlay" role="dialog" aria-modal="true" aria-labelledby="coach-approval-title">
			<section>
				<button type="button" className="coach-approval-close" onClick={onDismiss} aria-label="Close congratulations">×</button>
				<div className="coach-approval-mark">✦</div>
				<p>Application approved</p>
				<h1 id="coach-approval-title">Congratulations, {application?.fullName?.split(" ")[0] || "Coach"}</h1>
				<span>You’re officially a Weightlisted coach. Your new workspace is ready for messages, service requests, client details, and your public profile.</span>
				<button type="button" onClick={onEnter}>Enter coach workspace</button>
				<small>You can switch between Client and Coach mode anytime.</small>
			</section>
		</div>
	);
}

export default function CoachWorkspace({
	application,
	user,
	userProfile,
	onExitCoachMode,
	onOpenClientAccount,
	onSignOut,
	previewMode = false,
}) {
	const [publicProfile, setPublicProfile] = useState(() => loadLocalCoachPublicProfile(application?.id));
	const coach = useMemo(() => ({
		...coachIdentity(application, user, userProfile),
		...(publicProfile
			? {
				name: publicProfile.fullName || application?.fullName,
				title: publicProfile.title || application?.coachTitle,
				avatarUrl: publicProfile.avatarUrl || application?.profilePhotoUrl || userProfile?.avatar_url || "",
				acceptingRequests: publicProfile.acceptingRequests,
			}
			: {}),
	}), [application, publicProfile, user, userProfile]);
	const [section, setSection] = useState("home");
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
		try {
			return window.localStorage.getItem("weightlisted.coachSidebarCollapsed") === "true";
		} catch {
			return false;
		}
	});
	const [threads, setThreads] = useState([]);
	const [requests, setRequests] = useState([]);
	const mainRef = useRef(null);
	const shellRef = useRef(null);
	const [inboxFullscreen, setInboxFullscreen] = useState(false);

	async function toggleInboxFullscreen() {
		if (inboxFullscreen) {
			setInboxFullscreen(false);
			if (document.fullscreenElement === shellRef.current && document.exitFullscreen) {
				try { await document.exitFullscreen(); } catch { /* CSS focus mode still exits. */ }
			}
			return;
		}

		setInboxFullscreen(true);
		if (shellRef.current?.requestFullscreen) {
			try { await shellRef.current.requestFullscreen(); } catch { /* Fixed focus mode is the fallback. */ }
		}
	}

	function navigate(sectionId) {
		setSection(sectionId);
		setMobileMenuOpen(false);
		requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
	}

	function refresh() {
		setThreads(loadDirectMessageThreads({ view: "coach", coachId: coach.id }));
		setRequests(loadServiceRequests({ view: "coach", coachId: coach.id }));
		setPublicProfile(loadLocalCoachPublicProfile(application?.id));
	}

	useEffect(() => {
		if (previewMode) ensureCoachWorkspaceDemoData(coach);
		refresh();
		if (!previewMode) void refreshMarketplaceData().then(refresh);
		const refreshFromBackend = () => {
			if (!previewMode) void refreshMarketplaceData().then(refresh);
		};
		window.addEventListener(DIRECT_MESSAGES_CHANGED_EVENT, refresh);
		window.addEventListener(SERVICE_REQUESTS_CHANGED_EVENT, refresh);
		window.addEventListener(COACH_APPLICATION_CHANGED_EVENT, refresh);
		window.addEventListener("storage", refresh);
		window.addEventListener("focus", refreshFromBackend);
		return () => {
			window.removeEventListener(DIRECT_MESSAGES_CHANGED_EVENT, refresh);
			window.removeEventListener(SERVICE_REQUESTS_CHANGED_EVENT, refresh);
			window.removeEventListener(COACH_APPLICATION_CHANGED_EVENT, refresh);
			window.removeEventListener("storage", refresh);
			window.removeEventListener("focus", refreshFromBackend);
		};
	}, [application?.id, coach.id, previewMode]);

	useEffect(() => {
		try {
			window.localStorage.setItem("weightlisted.coachSidebarCollapsed", String(sidebarCollapsed));
		} catch {
			// Local preference storage is optional.
		}
	}, [sidebarCollapsed]);

	useEffect(() => {
		const handleFullscreenChange = () => {
			if (!document.fullscreenElement) setInboxFullscreen(false);
		};
		document.addEventListener("fullscreenchange", handleFullscreenChange);
		return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
	}, []);

	useEffect(() => {
		if (section === "inbox" || !inboxFullscreen) return;
		setInboxFullscreen(false);
		if (document.fullscreenElement === shellRef.current && document.exitFullscreen) void document.exitFullscreen();
	}, [inboxFullscreen, section]);

	const acceptedClientThreads = threads.filter((thread) => getClientRelationshipStatus(thread) === "accepted");
	const serviceInboxRequests = getQuickServiceInboxRequests(requests, coach.id);
	const unreadMessages = acceptedClientThreads.reduce((total, thread) => total + (thread.unreadForCoach || 0), 0)
		+ serviceInboxRequests.reduce((total, request) => total + (request.unreadForCoach || 0), 0);
	const availableRequests = coach.acceptingRequests === false ? 0 : bucketQuickServiceRequests(requests, coach.id).available.length;
	const pendingClientRequests = threads.filter((thread) => getClientRelationshipStatus(thread) === "pending").length;

	return (
		<main
			ref={shellRef}
			className={`coach-workspace-shell${previewMode ? " is-preview" : ""}${sidebarCollapsed ? " is-sidebar-collapsed" : ""}${inboxFullscreen ? " is-inbox-fullscreen" : ""}`}
			data-section={section}
			style={{
				"--coach-workspace-background": `url(${coachWorkspaceBackground})`,
				"--coach-workspace-portrait": `url(${coachWorkspacePortrait})`,
			}}
		>
			<div className="coach-workspace-motto" aria-hidden="true">
				<span>Discipline</span>
				<span>Builds</span>
				<span>Freedom</span>
				<i />
			</div>
			<button
				type="button"
				className="coach-sidebar-toggle"
				onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
				aria-expanded={!sidebarCollapsed}
				aria-label={sidebarCollapsed ? "Show coach navigation" : "Hide coach navigation"}
				title={sidebarCollapsed ? "Show navigation" : "Hide navigation"}
				data-tooltip={sidebarCollapsed ? "Show navigation" : "Hide navigation"}
			>
				<svg viewBox="0 0 20 20" aria-hidden="true">
					<path d={sidebarCollapsed ? "m7 4.5 5.5 5.5L7 15.5" : "m13 4.5-5.5 5.5 5.5 5.5"} />
				</svg>
			</button>
			<aside className="coach-workspace-sidebar">
				<header><div className="coach-workspace-logo">W</div><div><span>Weightlisted</span><strong>Coach</strong></div></header>
				<nav aria-label="Coach workspace">
					{NAV_ITEMS.map((item) => <button key={item.id} type="button" className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)}><i><NavigationIcon name={item.id} /></i><span>{item.label}</span>{item.id === "inbox" && unreadMessages ? <b>{unreadMessages}</b> : item.id === "requests" && availableRequests ? <b>{availableRequests}</b> : item.id === "clients" && pendingClientRequests ? <b>{pendingClientRequests}</b> : null}</button>)}
				</nav>
				<footer><div><Avatar client={{ fullName: coach.name, avatarUrl: coach.avatarUrl }} /><span><strong>{coach.name}</strong><small>{coach.title}</small></span></div><button type="button" onClick={onExitCoachMode}>User View</button></footer>
			</aside>
			<div className="coach-workspace-main coach-scroll-panel" ref={mainRef}>
				{section === "home" ? <HomeView coach={coach} threads={threads} requests={requests} onNavigate={navigate} /> : null}
				{section === "inbox" ? <InboxView threads={acceptedClientThreads} requests={requests} coach={coach} onRefresh={refresh} fullscreen={inboxFullscreen} onToggleFullscreen={toggleInboxFullscreen} /> : null}
				{section === "requests" ? <RequestsView requests={requests} coach={coach} onRefresh={refresh} /> : null}
				{section === "clients" ? <ClientsView threads={threads} onRefresh={refresh} onOpenInbox={() => navigate("inbox")} /> : null}
				{section === "profile" ? <PublicProfileView application={application} userProfile={userProfile} previewMode={previewMode} /> : null}
				{section === "account" ? <AccountView application={application} user={user} onExitCoachMode={onExitCoachMode} onOpenClientAccount={onOpenClientAccount} onSignOut={onSignOut} /> : null}
			</div>
			<nav className="coach-workspace-mobile-nav" aria-label="Coach workspace">
				{MOBILE_NAV_ITEMS.map((item) => <button key={item.id} type="button" className={section === item.id ? "is-active" : ""} aria-current={section === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><i><NavigationIcon name={item.id} /></i><span>{item.id === "requests" ? "Services" : item.label}</span>{item.id === "inbox" && unreadMessages ? <b>{unreadMessages}</b> : item.id === "requests" && availableRequests ? <b>{availableRequests}</b> : item.id === "clients" && pendingClientRequests ? <b>{pendingClientRequests}</b> : null}</button>)}
				<button type="button" className={mobileMenuOpen || ["profile", "account"].includes(section) ? "is-active" : ""} aria-current={["profile", "account"].includes(section) ? "page" : undefined} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}><i><NavigationIcon name="more" /></i><span>More</span></button>
			</nav>
			{mobileMenuOpen ? (
				<div className="coach-mobile-more-layer">
					<button type="button" className="coach-mobile-more-backdrop" aria-label="Close more menu" onClick={() => setMobileMenuOpen(false)} />
					<section className="coach-mobile-more-menu" aria-label="More coach options">
						<header><span>More</span><button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close more menu">×</button></header>
						<button type="button" className={section === "profile" ? "is-active" : ""} onClick={() => navigate("profile")}><i><NavigationIcon name="profile" /></i><span><strong>Public profile</strong><small>Manage how clients find you</small></span><b aria-hidden="true">›</b></button>
						<button type="button" className={section === "account" ? "is-active" : ""} onClick={() => navigate("account")}><i><NavigationIcon name="account" /></i><span><strong>Account</strong><small>Profile, payouts, and access</small></span><b aria-hidden="true">›</b></button>
						<button type="button" onClick={onExitCoachMode}><i><span aria-hidden="true">W</span></i><span><strong>User View</strong><small>Return to the client experience</small></span><b aria-hidden="true">›</b></button>
					</section>
				</div>
			) : null}
		</main>
	);
}
