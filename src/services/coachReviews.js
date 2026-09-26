import { supabase } from "../lib/supabase";

export const COACH_REVIEWS_CHANGED_EVENT = "weightlisted:coach-reviews-changed";

const LOCAL_REVIEWS_KEY = "weightlisted.coachReviews.v1";
const REVIEW_BACKEND_MISSING_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

function compact(value) {
	return String(value ?? "").trim();
}

function clampRating(value) {
	return Math.max(1, Math.min(5, Math.round(Number(value) || 0)));
}

function publicDisplayName(profile, user) {
	const raw = compact(
		profile?.full_name ||
		profile?.display_name ||
		user?.user_metadata?.full_name ||
		user?.email?.split("@")[0] ||
		"Weightlisted member",
	);
	if (!raw || raw.includes("@")) return compact(user?.email?.split("@")[0]) || "Weightlisted member";
	const parts = raw.split(/\s+/).filter(Boolean);
	return parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0].toUpperCase()}.` : parts[0];
}

function readLocalReviews() {
	if (typeof window === "undefined") return [];
	try {
		const parsed = JSON.parse(window.localStorage.getItem(LOCAL_REVIEWS_KEY) || "[]");
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function writeLocalReviews(reviews) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(reviews));
	emitReviewChange();
}

function emitReviewChange() {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(COACH_REVIEWS_CHANGED_EVENT));
}

function rowToReview(row) {
	return {
		id: row.id,
		coachId: row.coach_id,
		reviewerUserId: row.reviewer_user_id,
		reviewerDisplayName: row.reviewer_display_name,
		reviewerAvatarUrl: row.reviewer_avatar_url || "",
		rating: Number(row.rating),
		body: row.body || "",
		coachResponse: row.coach_response || "",
		coachRespondedAt: row.coach_responded_at || null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function isBackendMissing(error) {
	return REVIEW_BACKEND_MISSING_CODES.has(error?.code);
}

export function summarizeCoachReviews(reviews = []) {
	const count = reviews.length;
	const average = count
		? reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / count
		: 0;
	const distribution = [5, 4, 3, 2, 1].map((rating) => ({
		rating,
		count: reviews.filter((review) => review.rating === rating).length,
	}));
	return { count, average, distribution };
}

export async function loadCoachReviews(coachId) {
	const normalizedCoachId = compact(coachId);
	if (!normalizedCoachId) return [];
	if (supabase) {
		const { data, error } = await supabase
			.from("coach_reviews")
			.select("id, coach_id, reviewer_user_id, reviewer_display_name, reviewer_avatar_url, rating, body, coach_response, coach_responded_at, created_at, updated_at")
			.eq("coach_id", normalizedCoachId)
			.order("updated_at", { ascending: false });
		if (!error) return (data || []).map(rowToReview);
		if (!isBackendMissing(error)) throw error;
	}
	return readLocalReviews()
		.filter((review) => review.coachId === normalizedCoachId)
		.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function saveCoachReview({ coachId, rating, body, user, profile }) {
	if (!user?.id) throw new Error("Sign in before writing a review.");
	const normalizedCoachId = compact(coachId);
	const normalizedBody = compact(body).slice(0, 1500);
	const normalizedRating = clampRating(rating);
	if (!normalizedCoachId) throw new Error("This coach could not be identified.");
	if (!normalizedRating) throw new Error("Choose a rating.");

	if (supabase) {
		const { data, error } = await supabase.rpc("submit_coach_review", {
			p_coach_id: normalizedCoachId,
			p_rating: normalizedRating,
			p_body: normalizedBody,
		});
		if (!error) {
			emitReviewChange();
			return rowToReview(Array.isArray(data) ? data[0] : data);
		}
		if (!isBackendMissing(error)) throw error;
	}

	const now = new Date().toISOString();
	const reviews = readLocalReviews();
	const existingIndex = reviews.findIndex(
		(review) => review.coachId === normalizedCoachId && review.reviewerUserId === user.id,
	);
	const nextReview = {
		id: existingIndex >= 0 ? reviews[existingIndex].id : `local-review-${Date.now()}`,
		coachId: normalizedCoachId,
		reviewerUserId: user.id,
		reviewerDisplayName: publicDisplayName(profile, user),
		reviewerAvatarUrl: profile?.profile_visible === false ? "" : compact(profile?.avatar_url),
		rating: normalizedRating,
		body: normalizedBody,
		coachResponse: existingIndex >= 0 ? reviews[existingIndex].coachResponse || "" : "",
		coachRespondedAt: existingIndex >= 0 ? reviews[existingIndex].coachRespondedAt || null : null,
		createdAt: existingIndex >= 0 ? reviews[existingIndex].createdAt : now,
		updatedAt: now,
	};
	if (existingIndex >= 0) reviews[existingIndex] = nextReview;
	else reviews.push(nextReview);
	writeLocalReviews(reviews);
	return nextReview;
}

export async function deleteCoachReview({ coachId, userId }) {
	if (!userId) throw new Error("Sign in before deleting a review.");
	const normalizedCoachId = compact(coachId);
	if (supabase) {
		const { error } = await supabase.rpc("delete_my_coach_review", {
			p_coach_id: normalizedCoachId,
		});
		if (!error) {
			emitReviewChange();
			return;
		}
		if (!isBackendMissing(error)) throw error;
	}
	writeLocalReviews(readLocalReviews().filter(
		(review) => !(review.coachId === normalizedCoachId && review.reviewerUserId === userId),
	));
}

export async function saveCoachReviewResponse({ reviewId, response, coachId }) {
	const normalizedResponse = compact(response).slice(0, 1000);
	if (!reviewId) throw new Error("This review could not be identified.");
	if (supabase) {
		const { data, error } = await supabase.rpc("respond_to_coach_review", {
			p_review_id: reviewId,
			p_response: normalizedResponse,
		});
		if (!error) {
			emitReviewChange();
			return rowToReview(Array.isArray(data) ? data[0] : data);
		}
		if (!isBackendMissing(error)) throw error;
	}
	const now = new Date().toISOString();
	const reviews = readLocalReviews();
	const index = reviews.findIndex(
		(review) => review.id === reviewId && review.coachId === compact(coachId),
	);
	if (index < 0) throw new Error("Review not found.");
	reviews[index] = {
		...reviews[index],
		coachResponse: normalizedResponse,
		coachRespondedAt: normalizedResponse ? now : null,
	};
	writeLocalReviews(reviews);
	return reviews[index];
}
