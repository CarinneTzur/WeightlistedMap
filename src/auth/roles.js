export const APP_VIEWS = Object.freeze({
	USER: "user",
	COACH: "coach",
	ADMIN: "admin",
});

// This is the only account allowed to preview UI for roles it does not actually
// hold. Keep this entitlement centralized so role checks never spread through UI.
export const FOUNDER_VIEW_SWITCHER_EMAIL = "getweightlisted@gmail.com";

export function normalizeAccountEmail(value) {
	return String(value || "").trim().toLowerCase();
}

export function isFounderViewSwitcherAccount(user) {
	return Boolean(
		user && normalizeAccountEmail(user.email) === FOUNDER_VIEW_SWITCHER_EMAIL,
	);
}

export function buildRoleAccess({ user, profile, coachApplicationStatus }) {
	const authenticated = Boolean(user?.id);
	const actual = Object.freeze({
		user: authenticated,
		coach: authenticated && coachApplicationStatus === "approved",
		admin: authenticated && profile?.is_admin === true,
	});
	const canPreviewAllViews = authenticated && isFounderViewSwitcherAccount(user);

	return Object.freeze({
		authenticated,
		actual,
		canPreviewAllViews,
		canViewUser: true,
		canViewCoach: actual.coach || canPreviewAllViews,
		canViewAdmin: actual.admin || canPreviewAllViews,
	});
}

export function canAccessAppView(roleAccess, view) {
	if (view === APP_VIEWS.USER) return true;
	if (view === APP_VIEWS.COACH) return Boolean(roleAccess?.canViewCoach);
	if (view === APP_VIEWS.ADMIN) return Boolean(roleAccess?.canViewAdmin);
	return false;
}

export function getAppViewForPath(path) {
	if (path === "/coach") return APP_VIEWS.COACH;
	if (path === "/admin/coach-applications") return APP_VIEWS.ADMIN;
	return APP_VIEWS.USER;
}

export function getPathForAppView(view) {
	if (view === APP_VIEWS.COACH) return "/coach";
	if (view === APP_VIEWS.ADMIN) return "/admin/coach-applications";
	return "/";
}

export function buildFounderCoachPreviewApplication(user, profile) {
	return {
		id: `founder-coach-preview-${user?.id || "account"}`,
		userId: user?.id || "",
		status: "preview",
		fullName:
			profile?.full_name ||
			profile?.display_name ||
			user?.user_metadata?.full_name ||
			"Weightlisted Founder",
		email: user?.email || FOUNDER_VIEW_SWITCHER_EMAIL,
		coachTitle: "Strength & Wellness Coach",
		bio: "Helping lifters train with clarity, confidence, and purpose.",
		city: profile?.city || "New York",
		state: "",
		gymName: profile?.gym_name || "Anytime Fitness",
		gymCity: profile?.city || "New York",
		gymState: "",
		specialties: profile?.training_focus?.length
			? profile.training_focus
			: ["Powerlifting", "General Fitness", "Nutrition"],
		onlineTraining: true,
		inPersonCoaching: true,
		remoteAvailable: true,
		profilePhotoUrl: profile?.avatar_url || "",
		certifications: [],
		socialLinks: [],
		adminNotes: "Founder coach-view preview. No backend coach permission is granted.",
		isPreview: true,
	};
}
