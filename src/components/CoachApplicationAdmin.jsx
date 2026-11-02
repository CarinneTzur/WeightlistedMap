import React, { useEffect, useMemo, useState } from "react";
import {
	COACH_APPLICATION_CHANGED_EVENT,
	COACH_APPLICATION_STATUSES,
	getCoachApplications,
	reviewCoachApplication,
	splitList,
} from "../../utils/coachApplications";
import { loadAdminMarketplaceOverview } from "../services/conversationStore";
import "./CoachApplicationAdmin.css";

const styles = {
	page: {
		minHeight: "100dvh",
		overflowX: "clip",
		display: "flow-root",
		background: "radial-gradient(circle at 82% 0%, rgba(151,105,82,0.10), transparent 34%), linear-gradient(180deg, #131516 0%, #0d0f10 100%)",
		color: "#e8e5e1",
		fontFamily:
			"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
	},
	wrap: {
		width: "min(1220px, calc(100% - clamp(24px, 5vw, 56px)))",
		margin: "0 auto",
		padding:
			"calc(20px + env(safe-area-inset-top)) 0 calc(48px + env(safe-area-inset-bottom))",
	},
	topBar: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 16,
		flexWrap: "wrap",
		marginBottom: 22,
	},
	buttonSoft: {
		border: "1px solid rgba(224,219,211,0.12)",
		background: "rgba(255,255,255,0.035)",
		color: "#d8d5d0",
		borderRadius: 9,
		padding: "11px 15px",
		font: "inherit",
		fontWeight: 620,
		cursor: "pointer",
		textDecoration: "none",
		minHeight: 44,
		display: "inline-flex",
		alignItems: "center",
	},
	title: {
		margin: 0,
		color: "#eeeae5",
		fontSize: "clamp(31px, 4vw, 46px)",
		lineHeight: 1.04,
		fontWeight: 720,
		letterSpacing: "-0.035em",
	},
	subtitle: {
		margin: "12px 0 0",
		color: "#9e9a95",
		lineHeight: 1.5,
		maxWidth: 720,
		fontSize: 14,
	},
	tabs: {
		display: "flex",
		gap: 8,
		flexWrap: "wrap",
		margin: "26px 0 18px",
	},
	tab: {
		border: "1px solid rgba(224,219,211,0.11)",
		background: "rgba(255,255,255,0.025)",
		color: "#aaa6a0",
		borderRadius: 8,
		padding: "10px 14px",
		font: "inherit",
		fontSize: 14,
		fontWeight: 620,
		cursor: "pointer",
		minHeight: 44,
	},
	tabActive: {
		borderColor: "rgba(216,184,111,0.30)",
		background: "rgba(216,184,111,0.13)",
		color: "#ead28e",
	},
	workspaceNav: {
		display: "flex",
		gap: 8,
		flexWrap: "wrap",
		margin: "24px 0 20px",
		padding: 5,
		border: "1px solid rgba(224,219,211,0.08)",
		borderRadius: 11,
		background: "rgba(0,0,0,0.18)",
		width: "fit-content",
		maxWidth: "100%",
	},
	workspaceTab: {
		minHeight: 42,
		padding: "9px 15px",
		border: 0,
		borderRadius: 8,
		background: "transparent",
		color: "#96928d",
		font: "inherit",
		fontSize: 13,
		fontWeight: 620,
		cursor: "pointer",
	},
	workspaceTabActive: {
		background: "rgba(216,184,111,0.12)",
		color: "#ead28e",
	},
	sectionHeader: {
		display: "flex",
		alignItems: "flex-end",
		justifyContent: "space-between",
		gap: 16,
		flexWrap: "wrap",
		marginBottom: 14,
	},
	attentionGrid: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
		gap: 10,
		marginBottom: 18,
	},
	attentionCard: {
		display: "grid",
		gap: 5,
		minHeight: 86,
		padding: 14,
		border: "1px solid rgba(224,219,211,0.09)",
		borderRadius: 11,
		background: "rgba(255,255,255,0.025)",
		color: "#dedad5",
		font: "inherit",
		textAlign: "left",
		cursor: "pointer",
	},
	attentionNumber: {
		fontSize: 27,
		fontWeight: 680,
		lineHeight: 1,
	},
	queueToolbar: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		flexWrap: "wrap",
		marginBottom: 14,
	},
	searchInput: {
		width: "min(330px, 100%)",
		minHeight: 44,
		padding: "10px 13px",
		border: "1px solid rgba(224,219,211,0.11)",
		borderRadius: 9,
		outline: 0,
		background: "rgba(0,0,0,0.22)",
		color: "#ddd9d4",
		font: "inherit",
		fontSize: 13,
	},
	card: {
		border: "1px solid rgba(198,197,195,0.15)",
		background: "rgba(48,45,48,0.8)",
		borderRadius: 8,
		padding: 20,
		display: "grid",
		gridTemplateColumns:
			"repeat(auto-fit, minmax(min(100%, 220px), max-content))",
		gap: 18,
		marginBottom: 14,
		boxShadow: "0 20px 58px rgba(0,0,0,0.26)",
	},
	cardHighlighted: {
		borderColor: "rgba(216,184,111,0.34)",
		boxShadow: "0 0 0 1px rgba(216,184,111,0.12)",
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
		flexWrap: "wrap",
		marginBottom: 14,
	},
	name: {
		margin: 0,
		color: "#e6e2dd",
		fontSize: 24,
		fontWeight: 680,
		letterSpacing: "-0.02em",
	},
	meta: {
		color: "#99958f",
		fontSize: 13,
		lineHeight: 1.45,
	},
	badge: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 999,
		padding: "7px 10px",
		fontSize: 12,
		fontWeight: 680,
		textTransform: "none",
		letterSpacing: "0.01em",
	},
	badgePending: {
		background: "rgba(216,184,111,0.11)",
		color: "#e6cd85",
	},
	badgeAccepted: {
		background: "rgba(121,177,139,0.11)",
		color: "#b7d8bf",
	},
	badgeDeclined: {
		background: "rgba(203,112,112,0.11)",
		color: "#ddb1b1",
	},
	detailGrid: {
		display: "grid",
		gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
		gap: 12,
		marginBottom: 14,
	},
	detail: {
		border: "1px solid rgba(224,219,211,0.07)",
		background: "rgba(255,255,255,0.018)",
		borderRadius: 10,
		padding: "11px 12px",
		minWidth: 0,
	},
	label: {
		display: "block",
		color: "#8f8b86",
		fontSize: 11,
		textTransform: "uppercase",
		letterSpacing: "0.1em",
		marginBottom: 5,
	},
	value: {
		color: "#dcd8d3",
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
		border: "1px solid rgba(224,219,211,0.09)",
		background: "rgba(255,255,255,0.025)",
		color: "#bcb8b2",
		borderRadius: 999,
		padding: "7px 10px",
		fontSize: 12,
		fontWeight: 580,
	},
	actions: {
		display: "flex",
		gap: 9,
		flexWrap: "wrap",
	},
	actionButton: {
		border: "1px solid rgba(224,219,211,0.11)",
		borderRadius: 9,
		padding: "10px 13px",
		font: "inherit",
		fontSize: 14,
		fontWeight: 650,
		cursor: "pointer",
		color: "#d9d5cf",
		background: "rgba(255,255,255,0.03)",
		minHeight: 44,
	},
	acceptButton: {
		background: "rgba(121,177,139,0.16)",
		color: "#c8e2ce",
		borderColor: "rgba(121,177,139,0.28)",
	},
	declineButton: {
		background: "rgba(203,112,112,0.11)",
		color: "#dfb7b7",
		borderColor: "rgba(203,112,112,0.22)",
	},
	empty: {
		border: "1px solid rgba(224,219,211,0.08)",
		background: "rgba(255,255,255,0.02)",
		borderRadius: 12,
		padding: 24,
		color: "#a9a59f",
		textAlign: "center",
	},
	marketplacePanel: {
		margin: "24px 0 8px",
		padding: 20,
		border: "1px solid rgba(224,219,211,0.08)",
		borderRadius: 14,
		background: "rgba(22,24,25,0.70)",
	},
	marketplaceStats: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
		gap: 10,
		marginTop: 14,
	},
	marketplaceStat: {
		padding: 14,
		border: "1px solid rgba(224,219,211,0.07)",
		borderRadius: 10,
		background: "rgba(0,0,0,0.18)",
	},
	marketplaceLists: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 310px), 1fr))",
		gap: 14,
		marginTop: 14,
	},
	marketplaceList: {
		margin: 0,
		padding: 0,
		listStyle: "none",
		display: "grid",
		gap: 8,
	},
	marketplaceItem: {
		padding: 11,
		border: "1px solid rgba(224,219,211,0.06)",
		borderRadius: 9,
		background: "rgba(0,0,0,0.14)",
	},
	reviewShell: {
		display: "grid",
		gridTemplateColumns:
			"repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
		gap: 20,
		alignItems: "start",
	},
	applicationList: {
		display: "grid",
		gap: 10,
	},
	listCard: {
		display: "block",
		width: "100%",
		border: "1px solid rgba(224,219,211,0.08)",
		background: "rgba(255,255,255,0.02)",
		borderRadius: 11,
		padding: 15,
		color: "#dedad5",
		textAlign: "left",
		font: "inherit",
		cursor: "pointer",
	},
	listCardActive: {
		borderColor: "rgba(216,184,111,0.30)",
		background: "rgba(216,184,111,0.07)",
		boxShadow: "inset 3px 0 0 rgba(216,184,111,0.68)",
	},
	previewPanel: {
		border: "1px solid rgba(224,219,211,0.09)",
		background: "rgba(19,21,22,0.90)",
		borderRadius: 14,
		padding: "clamp(16px, 3.5vw, 24px)",
		boxShadow: "0 22px 60px rgba(0,0,0,0.20)",
	},
	previewSection: {
		border: 0,
		borderBottom: "1px solid rgba(224,219,211,0.07)",
		background: "transparent",
		borderRadius: 0,
		padding: "4px 0 18px",
		marginBottom: 18,
	},
	previewSectionTitle: {
		margin: "0 0 12px",
		color: "#ddd9d4",
		fontSize: 15,
		fontWeight: 650,
		letterSpacing: "-0.01em",
	},
	readonlyGrid: {
		display: "grid",
		gridTemplateColumns:
			"repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
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
		minHeight: 44,
	},
	lockPanel: {
		width: "min(460px, calc(100% - 32px))",
		margin: "min(12vh, 72px) auto 0",
		border: "1px solid rgba(198,197,195,0.15)",
		background: "rgba(48,45,48,0.88)",
		borderRadius: 8,
		padding: 22,
		boxShadow: "0 20px 58px rgba(0,0,0,0.32)",
	},
	input: {
		width: "100%",
		border: "1px solid rgba(224,219,211,0.11)",
		background: "rgba(0,0,0,0.20)",
		borderRadius: 9,
		color: "#ddd9d4",
		padding: "12px 13px",
		font: "inherit",
		fontSize: 14,
		minHeight: 48,
		outline: "none",
		margin: "14px 0",
	},
	textarea: {
		width: "100%",
		minHeight: 92,
		border: "1px solid rgba(224,219,211,0.11)",
		background: "rgba(0,0,0,0.20)",
		borderRadius: 9,
		color: "#ddd9d4",
		padding: "12px 13px",
		font: "inherit",
		fontSize: 14,
		outline: "none",
		resize: "vertical",
		margin: "8px 0 12px",
	},
	field: {
		display: "block",
	},
	fieldHelp: {
		display: "block",
		marginTop: -5,
		marginBottom: 4,
		color: "#85817c",
		fontSize: 11.5,
		lineHeight: 1.45,
	},
	decisionGuide: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
		gap: 8,
		marginBottom: 14,
	},
	decisionOption: {
		padding: 11,
		border: "1px solid rgba(224,219,211,0.07)",
		borderRadius: 9,
		background: "rgba(0,0,0,0.15)",
		color: "#99958f",
		fontSize: 11.5,
		lineHeight: 1.45,
	},
	error: {
		color: "#ffd4d4",
		fontSize: 14,
	},
	previewBanner: {
		marginBottom: 18,
		padding: "11px 14px",
		border: "1px solid rgba(128,190,238,.24)",
		borderRadius: 10,
		background: "rgba(72,116,158,.10)",
		color: "#c9dde9",
		fontSize: 13,
		lineHeight: 1.45,
	},
};

const PREVIEW_APPLICATIONS = [
	{
		id: "admin-preview-pending",
		status: COACH_APPLICATION_STATUSES.PENDING,
		fullName: "Taylor Morgan",
		firstName: "Taylor",
		lastName: "Morgan",
		email: "taylor@example.com",
		phone: "(555) 014-2290",
		coachTitle: "Powerlifting Coach",
		city: "Austin",
		state: "TX",
		gymName: "Eastside Barbell",
		gymCity: "Austin",
		gymState: "TX",
		inPersonCoaching: true,
		onlineTraining: true,
		yearsOfExperience: 5,
		currentRosterSize: 8,
		bio: "Technique-first strength coaching for newer and intermediate lifters.",
		reviewStatement: "I want to help athletes build confidence and train sustainably.",
		liftingExperience: "Seven years of powerlifting with local meet experience.",
		coachingExperience: "Five years coaching individual and small-group strength sessions.",
		specialties: ["Powerlifting", "Technique / form", "General Fitness"],
		certifications: ["CPT"],
		socialLinks: [{ type: "Instagram", value: "@taylormorganstrength" }],
		interviewAcknowledged: true,
		submittedAt: new Date(Date.now() - 36e5 * 8).toISOString(),
		adminNotes: "",
		declineReason: "",
	},
	{
		id: "admin-preview-approved",
		status: COACH_APPLICATION_STATUSES.ACCEPTED,
		fullName: "Morgan Reyes",
		email: "morgan@example.com",
		phone: "(555) 010-8842",
		coachTitle: "Bodybuilding Coach",
		city: "Brooklyn",
		state: "NY",
		gymName: "Harbor Strength",
		gymCity: "Brooklyn",
		gymState: "NY",
		inPersonCoaching: false,
		onlineTraining: true,
		yearsOfExperience: 7,
		currentRosterSize: 12,
		bio: "Online physique and nutrition coaching built around realistic routines.",
		reviewStatement: "I value clear communication and practical programming.",
		liftingExperience: "Bodybuilding and recreational strength training.",
		coachingExperience: "Seven years of online programming and check-ins.",
		specialties: ["Bodybuilding", "Nutrition"],
		certifications: ["CPT", "Nutrition Coach"],
		socialLinks: [],
		interviewAcknowledged: true,
		submittedAt: new Date(Date.now() - 864e5 * 4).toISOString(),
		adminNotes: "Strong interview and references.",
		declineReason: "",
	},
];

const APPLICATION_FILTERS = [
	[COACH_APPLICATION_STATUSES.PENDING, "Needs review"],
	[COACH_APPLICATION_STATUSES.NEEDS_EDITS, "Edits requested"],
	[COACH_APPLICATION_STATUSES.ACCEPTED, "Approved"],
	[COACH_APPLICATION_STATUSES.DECLINED, "Declined"],
	["all", "All applications"],
];

const APPLICATION_STATUS_LABELS = {
	[COACH_APPLICATION_STATUSES.PENDING]: "Needs review",
	[COACH_APPLICATION_STATUSES.ACCEPTED]: "Approved",
	[COACH_APPLICATION_STATUSES.DECLINED]: "Declined",
	[COACH_APPLICATION_STATUSES.NEEDS_EDITS]: "Edits requested",
};

function humanizeStatus(value) {
	return String(value || "Unknown")
		.replaceAll("_", " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
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

function formatShortDate(value) {
	if (!value) return "Unknown";

	try {
		return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
	} catch {
		return value;
	}
}

function getAdminErrorMessage(error, fallback) {
	const message = error?.message || "";
	if (message.toLowerCase().includes("failed to fetch")) {
		return fallback;
	}

	return message || fallback;
}

function StatusBadge({ status }) {
	const badgeStyle =
		status === COACH_APPLICATION_STATUSES.ACCEPTED
			? styles.badgeAccepted
			: status === COACH_APPLICATION_STATUSES.DECLINED
				? styles.badgeDeclined
				: styles.badgePending;

	return <span style={{ ...styles.badge, ...badgeStyle }}>{APPLICATION_STATUS_LABELS[status] || humanizeStatus(status)}</span>;
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
			<section className="admin-application-focus" style={styles.previewPanel}>
				<div style={styles.empty}>Select an application to review.</div>
			</section>
		);
	}

	const specialties = splitList(application.specialties);
	const certifications = splitList(application.certifications);
	const socialLinks = Array.isArray(application.socialLinks)
		? application.socialLinks
		: [];
	const reviewChecks = [
		["Identity and contact", Boolean(application.fullName && application.email)],
		["Coaching profile", Boolean(application.coachTitle && application.bio && specialties.length)],
		["Location and format", Boolean((!application.inPersonCoaching || (application.gymName && application.gymZip)) && (application.inPersonCoaching || application.onlineTraining))],
		["Interview", Boolean(application.interviewDateTime || application.interviewAcknowledged)],
	];

	function requestDecision(nextStatus) {
		if (nextStatus === COACH_APPLICATION_STATUSES.NEEDS_EDITS && !adminNotes.trim()) {
			window.alert("Add the edits the applicant needs to make before requesting changes.");
			return;
		}
		if (nextStatus === COACH_APPLICATION_STATUSES.DECLINED && !declineReason.trim()) {
			window.alert("Add a clear decline reason before declining this application.");
			return;
		}
		if (nextStatus === COACH_APPLICATION_STATUSES.ACCEPTED && !window.confirm(`Approve ${application.fullName} as a Weightlisted coach?`)) return;
		if (nextStatus === COACH_APPLICATION_STATUSES.DECLINED && !window.confirm(`Decline ${application.fullName}'s application?`)) return;
		onReview(application.id, nextStatus);
	}

	return (
		<section className="admin-application-focus" style={styles.previewPanel}>
			<div style={styles.cardHeader}>
				<div>
					<span style={styles.label}>Selected application</span>
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

			<PreviewSection title="Review checklist">
				<div style={styles.readonlyGrid}>
					{reviewChecks.map(([label, complete]) => (
						<div key={label} style={styles.detail}>
							<span style={styles.label}>{label}</span>
							<strong style={{ color: complete ? "#b7d8bf" : "#e6cd85", fontSize: 13 }}>{complete ? "Ready" : "Check details"}</strong>
						</div>
					))}
				</div>
			</PreviewSection>

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
						{application.gymZip ? ` ${application.gymZip}` : ""}
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
					<Detail label="Public directory">
						{application.profileVisible === false ? "Hidden" : "Visible"}
						<br />
						Quick Services: {application.acceptingRequests === false ? "Paused" : "Accepting"}
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

			<PreviewSection title="Decision">
				<div style={styles.decisionGuide}>
					<div style={styles.decisionOption}><strong style={{ color: "#b7d8bf" }}>Approve</strong><br />Profile is complete and the coach is ready to appear in the directory.</div>
					<div style={styles.decisionOption}><strong style={{ color: "#e6cd85" }}>Request edits</strong><br />The applicant can correct missing or unclear information and return for review.</div>
					<div style={styles.decisionOption}><strong style={{ color: "#ddb1b1" }}>Decline</strong><br />The application is not a fit. A clear reason is required.</div>
				</div>
				<label style={styles.field}>
					<span style={styles.label}>Review notes or requested edits</span>
					<small style={styles.fieldHelp}>Required when requesting edits. The applicant can see this guidance while their application needs attention.</small>
					<textarea
						style={{ ...styles.textarea, fontSize: 14 }}
						value={adminNotes}
						onChange={(event) => setAdminNotes(event.target.value)}
						placeholder="Example: Add your gym ZIP code and clarify your coaching certification."
					/>
				</label>
				<label style={styles.field}>
					<span style={styles.label}>Decline reason</span>
					<small style={styles.fieldHelp}>Required only when declining. Keep it direct and useful to the applicant.</small>
					<textarea
						style={{ ...styles.textarea, fontSize: 14 }}
						value={declineReason}
						onChange={(event) => setDeclineReason(event.target.value)}
						placeholder="Explain why the application cannot be approved."
					/>
				</label>

				<div style={styles.actions}>
					<button type="button" style={{ ...styles.actionButton, ...styles.acceptButton }} onClick={() => requestDecision(COACH_APPLICATION_STATUSES.ACCEPTED)} disabled={actionBusy || application.status === COACH_APPLICATION_STATUSES.ACCEPTED}>
						{actionBusy ? "Saving…" : "Approve coach"}
					</button>
					<button type="button" style={styles.actionButton} onClick={() => requestDecision(COACH_APPLICATION_STATUSES.NEEDS_EDITS)} disabled={actionBusy || application.status === COACH_APPLICATION_STATUSES.NEEDS_EDITS}>
						Request edits
					</button>
					<button type="button" style={styles.actionButton} onClick={() => requestDecision(COACH_APPLICATION_STATUSES.PENDING)} disabled={actionBusy || application.status === COACH_APPLICATION_STATUSES.PENDING}>
						Move to review queue
					</button>
					<button type="button" style={{ ...styles.actionButton, ...styles.declineButton }} onClick={() => requestDecision(COACH_APPLICATION_STATUSES.DECLINED)} disabled={actionBusy || application.status === COACH_APPLICATION_STATUSES.DECLINED}>
						Decline application
					</button>
				</div>
			</PreviewSection>
		</section>
	);
}

export default function CoachApplicationAdmin({
	onBackToMap,
	applicationHref,
	highlightedApplicationId,
	previewMode = false,
}) {
	const [applications, setApplications] = useState([]);
	const [previewApplications, setPreviewApplications] = useState(PREVIEW_APPLICATIONS);
	const [workspaceSection, setWorkspaceSection] = useState("applications");
	const [tab, setTab] = useState(COACH_APPLICATION_STATUSES.PENDING);
	const [search, setSearch] = useState("");
	const [message, setMessage] = useState("");
	const [loadError, setLoadError] = useState("");
	const [selectedApplicationId, setSelectedApplicationId] = useState(
		highlightedApplicationId || "",
	);
	const [adminNotes, setAdminNotes] = useState("");
	const [declineReason, setDeclineReason] = useState("");
	const [loading, setLoading] = useState(true);
	const [actionBusy, setActionBusy] = useState(false);
	const [marketplaceOverview, setMarketplaceOverview] = useState({
		conversations: [],
		serviceRequests: [],
	});
	const [marketplaceLoading, setMarketplaceLoading] = useState(!previewMode);
	const [marketplaceError, setMarketplaceError] = useState("");

	useEffect(() => {
		loadApplications();
	}, [previewApplications, previewMode]);

	useEffect(() => {
		if (previewMode) {
			setMarketplaceLoading(false);
			return undefined;
		}
		let active = true;
		async function loadMarketplace() {
			setMarketplaceLoading(true);
			setMarketplaceError("");
			try {
				const overview = await loadAdminMarketplaceOverview();
				if (active) setMarketplaceOverview(overview);
			} catch (error) {
				if (active) setMarketplaceError(getAdminErrorMessage(error, "Marketplace activity could not be loaded."));
			} finally {
				if (active) setMarketplaceLoading(false);
			}
		}
		loadMarketplace();
		const refresh = () => loadMarketplace();
		window.addEventListener("focus", refresh);
		return () => {
			active = false;
			window.removeEventListener("focus", refresh);
		};
	}, [previewMode]);

	useEffect(() => {
		function refreshApplications() {
			loadApplications();
		}
		window.addEventListener(COACH_APPLICATION_CHANGED_EVENT, refreshApplications);
		return () =>
			window.removeEventListener(
				COACH_APPLICATION_CHANGED_EVENT,
				refreshApplications,
			);
	}, [previewMode]);

	async function loadApplications() {
		setLoading(true);
		setLoadError("");
		try {
			const nextApplications = previewMode
				? previewApplications
				: await getCoachApplications("all");
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
			setLoadError(
				getAdminErrorMessage(
					error,
					"Applications could not be loaded. Check the connection and try again.",
				),
			);
		} finally {
			setLoading(false);
		}
	}

	const applicationCounts = useMemo(() => applications.reduce((counts, application) => ({
		...counts,
		[application.status]: (counts[application.status] || 0) + 1,
	}), { all: applications.length }), [applications]);

	const visibleApplications = useMemo(() => {
		const normalizedSearch = search.trim().toLowerCase();
		return applications.filter((application) => {
			if (tab !== "all" && application.status !== tab) return false;
			if (!normalizedSearch) return true;
			return [
				application.fullName,
				application.email,
				application.coachTitle,
				application.gymName,
				application.gymCity,
				application.gymState,
				application.gymZip,
			].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
		});
	}, [applications, search, tab]);

	const selectedApplication = useMemo(
		() => visibleApplications.find((application) => application.id === selectedApplicationId) || visibleApplications[0] || null,
		[selectedApplicationId, visibleApplications],
	);

	useEffect(() => {
		if (!selectedApplication) return;
		setSelectedApplicationId(selectedApplication.id);
		setAdminNotes(selectedApplication.adminNotes || "");
		setDeclineReason(selectedApplication.declineReason || "");
	}, [selectedApplication?.id]);

	useEffect(() => {
		if (!highlightedApplicationId || !applications.length) return;
		const highlighted = applications.find((application) => application.id === highlightedApplicationId);
		if (!highlighted) return;
		setTab(highlighted.status);
		setSelectedApplicationId(highlighted.id);
	}, [applications, highlightedApplicationId]);

	async function handleReview(applicationId, nextStatus) {
		setActionBusy(true);
		try {
			if (previewMode) {
				const previewApplication = PREVIEW_APPLICATIONS.find(
					(application) => application.id === applicationId,
				);
				setPreviewApplications((current) => current.map((application) => (
					application.id === applicationId
						? { ...application, status: nextStatus, adminNotes, declineReason }
						: application
				)));
				setMessage(`${previewApplication?.fullName || "This application"} is now ${APPLICATION_STATUS_LABELS[nextStatus] || humanizeStatus(nextStatus)} in this preview only. No database record changed.`);
				return;
			}
			const result = await reviewCoachApplication(applicationId, nextStatus, {
				adminNotes,
				declineReason,
			});
			await loadApplications();
			setMessage(
				nextStatus === COACH_APPLICATION_STATUSES.ACCEPTED
					? `${result.application.fullName} was accepted and added to the coach flow.`
					: `${result.application.fullName} is now ${APPLICATION_STATUS_LABELS[nextStatus] || humanizeStatus(nextStatus)}.`,
			);
		} catch (error) {
			setMessage(
				getAdminErrorMessage(
					error,
					"The review action could not be completed. Check the connection and try again.",
				),
			);
		} finally {
			setActionBusy(false);
		}
	}

	const pendingCoachRequests = marketplaceOverview.conversations.filter(
		(conversation) => conversation.relationshipStatus === "pending",
	).length;
	const activeCoachRelationships = marketplaceOverview.conversations.filter(
		(conversation) => conversation.relationshipStatus === "accepted",
	).length;
	const awaitingPaymentRequests = marketplaceOverview.serviceRequests.filter(
		(request) => request.paymentStatus === "payment_required",
	).length;
	const activeServiceRequests = marketplaceOverview.serviceRequests.filter(
		(request) => ["matching", "claimed"].includes(request.requestStatus),
	).length;

	return (
		<main className="admin-workspace" style={styles.page}>
			<div style={styles.wrap}>
				<div style={styles.topBar}>
					<button type="button" style={styles.buttonSoft} onClick={onBackToMap}>
						Return to marketplace
					</button>
					<a style={styles.buttonSoft} href={applicationHref}>
						Open application form
					</a>
				</div>

				<header>
					<h1 style={styles.title}>Admin workspace</h1>
					<p style={styles.subtitle}>
						Review coaches and monitor client–coach activity from one place. Start with items that need attention, then use the completed records for reference.
					</p>
				</header>
				{previewMode ? (
					<div style={styles.previewBanner} role="status">
						<strong>Admin View preview.</strong> This uses sample applications. Review actions stay in the browser and never call privileged Supabase operations.
					</div>
				) : null}

				<nav style={styles.workspaceNav} aria-label="Admin workspace sections">
					<button type="button" style={{ ...styles.workspaceTab, ...(workspaceSection === "applications" ? styles.workspaceTabActive : {}) }} onClick={() => setWorkspaceSection("applications")} aria-current={workspaceSection === "applications" ? "page" : undefined}>
						Applications{applicationCounts[COACH_APPLICATION_STATUSES.PENDING] ? ` · ${applicationCounts[COACH_APPLICATION_STATUSES.PENDING]} to review` : ""}
					</button>
					<button type="button" style={{ ...styles.workspaceTab, ...(workspaceSection === "marketplace" ? styles.workspaceTabActive : {}) }} onClick={() => setWorkspaceSection("marketplace")} aria-current={workspaceSection === "marketplace" ? "page" : undefined}>
						Marketplace{pendingCoachRequests + awaitingPaymentRequests ? ` · ${pendingCoachRequests + awaitingPaymentRequests} attention` : ""}
					</button>
				</nav>

				{workspaceSection === "marketplace" ? <section style={{ ...styles.marketplacePanel, marginTop: 0 }} aria-labelledby="marketplace-overview-title">
					<div style={styles.cardHeader}>
						<div>
							<span style={styles.label}>Read-only owner oversight</span>
							<h2 id="marketplace-overview-title" style={{ ...styles.name, fontSize: 22 }}>Marketplace activity</h2>
						</div>
						<span style={styles.meta}>Use this area to spot stalled requests or payment issues. Conversations remain private from other users.</span>
					</div>
					{previewMode ? (
						<div style={{ ...styles.empty, textAlign: "left" }}>Apply the marketplace migration and sign in with an owner account to see live conversations and service requests here.</div>
					) : marketplaceLoading ? (
						<div style={{ ...styles.empty, textAlign: "left" }}>Loading marketplace activity…</div>
					) : marketplaceError ? (
						<div style={{ ...styles.empty, textAlign: "left" }} role="alert">{marketplaceError}</div>
					) : <>
						<div style={styles.marketplaceStats}>
							<div style={styles.marketplaceStat}><span style={styles.label}>Coaching requests</span><strong style={{ fontSize: 28 }}>{pendingCoachRequests}</strong><small style={styles.meta}>Awaiting coach decision</small></div>
							<div style={styles.marketplaceStat}><span style={styles.label}>Active clients</span><strong style={{ fontSize: 28 }}>{activeCoachRelationships}</strong></div>
							<div style={styles.marketplaceStat}><span style={styles.label}>Payment attention</span><strong style={{ fontSize: 28 }}>{awaitingPaymentRequests}</strong><small style={styles.meta}>Not yet paid</small></div>
							<div style={styles.marketplaceStat}><span style={styles.label}>Quick Services</span><strong style={{ fontSize: 28 }}>{activeServiceRequests}</strong><small style={styles.meta}>Matching or in progress</small></div>
						</div>
						<div style={styles.marketplaceLists}>
							<div>
								<h3 style={{ margin: "0 0 9px", fontSize: 14 }}>Recent coaching conversations</h3>
								<ul style={styles.marketplaceList}>
									{marketplaceOverview.conversations.slice(0, 5).map((conversation) => (
										<li key={conversation.id} style={styles.marketplaceItem}>
											<strong>{conversation.client?.fullName || "Weightlisted client"}</strong>
											<div style={styles.meta}>{conversation.coachName || "Coach"} · {humanizeStatus(conversation.relationshipStatus)} · {formatDate(conversation.updatedAt)}</div>
										</li>
									))}
									{!marketplaceOverview.conversations.length ? <li style={styles.meta}>No shared conversations yet.</li> : null}
								</ul>
							</div>
							<div>
								<h3 style={{ margin: "0 0 9px", fontSize: 14 }}>Recent Quick Services</h3>
								<ul style={styles.marketplaceList}>
									{marketplaceOverview.serviceRequests.slice(0, 5).map((request) => (
										<li key={request.id} style={styles.marketplaceItem}>
											<strong>{request.client?.fullName || "Weightlisted client"}</strong>
											<div style={styles.meta}>{humanizeStatus(request.requestType || request.serviceCategory || "Service request")} · {humanizeStatus(request.paymentStatus)} · {formatDate(request.updatedAt)}</div>
										</li>
									))}
									{!marketplaceOverview.serviceRequests.length ? <li style={styles.meta}>No shared service requests yet.</li> : null}
								</ul>
							</div>
						</div>
					</>}
				</section> : null}

				{workspaceSection === "applications" ? <>
					<div style={styles.sectionHeader}>
						<div>
							<span style={styles.label}>Coach onboarding</span>
							<h2 style={{ ...styles.name, fontSize: 24 }}>Application queue</h2>
						</div>
						<span style={styles.meta}>Review the checklist, leave clear applicant guidance, then choose one decision.</span>
					</div>

					<div style={styles.attentionGrid} aria-label="Application summary">
						{[
							[COACH_APPLICATION_STATUSES.PENDING, "Needs review", "Start here"],
							[COACH_APPLICATION_STATUSES.NEEDS_EDITS, "Edits requested", "Waiting on applicant"],
							[COACH_APPLICATION_STATUSES.ACCEPTED, "Approved coaches", "Directory records"],
							["all", "Total applications", "Complete history"],
						].map(([value, label, helper]) => (
							<button key={value} type="button" style={{ ...styles.attentionCard, ...(tab === value ? styles.cardHighlighted : {}) }} onClick={() => { setTab(value); setSearch(""); }}>
								<strong style={styles.attentionNumber}>{applicationCounts[value] || 0}</strong>
								<span style={{ fontSize: 13, fontWeight: 720 }}>{label}</span>
								<small style={{ color: "#8e8b89" }}>{helper}</small>
							</button>
						))}
					</div>

					<div style={{ ...styles.tabs, marginTop: 0 }} role="tablist" aria-label="Application status">
					{APPLICATION_FILTERS.map(([value, label]) => (
						<button
							key={value}
							type="button"
							style={{
								...styles.tab,
								...(tab === value ? styles.tabActive : {}),
							}}
							onClick={() => setTab(value)}
							role="tab"
							aria-selected={tab === value}
						>
							{label} · {applicationCounts[value] || 0}
						</button>
					))}
					</div>

					<div style={styles.queueToolbar}>
						<strong style={{ fontSize: 13 }}>{visibleApplications.length} {visibleApplications.length === 1 ? "application" : "applications"}</strong>
						<input style={styles.searchInput} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, gym, city, or ZIP" aria-label="Search coach applications" />
					</div>

				{message ? (
					<div
						style={{ ...styles.empty, marginBottom: 14, textAlign: "left" }}
						role="status"
						aria-live="polite"
					>
						{message}
					</div>
				) : null}

				{loading ? (
					<div style={styles.empty}>Loading applications...</div>
				) : loadError ? (
					<div style={styles.empty} role="alert">
						{loadError}
					</div>
				) : visibleApplications.length === 0 ? (
					<div style={styles.empty}>{search ? "No applications match that search." : `No ${APPLICATION_STATUS_LABELS[tab]?.toLowerCase() || "matching"} applications yet.`}</div>
				) : (
					<div className="admin-review-layout">
						<div className="admin-application-rail" style={styles.applicationList} aria-label="Application choices">
							{visibleApplications.map((application) => (
								<button
									type="button"
									className="admin-application-option"
									key={application.id}
									style={{
										...styles.listCard,
										...(application.id === selectedApplication?.id
											? styles.listCardActive
											: {}),
									}}
									onClick={() => setSelectedApplicationId(application.id)}
									aria-pressed={application.id === selectedApplication?.id}
								>
									<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}><strong>{application.fullName}</strong><span style={{ color: "#aaa7a5" }} aria-hidden="true">→</span></div>
									<div style={styles.meta}>{application.coachTitle}</div>
									<div style={styles.meta}>
										{application.gymName} - {application.gymCity},{" "}
										{application.gymState}
										{application.gymZip ? ` ${application.gymZip}` : ""}
									</div>
									<div className="admin-application-option__footer">
										<StatusBadge status={application.status} />
										<small>{formatShortDate(application.submittedAt)}</small>
									</div>
								</button>
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
				</> : null}
			</div>
		</main>
	);
}
