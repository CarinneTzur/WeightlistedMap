const GOOGLE_PLACES_API_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();

export const isGooglePlacesConfigured = Boolean(GOOGLE_PLACES_API_KEY);

export function createPlacesSessionToken() {
	return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function textValue(value) {
	return typeof value === "string" ? value : value?.text || "";
}

function addressPart(addressComponents, type, { short = false } = {}) {
	const component = (addressComponents || []).find((item) => item.types?.includes(type));
	return short ? textValue(component?.shortText) : textValue(component?.longText);
}

export async function searchGymPlaces(query, { locationHint = "", sessionToken, signal } = {}) {
	if (!isGooglePlacesConfigured || String(query || "").trim().length < 2) return [];
	const input = [String(query).trim(), String(locationHint).trim()].filter(Boolean).join(" ");
	const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
			"X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
		},
		body: JSON.stringify({
			input,
			includedRegionCodes: ["us"],
			includedPrimaryTypes: ["gym"],
			sessionToken,
		}),
		signal,
	});
	if (!response.ok) throw new Error("Gym search is unavailable right now.");
	const payload = await response.json();
	return (payload.suggestions || [])
		.map((suggestion) => suggestion.placePrediction)
		.filter(Boolean)
		.map((prediction) => ({
			placeId: prediction.placeId,
			name: textValue(prediction.structuredFormat?.mainText) || textValue(prediction.text),
			address: textValue(prediction.structuredFormat?.secondaryText),
		}));
}

export async function getGymPlace(placeId, { sessionToken, signal, fallbackName = "" } = {}) {
	if (!isGooglePlacesConfigured || !placeId) throw new Error("Gym search is not configured.");
	const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
	if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
	const response = await fetch(url, {
		headers: {
			"X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
			"X-Goog-FieldMask": "id,formattedAddress,addressComponents,location",
		},
		signal,
	});
	if (!response.ok) throw new Error("Gym details are unavailable right now.");
	const place = await response.json();
	return {
		placeId: place.id || placeId,
		name: fallbackName,
		address: textValue(place.formattedAddress),
		city: addressPart(place.addressComponents, "locality") || addressPart(place.addressComponents, "postal_town"),
		state: addressPart(place.addressComponents, "administrative_area_level_1", { short: true }),
		latitude: Number(place.location?.latitude) || null,
		longitude: Number(place.location?.longitude) || null,
	};
}
