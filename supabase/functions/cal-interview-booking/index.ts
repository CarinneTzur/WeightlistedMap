const CAL_API_BASE_URL = "https://api.cal.com/v2";
const CAL_LIST_BOOKINGS_API_VERSION = "2026-05-01";
const CAL_GET_BOOKING_API_VERSION = "2026-02-25";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CalBooking = {
	uid?: string;
	start?: string;
	location?: unknown;
	meetingUrl?: unknown;
	eventType?: {
		slug?: string;
	};
	attendees?: Array<{
		email?: string;
		displayEmail?: string;
		name?: string;
	}>;
	[key: string]: unknown;
};

type BookingLookupBody = {
	bookingUid?: string;
	attendeeEmail?: string;
	attendeeName?: string;
	eventTypeSlug?: string;
	fallbackUrl?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...corsHeaders,
			"Content-Type": "application/json",
		},
	});
}

function compactString(value: unknown) {
	return String(value ?? "").trim();
}

function isHttpUrl(value: unknown) {
	try {
		const url = new URL(compactString(value));
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}

function collectUrls(value: unknown, path: string[] = []) {
	if (!value) return [] as Array<{ url: string; keyPath: string }>;

	if (typeof value === "string") {
		return isHttpUrl(value)
			? [{ url: value, keyPath: path.join(".").toLowerCase() }]
			: [];
	}

	if (Array.isArray(value)) {
		return value.flatMap((item, index) =>
			collectUrls(item, [...path, String(index)]),
		);
	}

	if (typeof value === "object") {
		return Object.entries(value as Record<string, unknown>).flatMap(
			([key, item]) => collectUrls(item, [...path, key]),
		);
	}

	return [];
}

function getMeetingUrl(booking: CalBooking) {
	const urls = collectUrls(booking);
	const calVideoUrl = urls.find(({ url }) =>
		/^https?:\/\/(?:app\.)?cal\.com\/video\//i.test(url),
	);
	if (calVideoUrl) return calVideoUrl.url;

	const meetingUrl = urls.find(({ keyPath }) => keyPath.includes("meetingurl"));
	if (meetingUrl) return meetingUrl.url;

	const locationUrl = urls.find(({ keyPath }) => keyPath.includes("location"));
	if (locationUrl) return locationUrl.url;

	const likelyUrl = urls.find(({ keyPath }) =>
		/(video|conference|join|meeting|url|link)/i.test(keyPath),
	);

	return likelyUrl?.url || "";
}

function hasMatchingEventType(booking: CalBooking, eventTypeSlug: string) {
	if (!eventTypeSlug) return true;
	return compactString(booking.eventType?.slug).toLowerCase() ===
		eventTypeSlug.toLowerCase();
}

function hasMatchingAttendeeEmail(booking: CalBooking, attendeeEmail: string) {
	if (!attendeeEmail) return true;
	const normalizedEmail = attendeeEmail.toLowerCase();
	return (booking.attendees || []).some((attendee) =>
		[attendee.email, attendee.displayEmail]
			.map((value) => compactString(value).toLowerCase())
			.includes(normalizedEmail),
	);
}

function pickBooking(
	bookings: CalBooking[],
	{ attendeeEmail, eventTypeSlug }: BookingLookupBody,
) {
	const matchingBookings = bookings.filter(
		(booking) =>
			hasMatchingEventType(booking, compactString(eventTypeSlug)) &&
			hasMatchingAttendeeEmail(booking, compactString(attendeeEmail)),
	);

	return matchingBookings.sort((left, right) => {
		const leftCreated = Date.parse(compactString(left.createdAt));
		const rightCreated = Date.parse(compactString(right.createdAt));
		return (rightCreated || 0) - (leftCreated || 0);
	})[0];
}

async function fetchCal(path: string, apiVersion: string) {
	const calApiKey = Deno.env.get("CAL_API_KEY");

	if (!calApiKey) {
		throw new Error("CAL_API_KEY is not configured.");
	}

	const response = await fetch(`${CAL_API_BASE_URL}${path}`, {
		headers: {
			Authorization: `Bearer ${calApiKey}`,
			"cal-api-version": apiVersion,
		},
	});

	const body = await response.json().catch(() => ({}));

	if (!response.ok) {
		throw new Error(
			compactString((body as { message?: string }).message) ||
				`Cal API request failed with ${response.status}.`,
		);
	}

	return body as { data?: CalBooking | CalBooking[] };
}

async function getBookingByUid(bookingUid: string) {
	if (!bookingUid) return null;

	const query = new URLSearchParams({
		bookingUid,
		limit: "1",
	});
	const listed = await fetchCal(
		`/bookings?${query.toString()}`,
		CAL_LIST_BOOKINGS_API_VERSION,
	);
	const listedBooking = Array.isArray(listed.data) ? listed.data[0] : null;
	if (listedBooking) return listedBooking;

	const direct = await fetchCal(
		`/bookings/${encodeURIComponent(bookingUid)}`,
		CAL_GET_BOOKING_API_VERSION,
	);

	return Array.isArray(direct.data) ? direct.data[0] : direct.data || null;
}

async function getRecentBooking(body: BookingLookupBody) {
	const attendeeEmail = compactString(body.attendeeEmail);
	const attendeeName = compactString(body.attendeeName);
	if (!attendeeEmail && !attendeeName) return null;

	const afterCreatedAt = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
	const query = new URLSearchParams({
		status: "upcoming",
		afterCreatedAt,
		sortCreated: "desc",
		limit: "10",
	});

	if (attendeeEmail) query.set("attendeeEmail", attendeeEmail);
	if (!attendeeEmail && attendeeName) query.set("attendeeName", attendeeName);

	const response = await fetchCal(
		`/bookings?${query.toString()}`,
		CAL_LIST_BOOKINGS_API_VERSION,
	);

	const bookings = Array.isArray(response.data) ? response.data : [];
	return pickBooking(bookings, body) || null;
}

Deno.serve(async (request) => {
	if (request.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders });
	}

	if (request.method !== "POST") {
		return jsonResponse({ error: "Method not allowed." }, 405);
	}

	try {
		const body = (await request.json().catch(() => ({}))) as BookingLookupBody;
		const fallbackUrl = compactString(body.fallbackUrl);
		const booking =
			(await getBookingByUid(compactString(body.bookingUid))) ||
			(await getRecentBooking(body));
		const interviewBookingUrl = booking ? getMeetingUrl(booking) : "";

		return jsonResponse({
			ok: true,
			bookingUid: compactString(booking?.uid) || compactString(body.bookingUid),
			interviewBookingUrl: interviewBookingUrl || fallbackUrl,
			interviewDateTime: compactString(booking?.start),
			found: Boolean(booking),
		});
	} catch (error) {
		return jsonResponse(
			{
				ok: false,
				error: error instanceof Error ? error.message : "Cal lookup failed.",
			},
			500,
		);
	}
});
