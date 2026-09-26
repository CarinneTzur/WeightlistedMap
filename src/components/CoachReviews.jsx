import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
	COACH_REVIEWS_CHANGED_EVENT,
	deleteCoachReview,
	loadCoachReviews,
	saveCoachReview,
	saveCoachReviewResponse,
	summarizeCoachReviews,
} from "../services/coachReviews";
import "./CoachReviews.css";

function formatReviewDate(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(date);
}

function Stars({ value, label = true }) {
	return (
		<span className="coach-review-stars" aria-label={label ? `${value} out of 5 stars` : undefined} aria-hidden={label ? undefined : "true"}>
			{[1, 2, 3, 4, 5].map((star) => <span key={star} className={star <= value ? "is-filled" : ""}>★</span>)}
		</span>
	);
}

function ReviewerAvatar({ review }) {
	if (review.reviewerAvatarUrl) {
		return <img className="coach-review-avatar" src={review.reviewerAvatarUrl} alt="" />;
	}
	const initials = String(review.reviewerDisplayName || "W")
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");
	return <span className="coach-review-avatar coach-review-avatar--fallback" aria-hidden="true">{initials || "W"}</span>;
}

function ReviewForm({ existingReview, onCancel, onSaved }) {
	const { user, profile } = useAuth();
	const [rating, setRating] = useState(existingReview?.rating || 0);
	const [body, setBody] = useState(existingReview?.body || "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	async function submit(event) {
		event.preventDefault();
		if (!rating) {
			setError("Choose a star rating.");
			return;
		}
		setBusy(true);
		setError("");
		try {
			await onSaved({ rating, body, user, profile });
		} catch (saveError) {
			setError(saveError?.message || "Your review could not be saved.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className="coach-review-form" onSubmit={submit}>
			<header>
				<div>
					<span>{existingReview ? "Update your review" : "Write a review"}</span>
					<strong>How was your experience?</strong>
				</div>
				<button type="button" onClick={onCancel} aria-label="Close review form">×</button>
			</header>
			<div className="coach-review-rating-input" role="radiogroup" aria-label="Rating">
				{[1, 2, 3, 4, 5].map((star) => (
					<button
						type="button"
						key={star}
						className={star <= rating ? "is-selected" : ""}
						onClick={() => setRating(star)}
						role="radio"
						aria-checked={rating === star}
						aria-label={`${star} star${star === 1 ? "" : "s"}`}
					>
						★
					</button>
				))}
			</div>
			<label>
				<span>Share a few details <small>Optional</small></span>
				<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={1500} rows={5} placeholder="What stood out about working with this coach?" />
			</label>
			<p>Your name is shown with your review. Your email always stays private.</p>
			{error ? <div className="coach-review-error" role="alert">{error}</div> : null}
			<div className="coach-review-form-actions">
				<button type="button" onClick={onCancel}>Cancel</button>
				<button type="submit" disabled={busy}>{busy ? "Saving…" : existingReview ? "Save changes" : "Post review"}</button>
			</div>
		</form>
	);
}

function ReviewCard({ review, isMine, onEdit, onDelete }) {
	return (
		<article className="coach-review-card">
			<header>
				<ReviewerAvatar review={review} />
				<div>
					<strong>{review.reviewerDisplayName}</strong>
					<span>{formatReviewDate(review.updatedAt || review.createdAt)}</span>
				</div>
				{isMine ? <div className="coach-review-card-actions"><button type="button" onClick={onEdit}>Edit</button><button type="button" onClick={onDelete}>Delete</button></div> : null}
			</header>
			<Stars value={review.rating} />
			{review.body ? <p>{review.body}</p> : null}
			{review.coachResponse ? (
				<div className="coach-review-response">
					<strong>Response from the coach</strong>
					<p>{review.coachResponse}</p>
				</div>
			) : null}
		</article>
	);
}

export default function CoachReviews({ coach, onBack }) {
	const { user, profile, requireAuth } = useAuth();
	const [reviews, setReviews] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [editing, setEditing] = useState(false);
	const summary = useMemo(() => summarizeCoachReviews(reviews), [reviews]);
	const myReview = reviews.find((review) => review.reviewerUserId === user?.id) || null;

	const refresh = useCallback(async () => {
		try {
			setError("");
			setReviews(await loadCoachReviews(coach.id));
		} catch (loadError) {
			setError(loadError?.message || "Reviews could not be loaded.");
		} finally {
			setLoading(false);
		}
	}, [coach.id]);

	useEffect(() => {
		refresh();
		window.addEventListener(COACH_REVIEWS_CHANGED_EVENT, refresh);
		window.addEventListener("storage", refresh);
		return () => {
			window.removeEventListener(COACH_REVIEWS_CHANGED_EVENT, refresh);
			window.removeEventListener("storage", refresh);
		};
	}, [refresh]);

	function beginReview() {
		if (user) {
			setEditing(true);
			return;
		}
		requireAuth({ reason: "account", onAuthenticated: () => setEditing(true) });
	}

	async function save(values) {
		await saveCoachReview({ coachId: coach.id, ...values });
		setEditing(false);
		await refresh();
	}

	async function removeMine() {
		if (!myReview || !window.confirm("Delete your review?")) return;
		try {
			await deleteCoachReview({ coachId: coach.id, userId: user.id });
			await refresh();
		} catch (deleteError) {
			setError(deleteError?.message || "Your review could not be deleted.");
		}
	}

	return (
		<div className="coach-reviews-panel coach-scroll-panel">
			<header className="coach-reviews-header">
				<button type="button" onClick={onBack} aria-label="Back to coach profile">←</button>
				<div><span>Coach reviews</span><h2>{coach.name}</h2></div>
			</header>
			<section className="coach-review-summary">
				<div className="coach-review-summary-score">
					<strong>{summary.count ? summary.average.toFixed(1) : "New"}</strong>
					{summary.count ? <Stars value={Math.round(summary.average)} /> : <span>No ratings yet</span>}
					<small>{summary.count} {summary.count === 1 ? "review" : "reviews"}</small>
				</div>
				<div className="coach-review-distribution">
					{summary.distribution.map((row) => <div key={row.rating}><span>{row.rating}</span><i><b style={{ width: summary.count ? `${(row.count / summary.count) * 100}%` : "0%" }} /></i></div>)}
				</div>
			</section>
			{editing ? <ReviewForm key={myReview?.updatedAt || "new"} existingReview={myReview} onCancel={() => setEditing(false)} onSaved={save} /> : (
				<button type="button" className="coach-review-write-button" onClick={beginReview}>{myReview ? "Edit your review" : "Write a review"}</button>
			)}
			{error ? <div className="coach-review-error" role="alert">{error}</div> : null}
			<div className="coach-review-list">
				{loading ? <div className="coach-review-empty">Loading reviews…</div> : null}
				{!loading && !reviews.length ? <div className="coach-review-empty"><strong>No reviews yet</strong><p>Be the first to share your experience with {coach.name.split(" ")[0]}.</p></div> : null}
				{reviews.map((review) => <ReviewCard key={review.id} review={review} isMine={review.reviewerUserId === user?.id} onEdit={() => setEditing(true)} onDelete={removeMine} />)}
			</div>
		</div>
	);
}

export function CoachReviewManager({ coachId, coachName }) {
	const [reviews, setReviews] = useState([]);
	const [drafts, setDrafts] = useState({});
	const [busyId, setBusyId] = useState("");
	const [error, setError] = useState("");

	const refresh = useCallback(async () => {
		try {
			setReviews(await loadCoachReviews(coachId));
			setError("");
		} catch (loadError) {
			setError(loadError?.message || "Reviews could not be loaded.");
		}
	}, [coachId]);

	useEffect(() => {
		refresh();
		window.addEventListener(COACH_REVIEWS_CHANGED_EVENT, refresh);
		return () => window.removeEventListener(COACH_REVIEWS_CHANGED_EVENT, refresh);
	}, [refresh]);

	async function respond(review) {
		setBusyId(review.id);
		setError("");
		try {
			await saveCoachReviewResponse({ reviewId: review.id, response: drafts[review.id] ?? review.coachResponse, coachId });
			await refresh();
		} catch (responseError) {
			setError(responseError?.message || "Your response could not be saved.");
		} finally {
			setBusyId("");
		}
	}

	return (
		<section className="coach-review-manager">
			<header><div><span>Public feedback</span><h2>Reviews</h2></div><small>{reviews.length} total</small></header>
			<p>Clients can leave one review each. You can publish one response beneath every review.</p>
			{error ? <div className="coach-review-error" role="alert">{error}</div> : null}
			{!reviews.length ? <div className="coach-review-empty"><strong>No reviews yet</strong><p>Reviews for {coachName} will appear here.</p></div> : null}
			<div className="coach-review-manager-list">
				{reviews.map((review) => (
					<article key={review.id}>
						<header><div><strong>{review.reviewerDisplayName}</strong><span>{formatReviewDate(review.updatedAt)}</span></div><Stars value={review.rating} /></header>
						{review.body ? <p>{review.body}</p> : null}
						<label><span>Your public response</span><textarea rows={3} maxLength={1000} value={drafts[review.id] ?? review.coachResponse} onChange={(event) => setDrafts((current) => ({ ...current, [review.id]: event.target.value }))} placeholder="Thank the client or add helpful context." /></label>
						<button type="button" onClick={() => respond(review)} disabled={busyId === review.id}>{busyId === review.id ? "Saving…" : review.coachResponse ? "Update response" : "Publish response"}</button>
					</article>
				))}
			</div>
		</section>
	);
}
