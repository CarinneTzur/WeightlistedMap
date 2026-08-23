import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import "./AccountPanel.css";

const TRAINING_FOCUS_OPTIONS = [
	"Powerlifting",
	"Bodybuilding",
	"Olympic Weightlifting",
	"Recreational Strength",
	"General Fitness",
	"Nutrition",
];

function initials(value) {
	return String(value || "W")
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}

function profileValues(profile, user) {
	return {
		fullName:
			profile?.full_name ||
			profile?.display_name ||
			user?.user_metadata?.full_name ||
			user?.user_metadata?.display_name ||
			"",
		city: profile?.city || "",
		gymName: profile?.gym_name || "",
		trainingFocus: profile?.training_focus || [],
		trainingNote: profile?.training_note || "",
		profileVisible: profile?.profile_visible ?? true,
		avatarUrl: profile?.avatar_url || "",
	};
}

export default function AccountPanel({ open, onClose, embedded = false, onOpenMatchingPreferences }) {
	const { user, profile, profileLoading, isAdmin, updateProfile, signOut, deleteAccount } =
		useAuth();
	const fileInputRef = useRef(null);
	const [form, setForm] = useState(() => profileValues(profile, user));
	const [avatarFile, setAvatarFile] = useState(null);
	const [previewUrl, setPreviewUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [deleteText, setDeleteText] = useState("");

	useEffect(() => {
		if (!open) return;
		setForm(profileValues(profile, user));
		setAvatarFile(null);
		setPreviewUrl("");
		setMessage("");
		setError("");
		setConfirmingDelete(false);
		setDeleteText("");
	}, [open, profile, user]);

	useEffect(() => {
		if (!avatarFile) return undefined;
		const objectUrl = URL.createObjectURL(avatarFile);
		setPreviewUrl(objectUrl);
		return () => URL.revokeObjectURL(objectUrl);
	}, [avatarFile]);

	const avatarSource = previewUrl || form.avatarUrl;
	const isDirty = useMemo(() => {
		const original = profileValues(profile, user);
		return (
			avatarFile ||
			form.fullName !== original.fullName ||
			form.city !== original.city ||
			form.gymName !== original.gymName ||
			form.trainingNote !== original.trainingNote ||
			form.profileVisible !== original.profileVisible ||
			form.trainingFocus.join("|") !== original.trainingFocus.join("|")
		);
	}, [avatarFile, form, profile, user]);

	if (!open) return null;

	function toggleFocus(option) {
		setForm((current) => ({
			...current,
			trainingFocus: current.trainingFocus.includes(option)
				? current.trainingFocus.filter((item) => item !== option)
				: [...current.trainingFocus, option],
		}));
	}

	function chooseAvatar(event) {
		const [file] = [...(event.target.files || [])];
		if (!file) return;
		setAvatarFile(file);
		setError("");
	}

	async function handleSave(event) {
		event.preventDefault();
		setBusy(true);
		setMessage("");
		setError("");
		try {
			const nextProfile = await updateProfile({ ...form, avatarFile });
			setForm(profileValues(nextProfile, user));
			setAvatarFile(null);
			setPreviewUrl("");
			setMessage(nextProfile?.profile_visible
				? "Profile saved. Coaches can see the details you chose to share."
				: "Profile hidden. Turn it back on before messaging or submitting requests.");
		} catch (saveError) {
			setError(saveError?.message || "Your profile could not be saved. Please try again.");
		} finally {
			setBusy(false);
		}
	}

	async function handleSignOut() {
		setBusy(true);
		setError("");
		try {
			await signOut();
			onClose();
		} catch (signOutError) {
			setError(signOutError?.message || "You could not be signed out. Please try again.");
		} finally {
			setBusy(false);
		}
	}

	async function handleDelete() {
		if (deleteText.trim().toUpperCase() !== "DELETE") {
			setError('Type “DELETE” to confirm account deletion.');
			return;
		}
		setBusy(true);
		setError("");
		try {
			await deleteAccount();
			onClose();
		} catch (deleteError) {
			setError(deleteError?.message || "Your account could not be deleted. Please try again.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className={`account-panel${embedded ? " account-panel--embedded" : ""}`} aria-label="Account">
			<header className="account-panel__header">
				<button type="button" className="account-panel__back" onClick={onClose} aria-label="Close account">←</button>
				<div>
					<p>Weightlisted account</p>
					<h1>Edit profile</h1>
				</div>
			</header>

			<div className="account-panel__scroll coach-scroll-panel">
				<form onSubmit={handleSave}>
					<section className="account-panel__section">
						<div className="account-panel__section-heading">
							<h2>Profile</h2>
						</div>
						<div className="account-panel__identity">
							<button
								type="button"
								className="account-panel__avatar"
								onClick={() => fileInputRef.current?.click()}
								aria-label="Add or change headshot"
							>
								{avatarSource ? (
									<img src={avatarSource} alt="Your profile" />
								) : (
									<span>{initials(form.fullName || user?.email)}</span>
								)}
								<i aria-hidden="true">+</i>
							</button>
							<div>
								<strong>{form.fullName || "Your profile"}</strong>
								<span>{user?.email}</span>
								{isAdmin ? <b className="account-panel__admin-badge">Administrator</b> : null}
								<button type="button" className="account-panel__photo-link" onClick={() => fileInputRef.current?.click()}>
									{avatarSource ? "Change photo" : "Add a photo"}
								</button>
							</div>
							<input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseAvatar} hidden />
						</div>
						<label className="account-panel__field">
							<span>Full name</span>
							<input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} autoComplete="name" required />
						</label>
					</section>

					<section className="account-panel__section">
						<div className="account-panel__section-heading">
							<h2>Location</h2>
							<p>Optional details that help coaches understand where you train.</p>
						</div>
						<label className="account-panel__field">
							<span>City <em>Optional</em></span>
							<input
								value={form.city}
								onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
								placeholder="For example: New Braunfels, TX"
								autoComplete="address-level2"
								maxLength={120}
							/>
						</label>
						<label className="account-panel__field">
							<span>Gym name <em>Optional</em></span>
							<input
								value={form.gymName}
								onChange={(event) => setForm((current) => ({ ...current, gymName: event.target.value }))}
								placeholder="For example: Anytime Fitness"
								autoComplete="off"
								maxLength={160}
							/>
						</label>
					</section>

					<section className="account-panel__section">
						<div className="account-panel__section-heading">
							<h2>Training</h2>
							<p>Share only the details that help coaches understand your goals.</p>
						</div>
						<div className="account-panel__field">
							<span>What do you train for?</span>
							<div className="account-panel__choices" role="group" aria-label="Training focus">
								{TRAINING_FOCUS_OPTIONS.map((option) => {
									const selected = form.trainingFocus.includes(option);
									return <button key={option} type="button" aria-pressed={selected} className={selected ? "is-selected" : ""} onClick={() => toggleFocus(option)}>{option}</button>;
								})}
							</div>
						</div>
						<label className="account-panel__field">
							<span>Training note <em>Optional</em></span>
							<textarea value={form.trainingNote} onChange={(event) => setForm((current) => ({ ...current, trainingNote: event.target.value }))} maxLength={500} placeholder="For example: preparing for my first meet, rebuilding strength, or improving my lifting technique." rows={4} />
						</label>
						<label className="account-panel__visibility">
							<input type="checkbox" checked={form.profileVisible} onChange={(event) => setForm((current) => ({ ...current, profileVisible: event.target.checked }))} />
							<span><strong>Show this profile to coaches</strong><small>Required for messages and requests. Your email stays private.</small></span>
						</label>
					</section>

					{error ? <p className="account-panel__error" role="alert">{error}</p> : null}
					{message ? <p className="account-panel__notice" role="status">{message}</p> : null}
					<button type="submit" className="account-panel__save" disabled={busy || profileLoading || !isDirty}>
						{busy ? "Saving…" : "Save profile"}
					</button>
				</form>

				<section className="account-panel__actions">
					<h2>Account actions</h2>
					{onOpenMatchingPreferences ? (
						<button type="button" onClick={onOpenMatchingPreferences} disabled={busy}>Update profile details</button>
					) : null}
					<button type="button" onClick={handleSignOut} disabled={busy}>Sign out</button>
					{confirmingDelete ? (
						<div className="account-panel__delete-confirm">
							<p>Delete your account, saved conversations, applications, and profile? This cannot be undone.</p>
							<label><span>Type DELETE to confirm</span><input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} autoComplete="off" /></label>
							<div><button type="button" onClick={() => { setConfirmingDelete(false); setDeleteText(""); }}>Cancel</button><button type="button" className="account-panel__delete" disabled={busy} onClick={handleDelete}>Delete account</button></div>
						</div>
					) : (
						<button type="button" className="account-panel__delete-link" onClick={() => { setConfirmingDelete(true); setError(""); }}>Delete account</button>
					)}
				</section>
			</div>
		</section>
	);
}
