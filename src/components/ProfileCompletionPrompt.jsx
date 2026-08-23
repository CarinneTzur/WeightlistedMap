import "./ProfileCompletionPrompt.css";

export default function ProfileCompletionPrompt({ compact = false, onComplete }) {
	return (
		<section className={`profile-completion-prompt${compact ? " profile-completion-prompt--compact" : ""}`} aria-label="Complete your profile">
			<div className="profile-completion-prompt__copy">
				<span className="profile-completion-prompt__icon" aria-hidden="true">✦</span>
				<div>
					<strong>Complete your profile</strong>
					<p>For coach review.</p>
				</div>
			</div>
			<button type="button" onClick={onComplete}>Complete</button>
		</section>
	);
}
