import { useEffect, useRef, useState } from "react";
import {
	MediaDraftTray,
	MediaPickerButton,
	MessageMediaGallery,
	useLocalMediaDrafts,
} from "./ChatMedia";
import {
	buildServiceRequest,
	COMPETITION_REQUEST_TYPES,
	COMPETITION_SPORTS,
	getAccountabilityDurations,
	getServicePrice,
	getRequestTypeLabel,
	REQUEST_TYPES,
	SERVICE_CATEGORIES,
	TRAINING_DISCIPLINES,
	validateServiceRequest,
} from "../services/serviceRequestModel";
import {
	appendServiceRequestMessage,
	loadServiceRequests,
	saveServiceRequest,
	SERVICE_REQUESTS_CHANGED_EVENT,
} from "../services/conversationStore";
import "./ServicesFlow.css";

const INITIAL_DRAFT = {
	category: "",
	requestType: "",
	sport: "",
	discipline: "",
	attemptType: "",
	duration: "",
	scheduledDate: "",
	scheduledTime: "",
	eventDate: "",
	location: "",
	delivery: "",
	description: "",
};

function ChoiceGrid({ options, value, onSelect, compact = false, directory = false, dense = false }) {
	return (
		<div
			className={`services-choice-grid${compact ? " is-compact" : ""}${directory ? " is-directory" : ""}${dense ? " is-dense" : ""}`}
		>
			{options.map((option) => {
				const item = typeof option === "string" ? { id: option, label: option } : option;
				const examples = item.examples
					? item.examples.split(" • ").filter(Boolean)
					: [];
				return (
					<button
						key={item.id}
						type="button"
						className={value === item.id ? "is-selected" : ""}
						onClick={() => onSelect(item.id)}
					>
						<strong>{item.label}</strong>
						{item.description ? <span>{item.description}</span> : null}
						{examples.length ? (
							<small className="services-choice-examples">
								{examples.map((example) => <span key={example}>{example}</span>)}
							</small>
						) : null}
					</button>
				);
			})}
		</div>
	);
}

function FieldError({ children }) {
	return children ? <div className="services-field-error" role="alert">{children}</div> : null;
}

function SummaryRow({ label, children }) {
	if (!children) return null;
	return (
		<div className="services-summary-row">
			<span>{label}</span>
			<strong>{children}</strong>
		</div>
	);
}

function formatRequestDate(value) {
	if (!value) return "";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? ""
		: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function getStoredRequestTitle(request) {
	if (!request) return "Service request";
	return getRequestTypeLabel({
		category: request.serviceCategory,
		requestType: request.requestType,
	});
}

function getRequestStatusLabel(request) {
	const labels = {
		awaiting_payment: "Request sent",
		matching: "Finding a coach",
		claimed: "Coach accepted",
		in_progress: "In progress",
		delivered: "Response ready",
		completed: "Completed",
		refunded: "Refunded",
		cancelled: "Cancelled",
	};
	return labels[request?.requestStatus] || "Request sent";
}

function getStoredRequestPriceLabel(request) {
	return request?.details?.price?.label || request?.details?.budget?.label || "";
}

const ACCOUNTABILITY_FORM_COPY = {
	training_accountability: {
		duration: "How long would you like training check-ins? *",
		label: "What training are you staying consistent with?",
		placeholder: "Share your planned workout or training goal",
	},
	nutrition_accountability: {
		duration: "How long would you like nutrition check-ins? *",
		label: "What nutrition habit are you working on?",
		placeholder: "Share the habit, target, or routine you want help staying consistent with",
	},
	competition_accountability: {
		duration: "How long would you like preparation check-ins? *",
		label: "What do you want to stay on top of?",
		placeholder: "Share the event and the preparation tasks you want to stay on top of",
	},
	general_accountability: {
		duration: "How long would you like goal check-ins? *",
		label: "What goal are you working toward?",
		placeholder: "Share the specific goal you want help staying consistent with",
	},
	other_accountability: {
		duration: "How long would you like check-ins? *",
		label: "What would you like accountability for?",
		placeholder: "Share the goal or task you want to complete",
	},
};

function getDescriptionCopy(draft) {
	if (draft.category === "accountability") {
		return ACCOUNTABILITY_FORM_COPY[draft.requestType] || ACCOUNTABILITY_FORM_COPY.other_accountability;
	}
	if (draft.category === "quick_help") {
		return {
			label: "What should the coach focus on?",
			placeholder: "Share the context that will help the coach review your request",
		};
	}
	if (draft.category === "session") {
		return {
			label: "What would you like to work on?",
			placeholder: "Share what you want to cover during the session",
		};
	}
	return {
		label: "What support would be most useful?",
		placeholder: "Share the context that will help the coach support you",
	};
}

export default function ServicesFlow({
	open,
	onClose,
	embedded = false,
	initialView = "new",
	backLabel = "Back to coaches",
	onRequireAuth,
}) {
	const navigationButtonRef = useRef(null);
	const contentRef = useRef(null);
	const requestMessagesRef = useRef(null);
	const wasOpenRef = useRef(false);
	const [section, setSection] = useState(initialView === "requests" ? "requests" : "new");
	const [step, setStep] = useState("category");
	const [history, setHistory] = useState([]);
	const [draft, setDraft] = useState(INITIAL_DRAFT);
	const [errors, setErrors] = useState({});
	const [submittedRequest, setSubmittedRequest] = useState(null);
	const [requests, setRequests] = useState(() => loadServiceRequests());
	const [activeRequestId, setActiveRequestId] = useState(null);
	const [requestMessage, setRequestMessage] = useState("");
	const {
		attachments,
		error: mediaError,
		addFiles,
		removeAttachment,
		clearAttachments,
	} = useLocalMediaDrafts({ maxItems: 4 });

	useEffect(() => {
		if (!open) {
			if (wasOpenRef.current) {
				setSection(initialView === "requests" ? "requests" : "new");
				setStep("category");
				setHistory([]);
				setDraft(INITIAL_DRAFT);
				setErrors({});
				setSubmittedRequest(null);
				setActiveRequestId(null);
				setRequestMessage("");
				clearAttachments();
			}
			wasOpenRef.current = false;
			return undefined;
		}

		wasOpenRef.current = true;
		setSection(initialView === "requests" ? "requests" : "new");
		setRequests(loadServiceRequests());
		const previousOverflow = document.body.style.overflow;
		if (!embedded) document.body.style.overflow = "hidden";
		navigationButtonRef.current?.focus();
		const handleKeyDown = (event) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			if (!embedded) document.body.style.overflow = previousOverflow;
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [embedded, initialView, open, onClose]);

	useEffect(() => {
		const refreshRequests = () => setRequests(loadServiceRequests());
		window.addEventListener(SERVICE_REQUESTS_CHANGED_EVENT, refreshRequests);
		window.addEventListener("storage", refreshRequests);
		return () => {
			window.removeEventListener(SERVICE_REQUESTS_CHANGED_EVENT, refreshRequests);
			window.removeEventListener("storage", refreshRequests);
		};
	}, []);

	useEffect(() => {
		contentRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
	}, [activeRequestId, section, step]);

	useEffect(() => {
		if (!activeRequestId || !requestMessagesRef.current) return;
		requestMessagesRef.current.scrollTop = requestMessagesRef.current.scrollHeight;
	}, [activeRequestId, requests]);

	if (!open) return null;

	function updateDraft(patch) {
		setDraft((current) => ({ ...current, ...patch }));
		setErrors((current) => {
			const next = { ...current };
			Object.keys(patch).forEach((key) => delete next[key]);
			return next;
		});
	}

	function goTo(nextStep, patch = null) {
		if (patch) updateDraft(patch);
		setHistory((current) => [...current, step]);
		setStep(nextStep);
		setErrors({});
	}

	function goBack() {
		if (!history.length) return;
		setStep(history[history.length - 1]);
		setHistory(history.slice(0, -1));
		setErrors({});
	}

	function selectCategory(category) {
		const patch = { ...INITIAL_DRAFT, category };
		goTo(category === "competition" ? "competitionSport" : "requestType", patch);
	}

	function selectRequestType(requestType) {
		goTo("details", {
			requestType,
			sport: draft.category === "competition" ? draft.sport : "",
			discipline: "",
			attemptType: "",
			duration: "",
			scheduledDate: "",
			scheduledTime: "",
			eventDate: "",
			location: "",
			delivery: "",
			description: "",
		});
	}

	function reviewRequest(event) {
		event.preventDefault();
		const nextErrors = validateServiceRequest(draft, attachments.length);
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length) return;
		goTo("review");
	}

	function saveAndOpenRequest() {
		const request = buildServiceRequest(draft, attachments);
		setSubmittedRequest(request);
		try {
			saveServiceRequest(request);
		} catch {
			// The confirmation still works when private browsing blocks local storage.
		}
		goTo("sent");
	}

	function submitRequest() {
		const nextErrors = validateServiceRequest(draft, attachments.length);
		if (Object.keys(nextErrors).length) {
			setErrors(nextErrors);
			setStep("details");
			return;
		}
		if (onRequireAuth) {
			onRequireAuth({ reason: "service", onAuthenticated: saveAndOpenRequest });
			return;
		}
		saveAndOpenRequest();
	}

	function openRequest(requestId) {
		setSection("requests");
		setActiveRequestId(requestId);
		setRequestMessage("");
	}

	function selectSection(nextSection) {
		setSection(nextSection);
		setActiveRequestId(null);
		if (nextSection === "new") {
			setStep("category");
			setHistory([]);
		}
	}

	function addRequestMessage(event) {
		event.preventDefault();
		const text = requestMessage.trim();
		if (!text || !activeRequestId) return;
		appendServiceRequestMessage(activeRequestId, {
			id: `service-message-${Date.now()}`,
			sender: "client",
			text,
			createdAt: new Date().toISOString(),
		});
		setRequestMessage("");
	}

	const requestTypeLabel = getRequestTypeLabel(draft);
	const today = new Date().toISOString().slice(0, 10);
	const fixedPrice = getServicePrice(draft);
	const selectedPriceLabel = fixedPrice?.label;
	const accountabilityDurations = getAccountabilityDurations(draft.requestType);
	const accountabilityCopy =
		ACCOUNTABILITY_FORM_COPY[draft.requestType] || ACCOUNTABILITY_FORM_COPY.other_accountability;
	const descriptionCopy = getDescriptionCopy(draft);
	const competitionOptions = (COMPETITION_REQUEST_TYPES[draft.sport] || []).map((label) => ({
		id: label,
		label,
	}));

	function renderTrainingDisciplineField() {
		return (
			<div className="services-field">
				<label>What kind of training? *</label>
				<p>This helps us match you with coaches who have the right expertise.</p>
				<ChoiceGrid
					options={TRAINING_DISCIPLINES}
					value={draft.discipline}
					onSelect={(discipline) => updateDraft({ discipline })}
					compact
				/>
				<FieldError>{errors.discipline}</FieldError>
			</div>
		);
	}

	function renderSportField(label) {
		return (
			<div className="services-field">
				<label>{label} *</label>
				<ChoiceGrid
					options={COMPETITION_SPORTS}
					value={draft.sport}
					onSelect={(sport) => updateDraft({ sport })}
					compact
				/>
				<FieldError>{errors.sport}</FieldError>
			</div>
		);
	}

	function renderDetails() {
		return (
			<form onSubmit={reviewRequest} className="services-form">
				<div className="services-question-heading">
					<p>{SERVICE_CATEGORIES.find((category) => category.id === draft.category)?.label}</p>
					<h2>{requestTypeLabel}</h2>
					<span>A few details will help us match you with the right coach.</span>
				</div>

				{draft.category === "quick_help" ? (
					<>
						<div className="services-field">
							<label>Video or photos{["form_review", "attempt_review", "posing_review"].includes(draft.requestType) ? " *" : ""}</label>
							<p>Add any videos or photos that will help the coach understand your request.</p>
							<MediaDraftTray attachments={attachments} onRemove={removeAttachment} />
							<div className="services-media-picker-row"><MediaPickerButton onFiles={addFiles} /><span>Add media</span></div>
							<FieldError>{errors.attachments || mediaError}</FieldError>
						</div>

						{draft.requestType !== "posing_review" ? renderTrainingDisciplineField() : null}

						{draft.requestType === "attempt_review" ? (
							<div className="services-field">
								<label>Attempt type *</label>
								<ChoiceGrid
									options={[
										{ id: "pr", label: "PR attempt" },
										{ id: "competition", label: "Competition attempt" },
										{ id: "training", label: "Training attempt" },
									]}
									value={draft.attemptType}
									onSelect={(attemptType) => updateDraft({ attemptType })}
									compact
								/>
								<FieldError>{errors.attemptType}</FieldError>
							</div>
						) : null}

					</>
				) : null}

				{draft.category === "accountability" ? (
					<>
						{draft.requestType === "training_accountability" ? renderTrainingDisciplineField() : null}
						{draft.requestType === "competition_accountability" ? renderSportField("What are you preparing for?") : null}
						<div className="services-field">
							<label>{accountabilityCopy.duration}</label>
							<ChoiceGrid options={accountabilityDurations} value={draft.duration} onSelect={(duration) => updateDraft({ duration })} compact />
							<FieldError>{errors.duration}</FieldError>
						</div>
					</>
				) : null}

				{draft.category === "session" ? (
					<>
						{["technique_session", "workout_guidance"].includes(draft.requestType) ? renderTrainingDisciplineField() : null}
						{draft.requestType === "competition_practice" ? renderSportField("What are you practicing for?") : null}
						<div className="services-field-grid">
							<div className="services-field">
								<label htmlFor="service-date">Preferred date *</label>
								<input id="service-date" type="date" min={today} value={draft.scheduledDate} onChange={(event) => updateDraft({ scheduledDate: event.target.value })} />
								<FieldError>{errors.scheduledDate}</FieldError>
							</div>
							<div className="services-field">
								<label htmlFor="service-time">Preferred time *</label>
								<input id="service-time" type="time" value={draft.scheduledTime} onChange={(event) => updateDraft({ scheduledTime: event.target.value })} />
								<FieldError>{errors.scheduledTime}</FieldError>
							</div>
						</div>
						<div className="services-delivery-note"><strong>Remote session</strong><span>We’ll match you with a coach who supports live remote sessions.</span></div>
					</>
				) : null}

				{draft.category === "competition" ? (
					<>
						<div className="services-field-grid">
							<div className="services-field">
								<label htmlFor="service-event-date">Competition date *</label>
								<input id="service-event-date" type="date" min={today} value={draft.eventDate} onChange={(event) => updateDraft({ eventDate: event.target.value })} />
								<FieldError>{errors.eventDate}</FieldError>
							</div>
							<div className="services-field">
								<label htmlFor="service-location">Event location</label>
								<input id="service-location" value={draft.location} onChange={(event) => updateDraft({ location: event.target.value })} placeholder="City or venue" />
							</div>
						</div>
						<div className="services-delivery-note"><strong>Remote support</strong><span>Online support keeps the package affordable and helps us match you with more qualified coaches.</span></div>
					</>
				) : null}

				{fixedPrice || errors.price ? (
					<div className="services-field services-price-field">
						<label>Fixed service price</label>
						{fixedPrice ? (
							<div className="services-fixed-price">
								<strong className="services-price-amount">{fixedPrice.label}</strong>
								<span className="services-fixed-price-description">{fixedPrice.description}</span>
							</div>
						) : <FieldError>{errors.price}</FieldError>}
					</div>
				) : null}

				<div className="services-field">
					<label htmlFor="service-description">{descriptionCopy.label}{["accountability", "session"].includes(draft.category) ? " *" : ""}</label>
					<textarea id="service-description" rows="3" value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} placeholder={descriptionCopy.placeholder} />
					<FieldError>{errors.description}</FieldError>
				</div>

				<button type="submit" className="services-primary-action">Review request</button>
			</form>
		);
	}

	function renderStep() {
		switch (step) {
			case "category":
				return <><div className="services-question-heading"><p>Services</p><h2>What do you need help with?</h2><span>Focused help without a subscription</span></div><ChoiceGrid options={SERVICE_CATEGORIES} value={draft.category} onSelect={selectCategory} directory /></>;
			case "competitionSport":
				return <><div className="services-question-heading"><p>Competition</p><h2>What are you competing in?</h2></div><ChoiceGrid options={COMPETITION_SPORTS} value={draft.sport} onSelect={(sport) => goTo("requestType", { sport, requestType: "" })} directory dense /></>;
			case "requestType":
				return <><div className="services-question-heading"><p>{SERVICE_CATEGORIES.find((category) => category.id === draft.category)?.label}</p><h2>{draft.category === "accountability" ? "What do you want accountability for?" : draft.category === "competition" ? "What kind of support do you need?" : "What do you need help with?"}</h2></div><ChoiceGrid options={draft.category === "competition" ? competitionOptions : REQUEST_TYPES[draft.category] || []} value={draft.requestType} onSelect={selectRequestType} directory dense /></>;
			case "details":
				return renderDetails();
			case "review":
				return (
					<div className="services-review">
						<div className="services-question-heading"><p>Review request</p><h2>{requestTypeLabel}</h2><span>Review the details the coach will receive.</span></div>
						<div className="services-matching-note">
							<strong>How matching works</strong>
							<span>
								We’ll start with available coaches nearest to you who match your specific needs. If no one responds, we’ll broaden the search to qualified online coaches.
							</span>
						</div>
						{attachments.length ? <MessageMediaGallery attachments={attachments} /> : null}
						<div className="services-summary">
							<SummaryRow label="Service">{SERVICE_CATEGORIES.find((category) => category.id === draft.category)?.label}</SummaryRow>
							<SummaryRow label="Discipline">{TRAINING_DISCIPLINES.find((discipline) => discipline.id === draft.discipline)?.label}</SummaryRow>
							<SummaryRow label="Sport">{COMPETITION_SPORTS.find((sport) => sport.id === draft.sport)?.label || draft.sport}</SummaryRow>
							<SummaryRow label="Duration">{draft.duration}</SummaryRow>
							<SummaryRow label="When">{draft.scheduledDate ? `${draft.scheduledDate} at ${draft.scheduledTime}` : draft.eventDate}</SummaryRow>
							<SummaryRow label="Location">{draft.location}</SummaryRow>
							<SummaryRow label="Price">{selectedPriceLabel}</SummaryRow>
							<SummaryRow label="Focus">{draft.description}</SummaryRow>
						</div>
						<button type="button" className="services-primary-action" onClick={submitRequest}>Continue to payment • {selectedPriceLabel}</button>
					</div>
				);
			case "sent":
				return (
					<div className="services-sent-state">
						<div className="services-sent-check">✓</div>
						<p>Request sent</p>
						<h2>Your fixed price is locked in</h2>
						<span>Secure payment is the next step. Coaches are notified only after your {selectedPriceLabel} payment succeeds.</span>
						<div className="services-status-track"><strong>Sent ✓</strong><span>Payment</span><span>Coach matched</span></div>
						<small>Request {submittedRequest?.id?.replace("service-request-", "#")}</small>
						<button type="button" className="services-primary-action" onClick={() => openRequest(submittedRequest?.id)}>View service request</button>
					</div>
				);
			default:
				return null;
		}
	}

	function renderRequests() {
		const activeRequest = requests.find((request) => request.id === activeRequestId);
		if (activeRequest) {
			const price = getStoredRequestPriceLabel(activeRequest);
			return (
				<div className="services-request-thread">
					<div className="services-question-heading">
						<p>{getRequestStatusLabel(activeRequest)}</p>
						<h2>{getStoredRequestTitle(activeRequest)}</h2>
						<span>Created {formatRequestDate(activeRequest.createdAt)} · {price}</span>
					</div>
					{activeRequest.requestStatus === "awaiting_payment" ? (
						<div className="services-payment-callout">
							<div><strong>Payment required</strong><span>Coaches will be notified after secure checkout.</span></div>
							<strong className="services-price-amount">{price}</strong>
						</div>
					) : null}
					{activeRequest.attachments?.length ? (
						<div className="services-saved-attachments" aria-label="Request attachments">
							{activeRequest.attachments.map((attachment) => <span key={attachment.id}>{attachment.kind === "video" ? "Video" : "Photo"} · {attachment.name}</span>)}
						</div>
					) : null}
					<details className="services-request-details" open>
						<summary>Original request</summary>
						<div className="services-summary">
							<SummaryRow label="Status">{getRequestStatusLabel(activeRequest)}</SummaryRow>
							<SummaryRow label="Price">{price}</SummaryRow>
							<SummaryRow label="Focus">{activeRequest.details?.description}</SummaryRow>
						</div>
					</details>
					<div ref={requestMessagesRef} className="services-thread-messages coach-scroll-panel" aria-live="polite">
						{activeRequest.messages?.length ? activeRequest.messages.map((message) => (
							<div key={message.id} className="services-thread-message"><span>You</span><p>{message.text}</p></div>
						)) : <p className="services-thread-empty">This conversation will keep the request, coach response, receipt, and follow-up messages together.</p>}
					</div>
					<form className="services-thread-composer" onSubmit={addRequestMessage}>
						<input value={requestMessage} onChange={(event) => setRequestMessage(event.target.value)} placeholder="Add context to your request" aria-label="Message about this service request" />
						<button type="submit" disabled={!requestMessage.trim()}>Send</button>
					</form>
				</div>
			);
		}

		return (
			<div className="services-requests-list">
				<div className="services-question-heading"><p>Service requests</p><h2>Your Quick Services</h2><span>Requests, responses, and follow-up messages stay together.</span></div>
				{requests.length ? requests.map((request) => (
					<button key={request.id} type="button" className="services-request-card" onClick={() => openRequest(request.id)}>
						<div><span>{getRequestStatusLabel(request)}</span><strong>{getStoredRequestTitle(request)}</strong><small>{formatRequestDate(request.updatedAt || request.createdAt)}</small></div>
						<strong className="services-price-amount">{getStoredRequestPriceLabel(request)}</strong>
					</button>
				)) : (
					<div className="services-empty-requests"><strong>No service requests yet</strong><span>Start with one affordable, focused request.</span><button type="button" onClick={() => selectSection("new")}>Start a request</button></div>
				)}
			</div>
		);
	}

	const showSectionTabs = section === "requests" || step === "category";
	const canGoBackInFlow = section === "new" && history.length && step !== "sent";
	function handleHeaderBack() {
		if (section === "requests" && activeRequestId) {
			setActiveRequestId(null);
			return;
		}
		if (canGoBackInFlow) {
			goBack();
			return;
		}
		onClose();
	}

	const flow = (
		<section className={`services-modal${embedded ? " is-embedded" : ""}`} aria-labelledby="services-flow-title">
			<div ref={contentRef} className="services-modal-content coach-scroll-panel">
				<header className="services-modal-header">
					<button
						ref={navigationButtonRef}
						type="button"
						className="services-back-button"
						onClick={handleHeaderBack}
						aria-label={section === "requests" && activeRequestId || canGoBackInFlow ? "Go back" : backLabel}
					>
						←
					</button>
					<div><span>Weightlisted Services</span><strong id="services-flow-title">Quick Services</strong></div>
				</header>
				{showSectionTabs ? (
					<nav className="services-section-tabs" aria-label="Quick Services">
						<button type="button" className={section === "new" ? "is-active" : ""} onClick={() => selectSection("new")}>New request</button>
						<button type="button" className={section === "requests" ? "is-active" : ""} onClick={() => selectSection("requests")}>Service requests{requests.length ? <span>{requests.length}</span> : null}</button>
					</nav>
				) : null}
				<div className="services-step-content">{section === "requests" ? renderRequests() : renderStep()}</div>
			</div>
		</section>
	);

	return embedded ? flow : (
		<div className="services-overlay" role="dialog" aria-modal="true" aria-labelledby="services-flow-title">
			{flow}
		</div>
	);
}
