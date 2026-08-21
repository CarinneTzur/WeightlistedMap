export const SERVICE_CATEGORIES = [
	{
		id: "quick_help",
		label: "Quick Help",
		description: "Send a focused request for an available coach to review.",
		examples: "Form feedback • PR review • posing feedback • training feedback",
	},
	{
		id: "accountability",
		label: "Accountability",
		description: "Get short-term check-ins without an ongoing coaching plan.",
		examples: "Training • nutrition • competition prep • short-term goals",
	},
	{
		id: "session",
		label: "Session",
		description: "Work directly with a coach for one focused live session.",
		examples: "Technique • posing • workout guidance • competition practice",
	},
	{
		id: "competition",
		label: "Competition",
		description: "Get specialized support before, during, or after an event.",
		examples: "Powerlifting • Olympic weightlifting • bodybuilding",
	},
];

export const REQUEST_TYPES = {
	quick_help: [
		{ id: "form_review", label: "Form Review", description: "Technique feedback on a lift or movement." },
		{ id: "attempt_review", label: "PR / Attempt Review", description: "Review a PR, competition attempt, or training attempt." },
		{ id: "posing_review", label: "Posing Review", description: "Feedback on presentation, transitions, and positioning." },
		{ id: "training_feedback", label: "Training Feedback", description: "A focused look at training, programming, or execution." },
		{ id: "other", label: "Other", description: "Tell us what you’d like a coach to review." },
	],
	accountability: [
		{ id: "training_accountability", label: "Training", description: "Message check-ins around your planned training." },
		{ id: "nutrition_accountability", label: "Nutrition", description: "Simple check-ins around a nutrition habit or goal." },
		{ id: "competition_accountability", label: "Competition Prep", description: "Stay on track with short-term preparation tasks." },
		{ id: "general_accountability", label: "General Fitness", description: "Stay consistent with one short-term fitness goal." },
		{ id: "other_accountability", label: "Other", description: "Get check-ins for one clearly defined goal." },
	],
	session: [
		{ id: "technique_session", label: "Technique Session", description: "Live remote coaching for a lift or movement." },
		{ id: "posing_session", label: "Posing Session", description: "Practice posing live with a qualified coach." },
		{ id: "workout_guidance", label: "Workout Guidance", description: "Focused guidance during a remote workout." },
		{ id: "competition_practice", label: "Competition Practice", description: "Practice commands, attempts, posing, or event routines." },
		{ id: "other_session", label: "Other", description: "Describe the live session you need." },
	],
};

export const COMPETITION_SPORTS = [
	{
		id: "powerlifting",
		label: "Powerlifting",
		description: "Meet preparation, attempt strategy, or meet-day support.",
	},
	{
		id: "olympic_weightlifting",
		label: "Olympic Weightlifting",
		description: "Competition preparation, lift strategy, or competition-day support.",
	},
	{
		id: "bodybuilding",
		label: "Bodybuilding",
		description: "Show preparation, posing, or show-day support.",
	},
	{
		id: "other",
		label: "Other",
		description: "Support for another strength or physique competition.",
	},
];

export const COMPETITION_REQUEST_TYPES = {
	powerlifting: ["Meet Prep", "Meet-Day Support", "Post-Meet Review"],
	olympic_weightlifting: ["Competition Prep", "Competition-Day Support", "Post-Competition Review"],
	bodybuilding: ["Show Prep Support", "Posing Practice", "Show-Day Support", "Post-Show Review"],
	other: ["Competition Prep", "Event-Day Support", "Post-Event Review"],
};

export const TRAINING_DISCIPLINES = [
	{ id: "powerlifting", label: "Powerlifting" },
	{ id: "bodybuilding", label: "Bodybuilding" },
	{ id: "olympic_weightlifting", label: "Olympic Weightlifting" },
	{ id: "recreational_strength", label: "Recreational Strength" },
	{ id: "other", label: "Other" },
];

const TRAINING_ACCOUNTABILITY_DURATIONS = ["One workout", "A few days", "One week"];
const DAY_BASED_ACCOUNTABILITY_DURATIONS = ["One day", "A few days", "One week"];

export function getAccountabilityDurations(requestType) {
	return requestType === "training_accountability"
		? TRAINING_ACCOUNTABILITY_DURATIONS
		: DAY_BASED_ACCOUNTABILITY_DURATIONS;
}

const makeFixedPrice = (id, amountUsd, description) => ({
	id,
	label: `$${amountUsd}`,
	amountUsd,
	description,
});

const QUICK_HELP_PRICES = {
	form_review: makeFixedPrice(
		"form_review_fixed_4",
		4,
		"Send videos or photos of the movement. We’ll notify you when a coach responds.",
	),
	attempt_review: makeFixedPrice(
		"attempt_review_fixed_5",
		5,
		"Send your attempt. We’ll notify you when a coach responds.",
	),
	posing_review: makeFixedPrice(
		"posing_review_fixed_5",
		5,
		"Send your posing videos or photos. We’ll notify you when a coach responds.",
	),
	training_feedback: makeFixedPrice(
		"training_feedback_fixed_6",
		6,
		"Share one focused training question. We’ll notify you when a coach responds.",
	),
	other: makeFixedPrice(
		"quick_other_fixed_6",
		6,
		"Tell us what you need help with. We’ll notify you when a coach responds.",
	),
};

const ACCOUNTABILITY_PRICES = {
	training_accountability: {
		"One workout": makeFixedPrice(
			"training_one_workout_fixed_5",
			5,
			"A brief message check-in before and after one workout.",
		),
		"A few days": makeFixedPrice(
			"training_few_days_fixed_8",
			8,
			"Light training check-ins by message across a few days.",
		),
		"One week": makeFixedPrice(
			"training_one_week_fixed_15",
			15,
			"Light training check-ins by message for one week.",
		),
	},
	nutrition_accountability: {
		"One day": makeFixedPrice(
			"nutrition_one_day_fixed_4",
			4,
			"One day of simple nutrition accountability by message.",
		),
		"A few days": makeFixedPrice(
			"nutrition_few_days_fixed_8",
			8,
			"Simple nutrition check-ins by message across a few days.",
		),
		"One week": makeFixedPrice(
			"nutrition_one_week_fixed_15",
			15,
			"Simple nutrition check-ins by message for one week.",
		),
	},
	competition_accountability: {
		"One day": makeFixedPrice(
			"competition_accountability_one_day_fixed_5",
			5,
			"One day of focused preparation check-ins by message.",
		),
		"A few days": makeFixedPrice(
			"competition_accountability_few_days_fixed_10",
			10,
			"Preparation check-ins by message across a few days.",
		),
		"One week": makeFixedPrice(
			"competition_accountability_one_week_fixed_15",
			15,
			"Light preparation check-ins by message for one week.",
		),
	},
	general_accountability: {
		"One day": makeFixedPrice(
			"general_one_day_fixed_4",
			4,
			"One day of simple goal check-ins by message.",
		),
		"A few days": makeFixedPrice("general_few_days_fixed_8", 8, "Simple goal check-ins by message across a few days."),
		"One week": makeFixedPrice("general_one_week_fixed_15", 15, "Simple goal check-ins by message for one week."),
	},
	other_accountability: {
		"One day": makeFixedPrice(
			"other_accountability_one_day_fixed_4",
			4,
			"One day of check-ins for one clearly defined goal.",
		),
		"A few days": makeFixedPrice("other_accountability_few_days_fixed_8", 8, "Brief check-ins across a few days."),
		"One week": makeFixedPrice("other_accountability_one_week_fixed_15", 15, "Brief check-ins for one week."),
	},
};

const SESSION_PRICES = {
	technique_session: makeFixedPrice(
		"technique_session_fixed_15",
		15,
		"One focused 30-minute remote session.",
	),
	posing_session: makeFixedPrice(
		"posing_session_fixed_15",
		15,
		"One focused 30-minute remote session.",
	),
	workout_guidance: makeFixedPrice(
		"workout_guidance_fixed_18",
		18,
		"One focused 30-minute remote workout session.",
	),
	competition_practice: makeFixedPrice(
		"competition_practice_fixed_18",
		18,
		"One focused 30-minute remote practice session.",
	),
	other_session: makeFixedPrice(
		"other_session_fixed_15",
		15,
		"One focused 30-minute remote session.",
	),
};

function competitionPriceTier(requestType) {
	const normalizedType = String(requestType || "").toLowerCase();
	if (normalizedType.includes("day")) return "eventDay";
	if (normalizedType.includes("post")) return "review";
	return "prep";
}

const COMPETITION_PRICES = {
	review: makeFixedPrice(
		"competition_review_fixed_8",
		8,
		"One remote post-event review.",
	),
	prep: makeFixedPrice(
		"competition_prep_fixed_10",
		10,
		"One focused remote preparation check-in.",
	),
	eventDay: makeFixedPrice(
		"competition_day_fixed_15",
		15,
		"One focused remote event-day check-in.",
	),
};

export function getServicePrice(draft) {
	if (draft.category === "quick_help") {
		return QUICK_HELP_PRICES[draft.requestType] || null;
	}
	if (draft.category === "accountability") {
		return ACCOUNTABILITY_PRICES[draft.requestType]?.[draft.duration] || null;
	}
	if (draft.category === "session") {
		return SESSION_PRICES[draft.requestType] || null;
	}
	if (draft.category === "competition") {
		return COMPETITION_PRICES[competitionPriceTier(draft.requestType)] || null;
	}
	return null;
}

export function getRequestTypeLabel(draft) {
	if (draft.category === "competition") return draft.requestType || "Competition support";
	return REQUEST_TYPES[draft.category]?.find((option) => option.id === draft.requestType)?.label || "Service request";
}

export function validateServiceRequest(draft, attachmentCount = 0, now = new Date()) {
	const errors = {};
	if (!draft.category) errors.category = "Choose a service category.";
	if (!draft.requestType) errors.requestType = "Choose the type of help you need.";
	const accountabilityDurations = getAccountabilityDurations(draft.requestType);
	const hasValidAccountabilityDuration = accountabilityDurations.includes(draft.duration);
	const hasPricingInputs =
		draft.category !== "accountability" || hasValidAccountabilityDuration;
	if (draft.requestType && hasPricingInputs && !getServicePrice(draft)) {
		errors.price = "This package does not have a price yet.";
	}

	if (draft.category === "quick_help") {
		if (draft.requestType !== "posing_review" && !draft.discipline) {
			errors.discipline = "Choose the training discipline.";
		}
		const mediaRequired = ["form_review", "attempt_review", "posing_review"].includes(draft.requestType);
		if (mediaRequired && attachmentCount === 0) errors.attachments = "Add a video or photo for the coach to review.";
		if (draft.requestType === "attempt_review" && !draft.attemptType) {
			errors.attemptType = "Choose what kind of attempt this was.";
		}
		if (["training_feedback", "other"].includes(draft.requestType) && attachmentCount === 0 && !draft.description?.trim()) {
			errors.description = "Add a short description or an attachment.";
		}
	}

	if (draft.category === "accountability" && !hasValidAccountabilityDuration) {
		errors.duration = "Choose how long you want check-ins.";
	}
	if (draft.requestType === "training_accountability" && !draft.discipline) {
		errors.discipline = "Choose the kind of training.";
	}
	if (draft.category === "accountability" && !draft.description?.trim()) {
		errors.description = "Tell the coach what you want help staying consistent with.";
	}
	if (draft.requestType === "competition_accountability" && !draft.sport) {
		errors.sport = "Choose what you’re preparing for.";
	}

	if (draft.category === "session") {
		if (["technique_session", "workout_guidance"].includes(draft.requestType) && !draft.discipline) {
			errors.discipline = "Choose the kind of training.";
		}
		if (draft.requestType === "competition_practice" && !draft.sport) {
			errors.sport = "Choose what you’re practicing for.";
		}
		if (!draft.description?.trim()) {
			errors.description = "Tell the coach what you’d like to work on.";
		}
		if (!draft.scheduledDate) errors.scheduledDate = "Choose a date.";
		if (!draft.scheduledTime) errors.scheduledTime = "Choose a time.";
		if (draft.scheduledDate && draft.scheduledTime) {
			const scheduledAt = new Date(`${draft.scheduledDate}T${draft.scheduledTime}`);
			if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= now) {
				errors.scheduledTime = "Choose a future date and time.";
			}
		}
	}

	if (draft.category === "competition") {
		if (!draft.sport) errors.sport = "Choose your sport.";
		if (!draft.eventDate) errors.eventDate = "Choose the competition date.";
		if (draft.eventDate) {
			const eventDay = new Date(`${draft.eventDate}T23:59:59`);
			if (Number.isNaN(eventDay.getTime()) || eventDay < now) {
				errors.eventDate = "Choose today or a future competition date.";
			}
		}
	}

	return errors;
}

function inferSpecialties(draft) {
	if (draft.sport && draft.sport !== "other") return [draft.sport];
	if (draft.discipline === "powerlifting") return ["powerlifting", "strength_training"];
	if (draft.discipline === "olympic_weightlifting") return ["olympic_weightlifting", "strength_training"];
	if (draft.discipline === "bodybuilding") return ["bodybuilding"];
	if (draft.discipline === "recreational_strength") return ["general_fitness", "strength_training"];
	if (draft.requestType === "posing_review" || draft.requestType === "posing_session") return ["bodybuilding"];
	return ["general_fitness"];
}

export function buildServiceRequest(draft, attachments = [], now = new Date()) {
	const selectedPrice = getServicePrice(draft);
	return {
		id: `service-request-${now.getTime()}`,
		serviceCategory: draft.category,
		requestType: draft.requestType,
		specialties: inferSpecialties(draft),
		delivery: draft.category === "session" ? "live_remote" : "async_remote",
		requestStatus: "awaiting_payment",
		paymentStatus: "payment_required",
		payoutStatus: "not_started",
		availabilityStatus: "payment_pending",
		location: draft.location?.trim() || null,
		details: {
			discipline: draft.discipline || null,
			attemptType: draft.attemptType || null,
			sport: draft.sport || null,
			duration: draft.duration || null,
			scheduledDate: draft.scheduledDate || null,
			scheduledTime: draft.scheduledTime || null,
			eventDate: draft.eventDate || null,
			price: selectedPrice
				? {
						currency: "USD",
						priceId: selectedPrice.id,
						label: selectedPrice.label,
						amount: selectedPrice.amountUsd,
					}
				: null,
			description: draft.description?.trim() || null,
		},
		attachments: attachments.map(({ id, kind, name, size, mimeType, status }) => ({
			id,
			kind,
			name,
			size,
			mimeType,
			status,
		})),
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
		messages: [],
	};
}
