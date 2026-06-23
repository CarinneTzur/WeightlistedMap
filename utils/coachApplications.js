import { gyms as staticGyms } from "../data/gyms";
import { STATE_ABBR_BY_NAME, STATE_CENTERS } from "../data/usStates";
import { isSupabaseConfigured, requireSupabase } from "../src/lib/supabase";

export const COACH_APPLICATION_ADMIN_EMAIL = "ctzurdecker@outlook.com";
export const COACH_APPLICATION_CHANGED_EVENT =
	"weightlisted:coach-applications-changed";

export const COACH_APPLICATION_STATUSES = {
	PENDING: "pending",
	ACCEPTED: "approved",
	DECLINED: "declined",
	NEEDS_EDITS: "needs_edits",
};

const COACH_APPLICATION_TABLE = "coach_applications";
const COACH_PHOTOS_BUCKET = "coach-photos";
const APPROVED_CACHE_KEY = "weightlisted.supabaseApprovedCoaches";
const US_CENTER = [39.8283, -98.5795];

function emitChange() {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(COACH_APPLICATION_CHANGED_EVENT));
}

function compactString(value) {
	return String(value ?? "").trim();
}

function splitFullName(fullName) {
	const parts = compactString(fullName).split(/\s+/).filter(Boolean);
	return {
		firstName: parts[0] || "",
		lastName: parts.slice(1).join(" "),
	};
}

function buildFullName(firstName, lastName, fallbackName = "") {
	const combined = [firstName, lastName]
		.map(compactString)
		.filter(Boolean)
		.join(" ");

	return combined || compactString(fallbackName);
}

function formatDateTimeForEmail(value) {
	const rawValue = compactString(value);
	if (!rawValue) return "";

	const parsed = new Date(rawValue);
	if (Number.isNaN(parsed.getTime())) return rawValue;

	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "full",
		timeStyle: "short",
		timeZoneName: "short",
	}).format(parsed);
}

function escapeHtml(value) {
	return compactString(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function textToHtml(value) {
	return compactString(value)
		.split("\n")
		.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "<br />"))
		.join("");
}

function normalizeBoolean(value) {
	return value === true || value === "true" || value === "on" || value === "yes";
}

function normalizeNullableNumber(value) {
	if (value === "" || value === null || value === undefined) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function getStorage() {
	if (typeof window === "undefined") return null;

	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function readJson(key, fallback) {
	const storage = getStorage();
	if (!storage) return fallback;

	try {
		const raw = storage.getItem(key);
		return raw ? JSON.parse(raw) : fallback;
	} catch {
		return fallback;
	}
}

function writeJson(key, value) {
	const storage = getStorage();
	if (!storage) return;
	storage.setItem(key, JSON.stringify(value));
}

export function splitList(value) {
	if (Array.isArray(value)) {
		return value.map(compactString).filter(Boolean);
	}

	return compactString(value)
		.split(/[\n,;]+/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function slugify(value) {
	const slug = compactString(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");

	return slug || "new";
}

export function normalizeStateAbbr(value) {
	const trimmed = compactString(value);
	if (!trimmed) return "";

	if (trimmed.length === 2) return trimmed.toUpperCase();

	const matchingName = Object.keys(STATE_ABBR_BY_NAME).find(
		(name) => name.toLowerCase() === trimmed.toLowerCase(),
	);

	return matchingName ? STATE_ABBR_BY_NAME[matchingName] : trimmed.toUpperCase();
}

function normalizeExperience(value) {
	if (value === null || value === undefined || value === "") return "";
	return `${Number(value)} years`;
}

function normalizeRoster(value) {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function buildDefaultHeadshot(name) {
	const initials =
		compactString(name)
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join("") || "WL";
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" fill="#373537"/><circle cx="160" cy="132" r="56" fill="#c6c5c3"/><path d="M64 282c16-64 56-96 96-96s80 32 96 96" fill="#c6c5c3"/><text x="160" y="171" text-anchor="middle" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#1e1c1e">${initials}</text></svg>`;

	return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function safeFileName(fileName) {
	const extension = compactString(fileName).split(".").pop() || "jpg";
	const baseName = compactString(fileName)
		.replace(/\.[^.]+$/, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return `${baseName || "coach-photo"}.${extension.toLowerCase()}`;
}

export async function uploadCoachProfilePhoto(file) {
	if (!file) return { profilePhotoUrl: "", profilePhotoFileName: "" };

	const supabase = requireSupabase();
	const filePath = `applications/${Date.now()}-${safeFileName(file.name)}`;
	const { error: uploadError } = await supabase.storage
		.from(COACH_PHOTOS_BUCKET)
		.upload(filePath, file, {
			cacheControl: "3600",
			upsert: false,
		});

	if (uploadError) throw uploadError;

	const { data } = supabase.storage
		.from(COACH_PHOTOS_BUCKET)
		.getPublicUrl(filePath);

	return {
		profilePhotoUrl: data.publicUrl,
		profilePhotoFileName: file.name,
	};
}

function getWebsiteFromSocialLinks(socialLinks = []) {
	const website = socialLinks.find(
		(link) => compactString(link?.type).toLowerCase() === "website",
	);

	return compactString(website?.value);
}

function buildInsertRow(input) {
	const firstName = compactString(input.firstName);
	const lastName = compactString(input.lastName);
	const fullName = buildFullName(firstName, lastName, input.fullName);
	const socialLinks = Array.isArray(input.socialLinks)
		? input.socialLinks
			.map((link) => ({
				type: compactString(link?.type),
				value: compactString(link?.value),
			}))
			.filter((link) => link.type && link.value)
		: [];

	return {
		status: COACH_APPLICATION_STATUSES.PENDING,
		first_name: firstName || splitFullName(fullName).firstName,
		last_name: lastName || splitFullName(fullName).lastName,
		email: compactString(input.email),
		phone: compactString(input.phone),
		city: compactString(input.city),
		state: normalizeStateAbbr(input.state),
		gym_name: compactString(input.gymName),
		gym_city: compactString(input.gymCity),
		gym_state: normalizeStateAbbr(input.gymState),
		coach_title: compactString(input.coachTitle),
		specialties: splitList(input.specialties),
		bio: compactString(input.bio),
		review_statement: compactString(input.reviewStatement),
		lifting_experience: compactString(input.liftingExperience),
		coaching_experience: compactString(input.coachingExperience),
		years_of_experience: normalizeNullableNumber(input.yearsOfExperience),
		current_roster_size: normalizeNullableNumber(input.currentRosterSize),
		online_training: normalizeBoolean(input.onlineTraining),
		remote_available: normalizeBoolean(input.remoteAvailable),
		in_person_coaching: normalizeBoolean(input.inPersonCoaching),
		coaching_formats: splitList(input.coachingFormats),
		profile_photo_url: compactString(input.profilePhotoUrl),
		profile_photo_file_name: compactString(input.profilePhotoFileName),
		social_links: socialLinks,
		certifications: splitList(input.certifications),
		interview_booking_url: compactString(input.interviewBookingUrl),
		interview_date_time: compactString(input.interviewDateTime) || null,
		interview_required: normalizeBoolean(input.interviewRequired),
		interview_acknowledged: normalizeBoolean(input.interviewAcknowledged),
		latitude: normalizeNullableNumber(input.latitude),
		longitude: normalizeNullableNumber(input.longitude),
	};
}

export function mapSupabaseApplication(row) {
	if (!row) return null;
	const nameParts = splitFullName(row.full_name);
	const firstName = row.first_name || nameParts.firstName;
	const lastName = row.last_name || nameParts.lastName;
	const fullName = buildFullName(firstName, lastName, row.full_name);

	return {
		id: row.id,
		submittedAt: row.created_at,
		updatedAt: row.updated_at,
		reviewedAt: row.reviewed_at,
		status: row.status,
		firstName,
		lastName,
		fullName,
		email: row.email,
		phone: row.phone,
		city: row.city,
		state: row.state,
		gymName: row.gym_name,
		gymCity: row.gym_city,
		gymState: row.gym_state,
		coachTitle: row.coach_title,
		specialties: row.specialties || [],
		bio: row.bio,
		reviewStatement: row.review_statement || "",
		liftingExperience: row.lifting_experience,
		coachingExperience: row.coaching_experience,
		yearsOfExperience: row.years_of_experience,
		currentRosterSize: row.current_roster_size,
		onlineTraining: Boolean(row.online_training),
		remoteAvailable: Boolean(row.remote_available),
		inPersonCoaching: Boolean(row.in_person_coaching),
		coachingFormats: row.coaching_formats || [],
		profilePhotoUrl: row.profile_photo_url,
		profilePhotoFileName: row.profile_photo_file_name,
		socialLinks: row.social_links || [],
		certifications: row.certifications || [],
		interviewBookingUrl: row.interview_booking_url,
		interviewDateTime: row.interview_date_time || row.interview_datetime || "",
		interviewRequired: Boolean(row.interview_required),
		interviewAcknowledged: Boolean(row.interview_acknowledged),
		latitude: row.latitude,
		longitude: row.longitude,
		adminNotes: row.admin_notes || "",
		declineReason: row.decline_reason || "",
	};
}

export async function submitCoachApplication(input) {
	const supabase = requireSupabase();
	const { profilePhotoFile, ...applicationInput } = input;
	let photoFields = {
		profilePhotoUrl: compactString(input.profilePhotoUrl),
		profilePhotoFileName: compactString(input.profilePhotoFileName),
	};

	if (profilePhotoFile) {
		photoFields = await uploadCoachProfilePhoto(profilePhotoFile);
	}

	const insertRow = buildInsertRow({
		...applicationInput,
		...photoFields,
	});
	const { data, error } = await supabase
		.from(COACH_APPLICATION_TABLE)
		.insert(insertRow)
		.select("*")
		.single();

	if (error) throw error;

	const application = mapSupabaseApplication(data);
	emitChange();
	return application;
}

export async function resolveCalInterviewBooking({
	bookingUid = "",
	attendeeEmail = "",
	attendeeName = "",
	eventTypeSlug = "",
	fallbackUrl = "",
} = {}) {
	const normalizedFallbackUrl = compactString(fallbackUrl);

	if (!isSupabaseConfigured) {
		return {
			interviewBookingUrl: normalizedFallbackUrl,
			interviewDateTime: "",
			bookingUid: compactString(bookingUid),
		};
	}

	try {
		const supabase = requireSupabase();
		const { data, error } = await supabase.functions.invoke(
			"cal-interview-booking",
			{
				body: {
					bookingUid: compactString(bookingUid),
					attendeeEmail: compactString(attendeeEmail),
					attendeeName: compactString(attendeeName),
					eventTypeSlug: compactString(eventTypeSlug),
					fallbackUrl: normalizedFallbackUrl,
				},
			},
		);

		if (error) throw error;

		return {
			interviewBookingUrl:
				compactString(data?.interviewBookingUrl) || normalizedFallbackUrl,
			interviewDateTime: compactString(data?.interviewDateTime),
			bookingUid: compactString(data?.bookingUid),
		};
	} catch (error) {
		console.warn("Cal interview booking lookup failed.", error);
		return {
			interviewBookingUrl: normalizedFallbackUrl,
			interviewDateTime: "",
			bookingUid: compactString(bookingUid),
		};
	}
}

export async function getCoachApplications(status = "pending") {
	const supabase = requireSupabase();
	let query = supabase
		.from(COACH_APPLICATION_TABLE)
		.select("*")
		.order("created_at", { ascending: false });

	if (status && status !== "all") {
		query = query.eq("status", status);
	}

	const { data, error } = await query;
	if (error) throw error;
	return (data || []).map(mapSupabaseApplication);
}

export async function getCoachApplicationById(applicationId) {
	const supabase = requireSupabase();
	const { data, error } = await supabase
		.from(COACH_APPLICATION_TABLE)
		.select("*")
		.eq("id", applicationId)
		.single();

	if (error) throw error;
	return mapSupabaseApplication(data);
}

export async function reviewCoachApplication(
	applicationId,
	nextStatus,
	{ adminNotes = "", declineReason = "" } = {},
) {
	const supabase = requireSupabase();
	if (!Object.values(COACH_APPLICATION_STATUSES).includes(nextStatus)) {
		throw new Error(`Unsupported coach application status: ${nextStatus}`);
	}

	const updateRow = {
		status: nextStatus,
		reviewed_at: new Date().toISOString(),
		admin_notes: compactString(adminNotes),
	};

	if (nextStatus === COACH_APPLICATION_STATUSES.DECLINED) {
		updateRow.decline_reason = compactString(declineReason);
	}

	const { data, error } = await supabase
		.from(COACH_APPLICATION_TABLE)
		.update(updateRow)
		.eq("id", applicationId)
		.select("*")
		.single();

	if (error) throw error;

	await refreshApprovedCoachCache();
	emitChange();

	return {
		application: mapSupabaseApplication(data),
	};
}

function buildGymFromApplication(application) {
	const state = normalizeStateAbbr(application.gymState);
	const stateCenter = STATE_CENTERS[state]?.center || US_CENTER;
	const baseId = `gym_${slugify(`${application.gymName}_${application.gymCity}_${state}`)}`;

	return {
		id: `${baseId}_${slugify(application.id).slice(0, 8)}`,
		name: application.gymName,
		address: "Address pending",
		city: application.gymCity,
		state,
		zip: "",
		latitude: application.latitude || stateCenter[0],
		longitude: application.longitude || stateCenter[1],
		tags: splitList(application.specialties).map((specialty) =>
			specialty.toLowerCase(),
		),
		website: getWebsiteFromSocialLinks(application.socialLinks),
		image: "",
		description: `${application.gymName} was added through an approved coach application.`,
		sourceApplicationId: application.id,
	};
}

export function buildCoachFromApplication(application, gymId) {
	return {
		id: `coach_${slugify(application.fullName)}_${slugify(application.id).slice(0, 8)}`,
		name: application.fullName,
		title: application.coachTitle,
		gymIds: gymId ? [gymId] : [],
		rating: 0,
		headshot:
			application.profilePhotoUrl || buildDefaultHeadshot(application.fullName),
		specialties: splitList(application.specialties),
		bio: application.bio,
		liftingExperience: application.liftingExperience || "",
		coachingExperience: application.coachingExperience || "",
		experience: normalizeExperience(application.yearsOfExperience),
		roster: normalizeRoster(application.currentRosterSize),
		coachingFormats: splitList(application.coachingFormats),
		inPersonCoaching: Boolean(application.inPersonCoaching),
		onlineTraining: Boolean(application.onlineTraining),
		remoteAvailable: Boolean(application.remoteAvailable),
		approved: true,
		applicationId: application.id,
		email: application.email,
		phone: application.phone,
		website: getWebsiteFromSocialLinks(application.socialLinks),
		socialLinks: application.socialLinks || [],
		certifications: splitList(application.certifications),
	};
}

function findStaticGymForApplication(application) {
	const gymName = compactString(application.gymName).toLowerCase();
	const gymCity = compactString(application.gymCity).toLowerCase();
	const gymState = normalizeStateAbbr(application.gymState);

	return staticGyms.find(
		(gym) =>
			compactString(gym.name).toLowerCase() === gymName &&
			compactString(gym.city).toLowerCase() === gymCity &&
			normalizeStateAbbr(gym.state) === gymState,
	);
}

function buildApprovedData(applications) {
	const createdGyms = [];
	const coaches = applications.map((application) => {
		const isOnlineOnly =
			Boolean(application.onlineTraining) && !Boolean(application.inPersonCoaching);

		if (isOnlineOnly && !application.gymName) {
			return buildCoachFromApplication(application, null);
		}

		const existingGym = findStaticGymForApplication(application);
		const gym = existingGym || buildGymFromApplication(application);
		if (!existingGym) createdGyms.push(gym);
		return buildCoachFromApplication(application, gym.id);
	});

	return {
		coaches,
		gyms: createdGyms,
	};
}

export async function refreshApprovedCoachCache() {
	if (!isSupabaseConfigured) {
		return getApprovedCache();
	}

	const applications = await getCoachApplications(
		COACH_APPLICATION_STATUSES.ACCEPTED,
	);
	const approvedData = buildApprovedData(applications);
	writeJson(APPROVED_CACHE_KEY, approvedData);
	return approvedData;
}

function getApprovedCache() {
	return readJson(APPROVED_CACHE_KEY, { coaches: [], gyms: [] });
}

export function getApprovedApplicationCoaches() {
	return getApprovedCache().coaches || [];
}

export function getCreatedApplicationGyms() {
	return getApprovedCache().gyms || [];
}

export function buildCoachApplicationNotificationPayload(application, reviewUrl) {
	const nameParts = splitFullName(application.fullName);
	const firstName = application.firstName || nameParts.firstName;
	const lastName = application.lastName || nameParts.lastName;
	const interviewDateTime = formatDateTimeForEmail(application.interviewDateTime);
	const bookingSummary = interviewDateTime || "the interview time they booked";
	const adminPortalUrl = reviewUrl;
	const applicantSubject = "Your BuildHer coach application was received";
	const applicantText = [
		`Hi ${firstName || application.fullName},`,
		"",
		"Thank you for submitting your BuildHer coach application. I received your application and will review it after your required 30 minute interview.",
		"",
		interviewDateTime
			? `Your interview is scheduled for ${interviewDateTime}.`
			: `Your interview link is ${application.interviewBookingUrl || "in your booking confirmation"}.`,
		"",
		"If you need to change the interview time, use the confirmation or calendar invite from your booking.",
		"",
		"Thank you,",
		"Carinne",
	].join("\n");
	const adminSubject = `${application.fullName} applied as a coach`;
	const adminText = [
		`${application.fullName} applied as a coach${
			application.coachTitle ? ` (${application.coachTitle})` : ""
		} and set up a meeting at ${bookingSummary}.`,
		"",
		`Email: ${application.email}`,
		`Phone: ${application.phone || "Not provided"}`,
		`Location: ${[application.city, application.state].filter(Boolean).join(", ") || "Not provided"}`,
		`Gym: ${[application.gymName, application.gymCity, application.gymState].filter(Boolean).join(", ") || "Not provided"}`,
		`Specialties: ${splitList(application.specialties).join(", ") || "Not provided"}`,
		"",
		`View in admin portal: ${adminPortalUrl}`,
	].join("\n");

	return {
		event: "coach_application_submitted",
		notifyEmail: COACH_APPLICATION_ADMIN_EMAIL,
		fromEmail: COACH_APPLICATION_ADMIN_EMAIL,
		reviewUrl,
		adminPortalUrl,
		applicantEmail: application.email,
		applicantEmailSubject: applicantSubject,
		applicantEmailBody: applicantText,
		adminEmail: COACH_APPLICATION_ADMIN_EMAIL,
		adminEmailSubject: `New coach application: ${application.fullName}`,
		adminEmailBody: adminText,
		applicationId: application.id,
		submittedAt: application.submittedAt,
		status: application.status,
		coachName: application.fullName,
		firstName,
		lastName,
		city: application.city,
		state: application.state,
		gymName: application.gymName,
		specialties: splitList(application.specialties),
		socialLinks: application.socialLinks || [],
		email: application.email,
		phone: application.phone,
		interview: {
			required: application.interviewRequired,
			acknowledged: application.interviewAcknowledged,
			bookingPageUrl: application.interviewBookingUrl,
			bookingDateTime: application.interviewDateTime,
			bookingDateTimeLabel: interviewDateTime,
			calendarInviteNote:
				"The saved interview link is captured from the booking flow when the scheduling embed provides one.",
		},
		emails: {
			applicantConfirmation: {
				to: application.email,
				from: COACH_APPLICATION_ADMIN_EMAIL,
				subject: applicantSubject,
				text: applicantText,
				html: textToHtml(applicantText),
			},
			adminSummary: {
				to: COACH_APPLICATION_ADMIN_EMAIL,
				from: COACH_APPLICATION_ADMIN_EMAIL,
				subject: adminSubject,
				text: adminText,
				html: textToHtml(adminText),
			},
		},
		application,
	};
}

export async function sendCoachApplicationNotification(application, reviewUrl) {
	const webhookUrl = import.meta.env?.VITE_COACH_APPLICATION_WEBHOOK_URL || "";
	const payload = buildCoachApplicationNotificationPayload(application, reviewUrl);

	if (!webhookUrl) {
		return {
			ok: false,
			skipped: true,
			reason: "VITE_COACH_APPLICATION_WEBHOOK_URL is not configured.",
			payload,
		};
	}

	try {
		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		return {
			ok: response.ok,
			status: response.status,
			skipped: false,
			payload,
		};
	} catch (error) {
		try {
			await fetch(webhookUrl, {
				method: "POST",
				mode: "no-cors",
				headers: { "Content-Type": "text/plain;charset=UTF-8" },
				body: JSON.stringify(payload),
			});

			return {
				ok: true,
				status: "sent-no-cors",
				skipped: false,
				warning:
					"Webhook was sent with no-cors because the browser could not read the Make response.",
				payload,
			};
		} catch (fallbackError) {
			return {
				ok: false,
				skipped: false,
				error: fallbackError,
				originalError: error,
				payload,
			};
		}
	}
}

export function fileToDataUrl(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ""));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}
