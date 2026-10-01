import { useEffect, useMemo, useRef, useState } from "react";
import {
	MediaDraftTray,
	MediaPickerButton,
	MessageMediaGallery,
	useLocalMediaDrafts,
} from "./ChatMedia";
import { getRequestTypeLabel } from "../services/serviceRequestModel";
import {
	COACH_APPLICATION_CHANGED_EVENT,
	loadLocalCoachPublicProfile,
	saveLocalCoachPublicProfile,
} from "../../utils/coachApplications";
import {
	appendDirectMessageReply,
	appendServiceRequestMessage,
	claimServiceRequest,
	DIRECT_MESSAGES_CHANGED_EVENT,
	ensureCoachWorkspaceDemoData,
	loadDirectMessageThreads,
	loadServiceRequests,
	markDirectMessageThreadRead,
	markServiceRequestRead,
	passServiceRequest,
	SERVICE_REQUESTS_CHANGED_EVENT,
	updateServiceRequest,
} from "../services/conversationStore";
import { CoachReviewManager } from "./CoachReviews";
import coachWorkspaceBackground from "../../assets/coach-workspace-background.jpg";
import coachWorkspacePortrait from "../../assets/coach-workspace-portrait.jpg";
import "./CoachWorkspace.css";

const NAV_ITEMS = [
	{ id: "home", label: "Home" },
	{ id: "inbox", label: "Inbox" },
	{ id: "requests", label: "Requests" },
	{ id: "clients", label: "Clients" },
	{ id: "profile", label: "Public profile" },
	{ id: "account", label: "Account" },
];

function NavigationIcon({ name }) {
	const paths = {
		home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
		inbox: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
		requests: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M18 8v6M15 11h6" /></>,
		clients: <><circle cx="8.5" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M2.5 20c0-4 2.5-6 6-6s6 2 6 6M15 15c3 0 5 1.5 5 4" /></>,
		profile: <><path d="M5 20V10M12 20V4M19 20v-7M3 20h18" /></>,
		account: <><path d="M4 7h10M18 7h2M14 5v4M4 17h2M10 17h10M8 15v4M4 12h4M12 12h8M10 10v4" /></>,
	};
	return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
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
};

const CATEGORY_LABELS = {
	quick_help: "Quick Help",
	accountability: "Accountability",
	session: "Session",
	competition: "Competition",
};

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
			<div className="coach-client-snapshot__identity">
				<Avatar client={client} size={compact ? 42 : 54} />
				<div>
					<strong>{client.fullName || "Weightlisted client"}</strong>
					<span>{[client.city, client.gymName].filter(Boolean).join(" · ") || "Shared profile"}</span>
				</div>
			</div>
			{client.profileVisible === false ? (
				<div className="coach-client-snapshot__hidden">This client’s profile is currently hidden. History stays available, but new actions are paused.</div>
			) : (
				<>
					{client.trainingFocus?.length ? (
						<div className="coach-workspace-tags">
							{client.trainingFocus.map((focus) => <span key={focus}>{focus}</span>)}
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

function InboxView({ threads, onRefresh }) {
	const [activeId, setActiveId] = useState(() => threads[0]?.id || "");
	const [query, setQuery] = useState("");
	const [unreadOnly, setUnreadOnly] = useState(false);
	const visibleThreads = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return threads.filter((thread) => {
			if (unreadOnly && !thread.unreadForCoach) return false;
			if (!normalizedQuery) return true;
			const lastMessage = thread.messages?.[thread.messages.length - 1];
			return [
				thread.client?.fullName,
				thread.client?.city,
				thread.client?.gymName,
				lastMessage?.text,
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase()
				.includes(normalizedQuery);
		});
	}, [query, threads, unreadOnly]);
	const activeThread = threads.find((thread) => thread.id === activeId) || threads[0] || null;

	useEffect(() => {
		if (!activeThread?.id || !activeThread.unreadForCoach) return;
		markDirectMessageThreadRead(activeThread.id, "coach");
	}, [activeThread?.id, activeThread?.unreadForCoach]);

	function sendReply(text, attachments) {
		if (!activeThread) return;
		appendDirectMessageReply(activeThread.id, {
			id: `coach-message-${Date.now()}`,
			text,
			attachments: attachments.map(({ id, kind, name, size, mimeType, status, url }) => ({ id, kind, name, size, mimeType, status, url })),
			createdAt: new Date().toISOString(),
		});
		onRefresh();
	}

	return (
		<section className="coach-workspace-page">
			<PageHeading eyebrow="Conversations" title="Inbox" description="Read and answer every direct client message from one place." />
			<div className="coach-inbox-layout">
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
								</div>
								<time>{relativeDate(thread.updatedAt)}</time>
								{thread.unreadForCoach ? <b>{thread.unreadForCoach}</b> : null}
							</button>
						);
					}) : <EmptyState title={threads.length ? "No conversations found" : "No messages yet"} description={threads.length ? "Try a different name or turn off the unread filter." : "New client conversations will appear here."} />}
				</div>
				{activeThread ? (
					<div className="coach-conversation-shell">
						<header>
							<div><Avatar client={activeThread.client} /><div><strong>{activeThread.client?.fullName}</strong><span>{activeThread.client?.city || "Client conversation"}</span></div></div>
							<StatusBadge status={activeThread.client?.profileVisible === false ? "cancelled" : "claimed"} />
						</header>
						<ClientSnapshot client={activeThread.client} compact />
						<ConversationMessages messages={activeThread.messages} clientName={activeThread.client?.fullName || "Client"} />
						<MessageComposer disabled={activeThread.client?.profileVisible === false} placeholder="Reply to this client" onSend={sendReply} />
					</div>
				) : (
					<div className="coach-conversation-shell">
						<EmptyState title="Your conversations live here" description="Choose a client conversation to read and reply, or wait for a new message to arrive." />
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
	const [activeId, setActiveId] = useState(initialRequestId);
	const [notice, setNotice] = useState("");
	const [proposingTime, setProposingTime] = useState(false);
	const [proposedDate, setProposedDate] = useState("");
	const [proposedTime, setProposedTime] = useState("");

	const available = coach.acceptingRequests === false ? [] : requests.filter((request) => request.requestStatus === "matching" && request.paymentStatus === "paid" && !(request.passedByCoachIds || []).includes(coach.id));
	const active = requests.filter((request) => request.claimedBy?.id === coach.id && ["claimed", "in_progress", "delivered"].includes(request.requestStatus));
	const completed = requests.filter((request) => request.claimedBy?.id === coach.id && ["completed", "cancelled", "refunded"].includes(request.requestStatus));
	const visibleRequests = tab === "available" ? available : tab === "active" ? active : completed;
	const selected = requests.find((request) => request.id === activeId) || visibleRequests[0] || null;

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
		<section className="coach-workspace-page">
			<PageHeading eyebrow="Quick Services" title="Service requests" description="Accept a paid request, work with the client, then mark the service complete." />
			<nav className="coach-request-tabs" aria-label="Request status">
				<button type="button" className={tab === "available" ? "is-active" : ""} onClick={() => { setTab("available"); setActiveId(""); }}>Available <span>{available.length}</span></button>
				<button type="button" className={tab === "active" ? "is-active" : ""} onClick={() => { setTab("active"); setActiveId(""); }}>Active <span>{active.length}</span></button>
				<button type="button" className={tab === "completed" ? "is-active" : ""} onClick={() => { setTab("completed"); setActiveId(""); }}>Completed <span>{completed.length}</span></button>
			</nav>
			{notice ? <div className="coach-workspace-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>×</button></div> : null}
			<div className="coach-requests-layout">
				<div className="coach-request-list coach-scroll-panel">
					{visibleRequests.length ? visibleRequests.map((request) => (
						<button key={request.id} type="button" className={request.id === selected?.id ? "is-active" : ""} onClick={() => setActiveId(request.id)}>
							<div><span>{CATEGORY_LABELS[request.serviceCategory] || "Service"}</span><StatusBadge status={request.requestStatus} /></div>
							<strong>{requestTitle(request)}</strong>
							<p>{request.client?.fullName || "Weightlisted client"} · {request.details?.discipline || request.details?.sport || request.details?.duration || "Remote"}</p>
							<footer><small>{relativeDate(request.createdAt)}</small><b>{request.details?.coachPayout?.label || request.details?.price?.label}</b></footer>
						</button>
					)) : <EmptyState title={`No ${tab} requests`} description={tab === "available" ? "New paid requests that match your specialties will appear here." : tab === "active" ? "Accepted requests stay here until you mark them complete." : "Finished services will be saved here."} />}
				</div>
				{selected ? (
					<article className="coach-request-detail coach-scroll-panel">
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
							<DetailRow label="Training">{selected.details?.discipline}</DetailRow>
							<DetailRow label="Attempt">{selected.details?.attemptType}</DetailRow>
							<DetailRow label="Sport">{selected.details?.sport}</DetailRow>
							<DetailRow label="Duration">{selected.details?.duration}</DetailRow>
							<DetailRow label="Requested time">{selected.details?.scheduledDate ? `${selected.details.scheduledDate} at ${selected.details.scheduledTime}` : ""}</DetailRow>
							<DetailRow label="Competition date">{selected.details?.eventDate}</DetailRow>
							<DetailRow label="Client paid">{selected.details?.price?.label}</DetailRow>
							<DetailRow label="Your payout">{selected.details?.coachPayout?.label || "Calculated at payout"}</DetailRow>
							<DetailRow label="Payment">{selected.paymentStatus === "paid" ? "Paid and secured" : selected.paymentStatus}</DetailRow>
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

function ClientsView({ threads, requests, coach, onOpenInbox, onOpenRequest }) {
	const clients = useMemo(() => {
		const map = new Map();
		threads.forEach((thread) => {
			if (thread.client?.id) map.set(thread.client.id, { ...thread.client, threadId: thread.id });
		});
		requests.filter((request) => request.claimedBy?.id === coach.id).forEach((request) => {
			if (!request.client?.id) return;
			const existing = map.get(request.client.id) || request.client;
			map.set(request.client.id, { ...existing, requestIds: [...new Set([...(existing.requestIds || []), request.id])] });
		});
		return [...map.values()];
	}, [coach.id, requests, threads]);
	const [activeId, setActiveId] = useState(() => clients[0]?.id || "");
	const activeClient = clients.find((client) => client.id === activeId) || clients[0];
	const clientRequests = requests.filter((request) => request.client?.id === activeClient?.id && request.claimedBy?.id === coach.id);

	return (
		<section className="coach-workspace-page">
			<PageHeading eyebrow="Relationships" title="Clients" description="People appear here when they message you or have an accepted service request." />
			<div className="coach-clients-layout">
				<div className="coach-client-list">
					{clients.map((client) => <button key={client.id} type="button" className={client.id === activeClient?.id ? "is-active" : ""} onClick={() => setActiveId(client.id)}><Avatar client={client} /><div><strong>{client.fullName}</strong><span>{client.city || "Shared client profile"}</span></div></button>)}
				</div>
				{activeClient ? <article className="coach-client-detail"><ClientSnapshot client={activeClient} /><h3>Activity with you</h3><div className="coach-client-activity">{activeClient.threadId ? <button type="button" onClick={() => onOpenInbox(activeClient.threadId)}><span>Direct message</span><strong>Open conversation →</strong></button> : null}{clientRequests.map((request) => <button type="button" key={request.id} onClick={() => onOpenRequest(request.id)}><span>{CATEGORY_LABELS[request.serviceCategory]}</span><strong>{requestTitle(request)} →</strong><small>{REQUEST_STATUS_LABELS[request.requestStatus]}</small></button>)}</div></article> : null}
			</div>
		</section>
	);
}

function buildProfileDraft(application, userProfile) {
	return {
		fullName: application?.fullName || userProfile?.full_name || "Weightlisted Coach",
		title: application?.coachTitle || "Strength Coach",
		bio: application?.bio || "",
		city: application?.gymCity || application?.city || userProfile?.city || "",
		gymName: application?.gymName || userProfile?.gym_name || "",
		specialties: application?.specialties || [],
		formats: [application?.inPersonCoaching ? "In person" : "", application?.onlineTraining || application?.remoteAvailable ? "Online" : ""].filter(Boolean),
		certifications: normalizeStringList(application?.certifications),
		website: application?.socialLinks?.find((link) => String(link.type).toLowerCase() === "website")?.value || "",
		visible: true,
		acceptingRequests: true,
		avatarUrl: application?.profilePhotoUrl || userProfile?.avatar_url || "",
	};
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

function PublicProfileView({ application, userProfile }) {
	const [draft, setDraft] = useState(() => {
		const baseDraft = buildProfileDraft(application, userProfile);
		const storedDraft = loadLocalCoachPublicProfile(application?.id) || {};
		return {
			...baseDraft,
			...storedDraft,
			certifications: normalizeStringList(storedDraft.certifications ?? baseDraft.certifications),
		};
	});
	const [saved, setSaved] = useState(false);
	const isAvailableToClients = draft.visible && draft.acceptingRequests;

	function toggleList(field, value) {
		setDraft((current) => ({ ...current, [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value] }));
	}

	function save(event) {
		event.preventDefault();
		saveLocalCoachPublicProfile(application?.id, draft);
		setSaved(true);
		window.setTimeout(() => setSaved(false), 2200);
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
						<span><strong>{isAvailableToClients ? "Visible and accepting requests" : "Hidden from clients"}</strong><small>Controls your directory listing and new Quick Service requests together.</small></span>
						<b>{isAvailableToClients ? "On" : "Off"}</b>
					</button>
					<label><span>Public name</span><input value={draft.fullName} onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))} /></label>
					<label><span>Coach title</span><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
					<label><span>Short public bio</span><textarea rows={5} value={draft.bio} onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} /></label>
					<div className="coach-profile-editor__grid"><label><span>City</span><input value={draft.city} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} /></label><label><span>Exact gym</span><input value={draft.gymName} onChange={(event) => setDraft((current) => ({ ...current, gymName: event.target.value }))} /></label></div>
					<fieldset><legend>Coaching format</legend><div className="coach-workspace-choice-pills">{["In person", "Online"].map((format) => <button type="button" key={format} className={draft.formats.includes(format) ? "is-selected" : ""} onClick={() => toggleList("formats", format)}>{format}</button>)}</div></fieldset>
					<fieldset><legend>Specialties</legend><div className="coach-workspace-choice-pills">{PROFILE_SPECIALTIES.map((specialty) => <button type="button" key={specialty} className={draft.specialties.includes(specialty) ? "is-selected" : ""} onClick={() => toggleList("specialties", specialty)}>{specialty}</button>)}</div></fieldset>
					<MultiEntryPills
						label="Certifications"
						values={draft.certifications}
						onChange={(certifications) => setDraft((current) => ({ ...current, certifications }))}
						placeholder="Add a certification"
					/>
					<label><span>Website or social profile</span><input value={draft.website} onChange={(event) => setDraft((current) => ({ ...current, website: event.target.value }))} type="url" placeholder="https://" /></label>
					<button className="coach-workspace-primary" type="submit">{saved ? "Profile saved ✓" : "Save public profile"}</button>
				</form>
				<aside className="coach-public-preview"><span>Client preview</span><div className="coach-public-preview__card"><Avatar client={{ fullName: draft.fullName, avatarUrl: draft.avatarUrl }} size={82} /><h2>{draft.fullName}</h2><p>{draft.title}</p><small>{[draft.city, draft.gymName].filter(Boolean).join(" · ") || "Location not added"}</small><div className="coach-workspace-tags">{draft.specialties.map((specialty) => <span key={specialty}>{specialty}</span>)}</div><blockquote>{draft.bio || "Your public bio will appear here."}</blockquote><footer><span>{draft.formats.join(" + ") || "Format not selected"}</span><b>{isAvailableToClients ? "Visible & accepting" : "Not visible"}</b></footer></div></aside>
			</div>
			<CoachReviewManager coachId={application?.id} coachName={draft.fullName} />
		</section>
	);
}

function HomeView({ coach, threads, requests, onNavigate }) {
	const unread = threads.reduce((total, thread) => total + (thread.unreadForCoach || 0), 0);
	const available = coach.acceptingRequests === false ? [] : requests.filter((request) => request.requestStatus === "matching" && request.paymentStatus === "paid" && !(request.passedByCoachIds || []).includes(coach.id));
	const active = requests.filter((request) => request.claimedBy?.id === coach.id && ["claimed", "in_progress", "delivered"].includes(request.requestStatus));
	const nextSession = active.filter((request) => request.serviceCategory === "session" && request.details?.scheduledDate).sort((a, b) => `${a.details.scheduledDate}${a.details.scheduledTime}`.localeCompare(`${b.details.scheduledDate}${b.details.scheduledTime}`))[0];
	return (
		<section className="coach-workspace-page coach-home">
			<PageHeading eyebrow="Coach workspace" title={`Welcome, ${coach.name.split(" ")[0]}`} description="Everything here is driven by what clients can do on Weightlisted." action={<button type="button" className="coach-workspace-mode-button" onClick={() => onNavigate("profile")}>Preview public profile</button>} />
			<div className="coach-home-stats"><button type="button" onClick={() => onNavigate("inbox")}><span>Unread messages</span><strong>{unread}</strong><small>Open inbox →</small></button><button type="button" onClick={() => onNavigate("requests")}><span>Available requests</span><strong>{available.length}</strong><small>Review paid requests →</small></button><button type="button" onClick={() => onNavigate("requests")}><span>Active services</span><strong>{active.length}</strong><small>Continue client work →</small></button></div>
			<div className="coach-home-grid"><section><header><div><span>Needs attention</span><h2>Today</h2></div></header>{unread ? <button type="button" onClick={() => onNavigate("inbox")}><b>{unread}</b><div><strong>Client messages waiting</strong><span>Read and reply from your inbox.</span></div><i>→</i></button> : null}{available.length ? <button type="button" onClick={() => onNavigate("requests")}><b>{available.length}</b><div><strong>Paid requests available</strong><span>Review every submitted detail before accepting.</span></div><i>→</i></button> : null}{nextSession ? <button type="button" onClick={() => onNavigate("requests")}><b>◷</b><div><strong>{requestTitle(nextSession)}</strong><span>{nextSession.details.scheduledDate} at {nextSession.details.scheduledTime}</span></div><i>→</i></button> : null}{!unread && !available.length && !nextSession ? <EmptyState title="You’re caught up" description="New messages and paid requests will appear here." /> : null}</section><aside><span>Profile availability</span><h2>Ready to be discovered</h2><p>Use one control to show your profile and accept new requests.</p><button type="button" onClick={() => onNavigate("profile")}>Manage public profile</button></aside></div>
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
	const [threads, setThreads] = useState([]);
	const [requests, setRequests] = useState([]);

	function refresh() {
		setThreads(loadDirectMessageThreads({ view: "coach", coachId: coach.id }));
		setRequests(loadServiceRequests({ view: "coach", coachId: coach.id }));
		setPublicProfile(loadLocalCoachPublicProfile(application?.id));
	}

	useEffect(() => {
		if (previewMode) ensureCoachWorkspaceDemoData(coach);
		refresh();
		window.addEventListener(DIRECT_MESSAGES_CHANGED_EVENT, refresh);
		window.addEventListener(SERVICE_REQUESTS_CHANGED_EVENT, refresh);
		window.addEventListener(COACH_APPLICATION_CHANGED_EVENT, refresh);
		window.addEventListener("storage", refresh);
		return () => {
			window.removeEventListener(DIRECT_MESSAGES_CHANGED_EVENT, refresh);
			window.removeEventListener(SERVICE_REQUESTS_CHANGED_EVENT, refresh);
			window.removeEventListener(COACH_APPLICATION_CHANGED_EVENT, refresh);
			window.removeEventListener("storage", refresh);
		};
	}, [application?.id, coach.id, previewMode]);

	const unreadMessages = threads.reduce((total, thread) => total + (thread.unreadForCoach || 0), 0);
	const availableRequests = coach.acceptingRequests === false ? 0 : requests.filter((request) => request.requestStatus === "matching" && request.paymentStatus === "paid" && !(request.passedByCoachIds || []).includes(coach.id)).length;

	return (
		<main
			className={`coach-workspace-shell${previewMode ? " is-preview" : ""}`}
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
			<aside className="coach-workspace-sidebar">
				<header><div className="coach-workspace-logo">W</div><div><span>Weightlisted</span><strong>Coach</strong></div></header>
				<nav aria-label="Coach workspace">
					{NAV_ITEMS.map((item) => <button key={item.id} type="button" className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)}><i><NavigationIcon name={item.id} /></i><span>{item.label}</span>{item.id === "inbox" && unreadMessages ? <b>{unreadMessages}</b> : item.id === "requests" && availableRequests ? <b>{availableRequests}</b> : null}</button>)}
				</nav>
				<footer><div><Avatar client={{ fullName: coach.name, avatarUrl: coach.avatarUrl }} /><span><strong>{coach.name}</strong><small>{coach.title}</small></span></div><button type="button" onClick={onExitCoachMode}>User View</button></footer>
			</aside>
			<div className="coach-workspace-main coach-scroll-panel">
				{section === "home" ? <HomeView coach={coach} threads={threads} requests={requests} onNavigate={setSection} /> : null}
				{section === "inbox" ? <InboxView threads={threads} onRefresh={refresh} /> : null}
				{section === "requests" ? <RequestsView requests={requests} coach={coach} onRefresh={refresh} /> : null}
				{section === "clients" ? <ClientsView threads={threads} requests={requests} coach={coach} onOpenInbox={() => setSection("inbox")} onOpenRequest={() => setSection("requests")} /> : null}
				{section === "profile" ? <PublicProfileView application={application} userProfile={userProfile} /> : null}
				{section === "account" ? <AccountView application={application} user={user} onExitCoachMode={onExitCoachMode} onOpenClientAccount={onOpenClientAccount} onSignOut={onSignOut} /> : null}
			</div>
			<nav className="coach-workspace-mobile-nav" aria-label="Coach workspace">
				{NAV_ITEMS.map((item) => <button key={item.id} type="button" className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)}><i><NavigationIcon name={item.id} /></i><span>{item.id === "profile" ? "Profile" : item.label}</span>{item.id === "inbox" && unreadMessages ? <b>{unreadMessages}</b> : item.id === "requests" && availableRequests ? <b>{availableRequests}</b> : null}</button>)}
			</nav>
		</main>
	);
}
