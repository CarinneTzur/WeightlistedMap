import React, { useEffect, useMemo, useState } from "react";
import {
	COACH_APPLICATION_CHANGED_EVENT,
	COACH_APPLICATION_STATUSES,
	getCoachApplications,
	reviewCoachApplication,
	splitList,
} from "../../utils/coachApplications";

const styles = {
	page: {
		minHeight: "100vh",
		height: "100vh",
		overflowY: "auto",
		background: "#1e1c1e",
		color: "#f2f1ef",
		fontFamily:
			"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
	},
	wrap: {
		width: "min(1180px, calc(100% - 32px))",
		margin: "0 auto",
		padding: "28px 0 56px",
	},
	topBar: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 16,
		marginBottom: 26,
	},
	buttonSoft: {
		border: "1px solid rgba(198,197,195,0.18)",
		background: "rgba(198,197,195,0.06)",
		color: "#f2f1ef",
		borderRadius: 999,
		padding: "11px 15px",
		font: "inherit",
		fontWeight: 740,
		cursor: "pointer",
		textDecoration: "none",
	},
	title: {
		margin: 0,
		color: "#f2f1ef",
		fontSize: "clamp(32px, 5vw, 58px)",
		lineHeight: 1,
		fontWeight: 820,
		letterSpacing: 0,
	},
	subtitle: {
		margin: "12px 0 0",
		color: "#a8a6a2",
		lineHeight: 1.5,
		maxWidth: 760,
	},
	tabs: {
		display: "flex",
		gap: 8,
		flexWrap: "wrap",
		margin: "26px 0 18px",
	},
	tab: {
		border: "1px solid rgba(198,197,195,0.18)",
		background: "rgba(198,197,195,0.05)",
		color: "#c6c5c3",
		borderRadius: 999,
		padding: "10px 14px",
		font: "inherit",
		fontSize: 14,
		fontWeight: 760,
		cursor: "pointer",
	},
	tabActive: {
		background: "#c6c5c3",
		color: "#1e1c1e",
	},
	card: {
		border: "1px solid rgba(198,197,195,0.15)",
		background: "rgba(48,45,48,0.8)",
		borderRadius: 8,
		padding: 20,
		display: "grid",
		gridTemplateColumns: "132px minmax(0, 1fr)",
		gap: 18,
		marginBottom: 14,
		boxShadow: "0 20px 58px rgba(0,0,0,0.26)",
	},
	cardHighlighted: {
		borderColor: "rgba(198,197,195,0.48)",
		boxShadow: "0 0 0 2px rgba(198,197,195,0.14)",
	},
	photo: {
		width: 132,
		height: 132,
		borderRadius: 8,
		objectFit: "cover",
		background: "rgba(198,197,195,0.08)",
		border: "1px solid rgba(198,197,195,0.14)",
	},
	cardHeader: {
		display: "flex",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 14,
		marginBottom: 14,
	},
	name: {
		margin: 0,
		color: "#f2f1ef",
		fontSize: 24,
		fontWeight: 820,
		letterSpacing: 0,
	},
	meta: {
		color: "#a8a6a2",
		fontSize: 14,
		lineHeight: 1.45,
	},
	badge: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 999,
		padding: "7px 10px",
		fontSize: 12,
		fontWeight: 850,
		textTransform: "uppercase",
		letterSpacing: "0.08em",
	},
	badgePending: {
		background: "rgba(217,189,125,0.16)",
		color: "#f0d78f",
	},
	badgeAccepted: {
		background: "rgba(141,214,164,0.16)",
		color: "#a8ebb8",
	},
	badgeDeclined: {
		background: "rgba(255,132,132,0.16)",
		color: "#ffb1b1",
	},
	detailGrid: {
		display: "grid",
		gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
		gap: 12,
		marginBottom: 14,
	},
	detail: {
		border: "1px solid rgba(198,197,195,0.12)",
		background: "rgba(198,197,195,0.045)",
		borderRadius: 8,
		padding: "11px 12px",
		minWidth: 0,
	},
	label: {
		display: "block",
		color: "#a8a6a2",
		fontSize: 11,
		textTransform: "uppercase",
		letterSpacing: "0.12em",
		marginBottom: 5,
	},
	value: {
		color: "#f2f1ef",
		fontSize: 14,
		lineHeight: 1.35,
		overflowWrap: "anywhere",
		whiteSpace: "pre-line",
	},
	bio: {
		color: "#d8d7d4",
		lineHeight: 1.55,
		margin: "4px 0 14px",
	},
	tags: {
		display: "flex",
		flexWrap: "wrap",
		gap: 7,
		marginBottom: 15,
	},
	tag: {
		border: "1px solid rgba(198,197,195,0.16)",
		background: "rgba(198,197,195,0.06)",
		color: "#c6c5c3",
		borderRadius: 999,
		padding: "7px 10px",
		fontSize: 12,
		fontWeight: 720,
	},
	actions: {
		display: "flex",
		gap: 9,
		flexWrap: "wrap",
	},
	actionButton: {
		border: "1px solid rgba(198,197,195,0.18)",
		borderRadius: 999,
		padding: "10px 13px",
		font: "inherit",
		fontSize: 14,
		fontWeight: 820,
		cursor: "pointer",
		color: "#f2f1ef",
		background: "rgba(198,197,195,0.06)",
	},
	acceptButton: {
		background: "#c6c5c3",
		color: "#1e1c1e",
		borderColor: "#c6c5c3",
	},
	declineButton: {
		background: "rgba(255,132,132,0.14)",
		color: "#ffd4d4",
		borderColor: "rgba(255,132,132,0.26)",
	},
	empty: {
		border: "1px solid rgba(198,197,195,0.15)",
		background: "rgba(198,197,195,0.05)",
		borderRadius: 8,
		padding: 24,
		color: "#c6c5c3",
		textAlign: "center",
	},
	reviewShell: {
		display: "grid",
		gridTemplateColumns: "minmax(260px, 0.82fr) minmax(0, 1.45fr)",
		gap: 16,
		alignItems: "start",
	},
	applicationList: {
		display: "grid",
		gap: 10,
	},
	listCard: {
		border: "1px solid rgba(198,197,195,0.14)",
		background: "rgba(198,197,195,0.045)",
		borderRadius: 8,
		padding: 14,
		color: "#f2f1ef",
		textAlign: "left",
		font: "inherit",
	},
	listCardActive: {
		borderColor: "rgba(198,197,195,0.48)",
		background: "rgba(198,197,195,0.1)",
	},
	previewPanel: {
		border: "1px solid rgba(198,197,195,0.15)",
		background: "rgba(48,45,48,0.82)",
		borderRadius: 8,
		padding: 20,
		boxShadow: "0 20px 58px rgba(0,0,0,0.26)",
	},
	previewSection: {
		border: "1px solid rgba(198,197,195,0.12)",
		background: "rgba(198,197,195,0.035)",
		borderRadius: 8,
		padding: 14,
		marginBottom: 14,
	},
	previewSectionTitle: {
		margin: "0 0 12px",
		color: "#f2f1ef",
		fontSize: 15,
		fontWeight: 820,
		letterSpacing: 0,
	},
	readonlyGrid: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
		gap: 10,
	},
	openButton: {
		border: "1px solid rgba(198,197,195,0.2)",
		background: "#c6c5c3",
		color: "#1e1c1e",
		borderRadius: 999,
		padding: "8px 11px",
		font: "inherit",
		fontSize: 13,
		fontWeight: 820,
		cursor: "pointer",
		marginTop: 12,
	},
	lockPanel: {
		width: "min(460px, calc(100% - 32px))",
		margin: "12vh auto 0",
		border: "1px solid rgba(198,197,195,0.15)",
		background: "rgba(48,45,48,0.88)",
		borderRadius: 8,
		padding: 22,
		boxShadow: "0 20px 58px rgba(0,0,0,0.32)",
	},
	input: {
		width: "100%",
		border: "1px solid rgba(198,197,195,0.18)",
		background: "rgba(198,197,195,0.07)",
		borderRadius: 8,
		color: "#f2f1ef",
		padding: "12px 13px",
		font: "inherit",
		fontSize: 15,
		outline: "none",
		margin: "14px 0",
	},
	textarea: {
		width: "100%",
		minHeight: 92,
		border: "1px solid rgba(198,197,195,0.18)",
		background: "rgba(198,197,195,0.07)",
		borderRadius: 8,
		color: "#f2f1ef",
		padding: "12px 13px",
		font: "inherit",
		fontSize: 15,
		outline: "none",
		resize: "vertical",
		margin: "8px 0 12px",
	},
	error: {
		color: "#ffd4d4",
		fontSize: 14,
	},
};

function getAdminPin() {
	return import.meta.env?.VITE_COACH_ADMIN_PIN || "";
}

function formatDate(value) {
	if (!value) return "Unknown";

	try {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(value));
	} catch {
		return value;
	}
}

function StatusBadge({ status }) {
	const badgeStyle =
		status === COACH_APPLICATION_STATUSES.ACCEPTED
			? styles.badgeAccepted
			: status === COACH_APPLICATION_STATUSES.DECLINED
				? styles.badgeDeclined
				: styles.badgePending;

	return <span style={{ ...styles.badge, ...badgeStyle }}>{status}</span>;
}

function Detail({ label, children }) {
	return (
		<div style={styles.detail}>
			<span style={styles.label}>{label}</span>
			<span style={styles.value}>{children || "Not provided"}</span>
		</div>
	);
}

function PreviewSection({ title, children }) {
	return (
		<section style={styles.previewSection}>
			<h3 style={styles.previewSectionTitle}>{title}</h3>
			{children}
		</section>
	);
}

function AdminLock({ onUnlock, onBackToMap }) {
	const [pin, setPin] = useState("");
	const [error, setError] = useState("");

	function handleSubmit(event) {
		event.preventDefault();

		if (pin === getAdminPin()) {
			sessionStorage.setItem("weightlisted.adminUnlocked", "true");
			onUnlock();
			return;
		}

		setError("That passcode did not match.");
	}

	return (
		<main style={styles.page}>
			<section style={styles.lockPanel}>
				<button type="button" style={styles.buttonSoft} onClick={onBackToMap}>
					Back to map
				</button>
				<h1 style={{ ...styles.title, fontSize: 34, marginTop: 20 }}>
					Admin review
				</h1>
				<p style={styles.subtitle}>Enter the coach review passcode.</p>
				<form onSubmit={handleSubmit}>
					<input
						style={styles.input}
						type="password"
						value={pin}
						onChange={(event) => setPin(event.target.value)}
						autoFocus
					/>
					<button type="submit" style={{ ...styles.buttonSoft, width: "100%" }}>
						Unlock
					</button>
				</form>
				{error ? <p style={styles.error}>{error}</p> : null}
			</section>
		</main>
	);
}

function ApplicationPreview({
	application,
	adminNotes,
	setAdminNotes,
	declineReason,
	setDeclineReason,
	onReview,
	actionBusy,
}) {
	if (!application) {
		return (
			<section style={styles.previewPanel}>
				<div style={styles.empty}>Select an application to review.</div>
			</section>
		);
	}

	const specialties = splitList(application.specialties);
	const certifications = splitList(application.certifications);
	const socialLinks = Array.isArray(application.socialLinks)
		? application.socialLinks
		: [];

	return (
		<section style={styles.previewPanel}>
			<div style={styles.cardHeader}>
				<div>
					<h2 style={styles.name}>{application.fullName}</h2>
					<div style={styles.meta}>
						{application.coachTitle} in {application.city},{" "}
						{application.state}
					</div>
					<div style={styles.meta}>
						Submitted {formatDate(application.submittedAt)}
					</div>
				</div>
				<StatusBadge status={application.status} />
			</div>

			{application.profilePhotoUrl ? (
				<img
					style={{ ...styles.photo, marginBottom: 16 }}
					src={application.profilePhotoUrl}
					alt={application.fullName}
					loading="lazy"
				/>
			) : null}

			<PreviewSection title="Coach details">
				<div style={styles.readonlyGrid}>
					<Detail label="Full name">{application.fullName}</Detail>
					<Detail label="Coach title">{application.coachTitle}</Detail>
					<Detail label="Email">{application.email}</Detail>
					<Detail label="Phone">{application.phone}</Detail>
					<Detail label="Location">
						{application.city}, {application.state}
					</Detail>
					<Detail label="Submitted">{formatDate(application.submittedAt)}</Detail>
				</div>
			</PreviewSection>

			<PreviewSection title="Gym and coaching format">
				<div style={styles.readonlyGrid}>
					<Detail label="Gym">
						{application.gymName}
						<br />
						{application.gymCity}, {application.gymState}
					</Detail>
					<Detail label="Availability">
						In person: {application.inPersonCoaching ? "Yes" : "No"}
						<br />
						Online: {application.onlineTraining ? "Yes" : "No"}
					</Detail>
					<Detail label="Years coaching">
						{application.yearsOfExperience ?? "Not provided"}
					</Detail>
					<Detail label="Current roster">
						{application.currentRosterSize || 0}
					</Detail>
				</div>
			</PreviewSection>

			<PreviewSection title="Profile">
				<Detail label="Short profile bio">{application.bio}</Detail>
				<div style={{ height: 10 }} />
				<Detail label="Application statement">
					{application.reviewStatement || "Not provided"}
				</Detail>
				<div style={{ height: 10 }} />
				<Detail label="Own lifting experience">
					{application.liftingExperience}
				</Detail>
				<div style={{ height: 10 }} />
				<Detail label="Coaching experience">
					{application.coachingExperience}
				</Detail>
			</PreviewSection>

			<PreviewSection title="Specialties and credentials">
				<div style={styles.tags}>
					{specialties.map((specialty) => (
						<span key={specialty} style={styles.tag}>
							{specialty}
						</span>
					))}
					{certifications.map((certification) => (
						<span key={certification} style={styles.tag}>
							{certification}
						</span>
					))}
				</div>
			</PreviewSection>

			<PreviewSection title="Links and interview">
				<div style={styles.readonlyGrid}>
					<Detail label="Social links">
						{socialLinks.length
							? socialLinks
								.map((link) => `${link.type}: ${link.value}`)
								.join("\n")
							: "Not provided"}
					</Detail>
					<Detail label="Interview date/time">
						{application.interviewDateTime ||
							(application.interviewAcknowledged
								? "Booked or acknowledged by applicant"
								: "Not booked or acknowledged")}
						{application.interviewBookingUrl ? (
							<>
								<br />
								<a
									href={application.interviewBookingUrl}
									target="_blank"
									rel="noreferrer"
									style={{ color: "#f2f1ef" }}
								>
									Open interview link
								</a>
							</>
						) : null}
					</Detail>
				</div>
			</PreviewSection>

			<label style={styles.field}>
				<span style={styles.label}>Admin notes</span>
				<textarea
					style={styles.textarea}
					value={adminNotes}
					onChange={(event) => setAdminNotes(event.target.value)}
				/>
			</label>
			<label style={styles.field}>
				<span style={styles.label}>Decline reason</span>
				<textarea
					style={styles.textarea}
					value={declineReason}
					onChange={(event) => setDeclineReason(event.target.value)}
				/>
			</label>

			<div style={styles.actions}>
				<button
					type="button"
					style={{ ...styles.actionButton, ...styles.acceptButton }}
					onClick={() =>
						onReview(application.id, COACH_APPLICATION_STATUSES.ACCEPTED)
					}
					disabled={actionBusy}
				>
					Accept
				</button>
				<button
					type="button"
					style={styles.actionButton}
					onClick={() =>
						onReview(application.id, COACH_APPLICATION_STATUSES.NEEDS_EDITS)
					}
					disabled={actionBusy}
				>
					Needs Edits
				</button>
				<button
					type="button"
					style={{ ...styles.actionButton, ...styles.declineButton }}
					onClick={() =>
						onReview(application.id, COACH_APPLICATION_STATUSES.DECLINED)
					}
					disabled={actionBusy}
				>
					Decline
				</button>
			</div>
		</section>
	);
}

export default function CoachApplicationAdmin({
	onBackToMap,
	applicationHref,
	highlightedApplicationId,
}) {
	const adminPin = getAdminPin();
	const [authenticated, setAuthenticated] = useState(
		!adminPin ||
			(typeof sessionStorage !== "undefined" &&
				sessionStorage.getItem("weightlisted.adminUnlocked") === "true"),
	);
	const [applications, setApplications] = useState([]);
	const [tab, setTab] = useState(COACH_APPLICATION_STATUSES.PENDING);
	const [message, setMessage] = useState("");
	const [selectedApplicationId, setSelectedApplicationId] = useState(
		highlightedApplicationId || "",
	);
	const [adminNotes, setAdminNotes] = useState("");
	const [declineReason, setDeclineReason] = useState("");
	const [loading, setLoading] = useState(true);
	const [actionBusy, setActionBusy] = useState(false);

	useEffect(() => {
		loadApplications(tab);
	}, [tab]);

	useEffect(() => {
		function refreshApplications() {
			loadApplications(tab);
		}
		window.addEventListener(COACH_APPLICATION_CHANGED_EVENT, refreshApplications);
		return () =>
			window.removeEventListener(
				COACH_APPLICATION_CHANGED_EVENT,
				refreshApplications,
			);
	}, [tab]);

	const selectedApplication = useMemo(
		() =>
			applications.find(
				(application) => application.id === selectedApplicationId,
			) || applications[0] || null,
		[applications, selectedApplicationId],
	);

	useEffect(() => {
		if (!selectedApplication) return;
		setSelectedApplicationId(selectedApplication.id);
		setAdminNotes(selectedApplication.adminNotes || "");
		setDeclineReason(selectedApplication.declineReason || "");
	}, [selectedApplication?.id]);

	async function loadApplications(status) {
		setLoading(true);
		try {
			const nextApplications = await getCoachApplications(status);
			setApplications(nextApplications);
			if (
				nextApplications.length &&
				!nextApplications.some(
					(application) => application.id === selectedApplicationId,
				)
			) {
				setSelectedApplicationId(nextApplications[0].id);
			}
			if (!nextApplications.length) setSelectedApplicationId("");
		} catch (error) {
			setMessage(error?.message || "Applications could not be loaded.");
		} finally {
			setLoading(false);
		}
	}

	const visibleApplications = useMemo(() => {
		return applications;
	}, [applications]);

	async function handleReview(applicationId, nextStatus) {
		setActionBusy(true);
		try {
			const result = await reviewCoachApplication(applicationId, nextStatus, {
				adminNotes,
				declineReason,
			});
			await loadApplications(tab);
			setMessage(
				nextStatus === COACH_APPLICATION_STATUSES.ACCEPTED
					? `${result.application.fullName} was accepted and added to the coach flow.`
					: `${result.application.fullName} is now ${nextStatus}.`,
			);
		} catch (error) {
			setMessage(error?.message || "The review action could not be completed.");
		} finally {
			setActionBusy(false);
		}
	}

	if (!authenticated) {
		return (
			<AdminLock
				onBackToMap={onBackToMap}
				onUnlock={() => setAuthenticated(true)}
			/>
		);
	}

	return (
		<main style={styles.page}>
			<div style={styles.wrap}>
				<div style={styles.topBar}>
					<button type="button" style={styles.buttonSoft} onClick={onBackToMap}>
						Back to map
					</button>
					<a style={styles.buttonSoft} href={applicationHref}>
						New application
					</a>
				</div>

				<header>
					<h1 style={styles.title}>Coach application review</h1>
					<p style={styles.subtitle}>
						Review pending applications, approve them for the public map,
						decline them, or mark them as needing edits.
					</p>
				</header>

				<div style={styles.tabs} role="tablist" aria-label="Application status">
					{[
						["pending", "Pending"],
						["approved", "Approved"],
						["declined", "Declined"],
						["needs_edits", "Needs Edits"],
						["all", "All"],
					].map(([value, label]) => (
						<button
							key={value}
							type="button"
							style={{
								...styles.tab,
								...(tab === value ? styles.tabActive : {}),
							}}
							onClick={() => setTab(value)}
						>
							{label}
						</button>
					))}
				</div>

				{!adminPin ? (
					<div style={{ ...styles.empty, marginBottom: 14 }}>
						Set VITE_COACH_ADMIN_PIN to enable the admin passcode gate.
					</div>
				) : null}

				{message ? (
					<div style={{ ...styles.empty, marginBottom: 14, textAlign: "left" }}>
						{message}
					</div>
				) : null}

				{loading ? (
					<div style={styles.empty}>Loading applications...</div>
				) : visibleApplications.length === 0 ? (
					<div style={styles.empty}>No {tab} applications yet.</div>
				) : (
					<div style={styles.reviewShell}>
						<div style={styles.applicationList}>
							{visibleApplications.map((application) => (
								<div
									key={application.id}
									style={{
										...styles.listCard,
										...(application.id === selectedApplication?.id
											? styles.listCardActive
											: {}),
									}}
								>
									<strong>{application.fullName}</strong>
									<div style={styles.meta}>{application.coachTitle}</div>
									<div style={styles.meta}>
										{application.gymName} - {application.gymCity},{" "}
										{application.gymState}
									</div>
									<div style={{ marginTop: 8 }}>
										<StatusBadge status={application.status} />
									</div>
									<button
										type="button"
										style={styles.openButton}
										onClick={() => setSelectedApplicationId(application.id)}
									>
										Open application
									</button>
								</div>
							))}
						</div>
						<ApplicationPreview
							application={selectedApplication}
							adminNotes={adminNotes}
							setAdminNotes={setAdminNotes}
							declineReason={declineReason}
							setDeclineReason={setDeclineReason}
							onReview={handleReview}
							actionBusy={actionBusy}
						/>
					</div>
				)}
			</div>
		</main>
	);
}
