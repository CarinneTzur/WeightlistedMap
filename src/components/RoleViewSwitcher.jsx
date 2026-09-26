import { APP_VIEWS } from "../auth/roles";
import "./RoleViewSwitcher.css";

const OPTIONS = [
	[APP_VIEWS.USER, "User View"],
	[APP_VIEWS.COACH, "Coach View"],
	[APP_VIEWS.ADMIN, "Admin View"],
];

export default function RoleViewSwitcher({ visible, activeView, onChange }) {
	if (!visible) return null;

	return (
		<aside className="role-view-switcher" aria-label="Founder view preview">
			<span className="role-view-switcher__label">View as</span>
			<div role="group" aria-label="Preview application experience">
				{OPTIONS.map(([view, label]) => (
					<button
						key={view}
						type="button"
						className={activeView === view ? "is-active" : ""}
						aria-pressed={activeView === view}
						onClick={() => onChange?.(view)}
					>
						{label}
					</button>
				))}
			</div>
			<small>Preview only — permissions do not change</small>
		</aside>
	);
}
