import { useEffect, useRef, useState } from "react";
import "./AccountMenu.css";

function initials(value) {
	return String(value || "W")
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}

function displayName(profile, user) {
	return (
		profile?.full_name ||
		profile?.display_name ||
		user?.user_metadata?.full_name ||
		user?.user_metadata?.display_name ||
		user?.email?.split("@")[0] ||
		"Weightlisted member"
	);
}

function AccountGlyph() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			<circle cx="12" cy="8" r="3.25" fill="currentColor" />
			<path d="M5.25 19.25c.72-3.05 3.16-4.9 6.75-4.9s6.03 1.85 6.75 4.9" fill="none" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" />
		</svg>
	);
}

export default function AccountMenu({
	user,
	profile,
	onOpenAccount,
	onSignOut,
	compact = false,
}) {
	const menuRef = useRef(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const name = displayName(profile, user);
	const avatarUrl = profile?.avatar_url || "";

	useEffect(() => {
		if (!menuOpen) return undefined;
		function closeForOutsideInteraction(event) {
			if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
		}
		function closeForEscape(event) {
			if (event.key === "Escape") setMenuOpen(false);
		}
		document.addEventListener("pointerdown", closeForOutsideInteraction);
		document.addEventListener("keydown", closeForEscape);
		return () => {
			document.removeEventListener("pointerdown", closeForOutsideInteraction);
			document.removeEventListener("keydown", closeForEscape);
		};
	}, [menuOpen]);

	useEffect(() => {
		if (!user) {
			setMenuOpen(false);
			setError("");
		}
	}, [user]);

	if (!user) {
		return (
			<button
				type="button"
				className={`account-menu__trigger${compact ? " account-menu__trigger--compact" : ""}`}
				onClick={onOpenAccount}
				aria-label="Sign in or create a Weightlisted account"
				title="Account"
			>
				<span className="account-menu__fallback-avatar account-menu__fallback-avatar--guest" aria-hidden="true"><AccountGlyph /></span>
			</button>
		);
	}

	async function handleSignOut() {
		setBusy(true);
		setError("");
		try {
			await onSignOut?.();
			setMenuOpen(false);
		} catch (signOutError) {
			setError(signOutError?.message || "Couldn’t sign you out. Please try again.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div ref={menuRef} className={`account-menu${compact ? " account-menu--compact" : ""}`}>
			<button
				type="button"
				className="account-menu__trigger"
				onClick={() => {
					setMenuOpen((current) => !current);
					setError("");
				}}
				aria-label={`Open account menu for ${name}`}
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				title="Account"
			>
				{avatarUrl ? (
					<img className="account-menu__avatar" src={avatarUrl} alt="" />
				) : (
					<span className="account-menu__fallback-avatar" aria-hidden="true">{initials(name)}</span>
				)}
			</button>

			{menuOpen ? (
				<div className="account-menu__popover" role="menu" aria-label="Account menu">
					<div className="account-menu__identity">
						{avatarUrl ? (
							<img className="account-menu__identity-avatar" src={avatarUrl} alt="" />
						) : (
							<span className="account-menu__identity-avatar account-menu__identity-avatar--fallback" aria-hidden="true">{initials(name)}</span>
						)}
						<div>
							<strong>{name}</strong>
							<span>{user.email}</span>
						</div>
					</div>
					<button type="button" role="menuitem" className="account-menu__item" onClick={() => {
						setMenuOpen(false);
						onOpenAccount?.();
					}}>
						<span aria-hidden="true">◉</span> Manage account
					</button>
					<button type="button" role="menuitem" className="account-menu__item account-menu__item--signout" onClick={handleSignOut} disabled={busy}>
						<span aria-hidden="true">↗</span> {busy ? "Signing out…" : "Sign out"}
					</button>
					{error ? <p className="account-menu__error" role="alert">{error}</p> : null}
				</div>
			) : null}
		</div>
	);
}
