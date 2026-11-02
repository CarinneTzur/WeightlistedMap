import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { FOUNDER_PREVIEW_COACH_ID } from "../../data/founderPreview";
import {
	COACH_REVIEWS_CHANGED_EVENT,
	deleteCoachReview,
	loadCoachReviewReplies,
	loadCoachReviews,
	saveCoachReview,
	saveCoachReviewReply,
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

function ReviewReplyThread({
	review,
	canReplyToRole,
	authorRole,
	authorDisplayName,
	coachId = "",
	user = null,
	profile = null,
}) {
	const [replies, setReplies] = useState([]);
	const [replyTarget, setReplyTarget] = useState(null);
	const [body, setBody] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	const refresh = useCallback(async () => {
		try {
			setReplies(await loadCoachReviewReplies(review.id));
			setError("");
		} catch (loadError) {
			setError(loadError?.message || "Review replies could not be loaded.");
		}
	}, [review.id]);

	useEffect(() => {
		refresh();
		window.addEventListener(COACH_REVIEWS_CHANGED_EVENT, refresh);
		return () => window.removeEventListener(COACH_REVIEWS_CHANGED_EVENT, refresh);
	}, [refresh]);

	async function postReply(event) {
		event.preventDefault();
		if (!replyTarget || !body.trim()) return;
		setBusy(true);
		setError("");
		try {
			await saveCoachReviewReply({
				reviewId: review.id,
				parentReplyId: replyTarget.id,
				body,
				user,
				profile,
				coachId,
				authorRole,
				authorDisplayName,
			});
			setBody("");
			setReplyTarget(null);
			await refresh();
		} catch (replyError) {
			setError(replyError?.message || "Your reply could not be posted.");
		} finally {
			setBusy(false);
		}
	}

	function renderReply(reply, depth = 0) {
		const children = replies.filter((item) => item.parentReplyId === reply.id);
		return (
			<div key={reply.id} className={`coach-review-thread-reply is-${reply.authorRole}`} style={{ "--review-reply-depth": Math.min(depth, 4) }}>
				<header><strong>{reply.authorDisplayName}</strong><span>{reply.authorRole === "coach" ? "Coach" : "Client"} · {formatReviewDate(reply.createdAt)}{reply.isMock ? " · Preview" : ""}</span></header>
				<p>{reply.body}</p>
				{canReplyToRole(reply.authorRole) ? <button type="button" onClick={() => { setReplyTarget({ id: reply.id, name: reply.authorDisplayName }); setBody(""); }}>Reply</button> : null}
				{children.map((child) => renderReply(child, depth + 1))}
			</div>
		);
	}

	const roots = replies.filter((reply) => !reply.parentReplyId);
	return (
		<div className="coach-review-thread">
			{review.coachResponse ? (
				<div className="coach-review-response">
					<header><strong>Response from the coach</strong><span>{formatReviewDate(review.coachRespondedAt)}</span></header>
					<p>{review.coachResponse}</p>
					{canReplyToRole("coach") ? <button type="button" onClick={() => { setReplyTarget({ id: null, name: "the coach" }); setBody(""); }}>Reply</button> : null}
				</div>
			) : null}
			{roots.map((reply) => renderReply(reply))}
			{replyTarget ? (
				<form className="coach-review-thread-composer" onSubmit={postReply}>
					<span>Replying to {replyTarget.name}</span>
					<textarea rows={3} maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a public reply" autoFocus />
					<div><button type="button" onClick={() => { setReplyTarget(null); setBody(""); }}>Cancel</button><button type="submit" disabled={busy || !body.trim()}>{busy ? "Posting…" : "Post reply"}</button></div>
				</form>
			) : null}
			{error ? <div className="coach-review-error" role="alert">{error}</div> : null}
		</div>
	);
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

function ReviewCard({ review, isMine, onEdit, onDelete, user, profile }) {
	return (
		<article className="coach-review-card">
			<header>
				<ReviewerAvatar review={review} />
				<div>
					<strong>{review.reviewerDisplayName}</strong>
					<span>{formatReviewDate(review.updatedAt || review.createdAt)}{review.isMock ? " · Preview" : ""}</span>
				</div>
				{isMine ? <div className="coach-review-card-actions"><button type="button" onClick={onEdit}>Edit</button><button type="button" onClick={onDelete}>Delete</button></div> : null}
			</header>
			<Stars value={review.rating} />
			{review.body ? <p>{review.body}</p> : null}
			{review.coachResponse ? <ReviewReplyThread review={review} canReplyToRole={(role) => isMine && role === "coach"} authorRole="reviewer" authorDisplayName={review.reviewerDisplayName} user={user} profile={profile} /> : null}
		</article>
	);
}

export default function CoachReviews({ coach, onBack }) {
	const { user, profile, requireAuth } = useAuth();
	const [reviews, setReviews] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [editing, setEditing] = useState(false);
	const [ratingFilter, setRatingFilter] = useState(null);
	const summary = useMemo(() => summarizeCoachReviews(reviews), [reviews]);
	const visibleReviews = useMemo(
		() => ratingFilter ? reviews.filter((review) => Number(review.rating) === ratingFilter) : reviews,
		[ratingFilter, reviews],
	);
	const myReview = reviews.find((review) => review.reviewerUserId === user?.id) || null;
	const previewReviews = coach.id === FOUNDER_PREVIEW_COACH_ID;

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

	useEffect(() => {
		setRatingFilter(null);
	}, [coach.id]);

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
					<button type="button" className="coach-review-summary-count" onClick={() => setRatingFilter(null)} aria-pressed={ratingFilter === null}>
						{summary.count} {summary.count === 1 ? "review" : "reviews"}
					</button>
				</div>
				<div className="coach-review-distribution">
					{summary.distribution.map((row) => (
						<button
							type="button"
							key={row.rating}
							className={ratingFilter === row.rating ? "is-active" : ""}
							onClick={() => setRatingFilter((current) => current === row.rating ? null : row.rating)}
							aria-pressed={ratingFilter === row.rating}
							aria-label={`${ratingFilter === row.rating ? "Show all reviews" : `Show ${row.rating}-star reviews`}; ${row.count} ${row.count === 1 ? "review" : "reviews"}`}
						>
							<span>{row.rating}</span>
							<i><b style={{ width: summary.count ? `${(row.count / summary.count) * 100}%` : "0%" }} /></i>
						</button>
					))}
				</div>
			</section>
			{previewReviews ? <div className="coach-review-preview-note">Preview reviews — examples only, not real client testimonials.</div> : editing ? <ReviewForm key={myReview?.updatedAt || "new"} existingReview={myReview} onCancel={() => setEditing(false)} onSaved={save} /> : (
				<button type="button" className="coach-review-write-button" onClick={beginReview}>{myReview ? "Edit your review" : "Write a review"}</button>
			)}
			{error ? <div className="coach-review-error" role="alert">{error}</div> : null}
			<div className="coach-review-list">
				{loading ? <div className="coach-review-empty">Loading reviews…</div> : null}
				{!loading && !reviews.length ? <div className="coach-review-empty"><strong>No reviews yet</strong><p>Be the first to share your experience with {coach.name.split(" ")[0]}.</p></div> : null}
				{!loading && reviews.length && !visibleReviews.length ? <div className="coach-review-empty"><strong>No {ratingFilter}-star reviews</strong><p>Choose another rating or view every review.</p><button type="button" onClick={() => setRatingFilter(null)}>Show all reviews</button></div> : null}
				{visibleReviews.map((review) => <ReviewCard key={review.id} review={review} isMine={review.reviewerUserId === user?.id} onEdit={() => setEditing(true)} onDelete={removeMine} user={user} profile={profile} />)}
			</div>
		</div>
	);
}

export function CoachReviewManager({ coachId, coachName }) {
	const [reviews, setReviews] = useState([]);
	const [drafts, setDrafts] = useState({});
	const [busyId, setBusyId] = useState("");
	const [error, setError] = useState("");
	const previewReviews = coachId === FOUNDER_PREVIEW_COACH_ID;

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
		if (review.coachResponse) return;
		setBusyId(review.id);
		setError("");
		try {
			await saveCoachReviewResponse({ reviewId: review.id, response: drafts[review.id] || "", coachId });
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
			<p>{previewReviews ? "These example reviews show how client feedback and coach responses will look. Your response edits stay in this browser." : "Clients can leave one review each. You can publish one response beneath every review."}</p>
			{previewReviews ? <div className="coach-review-preview-note">Preview data — not real client testimonials.</div> : null}
			{error ? <div className="coach-review-error" role="alert">{error}</div> : null}
			{!reviews.length ? <div className="coach-review-empty"><strong>No reviews yet</strong><p>Reviews for {coachName} will appear here.</p></div> : null}
			<div className="coach-review-manager-list">
				{reviews.map((review) => (
					<article key={review.id}>
						<header><div><strong>{review.reviewerDisplayName}</strong><span>{formatReviewDate(review.updatedAt)}{review.isMock ? " · Preview" : ""}</span></div><Stars value={review.rating} /></header>
						{review.body ? <p>{review.body}</p> : null}
						{review.coachResponse ? (
							<ReviewReplyThread review={review} canReplyToRole={(role) => role === "reviewer"} authorRole="coach" authorDisplayName={coachName} coachId={coachId} />
						) : (
							<>
								<label><span>Your public response <small>Posts once and cannot be edited</small></span><textarea rows={3} maxLength={1000} value={drafts[review.id] || ""} onChange={(event) => setDrafts((current) => ({ ...current, [review.id]: event.target.value }))} placeholder="Thank the client or add helpful context." /></label>
								<button type="button" onClick={() => respond(review)} disabled={busyId === review.id || !drafts[review.id]?.trim()}>{busyId === review.id ? "Posting…" : "Post response"}</button>
							</>
						)}
					</article>
				))}
			</div>
		</section>
	);
}
