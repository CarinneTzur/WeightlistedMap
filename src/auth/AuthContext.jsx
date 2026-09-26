import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
	COACH_APPLICATION_CHANGED_EVENT,
	COACH_APPLICATION_STATUSES,
	getMyCoachApplication,
} from "../../utils/coachApplications";
import { buildRoleAccess } from "./roles";
import "./AuthDialog.css";

const AuthContext = createContext(null);

const AUTH_COPY = {
	contact: {
		title: "Sign in to contact this coach",
		description: "Your account keeps this conversation private and lets you return to it later.",
	},
	service: {
		title: "Sign in to send your request",
		description: "We’ll save the request to your account before matching you with a coach.",
	},
	service_history: {
		title: "Sign in to view your services",
		description: "Your service requests and coach responses belong to your account.",
	},
	messages: {
		title: "Sign in to view messages",
		description: "Your coach conversations are private and tied to your account.",
	},
	coach_application: {
		title: "Create an account to apply",
		description: "Your application will be private, and only you and a Weightlisted administrator can review it.",
	},
	account: {
		title: "Welcome to Weightlisted",
		description: "Create one account for client tools and, if approved, coach tools too.",
	},
	profile_hidden: {
		title: "Turn on your profile to continue",
		description: "Turn visibility back on before messaging coaches, submitting requests, or applying as a coach.",
	},
};

// Keep profile reads tolerant while the optional onboarding migration is rolled out.
const PROFILE_FIELDS = "*";

// Temporarily pause the questionnaire while the gym-matching flow is being refined.
// Flip this back to true to restore post-signup onboarding and completion prompts.
export const CLIENT_ONBOARDING_ENABLED = false;

const COACH_APPROVAL_SEEN_PREFIX = "weightlisted:coach-approval-seen:";

function coachStorageKey(prefix, user) {
	return `${prefix}${user?.id || String(user?.email || "").trim().toLowerCase() || "unknown"}`;
}

const ONBOARDING_EMAIL_STORAGE_PREFIX = "weightlisted:client-onboarding:email:";
const ONBOARDING_USER_STORAGE_PREFIX = "weightlisted:client-onboarding:user:";

function onboardingStorageKey(user) {
	return `${ONBOARDING_USER_STORAGE_PREFIX}${user?.id || user?.email?.toLowerCase?.() || "unknown"}`;
}

function onboardingEmailStorageKey(email) {
	return `${ONBOARDING_EMAIL_STORAGE_PREFIX}${String(email || "").trim().toLowerCase()}`;
}

function setOnboardingStorage(key, value) {
	try {
		window.localStorage?.setItem(key, value);
	} catch {
		// Storage is only a graceful fallback when the profile update cannot persist.
	}
}

function getOnboardingStorage(key) {
	try {
		return window.localStorage?.getItem(key) || "";
	} catch {
		return "";
	}
}

function clearOnboardingStorage(key) {
	try {
		window.localStorage?.removeItem(key);
	} catch {
		// Ignore unavailable browser storage.
	}
}

function normalizeTrainingFocus(values) {
	return [...new Set((Array.isArray(values) ? values : [])
		.map((value) => String(value || "").trim())
		.filter(Boolean))].slice(0, 6);
}

function isImageFile(file) {
	return Boolean(file?.type && /^image\/(png|jpe?g|webp)$/i.test(file.type));
}

function getAuthErrorMessage(error) {
	const message = String(error?.message || "");
	if (/failed to fetch|network|load failed/i.test(message)) {
		return "Weightlisted could not reach the account service. Check the Supabase project URL and try again.";
	}
	return message || "We couldn’t complete that request. Please try again.";
}

function PasswordVisibilityIcon({ visible }) {
	return visible ? (
		<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			<path d="M2.8 12s3.3-5.2 9.2-5.2S21.2 12 21.2 12 17.9 17.2 12 17.2 2.8 12 2.8 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
			<circle cx="12" cy="12" r="2.35" fill="none" stroke="currentColor" strokeWidth="1.8" />
		</svg>
	) : (
		<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			<path d="m3.5 3.5 17 17M10 6.9A10.4 10.4 0 0 1 12 6.7c5.9 0 9.2 5.3 9.2 5.3a15.2 15.2 0 0 1-4.1 4.1M6.85 6.85A15.2 15.2 0 0 0 2.8 12s3.3 5.2 9.2 5.2c.73 0 1.4-.08 2.02-.22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M9.8 9.8a3.1 3.1 0 0 0 4.4 4.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
		</svg>
	);
}

function AuthDialog({ prompt, recoveryMode = false, onClose, onAuthenticated, onPasswordUpdated, onEnableProfile }) {
	const [mode, setMode] = useState("signup");
	const [fullName, setFullName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const emailRef = useRef(null);

	useEffect(() => {
		if (!prompt) return undefined;
		setMode(recoveryMode ? "new_password" : "signup");
		setError("");
		setNotice("");
		setPassword("");
		setConfirmPassword("");
		setShowPassword(false);
		const frame = window.requestAnimationFrame(() => emailRef.current?.focus());
		const onKeyDown = (event) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.cancelAnimationFrame(frame);
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [onClose, prompt, recoveryMode]);

	if (!prompt && !recoveryMode) return null;
	const copy = AUTH_COPY[prompt?.reason] || AUTH_COPY.account;
	const isProfileHiddenPrompt = prompt?.reason === "profile_hidden";
	const isPasswordReset = mode === "reset";
	const isNewPassword = recoveryMode || mode === "new_password";

	async function handleEnableProfile() {
		setBusy(true);
		setError("");
		try {
			await onEnableProfile?.();
		} catch (profileError) {
			setError(getAuthErrorMessage(profileError));
		} finally {
			setBusy(false);
		}
	}

	async function handleSubmit(event) {
		event.preventDefault();
		setError("");
		setNotice("");
		if (!isSupabaseConfigured || !supabase) {
			setError("Account access is not configured yet. Add the Supabase project URL and anonymous key first.");
			return;
		}
		if (!isPasswordReset && password.length < 8) {
			setError("Use at least 8 characters for your password.");
			return;
		}
		if (isNewPassword && password !== confirmPassword) {
			setError("Your new passwords don’t match.");
			return;
		}

		setBusy(true);
		try {
			if (isPasswordReset) {
				const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
					redirectTo: window.location.origin,
				});
				if (resetError) throw resetError;
				setNotice("If that email has a Weightlisted account, we sent a reset link. Check your inbox and spam or junk folder.");
			} else if (isNewPassword) {
				const { data, error: updateError } = await supabase.auth.updateUser({ password });
				if (updateError) throw updateError;
				onPasswordUpdated?.(data.user);
			} else if (mode === "signup") {
				const { data, error: signUpError } = await supabase.auth.signUp({
					email: email.trim(),
					password,
					options: {
						emailRedirectTo: window.location.origin,
						data: {
							full_name: fullName.trim(),
							display_name: fullName.trim(),
						},
					},
				});
				if (signUpError) throw signUpError;
				if (CLIENT_ONBOARDING_ENABLED) {
					setOnboardingStorage(onboardingEmailStorageKey(email), "pending");
				}
				if (data.session && data.user) {
					onAuthenticated(data.user, { createdAccount: true });
				} else {
					setNotice("Check your email to confirm your account, then return here to sign in.");
					setMode("signin");
				}
			} else {
				const { data, error: signInError } = await supabase.auth.signInWithPassword({
					email: email.trim(),
					password,
				});
				if (signInError) throw signInError;
				onAuthenticated(data.user);
			}
		} catch (authError) {
			setError(getAuthErrorMessage(authError));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="auth-overlay" role="presentation" onMouseDown={(event) => {
			if (event.target === event.currentTarget) onClose();
		}}>
			<section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
				<button type="button" className="auth-close" onClick={onClose} aria-label="Close account dialog">×</button>
				<p className="auth-eyebrow">Weightlisted account</p>
				<h2 id="auth-dialog-title">{isNewPassword ? "Choose a new password" : isPasswordReset ? "Reset your password" : copy.title}</h2>
				<p className="auth-description">{isNewPassword ? "Set a new password for your Weightlisted account." : isPasswordReset ? "Enter your email and we’ll send you a secure reset link." : copy.description}</p>

				{isProfileHiddenPrompt ? (
					<div className="auth-profile-actions">
						{error ? <p className="auth-error" role="alert">{error}</p> : null}
						<button type="button" className="auth-profile-cancel" onClick={onClose} disabled={busy}>Keep hidden</button>
						<button type="button" className="auth-submit" onClick={handleEnableProfile} disabled={busy}>
							{busy ? "Turning on…" : "Turn profile on"}
						</button>
					</div>
				) : <>
				{!isPasswordReset && !isNewPassword ? <div className="auth-tabs" role="tablist" aria-label="Account action">
					<button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => { setMode("signup"); setError(""); }}>Create account</button>
					<button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => { setMode("signin"); setError(""); }}>Sign in</button>
				</div> : null}

				<form onSubmit={handleSubmit}>
					{!isNewPassword ? <label>
						<span>Email</span>
						<input ref={emailRef} id="weightlisted-email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
					</label> : null}
					{mode === "signup" ? (
						<label>
							<span>Full name</span>
							<input id="weightlisted-full-name" name="name" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required />
						</label>
					) : null}
					{!isPasswordReset ? <label>
						<span>Password</span>
						<div className="auth-password-field">
							<input id="weightlisted-password" name="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" || isNewPassword ? "new-password" : "current-password"} minLength={8} required />
							<button
								type="button"
								className="auth-password-visibility"
								onClick={() => setShowPassword((current) => !current)}
								aria-label={showPassword ? "Hide password" : "Show password"}
								aria-pressed={showPassword}
							>
								<PasswordVisibilityIcon visible={showPassword} />
							</button>
						</div>
					</label> : null}
					{isNewPassword ? <label>
						<span>Confirm new password</span>
						<input id="weightlisted-password-confirmation" name="password_confirmation" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
					</label> : null}
					{mode === "signin" ? <button type="button" className="auth-forgot-password auth-forgot-inline" onClick={() => { setMode("reset"); setError(""); setNotice(""); }}>Forgot password?</button> : null}
					{error ? <p className="auth-error" role="alert">{error}</p> : null}
					{notice ? <p className="auth-notice" role="status">{notice}</p> : null}
					<button className="auth-submit" type="submit" disabled={busy}>
						{busy ? "Please wait…" : isNewPassword ? "Save new password" : isPasswordReset ? "Send reset link" : mode === "signup" ? "Create account" : "Sign in"}
					</button>
				</form>
				{isPasswordReset ? <button type="button" className="auth-forgot-password auth-recovery-back" onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>← Back to sign in</button> : null}
				{!isNewPassword ? <p className="auth-footnote">One account can be used as a client and, after approval, as a coach.</p> : null}
				</>}
			</section>
		</div>
	);
}

export function AuthProvider({ children }) {
	const [session, setSession] = useState(null);
	const [profile, setProfile] = useState(null);
	const [loading, setLoading] = useState(true);
	const [profileLoading, setProfileLoading] = useState(false);
	const [prompt, setPrompt] = useState(null);
	const [passwordRecoveryOpen, setPasswordRecoveryOpen] = useState(false);
	const [clientOnboardingOpen, setClientOnboardingOpen] = useState(false);
	const [coachApplication, setCoachApplication] = useState(null);
	const [coachStatusLoading, setCoachStatusLoading] = useState(false);
	const [approvalCelebrationOpen, setApprovalCelebrationOpen] = useState(false);
	const pendingActionRef = useRef(null);
	const pendingOnboardingActionRef = useRef(null);
	const previousCoachStatusRef = useRef("");
	const refreshProfile = useCallback(async () => {
		const userId = session?.user?.id;
		if (!supabase || !userId) {
			setProfile(null);
			return null;
		}
		const { data, error } = await supabase
			.from("profiles")
			.select(PROFILE_FIELDS)
			.eq("user_id", userId)
			.maybeSingle();
		if (error) throw error;
		setProfile(data || null);
		return data || null;
	}, [session?.user?.id]);

	const refreshCoachApplication = useCallback(async () => {
		const currentUser = session?.user;
		if (!currentUser) {
			setCoachApplication(null);
			setCoachStatusLoading(false);
			return null;
		}

		setCoachStatusLoading(true);
		let application = null;
		if (supabase) {
			try {
				application = await getMyCoachApplication();
			} catch (error) {
				console.warn("Coach application status could not be loaded.", error);
			}
		}

		setCoachApplication(application);
		setCoachStatusLoading(false);
		return application;
	}, [session?.user]);

	useEffect(() => {
		if (!supabase) {
			setLoading(false);
			return undefined;
		}

		let active = true;
		supabase.auth.getSession().then(({ data }) => {
			if (!active) return;
			setSession(data.session || null);
			setLoading(false);
		});
		const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
			setSession(nextSession);
			setLoading(false);
			if (event === "PASSWORD_RECOVERY") setPasswordRecoveryOpen(true);
		});
		return () => {
			active = false;
			listener.subscription.unsubscribe();
		};
	}, []);

	useEffect(() => {
		const userId = session?.user?.id;
		if (!supabase || !userId) {
			setProfile(null);
			setProfileLoading(false);
			return;
		}
		let active = true;
		setProfileLoading(true);
		refreshProfile()
			.catch((error) => console.warn("Account profile could not be loaded.", error))
			.finally(() => { if (active) setProfileLoading(false); });
		return () => { active = false; };
	}, [refreshProfile, session?.user?.id]);

	useEffect(() => {
		const currentUser = session?.user;
		if (!currentUser) {
			setCoachApplication(null);
			setApprovalCelebrationOpen(false);
			previousCoachStatusRef.current = "";
			return undefined;
		}

		let active = true;
		refreshCoachApplication().catch(() => {
			if (active) setCoachStatusLoading(false);
		});

		const refresh = () => refreshCoachApplication();
		window.addEventListener(COACH_APPLICATION_CHANGED_EVENT, refresh);
		window.addEventListener("focus", refresh);
		const interval = window.setInterval(refresh, 30000);

		let channel = null;
		if (supabase) {
			channel = supabase
				.channel(`coach-application-${currentUser.id}`)
				.on(
					"postgres_changes",
					{
						event: "*",
						schema: "public",
						table: "coach_applications",
						filter: `user_id=eq.${currentUser.id}`,
					},
					refresh,
				)
				.subscribe();
		}

		return () => {
			active = false;
			window.removeEventListener(COACH_APPLICATION_CHANGED_EVENT, refresh);
			window.removeEventListener("focus", refresh);
			window.clearInterval(interval);
			if (channel && supabase) supabase.removeChannel(channel);
		};
	}, [refreshCoachApplication, session?.user]);

	const coachApplicationStatus = coachApplication?.status || "not_applied";
	const isCoachApproved = coachApplicationStatus === COACH_APPLICATION_STATUSES.ACCEPTED;
	const roleAccess = useMemo(
		() => buildRoleAccess({ user: session?.user, profile, coachApplicationStatus }),
		[coachApplicationStatus, profile, session?.user],
	);

	useEffect(() => {
		const currentUser = session?.user;
		if (!currentUser) return;
		const previousStatus = previousCoachStatusRef.current;
		previousCoachStatusRef.current = coachApplicationStatus;

		if (!isCoachApproved) {
			setApprovalCelebrationOpen(false);
			return;
		}

		const approvalSeen = getOnboardingStorage(
			coachStorageKey(COACH_APPROVAL_SEEN_PREFIX, currentUser),
		);
		if (!approvalSeen && previousStatus !== COACH_APPLICATION_STATUSES.ACCEPTED) {
			setApprovalCelebrationOpen(true);
		}
	}, [coachApplicationStatus, isCoachApproved, session?.user]);

	useEffect(() => {
		if (!CLIENT_ONBOARDING_ENABLED) return;
		const user = session?.user;
		if (!user || loading || clientOnboardingOpen) return;
		// Email-confirmation links can create a session outside the auth dialog.
		// The email marker lets that newly confirmed account continue into setup.
		if (getOnboardingStorage(onboardingEmailStorageKey(user.email)) === "pending") {
			setClientOnboardingOpen(true);
		}
	}, [clientOnboardingOpen, loading, session?.user]);

	const continueAfterOnboarding = useCallback(() => {
		const action = pendingOnboardingActionRef.current;
		pendingOnboardingActionRef.current = null;
		action?.();
	}, []);

	const openClientOnboarding = useCallback(() => {
		if (!CLIENT_ONBOARDING_ENABLED) return;
		setClientOnboardingOpen(true);
	}, []);

	const saveClientMatchingPreferences = useCallback(async (preferences = {}, { dismissed = false } = {}) => {
		const currentUser = session?.user;
		if (!supabase || !currentUser) throw new Error("Sign in before saving matching preferences.");

		const timestamp = new Date().toISOString();
		const payload = dismissed
			? {
				matching_preferences: profile?.matching_preferences || {},
				onboarding_dismissed_at: timestamp,
			}
			: {
				matching_preferences: preferences,
				onboarding_completed_at: timestamp,
				onboarding_dismissed_at: null,
			};
		let { data, error } = await supabase
			.from("profiles")
			.update(payload)
			.eq("user_id", currentUser.id)
			.select(PROFILE_FIELDS)
			.maybeSingle();
		if (error) throw error;
		if (!data) {
			const { data: createdProfile, error: createError } = await supabase
				.from("profiles")
				.upsert({
					user_id: currentUser.id,
					email: currentUser.email || "",
					full_name: profile?.full_name || currentUser.user_metadata?.full_name || "",
					display_name: profile?.display_name || currentUser.user_metadata?.display_name || "",
					...payload,
				}, { onConflict: "user_id" })
				.select(PROFILE_FIELDS)
				.single();
			if (createError) throw createError;
			data = createdProfile;
		}
		setProfile(data);
		return data;
	}, [profile?.matching_preferences, session?.user]);

	const completeClientOnboarding = useCallback(async (preferences) => {
		await saveClientMatchingPreferences(preferences);
		const userKey = onboardingStorageKey(session?.user);
		setOnboardingStorage(userKey, "completed");
		clearOnboardingStorage(onboardingEmailStorageKey(session?.user?.email));
		setClientOnboardingOpen(false);
		continueAfterOnboarding();
	}, [continueAfterOnboarding, saveClientMatchingPreferences, session?.user]);

	const dismissClientOnboarding = useCallback(async () => {
		try {
			await saveClientMatchingPreferences({}, { dismissed: true });
		} catch (error) {
			console.warn("Matching setup dismissal could not be saved.", error);
		}
		const userKey = onboardingStorageKey(session?.user);
		setOnboardingStorage(userKey, "dismissed");
		clearOnboardingStorage(onboardingEmailStorageKey(session?.user?.email));
		setClientOnboardingOpen(false);
		continueAfterOnboarding();
	}, [continueAfterOnboarding, saveClientMatchingPreferences, session?.user]);

	const completePendingAction = useCallback((user, { createdAccount = false } = {}) => {
		const action = pendingActionRef.current;
		pendingActionRef.current = null;
		setPrompt(null);
		const hasPendingOnboarding = getOnboardingStorage(onboardingEmailStorageKey(user?.email)) === "pending";
		if (CLIENT_ONBOARDING_ENABLED && (createdAccount || hasPendingOnboarding)) {
			pendingOnboardingActionRef.current = () => action?.onAuthenticated?.(user);
			openClientOnboarding();
			return;
		}
		action?.onAuthenticated?.(user);
	}, [openClientOnboarding]);

	const requireAuth = useCallback(({ reason = "account", onAuthenticated, onCancel } = {}) => {
		if (session?.user) {
			if (reason !== "account" && profile?.profile_visible === false) {
				pendingActionRef.current = { onAuthenticated, onCancel };
				setPrompt({ reason: "profile_hidden", requestedReason: reason });
				return false;
			}
			onAuthenticated?.(session.user);
			return true;
		}
		pendingActionRef.current = { onAuthenticated, onCancel };
		setPrompt({ reason });
		return false;
	}, [profile?.profile_visible, session?.user]);

	const enableProfileAndContinue = useCallback(async () => {
		const currentUser = session?.user;
		if (!supabase || !currentUser) throw new Error("Sign in before changing profile visibility.");
		const { data, error } = await supabase
			.from("profiles")
			.update({ profile_visible: true })
			.eq("user_id", currentUser.id)
			.select(PROFILE_FIELDS)
			.single();
		if (error) throw error;
		setProfile(data);
		const action = pendingActionRef.current;
		pendingActionRef.current = null;
		setPrompt(null);
		action?.onAuthenticated?.(currentUser);
		return data;
	}, [session?.user]);

	const closePrompt = useCallback(() => {
		const action = pendingActionRef.current;
		pendingActionRef.current = null;
		setPrompt(null);
		action?.onCancel?.();
	}, []);

	const updateProfile = useCallback(async ({
		fullName,
		city,
		gymName,
		trainingFocus,
		trainingNote,
		profileVisible,
		avatarFile,
	} = {}) => {
		const currentUser = session?.user;
		if (!supabase || !currentUser) throw new Error("Sign in before updating your account.");
		const normalizedName = String(fullName || "").trim();
		if (!normalizedName) throw new Error("Enter your full name.");

		let avatarUrl = profile?.avatar_url || "";
		if (avatarFile) {
			if (!isImageFile(avatarFile)) {
				throw new Error("Choose a PNG, JPG, or WebP image for your headshot.");
			}
			if (avatarFile.size > 5 * 1024 * 1024) {
				throw new Error("Choose a headshot smaller than 5 MB.");
			}
			const extension = avatarFile.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "jpg";
			const uploadId = globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
			const objectPath = `clients/${currentUser.id}/${uploadId}.${extension}`;
			const { error: uploadError } = await supabase.storage
				.from("client-profile-photos")
				.upload(objectPath, avatarFile, { contentType: avatarFile.type, upsert: false });
			if (uploadError) throw uploadError;
			const { data: publicUrlData } = supabase.storage
				.from("client-profile-photos")
				.getPublicUrl(objectPath);
			avatarUrl = publicUrlData.publicUrl;
		}

		const nextProfile = {
			full_name: normalizedName,
			display_name: normalizedName,
			city: String(city || "").trim().slice(0, 120) || null,
			gym_name: String(gymName || "").trim().slice(0, 160) || null,
			training_focus: normalizeTrainingFocus(trainingFocus),
			training_note: String(trainingNote || "").trim().slice(0, 500),
			profile_visible: Boolean(profileVisible),
			avatar_url: avatarUrl || null,
		};
		const { data, error } = await supabase
			.from("profiles")
			.update(nextProfile)
			.eq("user_id", currentUser.id)
			.select(PROFILE_FIELDS)
			.single();
		if (error) throw error;
		await supabase.auth.updateUser({ data: { full_name: normalizedName, display_name: normalizedName } });
		setProfile(data);
		return data;
	}, [profile?.avatar_url, session?.user, setProfile]);

	const deleteAccount = useCallback(async () => {
                if (!supabase || !session?.user) throw new Error("Sign in before deleting your account.");
                const { error } = await supabase.rpc("delete_current_user");
                if (error) throw error;
                setProfile(null);
                await supabase.auth.signOut();
	}, [session?.user]);

	const signOut = useCallback(async () => {
		if (!supabase) return;
		const { error } = await supabase.auth.signOut();
		if (error) throw error;
	}, []);

	const acknowledgeCoachApproval = useCallback(() => {
		if (!session?.user) return false;
		setApprovalCelebrationOpen(false);
		setOnboardingStorage(coachStorageKey(COACH_APPROVAL_SEEN_PREFIX, session.user), new Date().toISOString());
		return true;
	}, [session?.user]);

	const dismissCoachApproval = useCallback(() => {
		setApprovalCelebrationOpen(false);
		if (session?.user) {
			setOnboardingStorage(
				coachStorageKey(COACH_APPROVAL_SEEN_PREFIX, session.user),
				new Date().toISOString(),
			);
		}
	}, [session?.user]);

	const value = useMemo(() => ({
		session,
		user: session?.user || null,
		profile,
		loading,
		profileLoading,
		roleAccess,
		isAdmin: roleAccess.actual.admin,
		coachApplication,
		coachApplicationStatus,
		coachStatusLoading,
		isCoachApproved,
		canUseCoachView: roleAccess.canViewCoach,
		canUseAdminView: roleAccess.canViewAdmin,
		canPreviewAllViews: roleAccess.canPreviewAllViews,
		approvalCelebrationOpen,
		clientOnboardingOpen: CLIENT_ONBOARDING_ENABLED && clientOnboardingOpen,
		requireAuth,
		refreshProfile,
		updateProfile,
		openClientOnboarding,
		completeClientOnboarding,
		dismissClientOnboarding,
		deleteAccount,
		signOut,
		refreshCoachApplication,
		acknowledgeCoachApproval,
		dismissCoachApproval,
	}), [acknowledgeCoachApproval, approvalCelebrationOpen, clientOnboardingOpen, coachApplication, coachApplicationStatus, coachStatusLoading, completeClientOnboarding, deleteAccount, dismissClientOnboarding, dismissCoachApproval, isCoachApproved, loading, openClientOnboarding, profile, profileLoading, refreshCoachApplication, refreshProfile, requireAuth, roleAccess, session, signOut, updateProfile]);

	return (
		<AuthContext.Provider value={value}>
			{children}
			<AuthDialog
				prompt={prompt}
				recoveryMode={passwordRecoveryOpen}
				onClose={() => { setPasswordRecoveryOpen(false); closePrompt(); }}
				onAuthenticated={completePendingAction}
				onPasswordUpdated={(user) => { setPasswordRecoveryOpen(false); completePendingAction(user); }}
				onEnableProfile={enableProfileAndContinue}
			/>
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const value = useContext(AuthContext);
	if (!value) throw new Error("useAuth must be used inside AuthProvider.");
	return value;
}
