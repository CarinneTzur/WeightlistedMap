import { useEffect, useRef, useState } from "react";
import { gyms as knownGyms } from "../../data/gyms";
import { STATE_ABBR_BY_NAME, STATE_CENTERS } from "../../data/usStates";
import { useAuth } from "../auth/AuthContext";
import { SERVICE_CATEGORIES } from "../services/serviceRequestModel";
import GymPlaceAutocomplete from "./GymPlaceAutocomplete";
import "./ClientOnboarding.css";

const GOALS = [
	"Get stronger",
	"Powerlifting",
	"Bodybuilding",
	"Weight loss / general fitness",
	"Nutrition",
	"Competition prep",
	"Technique / form",
];

const COACH_SUPPORT_TYPES = [
	"Ongoing coaching",
	"Program design",
	"Nutrition",
	"Accountability",
];

const QUICK_SERVICE_OPTIONS = SERVICE_CATEGORIES.map(({ id, label }) => ({ id, label }));

const FIT_PREFERENCES = [
	"Women-centered strength",
	"Men-centered strength",
	"Pregnancy / postpartum",
	"Nutrition support",
	"Competition prep",
	"Beginner-friendly",
	"Injury-aware / adaptive",
];

const INITIAL_PREFERENCES = {
	lookingFor: "",
	goals: [],
	quickServices: [],
	coachingFormat: "",
	location: "",
	gymStatus: "",
	gymId: "",
	gymName: "",
	gymPlaceId: "",
	gymAddress: "",
	gymLatitude: null,
	gymLongitude: null,
	experienceLevel: "",
	supportTypes: [],
	clientGender: "",
	coachGenderPreference: "",
	fitPreferences: [],
};

const ADDITIONAL_CITY_OPTIONS = [
	{ city: "New Braunfels", state: "TX" },
	{ city: "Seguin", state: "TX" },
	{ city: "San Antonio", state: "TX" },
	{ city: "Austin", state: "TX" },
	{ city: "Houston", state: "TX" },
	{ city: "Dallas", state: "TX" },
	{ city: "Phoenix", state: "AZ" },
	{ city: "Denver", state: "CO" },
	{ city: "Miami", state: "FL" },
	{ city: "Chicago", state: "IL" },
	{ city: "New York", state: "NY" },
	{ city: "Seattle", state: "WA" },
];

function normalizeStateAbbr(value) {
	const normalized = String(value || "").trim();
	const upper = normalized.toUpperCase();
	if (STATE_CENTERS[upper]) return upper;
	return Object.entries(STATE_ABBR_BY_NAME).find(([name]) => name.toLowerCase() === normalized.toLowerCase())?.[1] || "";
}

function buildLocationOption(city, state) {
	const normalizedCity = String(city || "").trim();
	const normalizedState = normalizeStateAbbr(state);
	if (!normalizedCity || !normalizedState) return null;
	return {
		city: normalizedCity,
		state: normalizedState,
		label: `${normalizedCity}, ${normalizedState}`,
		searchText: `${normalizedCity} ${normalizedState} ${STATE_CENTERS[normalizedState]?.name || ""}`.toLowerCase(),
	};
}

const LOCAL_LOCATION_OPTIONS = Array.from(
	new Map(
		[...knownGyms, ...ADDITIONAL_CITY_OPTIONS]
			.map(({ city, state }) => buildLocationOption(city, state))
			.filter(Boolean)
			.map((option) => [`${option.city.toLowerCase()},${option.state}`, option]),
	).values(),
).sort((left, right) => left.label.localeCompare(right.label));

function mapNominatimLocation(result) {
	const address = result?.address || {};
	const city = address.city || address.town || address.village || address.municipality || address.county || "";
	return buildLocationOption(city, address.state);
}

async function searchUsLocations(query, signal) {
	const url = new URL("https://nominatim.openstreetmap.org/search");
	url.searchParams.set("format", "jsonv2");
	url.searchParams.set("addressdetails", "1");
	url.searchParams.set("countrycodes", "us");
	url.searchParams.set("limit", "8");
	url.searchParams.set("dedupe", "1");
	url.searchParams.set("q", query);
	const response = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal });
	if (!response.ok) throw new Error("Location search failed.");
	const results = await response.json();
	return Array.from(
		new Map(
			results
				.map(mapNominatimLocation)
				.filter(Boolean)
				.map((option) => [`${option.city.toLowerCase()},${option.state}`, option]),
		).values(),
	);
}

function selectedValues(value) {
	return Array.isArray(value) ? value : [];
}

function initialPreferences(profile) {
	const saved = profile?.matching_preferences || {};
	return {
		...INITIAL_PREFERENCES,
		...saved,
		goals: selectedValues(saved.goals),
		quickServices: selectedValues(saved.quickServices),
		supportTypes: selectedValues(saved.supportTypes),
		fitPreferences: selectedValues(saved.fitPreferences),
	};
}

function LocationAutocomplete({ value, onChange }) {
	const [open, setOpen] = useState(false);
	const [inputValue, setInputValue] = useState(value || "");
	const [apiOptions, setApiOptions] = useState([]);
	const [searchStatus, setSearchStatus] = useState("idle");
	const normalizedInput = inputValue.trim().toLowerCase();
	const localOptions = LOCAL_LOCATION_OPTIONS.filter((option) =>
		normalizedInput ? option.searchText.includes(normalizedInput) : true,
	).slice(0, 8);
	const options = Array.from(
		new Map([...apiOptions, ...localOptions].map((option) => [`${option.city.toLowerCase()},${option.state}`, option])).values(),
	).slice(0, 8);

	useEffect(() => {
		setInputValue(value || "");
	}, [value]);

	useEffect(() => {
		if (!open || inputValue.trim().length < 3) {
			setApiOptions([]);
			setSearchStatus("idle");
			return undefined;
		}
		const controller = new AbortController();
		const timeoutId = window.setTimeout(async () => {
			setSearchStatus("loading");
			try {
				setApiOptions(await searchUsLocations(inputValue.trim(), controller.signal));
				setSearchStatus("done");
			} catch (error) {
				if (error?.name === "AbortError") return;
				setApiOptions([]);
				setSearchStatus("error");
			}
		}, 350);
		return () => {
			controller.abort();
			window.clearTimeout(timeoutId);
		};
	}, [inputValue, open]);

	function choose(option) {
		setInputValue(option.label);
		onChange(option.label);
		setOpen(false);
	}

	return (
		<label className="client-onboarding__field client-onboarding__location-picker" onBlur={(event) => {
			if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
		}}>
			<span>Where are you based? <em>Optional</em></span>
			<input
				value={inputValue}
				onChange={(event) => { setInputValue(event.target.value); onChange(event.target.value); setOpen(true); }}
				onFocus={() => setOpen(true)}
				placeholder="Start typing a city or state"
				autoComplete="off"
			/>
			{open ? (
				<div className="client-onboarding__location-results" role="listbox">
					{options.length ? options.map((option) => (
						<button key={option.label} type="button" role="option" aria-selected={value === option.label} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>{option.label}</button>
					)) : <div>{searchStatus === "loading" ? "Searching city and state..." : "Keep typing to find your city or region."}</div>}
					{options.length && searchStatus === "loading" ? <div>Searching more matches...</div> : null}
				</div>
			) : null}
		</label>
	);
}

function ChoiceButton({ active, children, onClick, className = "" }) {
	return (
		<button
			type="button"
			className={`client-onboarding__choice${active ? " is-selected" : ""}${className ? ` ${className}` : ""}`}
			aria-pressed={active}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

function toggleValue(values, value, limit = Infinity) {
	if (values.includes(value)) return values.filter((item) => item !== value);
	if (values.length >= limit) return values;
	return [...values, value];
}

export default function ClientOnboarding({ open }) {
	const {
		profile,
		completeClientOnboarding,
		dismissClientOnboarding,
	} = useAuth();
	const [step, setStep] = useState(0);
	const [preferences, setPreferences] = useState(() => initialPreferences(profile));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const wasOpenRef = useRef(false);

	useEffect(() => {
		if (!open) {
			wasOpenRef.current = false;
			return;
		}
		if (wasOpenRef.current) return;
		wasOpenRef.current = true;
		setStep(0);
		setPreferences(initialPreferences(profile));
		setBusy(false);
		setError("");
	}, [open, profile]);

	if (!open) return null;

	const update = (patch) => setPreferences((current) => ({ ...current, ...patch }));
	const stepNumber = step + 1;

	function chooseGymStatus(value) {
		update({
			gymStatus: value,
			gymId: value === "member" ? preferences.gymId : "",
			gymName: value === "member" ? preferences.gymName : "",
			gymPlaceId: value === "member" ? preferences.gymPlaceId : "",
			gymAddress: value === "member" ? preferences.gymAddress : "",
			gymLatitude: value === "member" ? preferences.gymLatitude : null,
			gymLongitude: value === "member" ? preferences.gymLongitude : null,
		});
	}

	function toggleGoals(goal) {
		update({ goals: toggleValue(preferences.goals, goal, 3) });
	}

	function toggleSupport(value) {
		update({ supportTypes: toggleValue(preferences.supportTypes, value, 3) });
	}

	function chooseLookingFor(value) {
		update({
			lookingFor: value,
			quickServices: value === "Find a coach" ? [] : preferences.quickServices,
		});
	}

	function toggleQuickService(value) {
		update({ quickServices: toggleValue(preferences.quickServices, value, 3) });
	}

	function toggleFitPreference(value) {
		if (value === "No preference") {
			update({ fitPreferences: preferences.fitPreferences.includes(value) ? [] : [value] });
			return;
		}
		const withoutNoPreference = preferences.fitPreferences.filter((item) => item !== "No preference");
		update({ fitPreferences: toggleValue(withoutNoPreference, value, 3) });
	}

	async function finish() {
		setBusy(true);
		setError("");
		try {
			await completeClientOnboarding({
				...preferences,
				version: 1,
				matchPriority: {
					hard: [
						...(preferences.coachGenderPreference && preferences.coachGenderPreference !== "No preference" ? ["coachGenderPreference"] : []),
						...preferences.fitPreferences.filter((item) => ["Women-centered strength", "Men-centered strength", "Pregnancy / postpartum"].includes(item)),
					],
					strong: ["coachingFormat", "gymPlaceId", "gymId", "gymName"],
					soft: ["goals", "quickServices", "experienceLevel", "supportTypes", "location"],
				},
			});
		} catch (saveError) {
			setError(saveError?.message || "We couldn’t save your preferences. Try again or close this for now.");
			setBusy(false);
		}
	}

	function back() {
		if (step > 0) setStep((current) => current - 1);
	}

	return (
		<section className="client-onboarding" aria-labelledby="client-onboarding-title">
			<header className="client-onboarding__header">
				<div>
					<p>Weightlisted profile setup</p>
					<h1 id="client-onboarding-title">Help coaches understand your needs</h1>
				</div>
				<button
					type="button"
					className="client-onboarding__close"
					onClick={() => dismissClientOnboarding()}
					disabled={busy}
					aria-label="Skip matching setup for now"
					title="Skip for now"
				>
					×
				</button>
			</header>

			<div className="client-onboarding__progress" aria-label={`Step ${stepNumber} of 4`}>
				<span>Step {stepNumber} of 4</span>
				<div aria-hidden="true"><i style={{ width: `${stepNumber * 25}%` }} /></div>
			</div>

			<div className="client-onboarding__scroll coach-scroll-panel">
				{step === 0 ? (
					<section className="client-onboarding__step">
						<p className="client-onboarding__eyebrow">Goals</p>
						<h2>What brings you to Weightlisted?</h2>
						<p className="client-onboarding__intro">A few details help coaches understand your goals and preferred support. You can change any of this later.</p>
						<div className="client-onboarding__group">
							<span className="client-onboarding__label">What are you looking for?</span>
							<div className="client-onboarding__choice-grid client-onboarding__choice-grid--three">
								{["Find a coach", "Quick help / feedback", "Both"].map((value) => (
									<ChoiceButton key={value} active={preferences.lookingFor === value} onClick={() => chooseLookingFor(value)}>{value}</ChoiceButton>
								))}
							</div>
						</div>
						{preferences.lookingFor !== "Quick help / feedback" ? <div className="client-onboarding__group">
							<div className="client-onboarding__label-row"><span className="client-onboarding__label">Your main goals</span><small>Choose up to 3</small></div>
							<div className="client-onboarding__tag-grid">
								{GOALS.map((goal) => <ChoiceButton key={goal} active={preferences.goals.includes(goal)} onClick={() => toggleGoals(goal)}>{goal}</ChoiceButton>)}
							</div>
						</div> : null}
						{preferences.lookingFor !== "Find a coach" ? <div className="client-onboarding__group">
							<div className="client-onboarding__label-row"><span className="client-onboarding__label">Quick services that sound useful</span><small>Choose up to 3</small></div>
							<div className="client-onboarding__tag-grid">
								{QUICK_SERVICE_OPTIONS.map((service) => <ChoiceButton key={service.id} active={preferences.quickServices.includes(service.id)} onClick={() => toggleQuickService(service.id)}>{service.label}</ChoiceButton>)}
							</div>
						</div> : null}
					</section>
				) : null}

				{step === 1 ? (
					<section className="client-onboarding__step">
						<p className="client-onboarding__eyebrow">Training setup</p>
						<h2>How and where do you train?</h2>
						<div className="client-onboarding__group">
							<span className="client-onboarding__label">How do you want to be coached?</span>
							<div className="client-onboarding__choice-grid client-onboarding__choice-grid--three">
								{["In person", "Online", "Either"].map((value) => <ChoiceButton key={value} active={preferences.coachingFormat === value} onClick={() => update({ coachingFormat: value })}>{value}</ChoiceButton>)}
							</div>
						</div>
						<LocationAutocomplete value={preferences.location} onChange={(location) => update({ location })} />
						<div className="client-onboarding__group">
							<span className="client-onboarding__label">Do you train at a gym already?</span>
							<div className="client-onboarding__choice-grid client-onboarding__choice-grid--three">
								<ChoiceButton active={preferences.gymStatus === "member"} onClick={() => chooseGymStatus("member")}>Yes</ChoiceButton>
								<ChoiceButton active={preferences.gymStatus === "not-yet"} onClick={() => chooseGymStatus("not-yet")}>Not yet</ChoiceButton>
								<ChoiceButton active={preferences.gymStatus === "home"} onClick={() => chooseGymStatus("home")}>At home</ChoiceButton>
							</div>
						</div>
						{preferences.gymStatus === "member" ? (
							<div className="client-onboarding__gym-picker">
								<GymPlaceAutocomplete
									label="Which gym?"
									helper="Choose the exact location when it appears."
									value={preferences.gymName}
									placeId={preferences.gymPlaceId}
									locationHint={preferences.location}
									placeholder="Start typing your gym’s name"
									onChange={(gymName) => update({
										gymId: "",
										gymName,
										gymPlaceId: "",
										gymAddress: "",
										gymLatitude: null,
										gymLongitude: null,
									})}
									onSelect={(gym) => update({
										gymId: `google:${gym.placeId}`,
										gymName: gym.name,
										gymPlaceId: gym.placeId,
										gymAddress: gym.address,
										gymLatitude: gym.latitude,
										gymLongitude: gym.longitude,
									})}
								/>
							</div>
						) : null}
					</section>
				) : null}

				{step === 2 ? (
					<section className="client-onboarding__step">
						<p className="client-onboarding__eyebrow">Coaching support</p>
						<h2>What kind of help would feel useful?</h2>
						<div className="client-onboarding__group">
							<span className="client-onboarding__label">Your lifting experience</span>
							<div className="client-onboarding__choice-grid client-onboarding__choice-grid--two">
								{["New to lifting", "Some experience", "Experienced", "Competitive"].map((value) => <ChoiceButton key={value} active={preferences.experienceLevel === value} onClick={() => update({ experienceLevel: value })}>{value}</ChoiceButton>)}
							</div>
						</div>
						{preferences.lookingFor !== "Quick help / feedback" ? <div className="client-onboarding__group">
							<div className="client-onboarding__label-row"><span className="client-onboarding__label">Support that sounds useful</span><small>Choose up to 3</small></div>
							<div className="client-onboarding__tag-grid">
								{COACH_SUPPORT_TYPES.map((value) => <ChoiceButton key={value} active={preferences.supportTypes.includes(value)} onClick={() => toggleSupport(value)}>{value}</ChoiceButton>)}
							</div>
						</div> : null}
					</section>
				) : null}

				{step === 3 ? (
					<section className="client-onboarding__step">
						<p className="client-onboarding__eyebrow">Fit preferences</p>
						<h2>Help us prioritize the right fit.</h2>
						<p className="client-onboarding__intro">These are optional. Coach-gender and identity-specific experience are treated as stronger signals than broad training goals.</p>
						<div className="client-onboarding__group">
							<span className="client-onboarding__label">Your gender <em>Optional</em></span>
							<div className="client-onboarding__tag-grid">
								{["Woman", "Man", "Non-binary", "Prefer not to say"].map((value) => <ChoiceButton key={value} active={preferences.clientGender === value} onClick={() => update({ clientGender: preferences.clientGender === value ? "" : value })}>{value}</ChoiceButton>)}
							</div>
						</div>
						<div className="client-onboarding__group">
							<div className="client-onboarding__label-row"><span className="client-onboarding__label">Would you like a coach of a particular gender?</span><small>Strong preference</small></div>
							<div className="client-onboarding__choice-grid client-onboarding__choice-grid--three">
								{["Woman", "Man", "No preference"].map((value) => <ChoiceButton key={value} active={preferences.coachGenderPreference === value} onClick={() => update({ coachGenderPreference: value })}>{value}</ChoiceButton>)}
							</div>
						</div>
						<div className="client-onboarding__group">
							<div className="client-onboarding__label-row"><span className="client-onboarding__label">Experience you’d value</span><small>Choose up to 3</small></div>
							<div className="client-onboarding__tag-grid">
								{FIT_PREFERENCES.map((value) => <ChoiceButton key={value} active={preferences.fitPreferences.includes(value)} onClick={() => toggleFitPreference(value)}>{value}</ChoiceButton>)}
								<ChoiceButton active={preferences.fitPreferences.includes("No preference")} onClick={() => toggleFitPreference("No preference")}>No preference</ChoiceButton>
							</div>
						</div>
					</section>
				) : null}

				{error ? <p className="client-onboarding__error" role="alert">{error}</p> : null}
			</div>

			<footer className="client-onboarding__footer">
				{step > 0 ? <button type="button" className="client-onboarding__back" onClick={back} disabled={busy}>Back</button> : <span />}
				{step < 3 ? <button type="button" className="client-onboarding__next" onClick={() => setStep((current) => current + 1)} disabled={busy}>Continue</button> : <button type="button" className="client-onboarding__next" onClick={finish} disabled={busy}>{busy ? "Saving…" : "Save preferences"}</button>}
			</footer>
			<button type="button" className="client-onboarding__skip" onClick={() => dismissClientOnboarding()} disabled={busy}>Skip for now</button>
		</section>
	);
}
