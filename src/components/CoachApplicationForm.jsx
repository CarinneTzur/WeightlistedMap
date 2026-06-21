import React, { useEffect, useMemo, useState } from "react";
import {
	COACH_APPLICATION_ADMIN_EMAIL,
	normalizeStateAbbr,
	resolveCalInterviewBooking,
	submitCoachApplication,
} from "../../utils/coachApplications";
import coachApplicationBackground from "../../assets/coach-application-bg-optimized.jpg";

const CAL_INTERVIEW_LINK = "https://cal.com/carinne-tzurdecker-rwwlw0/30min";
const CAL_INTERVIEW_EVENT_SLUG = "30min";
const CAL_INTERVIEW_EMBED_LINK = `${CAL_INTERVIEW_LINK}?embed=1&theme=dark`;
const CAL_EMBED_ORIGINS = new Set(["https://cal.com", "https://app.cal.com"]);
const INTERVIEW_LINK_KEYWORDS = [
	"zoom",
	"meeting",
	"join",
	"video",
	"conference",
	"location",
	"booking",
	"url",
	"link",
];

const blankForm = {
	firstName: "",
	lastName: "",
	email: "",
	phone: "",
	city: "",
	state: "",
	gymName: "",
	gymCity: "",
	gymState: "",
	coachTitle: "",
	specialties: [],
	bio: "",
	reviewStatement: "",
	liftingExperience: "",
	coachingExperience: "",
	yearsOfExperience: "",
	currentRosterSize: "",
	onlineTraining: false,
	remoteAvailable: false,
	coachingFormats: [],
	interviewBookingUrl: "",
	interviewBookingUid: "",
	interviewAcknowledged: false,
	socialLinks: [],
	certifications: [],
};

function isValidHttpUrl(value) {
	try {
		const url = new URL(String(value ?? ""));
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}

function extractUrlsFromValue(value, path = []) {
	if (!value) return [];

	if (typeof value === "string") {
		return isValidHttpUrl(value)
			? [{ url: value, keyPath: path.join(".").toLowerCase() }]
			: [];
	}

	if (Array.isArray(value)) {
		return value.flatMap((item, index) =>
			extractUrlsFromValue(item, [...path, String(index)]),
		);
	}

	if (typeof value === "object") {
		return Object.entries(value).flatMap(([key, item]) =>
			extractUrlsFromValue(item, [...path, key]),
		);
	}

	return [];
}

function extractStringsFromValue(value, path = []) {
	if (!value) return [];

	if (typeof value === "string") {
		return [{ value, keyPath: path.join(".").toLowerCase() }];
	}

	if (Array.isArray(value)) {
		return value.flatMap((item, index) =>
			extractStringsFromValue(item, [...path, String(index)]),
		);
	}

	if (typeof value === "object") {
		return Object.entries(value).flatMap(([key, item]) =>
			extractStringsFromValue(item, [...path, key]),
		);
	}

	return [];
}

function normalizeCalEmbedPayload(data) {
	if (typeof data !== "string") return data;

	try {
		return JSON.parse(data);
	} catch {
		return data;
	}
}

function isCalBookingSuccessMessage(data) {
	const payloadText = JSON.stringify(data ?? {}).toLowerCase();
	return (
		payloadText.includes("bookingsuccessful") ||
		payloadText.includes("booking_successful") ||
		payloadText.includes("booking.successful") ||
		payloadText.includes("bookingcompleted") ||
		payloadText.includes("booking_completed")
	);
}

function getInterviewUrlFromCalMessage(data) {
	const urls = extractUrlsFromValue(data);
	if (!urls.length) return "";

	const zoomUrl = urls.find(({ url }) => /\/\/[^/]*zoom\.us\//i.test(url));
	if (zoomUrl) return zoomUrl.url;

	const likelyInterviewUrl = urls.find(({ keyPath }) =>
		INTERVIEW_LINK_KEYWORDS.some((keyword) => keyPath.includes(keyword)),
	);

	return likelyInterviewUrl?.url || "";
}

function getBookingUidFromCalMessage(data) {
	const fields = extractStringsFromValue(data);
	const likelyUid = fields.find(({ keyPath, value }) => {
		const normalizedValue = String(value ?? "").trim();
		const isUidLike = /^[a-zA-Z0-9_-]{8,}$/.test(normalizedValue);
		return (
			isUidLike &&
			(keyPath.includes("bookinguid") ||
				keyPath.includes("booking.uid") ||
				keyPath.endsWith(".uid") ||
				keyPath === "uid")
		);
	});

	return likelyUid?.value || "";
}

const COACHING_FORMAT_OPTIONS = ["In-person coaching", "Online coaching"];

const COACH_TITLE_OPTIONS = [
	"Powerlifting Coach",
	"Bodybuilding Coach",
	"Olympic Weightlifting Coach",
	"Strength & Conditioning Coach",
	"Hybrid Athlete Coach",
	"Nutrition Coach",
	"Personal Trainer",
];

const SPECIALTY_OPTIONS = [
	"Personal Training",
	"Powerlifting",
	"Bodybuilding",
	"Olympic Weightlifting",
	"Strength",
	"Strength & Conditioning",
	"Hypertrophy",
	"Nutrition",
	"Posing",
	"Women's Strength",
	"Hybrid Training",
];

const CERTIFICATION_OPTIONS = [
	"NASM-CPT",
	"NSCA-CSCS",
	"NSCA-CPT",
	"ISSA-CPT",
	"ACE-CPT",
	"ACSM-CPT",
	"USAW Level 1",
	"USAW Level 2",
	"Precision Nutrition",
	"Girls Gone Strong",
	"Pain-Free Performance Specialist",
	"CPPS",
	"Other",
];

const SOCIAL_LINK_TYPES = [
	"Instagram",
	"TikTok",
	"YouTube",
	"Facebook",
	"LinkedIn",
	"X",
	"Website",
	"Other",
];

const styles = {
	page: {
		minHeight: "100vh",
		height: "100vh",
		overflowY: "auto",
		backgroundImage: `radial-gradient(circle at 18% 12%, rgba(198,197,195,0.13), transparent 24%), linear-gradient(90deg, rgba(30,28,30,0.96) 0%, rgba(30,28,30,0.9) 42%, rgba(30,28,30,0.76) 100%), linear-gradient(180deg, rgba(30,28,30,0.7), rgba(30,28,30,0.96)), url(${coachApplicationBackground})`,
		backgroundSize: "auto, auto, auto, cover",
		backgroundPosition: "left top, center, center, center",
		backgroundAttachment: "fixed",
		color: "#f2f1ef",
		fontFamily:
			"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
	},
	wrap: {
		width: "min(1120px, calc(100% - 32px))",
		margin: "0 auto",
		padding: "28px 0 56px",
	},
	topBar: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 16,
		marginBottom: 28,
	},
	backLink: {
		border: "1px solid rgba(198,197,195,0.18)",
		background: "rgba(198,197,195,0.06)",
		color: "#f2f1ef",
		borderRadius: 999,
		padding: "11px 15px",
		font: "inherit",
		fontWeight: 700,
		cursor: "pointer",
		textDecoration: "none",
	},
	adminLink: {
		color: "#c6c5c3",
		fontSize: 14,
		textDecoration: "none",
	},
	header: {
		display: "grid",
		gridTemplateColumns: "minmax(0, 1.1fr) minmax(280px, 0.9fr)",
		gap: 24,
		alignItems: "end",
		marginBottom: 24,
	},
	eyebrow: {
		margin: "0 0 9px",
		color: "#a8a6a2",
		fontSize: 12,
		letterSpacing: "0.18em",
		textTransform: "uppercase",
	},
	title: {
		margin: 0,
		color: "#f2f1ef",
		fontSize: "clamp(34px, 6vw, 72px)",
		lineHeight: 0.96,
		fontWeight: 820,
		letterSpacing: 0,
	},
	intro: {
		margin: "12px 0 0",
		color: "#c6c5c3",
		fontSize: 17,
		lineHeight: 1.55,
		maxWidth: 720,
	},
	sideNote: {
		border: "1px solid rgba(198,197,195,0.15)",
		background: "rgba(198,197,195,0.06)",
		borderRadius: 8,
		padding: 18,
		color: "#c6c5c3",
		lineHeight: 1.5,
		fontSize: 14,
	},
	interviewNote: {
		border: "1px solid rgba(198,197,195,0.18)",
		background: "rgba(198,197,195,0.065)",
		borderRadius: 8,
		padding: 16,
		color: "#c6c5c3",
		lineHeight: 1.5,
		fontSize: 14,
		marginBottom: 14,
	},
	calEmbedFrame: {
		width: "100%",
		minHeight: 650,
		border: "1px solid rgba(198,197,195,0.16)",
		borderRadius: 8,
		background: "rgba(30,28,30,0.88)",
		display: "block",
	},
	form: {
		display: "grid",
		gap: 18,
		paddingBottom: 28,
	},
	section: {
		border: "1px solid rgba(198,197,195,0.15)",
		background: "rgba(30,28,30,0.78)",
		borderRadius: 8,
		padding: 20,
		boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
	},
	sectionTitle: {
		margin: "0 0 16px",
		color: "#f2f1ef",
		fontSize: 18,
		fontWeight: 760,
		letterSpacing: 0,
	},
	gridTwo: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
		gap: 14,
	},
	gridThree: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
		gap: 14,
	},
	field: {
		display: "grid",
		gap: 7,
		minWidth: 0,
	},
	label: {
		color: "#c6c5c3",
		fontSize: 13,
		fontWeight: 720,
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
	},
	select: {
		width: "100%",
		border: "1px solid rgba(198,197,195,0.18)",
		background: "rgba(198,197,195,0.07)",
		borderRadius: 8,
		color: "#f2f1ef",
		padding: "12px 13px",
		font: "inherit",
		fontSize: 15,
		outline: "none",
	},
	customSelect: {
		position: "relative",
		width: "100%",
		minWidth: 0,
	},
	customSelectButton: {
		width: "100%",
		minHeight: 49,
		border: "1px solid rgba(198,197,195,0.18)",
		background: "rgba(198,197,195,0.07)",
		borderRadius: 8,
		color: "#f2f1ef",
		padding: "12px 13px",
		font: "inherit",
		fontSize: 15,
		outline: "none",
		cursor: "pointer",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		textAlign: "left",
	},
	customSelectPlaceholder: {
		color: "#a8a6a2",
	},
	customSelectChevron: {
		width: 0,
		height: 0,
		borderLeft: "5px solid transparent",
		borderRight: "5px solid transparent",
		borderTop: "6px solid #a8a6a2",
		flexShrink: 0,
	},
	customSelectMenu: {
		position: "absolute",
		zIndex: 20,
		top: "calc(100% + 7px)",
		left: 0,
		right: 0,
		maxHeight: 268,
		overflowY: "auto",
		border: "1px solid rgba(198,197,195,0.16)",
		background:
			"linear-gradient(145deg, rgba(30,28,30,0.98), rgba(48,45,48,0.98))",
		borderRadius: 8,
		boxShadow: "0 24px 70px rgba(0,0,0,0.46)",
		padding: 6,
	},
	customSelectOption: {
		width: "100%",
		border: 0,
		background: "transparent",
		color: "#f2f1ef",
		borderRadius: 6,
		padding: "10px 11px",
		font: "inherit",
		fontSize: 14,
		lineHeight: 1.25,
		textAlign: "left",
		cursor: "pointer",
	},
	customSelectOptionActive: {
		background: "rgba(198,197,195,0.13)",
	},
	customSelectOptionPlaceholder: {
		color: "#a8a6a2",
	},
	textarea: {
		width: "100%",
		minHeight: 110,
		resize: "vertical",
		border: "1px solid rgba(198,197,195,0.18)",
		background: "rgba(198,197,195,0.07)",
		borderRadius: 8,
		color: "#f2f1ef",
		padding: "12px 13px",
		font: "inherit",
		fontSize: 15,
		outline: "none",
	},
	longTextarea: {
		minHeight: 160,
	},
	switchGrid: {
		display: "grid",
		gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
		gap: 12,
	},
	switchLabel: {
		display: "flex",
		alignItems: "center",
		gap: 10,
		border: "1px solid rgba(198,197,195,0.15)",
		background: "rgba(198,197,195,0.05)",
		borderRadius: 8,
		padding: "13px 14px",
		color: "#f2f1ef",
		fontWeight: 700,
		cursor: "pointer",
	},
	checkbox: {
		width: 18,
		height: 18,
		accentColor: "#c6c5c3",
	},
	formatPicker: {
		display: "flex",
		flexWrap: "wrap",
		gap: 10,
	},
	formatButton: {
		border: "1px solid rgba(198,197,195,0.16)",
		background: "rgba(198,197,195,0.055)",
		color: "#c6c5c3",
		borderRadius: 999,
		padding: "10px 13px",
		font: "inherit",
		fontSize: 14,
		fontWeight: 780,
		cursor: "pointer",
		display: "inline-flex",
		alignItems: "center",
		gap: 9,
	},
	formatButtonActive: {
		background: "#c6c5c3",
		color: "#1e1c1e",
		borderColor: "#c6c5c3",
	},
	formatDot: {
		width: 10,
		height: 10,
		borderRadius: 999,
		border: "1px solid currentColor",
	},
	formatDotActive: {
		background: "currentColor",
	},
	comboRow: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
		gap: 10,
		alignItems: "end",
	},
	addButton: {
		border: "1px solid rgba(198,197,195,0.22)",
		background: "#c6c5c3",
		color: "#1e1c1e",
		borderRadius: 8,
		padding: "12px 15px",
		font: "inherit",
		fontSize: 14,
		fontWeight: 820,
		cursor: "pointer",
		whiteSpace: "nowrap",
	},
	pillWrap: {
		display: "flex",
		flexWrap: "wrap",
		gap: 8,
		marginTop: 12,
		maxHeight: 96,
		overflowY: "auto",
		paddingRight: 4,
	},
	pill: {
		display: "inline-flex",
		alignItems: "center",
		gap: 7,
		border: "1px solid rgba(198,197,195,0.16)",
		background: "rgba(198,197,195,0.07)",
		color: "#f2f1ef",
		borderRadius: 999,
		padding: "7px 9px 7px 11px",
		fontSize: 13,
		fontWeight: 720,
		maxWidth: "100%",
	},
	pillText: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		maxWidth: 260,
	},
	pillRemove: {
		width: 22,
		height: 22,
		border: 0,
		borderRadius: 999,
		background: "rgba(242,241,239,0.16)",
		color: "#f2f1ef",
		cursor: "pointer",
		lineHeight: 1,
	},
	compactHint: {
		color: "#a8a6a2",
		fontSize: 12,
		lineHeight: 1.4,
		marginTop: 8,
	},
	actions: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 16,
		flexWrap: "wrap",
	},
	submit: {
		border: 0,
		background: "#c6c5c3",
		color: "#1e1c1e",
		borderRadius: 999,
		padding: "14px 20px",
		font: "inherit",
		fontWeight: 820,
		cursor: "pointer",
		minWidth: 180,
	},
	submitDisabled: {
		opacity: 0.58,
		cursor: "not-allowed",
	},
	status: {
		color: "#c6c5c3",
		fontSize: 14,
		lineHeight: 1.45,
	},
	successBox: {
		border: "1px solid rgba(198,197,195,0.22)",
		background: "rgba(198,197,195,0.08)",
		borderRadius: 8,
		padding: 18,
		color: "#f2f1ef",
		lineHeight: 1.5,
	},
	errorBox: {
		border: "1px solid rgba(255,132,132,0.32)",
		background: "rgba(255,132,132,0.1)",
		borderRadius: 8,
		padding: 14,
		color: "#ffd4d4",
		lineHeight: 1.45,
	},
	link: {
		color: "#f2f1ef",
		fontWeight: 800,
	},
};

function buildReviewUrl(applicationId) {
	if (typeof window === "undefined") return "#/admin/coach-applications";

	const baseUrl = `${window.location.origin}${window.location.pathname}`;
	return `${baseUrl}#/admin/coach-applications?application=${encodeURIComponent(
		applicationId,
	)}`;
}

function formatStateInput(value) {
	const trimmedStart = String(value ?? "").replace(/^\s+/, "");
	if (trimmedStart.length <= 2) return trimmedStart.toUpperCase();

	return trimmedStart
		.toLowerCase()
		.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function getSubmitErrorMessage(error) {
	const message = error?.message || "";
	const isRowLevelSecurityError =
		message.toLowerCase().includes("row-level security") ||
		message.toLowerCase().includes("violates row-level security policy");

	if (isRowLevelSecurityError) {
		return "The form is working, but Supabase is blocking public application submissions. Add the coach_applications insert policy in Supabase, then try again.";
	}

	return message || "Something went wrong while saving the application.";
}

function buildFullName(firstName, lastName) {
	return [firstName, lastName]
		.map((part) => String(part ?? "").trim())
		.filter(Boolean)
		.join(" ");
}

function Field({
	label,
	name,
	type = "text",
	required = true,
	value,
	onChange,
	...props
}) {
	return (
		<label style={styles.field}>
			<span style={styles.label}>{label}</span>
			<input
				style={styles.input}
				name={name}
				type={type}
				required={required}
				value={value}
				onChange={onChange}
				{...props}
			/>
		</label>
	);
}

function TextArea({
	label,
	name,
	required = true,
	value,
	onChange,
	rows = 4,
	placeholder = "",
	style,
}) {
	return (
		<label style={styles.field}>
			<span style={styles.label}>{label}</span>
			<textarea
				style={{ ...styles.textarea, ...style }}
				name={name}
				required={required}
				value={value}
				onChange={onChange}
				rows={rows}
				placeholder={placeholder}
			/>
		</label>
	);
}

function CustomSelect({
	value,
	onChange,
	options,
	placeholder,
	name,
	ariaLabel,
}) {
	const [open, setOpen] = useState(false);
	const selectedLabel = value || placeholder;

	function choose(nextValue) {
		onChange(nextValue);
		setOpen(false);
	}

	function handleBlur(event) {
		if (!event.currentTarget.contains(event.relatedTarget)) {
			setOpen(false);
		}
	}

	return (
		<div style={styles.customSelect} onBlur={handleBlur}>
			<button
				type="button"
				style={styles.customSelectButton}
				onClick={() => setOpen((current) => !current)}
				aria-haspopup="listbox"
				aria-expanded={open ? "true" : "false"}
				aria-label={ariaLabel || placeholder}
			>
				<span
					style={{
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						...(value ? {} : styles.customSelectPlaceholder),
					}}
				>
					{selectedLabel}
				</span>
				<span
					style={{
						...styles.customSelectChevron,
						...(open ? { borderTopColor: "#f2f1ef" } : {}),
					}}
					aria-hidden="true"
				/>
			</button>
			{name ? <input type="hidden" name={name} value={value} /> : null}
			{open ? (
				<div style={styles.customSelectMenu} role="listbox">
					<button
						type="button"
						style={{
							...styles.customSelectOption,
							...styles.customSelectOptionPlaceholder,
							...(!value ? styles.customSelectOptionActive : {}),
						}}
						onClick={() => choose("")}
						role="option"
						aria-selected={!value}
					>
						{placeholder}
					</button>
					{options.map((option) => (
						<button
							key={option}
							type="button"
							style={{
								...styles.customSelectOption,
								...(value === option ? styles.customSelectOptionActive : {}),
							}}
							onClick={() => choose(option)}
							role="option"
							aria-selected={value === option}
						>
							{option}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

function SelectField({
	label,
	name,
	required = true,
	value,
	onChange,
	options,
	placeholder = "Select one",
}) {
	return (
		<label style={styles.field}>
			<span style={styles.label}>{label}</span>
			<CustomSelect
				name={name}
				value={value}
				options={options}
				placeholder={placeholder}
				ariaLabel={label}
				onChange={(nextValue) =>
					onChange({
						target: { name, value: nextValue, type: "select-one" },
					})
				}
			/>
		</label>
	);
}

function PillList({ items, onRemove, emptyLabel, getLabel = (item) => item }) {
	if (!items.length) {
		return <div style={styles.compactHint}>{emptyLabel}</div>;
	}

	const hiddenCount = Math.max(items.length - 8, 0);

	return (
		<div style={styles.pillWrap}>
			{items.slice(0, 8).map((item, index) => {
				const label = getLabel(item);
				return (
					<span key={`${label}-${index}`} style={styles.pill} title={label}>
						<span style={styles.pillText}>{label}</span>
						<button
							type="button"
							style={styles.pillRemove}
							onClick={() => onRemove(index)}
							aria-label={`Remove ${label}`}
						>
							x
						</button>
					</span>
				);
			})}
			{hiddenCount ? (
				<span style={styles.pill} title={`${hiddenCount} more saved`}>
					+{hiddenCount} more
				</span>
			) : null}
		</div>
	);
}

function MultiSelectInput({
	label,
	options,
	items,
	onAdd,
	onRemove,
	selectValue,
	setSelectValue,
	customValue,
	setCustomValue,
	selectPlaceholder,
	customPlaceholder,
	emptyLabel,
}) {
	function addItem() {
		const value = customValue.trim() || selectValue;
		if (!value) return;
		onAdd(value);
		setSelectValue("");
		setCustomValue("");
	}

	function handleKeyDown(event) {
		if (event.key === "Enter") {
			event.preventDefault();
			addItem();
		}
	}

	return (
		<div style={styles.field}>
			<span style={styles.label}>{label}</span>
			<div style={styles.comboRow}>
				<CustomSelect
					value={selectValue}
					onChange={setSelectValue}
					options={options}
					placeholder={selectPlaceholder}
					ariaLabel={selectPlaceholder}
				/>
				<input
					style={styles.input}
					value={customValue}
					onChange={(event) => setCustomValue(event.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={customPlaceholder}
				/>
				<button type="button" style={styles.addButton} onClick={addItem}>
					Add
				</button>
			</div>
			<PillList items={items} onRemove={onRemove} emptyLabel={emptyLabel} />
		</div>
	);
}

function SocialLinkInput({
	items,
	onAdd,
	onRemove,
	typeValue,
	setTypeValue,
	handleValue,
	setHandleValue,
}) {
	function addItem() {
		const type = typeValue || "Website";
		const value = handleValue.trim();
		if (!value) return;
		onAdd({ type, value });
		setTypeValue("");
		setHandleValue("");
	}

	function handleKeyDown(event) {
		if (event.key === "Enter") {
			event.preventDefault();
			addItem();
		}
	}

	return (
		<div style={styles.field}>
			<span style={styles.label}>Social media or website</span>
			<div style={styles.comboRow}>
				<CustomSelect
					value={typeValue}
					onChange={setTypeValue}
					options={SOCIAL_LINK_TYPES}
					placeholder="Link type"
					ariaLabel="Social link type"
				/>
				<input
					style={styles.input}
					value={handleValue}
					onChange={(event) => setHandleValue(event.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="@username, profile URL, or website"
				/>
				<button type="button" style={styles.addButton} onClick={addItem}>
					Add
				</button>
			</div>
			<PillList
				items={items}
				onRemove={onRemove}
				emptyLabel="Optional. Add one or more places where athletes can find you."
				getLabel={(item) => `${item.type}: ${item.value}`}
			/>
		</div>
	);
}

function CoachingFormatPicker({ value, onChange }) {
	function toggleFormat(format) {
		if (value.includes(format)) {
			onChange(value.filter((item) => item !== format));
			return;
		}

		onChange([...value, format]);
	}

	return (
		<div style={styles.field}>
			<span style={styles.label}>Coaching format</span>
			<div style={styles.formatPicker}>
				{COACHING_FORMAT_OPTIONS.map((format) => {
					const active = value.includes(format);
					return (
						<button
							key={format}
							type="button"
							style={{
								...styles.formatButton,
								...(active ? styles.formatButtonActive : {}),
							}}
							onClick={() => toggleFormat(format)}
							aria-pressed={active ? "true" : "false"}
						>
							<span
								style={{
									...styles.formatDot,
									...(active ? styles.formatDotActive : {}),
								}}
							/>
							{format}
						</button>
					);
				})}
			</div>
			<div style={styles.compactHint}>
				Choose one or both. Tap an active format to remove it.
			</div>
		</div>
	);
}

export default function CoachApplicationForm({ onBackToMap, adminHref }) {
	const [form, setForm] = useState(blankForm);
	const [photoFile, setPhotoFile] = useState(null);
	const [specialtyChoice, setSpecialtyChoice] = useState("");
	const [customSpecialty, setCustomSpecialty] = useState("");
	const [certificationChoice, setCertificationChoice] = useState("");
	const [customCertification, setCustomCertification] = useState("");
	const [socialType, setSocialType] = useState("");
	const [socialHandle, setSocialHandle] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [submittedApplication, setSubmittedApplication] = useState(null);

	const reviewUrl = useMemo(
		() =>
			submittedApplication
				? buildReviewUrl(submittedApplication.id)
				: adminHref,
		[adminHref, submittedApplication],
	);

	useEffect(() => {
		function handleCalEmbedMessage(event) {
			if (!CAL_EMBED_ORIGINS.has(event.origin)) return;

			const payload = normalizeCalEmbedPayload(event.data);
			if (!isCalBookingSuccessMessage(payload)) return;

			const interviewUrl = getInterviewUrlFromCalMessage(payload);
			const bookingUid = getBookingUidFromCalMessage(payload);
			setForm((current) => ({
				...current,
				interviewAcknowledged: true,
				interviewBookingUrl:
					interviewUrl || current.interviewBookingUrl || CAL_INTERVIEW_LINK,
				interviewBookingUid: bookingUid || current.interviewBookingUid,
			}));
		}

		window.addEventListener("message", handleCalEmbedMessage);
		return () => window.removeEventListener("message", handleCalEmbedMessage);
	}, []);

	function updateField(event) {
		const { name, type, checked, value } = event.target;
		setForm((current) => ({
			...current,
			[name]: type === "checkbox" ? checked : value,
		}));
	}

	function updateStateField(event) {
		const { name, value } = event.target;
		setForm((current) => ({
			...current,
			[name]: formatStateInput(value),
		}));
	}

	function addUniqueItem(fieldName, value) {
		const trimmed = String(value ?? "").trim();
		if (!trimmed) return;

		setForm((current) => {
			const existingItems = current[fieldName] || [];
			const exists = existingItems.some(
				(item) => String(item).toLowerCase() === trimmed.toLowerCase(),
			);

			if (exists) return current;

			return {
				...current,
				[fieldName]: [...existingItems, trimmed],
			};
		});
	}

	function removeItem(fieldName, index) {
		setForm((current) => ({
			...current,
			[fieldName]: (current[fieldName] || []).filter(
				(_item, itemIndex) => itemIndex !== index,
			),
		}));
	}

	function addSocialLink(item) {
		const type = String(item.type || "Website").trim();
		const value = String(item.value || "").trim();
		if (!value) return;

		setForm((current) => {
			const existingItems = current.socialLinks || [];
			const exists = existingItems.some(
				(link) =>
					link.type.toLowerCase() === type.toLowerCase() &&
					link.value.toLowerCase() === value.toLowerCase(),
			);

			if (exists) return current;

			return {
				...current,
				socialLinks: [...existingItems, { type, value }],
			};
		});
	}

	function removeSocialLink(index) {
		setForm((current) => ({
			...current,
			socialLinks: (current.socialLinks || []).filter(
				(_item, itemIndex) => itemIndex !== index,
			),
		}));
	}

	function resetForm() {
		setForm(blankForm);
		setPhotoFile(null);
		setSpecialtyChoice("");
		setCustomSpecialty("");
		setCertificationChoice("");
		setCustomCertification("");
		setSocialType("");
		setSocialHandle("");
		setSubmittedApplication(null);
		setError("");
	}

	async function handleSubmit(event) {
		event.preventDefault();
		setSubmitting(true);
		setError("");

		try {
			if (!form.coachTitle) {
				setError("Choose a coach title.");
				setSubmitting(false);
				return;
			}

			if (!form.specialties.length) {
				setError("Add at least one coaching specialty.");
				setSubmitting(false);
				return;
			}

			if (!form.coachingFormats.length) {
				setError("Choose at least one coaching format.");
				setSubmitting(false);
				return;
			}

			if (!form.interviewAcknowledged) {
				setError(
					"Book your approval interview and confirm it before submitting.",
				);
				setSubmitting(false);
				return;
			}

			const fullName = buildFullName(form.firstName, form.lastName);
			const interviewBooking = await resolveCalInterviewBooking({
				bookingUid: form.interviewBookingUid,
				attendeeEmail: form.email,
				attendeeName: fullName,
				eventTypeSlug: CAL_INTERVIEW_EVENT_SLUG,
				fallbackUrl: form.interviewBookingUrl || CAL_INTERVIEW_LINK,
			});

			const application = await submitCoachApplication({
				...form,
				fullName,
				interviewBookingUrl:
					interviewBooking.interviewBookingUrl ||
					form.interviewBookingUrl ||
					CAL_INTERVIEW_LINK,
				interviewDateTime: interviewBooking.interviewDateTime,
				interviewRequired: true,
				onlineTraining: form.coachingFormats.includes("Online coaching"),
				remoteAvailable: form.coachingFormats.includes("Online coaching"),
				inPersonCoaching: form.coachingFormats.includes("In-person coaching"),
				state: normalizeStateAbbr(form.state),
				gymState: normalizeStateAbbr(form.gymState),
				profilePhotoFile: photoFile,
			});

			setSubmittedApplication(application);
		} catch (submitError) {
			setError(getSubmitErrorMessage(submitError));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main style={styles.page}>
			<div style={styles.wrap}>
				<div style={styles.topBar}>
					<button type="button" style={styles.backLink} onClick={onBackToMap}>
						Back to map
					</button>
					<a style={styles.adminLink} href={adminHref}>
						Admin will review
					</a>
				</div>

				<header style={styles.header}>
					<div>
						<p style={styles.eyebrow}>Coach application</p>
						<h1 style={styles.title}>Apply to be listed</h1>
						<p style={styles.intro}>
							Submit your coaching details for review. Approved applications are
							added to the coach discovery map and connected to the matching
							gym.
						</p>
					</div>
					<div style={styles.sideNote}>
						New submissions are saved as pending applications. Notifications are
						sent to {COACH_APPLICATION_ADMIN_EMAIL} when the webhook is
						configured.
					</div>
				</header>

				{submittedApplication ? (
					<section style={styles.successBox}>
						<strong>Application submitted.</strong>
						<br />
						Status: {submittedApplication.status}
						<br />
						Review link:{" "}
						<a style={styles.link} href={reviewUrl}>
							open application
						</a>
						<p style={{ marginTop: 12 }}>
							Your application was saved. If email automation is enabled in
							Supabase, confirmation emails will be sent automatically.
						</p>
						<div style={{ ...styles.actions, marginTop: 16 }}>
							<button type="button" style={styles.backLink} onClick={resetForm}>
								Submit another
							</button>
							<button type="button" style={styles.submit} onClick={onBackToMap}>
								Return to map
							</button>
						</div>
					</section>
				) : (
					<form style={styles.form} onSubmit={handleSubmit}>
						<section style={styles.section}>
							<h2 style={styles.sectionTitle}>Coach details</h2>
							<div style={styles.gridThree}>
								<Field
									label="First name"
									name="firstName"
									value={form.firstName}
									onChange={updateField}
								/>
								<Field
									label="Last name"
									name="lastName"
									value={form.lastName}
									onChange={updateField}
								/>
								<Field
									label="Email"
									name="email"
									type="email"
									value={form.email}
									onChange={updateField}
								/>
								<Field
									label="Phone number"
									name="phone"
									type="tel"
									value={form.phone}
									onChange={updateField}
								/>
								<Field
									label="City"
									name="city"
									value={form.city}
									onChange={updateField}
								/>
								<Field
									label="State"
									name="state"
									value={form.state}
									onChange={updateStateField}
									maxLength={24}
								/>
								<SelectField
									label="Coach title"
									name="coachTitle"
									value={form.coachTitle}
									onChange={updateField}
									options={COACH_TITLE_OPTIONS}
									placeholder="Choose your primary title"
								/>
							</div>
						</section>

						<section style={styles.section}>
							<h2 style={styles.sectionTitle}>Gym</h2>
							<div style={styles.gridThree}>
								<Field
									label="Gym name"
									name="gymName"
									value={form.gymName}
									onChange={updateField}
								/>
								<Field
									label="Gym city"
									name="gymCity"
									value={form.gymCity}
									onChange={updateField}
								/>
								<Field
									label="Gym state"
									name="gymState"
									value={form.gymState}
									onChange={updateStateField}
									maxLength={24}
								/>
							</div>
						</section>

						<section style={styles.section}>
							<h2 style={styles.sectionTitle}>Coaching profile</h2>
							<div style={styles.form}>
								<MultiSelectInput
									label="Specialties"
									options={SPECIALTY_OPTIONS}
									items={form.specialties}
									onAdd={(value) => addUniqueItem("specialties", value)}
									onRemove={(index) => removeItem("specialties", index)}
									selectValue={specialtyChoice}
									setSelectValue={setSpecialtyChoice}
									customValue={customSpecialty}
									setCustomValue={setCustomSpecialty}
									selectPlaceholder="Choose specialty"
									customPlaceholder="Or type a niche specialty"
									emptyLabel="Add at least one specialty. They will appear as removable pills."
								/>
								<TextArea
									label="Short profile bio"
									name="bio"
									value={form.bio}
									onChange={updateField}
									placeholder="A very concise public bio athletes will see on your coach profile."
								/>
								<TextArea
									label="About you"
									name="reviewStatement"
									value={form.reviewStatement}
									onChange={updateField}
									rows={6}
									placeholder="Share the story behind your fitness journey, coaching approach, and what inspires you to want to coach."
									style={styles.longTextarea}
								/>
								<div style={styles.gridTwo}>
									<TextArea
										label="Your own lifting experience"
										name="liftingExperience"
										value={form.liftingExperience}
										onChange={updateField}
										placeholder="I started competing in powerlifting in college and have trained through..."
									/>
									<TextArea
										label="Your coaching experience"
										name="coachingExperience"
										value={form.coachingExperience}
										onChange={updateField}
										placeholder="I have coached beginner and intermediate lifters through meet prep, technique..."
									/>
								</div>
								<div style={styles.gridTwo}>
									<Field
										label="Years of experience"
										name="yearsOfExperience"
										type="number"
										min="0"
										value={form.yearsOfExperience}
										onChange={updateField}
									/>
									<Field
										label="Current roster size"
										name="currentRosterSize"
										type="number"
										min="0"
										value={form.currentRosterSize}
										onChange={updateField}
									/>
								</div>
							</div>
							<div style={{ marginTop: 14 }}>
								<CoachingFormatPicker
									value={form.coachingFormats}
									onChange={(nextFormats) =>
										setForm((current) => ({
											...current,
											coachingFormats: nextFormats,
										}))
									}
								/>
							</div>
						</section>

						<section style={styles.section}>
							<h2 style={styles.sectionTitle}>Media and links</h2>
							<div style={styles.form}>
								<label style={styles.field}>
									<span style={styles.label}>Headshot photo upload</span>
									<input
										style={styles.input}
										type="file"
										accept="image/*"
										required
										onChange={(event) =>
											setPhotoFile(event.target.files?.[0] || null)
										}
									/>
								</label>
								<SocialLinkInput
									items={form.socialLinks}
									onAdd={addSocialLink}
									onRemove={removeSocialLink}
									typeValue={socialType}
									setTypeValue={setSocialType}
									handleValue={socialHandle}
									setHandleValue={setSocialHandle}
								/>
								<MultiSelectInput
									label="Certifications"
									options={CERTIFICATION_OPTIONS}
									items={form.certifications}
									onAdd={(value) => addUniqueItem("certifications", value)}
									onRemove={(index) => removeItem("certifications", index)}
									selectValue={certificationChoice}
									setSelectValue={setCertificationChoice}
									customValue={customCertification}
									setCustomValue={setCustomCertification}
									selectPlaceholder="Choose certification"
									customPlaceholder="Or type the certification"
									emptyLabel="Optional. Add any certifications that should be reviewed."
								/>
							</div>
						</section>

						<section style={styles.section}>
							<h2 style={styles.sectionTitle}>Interview</h2>
							<div style={styles.interviewNote}>
								Book a 30 minute interview with Carinne. This interview is
								required before a coach application can be approved.
							</div>
							<iframe
								title="Book approval interview"
								src={CAL_INTERVIEW_EMBED_LINK}
								style={styles.calEmbedFrame}
								loading="lazy"
							/>
							<label
								style={{
									...styles.switchLabel,
									marginTop: 14,
									fontWeight: 400, // Thinner font weight, adjust as needed
									fontSize: 15,
								}}
							>
								<input
									style={styles.checkbox}
									type="checkbox"
									name="interviewAcknowledged"
									checked={form.interviewAcknowledged}
									onChange={updateField}
									required
								/>
								I booked the required approval interview. Note* you will not be
								considered until the interview is completed.
							</label>
						</section>

						{error ? <div style={styles.errorBox}>{error}</div> : null}

						<div style={styles.actions}>
							<p style={styles.status}>
								Submissions stay pending until they are accepted in admin
								review.
							</p>
							<button
								type="submit"
								style={{
									...styles.submit,
									...(submitting ? styles.submitDisabled : {}),
								}}
								disabled={submitting}
							>
								{submitting ? "Submitting..." : "Submit application"}
							</button>
						</div>
					</form>
				)}
			</div>
		</main>
	);
}
