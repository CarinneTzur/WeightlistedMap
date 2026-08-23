import { useEffect, useRef, useState } from "react";
import {
	createPlacesSessionToken,
	getGymPlace,
	isGooglePlacesConfigured,
	searchGymPlaces,
} from "../services/gymPlaces";
import "./GymPlaceAutocomplete.css";

export default function GymPlaceAutocomplete({
	label = "Which gym?",
	helper = "",
	value = "",
	placeId = "",
	locationHint = "",
	placeholder = "Start typing a gym name",
	required = false,
	disabled = false,
	className = "",
	style,
	onChange,
	onSelect,
}) {
	const [inputValue, setInputValue] = useState(value || "");
	const [results, setResults] = useState([]);
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState("idle");
	const [error, setError] = useState("");
	const sessionTokenRef = useRef(createPlacesSessionToken());

	useEffect(() => {
		setInputValue(value || "");
	}, [value]);

	useEffect(() => {
		if (disabled || !open || inputValue.trim().length < 2 || !isGooglePlacesConfigured) {
			setResults([]);
			setStatus("idle");
			return undefined;
		}
		const controller = new AbortController();
		const timeoutId = window.setTimeout(async () => {
			setStatus("loading");
			setError("");
			try {
				setResults(await searchGymPlaces(inputValue, {
					locationHint,
					sessionToken: sessionTokenRef.current,
					signal: controller.signal,
				}));
				setStatus("done");
			} catch (searchError) {
				if (searchError?.name === "AbortError") return;
				setResults([]);
				setStatus("error");
				setError(searchError?.message || "Gym search is unavailable right now.");
			}
		}, 280);
		return () => {
			controller.abort();
			window.clearTimeout(timeoutId);
		};
	}, [disabled, inputValue, locationHint, open]);

	async function choosePrediction(prediction) {
		setStatus("selecting");
		setError("");
		try {
			const place = await getGymPlace(prediction.placeId, {
				sessionToken: sessionTokenRef.current,
				fallbackName: prediction.name,
			});
			setInputValue(place.name || prediction.name);
			onSelect?.(place);
			setOpen(false);
			setResults([]);
			sessionTokenRef.current = createPlacesSessionToken();
			setStatus("done");
		} catch (placeError) {
			setError(placeError?.message || "We couldn’t confirm that gym location.");
			setStatus("error");
		}
	}

	function updateInput(nextValue) {
		setInputValue(nextValue);
		onChange?.(nextValue);
		setOpen(true);
		setError("");
	}

	return (
		<label
			className={`gym-place-field${className ? ` ${className}` : ""}`}
			style={style}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
			}}
		>
			<span>{label}{helper ? <em>{helper}</em> : null}</span>
			<input
				value={inputValue}
				required={required}
				disabled={disabled}
				onChange={(event) => updateInput(event.target.value)}
				onFocus={() => { if (!disabled) setOpen(true); }}
				placeholder={placeholder}
				autoComplete="off"
			/>
			{placeId ? <small className="gym-place-field__selected">Exact gym location selected</small> : null}
			{open && !disabled ? (
				<div className="gym-place-field__results" role="listbox">
					{isGooglePlacesConfigured && results.length ? results.map((result) => (
						<button key={result.placeId} type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => choosePrediction(result)} disabled={status === "selecting"}>
							<strong>{result.name}</strong>
							<span>{result.address || "Exact address available after selection"}</span>
						</button>
					)) : null}
					{inputValue.trim() ? (
						<button type="button" className="gym-place-field__manual" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange?.(inputValue.trim()); setOpen(false); }}>
							<strong>Use “{inputValue.trim()}” manually</strong>
							<span>{isGooglePlacesConfigured ? "Only use this if the exact location is missing." : "Add a Google Maps key to search exact locations."}</span>
						</button>
					) : <div className="gym-place-field__empty">Start typing to find the exact gym location.</div>}
					{status === "loading" ? <div className="gym-place-field__empty">Searching Google Maps…</div> : null}
					{error ? <div className="gym-place-field__empty">{error}</div> : null}
					{isGooglePlacesConfigured ? <div className="gym-place-field__attribution">Google Maps</div> : null}
				</div>
			) : null}
		</label>
	);
}
