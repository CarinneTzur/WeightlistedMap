import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import CoachApplicationAdmin from "./src/components/CoachApplicationAdmin";
import CoachApplicationForm from "./src/components/CoachApplicationForm";
import {
	getAllCoaches,
	getAllGyms,
	getStateByAbbr,
	getStatesWithCoaches,
} from "./utils/coachData";
import {
	COACH_APPLICATION_CHANGED_EVENT,
	refreshApprovedCoachCache,
} from "./utils/coachApplications";

const SHOW_COACH_APPLICATION_CTA =
	import.meta.env.VITE_SHOW_COACH_APPLICATION_CTA !== "false";

function getCurrentAppRoute() {
	if (typeof window === "undefined") {
		return { path: "/", params: new URLSearchParams() };
	}

	const hashRoute = window.location.hash.replace(/^#/, "");
	const rawRoute = hashRoute || window.location.pathname || "/";
	const [pathPart, queryString = ""] = rawRoute.split("?");
	const normalizedPath = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
	const path = normalizedPath === "/index.html" ? "/" : normalizedPath;

	return {
		path,
		params: new URLSearchParams(queryString),
	};
}

function navigateToAppRoute(path) {
	if (typeof window === "undefined") return;
	const nextHash = `#${path}`;
	if (window.location.hash !== nextHash) {
		window.location.hash = path;
	} else {
		window.dispatchEvent(new HashChangeEvent("hashchange"));
	}
}

const palette = {
	graphite900: "#1E1C1E",
	graphite850: "#262326",
	graphite800: "#373537",
	graphite700: "#4E4C4E",
	graphite500: "#6A6965",
	graphite300: "#A8A6A2",
	graphite100: "#C6C5C3",
	text: "#F2F1EF",
	muted: "#A8A6A2",
	border: "rgba(198,197,195,0.14)",
	panel: "rgba(30,28,30,0.88)",
	gold: "rgba(217,189,125,0.88)",
};

const STATE_ABBR_BY_NAME = {
	Alabama: "AL",
	Alaska: "AK",
	Arizona: "AZ",
	Arkansas: "AR",
	California: "CA",
	Colorado: "CO",
	Connecticut: "CT",
	Delaware: "DE",
	Florida: "FL",
	Georgia: "GA",
	Hawaii: "HI",
	Idaho: "ID",
	Illinois: "IL",
	Indiana: "IN",
	Iowa: "IA",
	Kansas: "KS",
	Kentucky: "KY",
	Louisiana: "LA",
	Maine: "ME",
	Maryland: "MD",
	Massachusetts: "MA",
	Michigan: "MI",
	Minnesota: "MN",
	Mississippi: "MS",
	Missouri: "MO",
	Montana: "MT",
	Nebraska: "NE",
	Nevada: "NV",
	"New Hampshire": "NH",
	"New Jersey": "NJ",
	"New Mexico": "NM",
	"New York": "NY",
	"North Carolina": "NC",
	"North Dakota": "ND",
	Ohio: "OH",
	Oklahoma: "OK",
	Oregon: "OR",
	Pennsylvania: "PA",
	"Rhode Island": "RI",
	"South Carolina": "SC",
	"South Dakota": "SD",
	Tennessee: "TN",
	Texas: "TX",
	Utah: "UT",
	Vermont: "VT",
	Virginia: "VA",
	Washington: "WA",
	"West Virginia": "WV",
	Wisconsin: "WI",
	Wyoming: "WY",
};

const STATE_LABEL_COORD_OVERRIDES = {
	Michigan: [43.82, -84.85],
	Florida: [28.05, -81.55],
	Louisiana: [30.88, -91.98],
	Maryland: [39.03, -76.78],
	Delaware: [39.05, -75.48],
	"New Jersey": [40.12, -74.7],
	Massachusetts: [42.22, -71.82],
	Connecticut: [41.62, -72.72],
	"Rhode Island": [41.68, -71.53],
	"New Hampshire": [43.68, -71.58],
	Vermont: [44.05, -72.72],
	Hawaii: [20.78, -156.36],
	Alaska: [64.2, -152.2],
};

const STATE_LABEL_SIZE_OVERRIDES = { Michigan: 0.72, Florida: 0.78 };

const SEMANTIC_SYNONYMS = {
	barbell: [
		"powerlifting",
		"olympic",
		"lifting",
		"strength",
		"squat",
		"bench",
		"deadlift",
		"technique",
	],
	heavy: [
		"powerlifting",
		"strength",
		"barbell",
		"deadlift",
		"squat",
		"olympic",
	],
	lifting: ["powerlifting", "olympic", "strength", "barbell", "technique"],
	lift: ["powerlifting", "olympic", "strength", "barbell"],
	strength: [
		"powerlifting",
		"conditioning",
		"athleticism",
		"resilience",
		"performance",
	],
	power: ["powerlifting", "strength", "barbell"],
	powerlifting: [
		"barbell",
		"squat",
		"bench",
		"deadlift",
		"strength",
		"technique",
	],
	olympic: [
		"weightlifting",
		"barbell",
		"clean",
		"jerk",
		"snatch",
		"technique",
		"lifting",
	],
	weightlifting: ["olympic", "barbell", "clean", "jerk", "snatch", "technique"],
	technique: ["olympic", "powerlifting", "barbell", "form"],
	bodybuilding: ["hypertrophy", "muscle", "physique", "transformation"],
	hypertrophy: ["bodybuilding", "muscle", "physique", "transformation"],
	wellness: [
		"lifestyle",
		"nutrition",
		"longevity",
		"sustainable",
		"health",
		"transformation",
	],
	female: ["women", "woman", "female", "lifestyle", "wellness", "nutrition"],
	woman: ["women", "female", "wellness", "lifestyle"],
	women: ["woman", "female", "wellness", "lifestyle"],
	nutrition: ["wellness", "lifestyle", "sustainable", "health"],
	lifestyle: ["wellness", "nutrition", "longevity", "transformation"],
	athlete: ["athleticism", "conditioning", "strength", "performance"],
	athletic: ["athleticism", "conditioning", "strength", "performance"],
	conditioning: ["athleticism", "strength", "performance", "resilience"],
	performance: ["strength", "conditioning", "athleticism", "resilience"],
};

const STOP_WORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"by",
	"for",
	"from",
	"in",
	"into",
	"is",
	"it",
	"of",
	"on",
	"or",
	"that",
	"the",
	"this",
	"to",
	"with",
	"who",
	"looking",
	"look",
	"find",
	"coach",
	"coaches",
	"trainer",
	"training",
]);

// --- Clustering ---
// Grid-based clustering: at each zoom level, snap gym coords to a grid cell
// and merge gyms that land in the same cell.
const CLUSTER_GRID_SIZE_DEG = {
	3: 8,
	4: 5,
	5: 2.5,
	6: 1.2,
	7: 0.6,
	8: 0.3,
};

const ZIP_RADIUS_OPTIONS = [10, 25, 50, 100, 250];

function toRadians(degrees) {
	return (degrees * Math.PI) / 180;
}

function getDistanceMiles(pointA, pointB) {
	const earthRadiusMiles = 3958.8;
	const deltaLat = toRadians(pointB.latitude - pointA.latitude);
	const deltaLng = toRadians(pointB.longitude - pointA.longitude);
	const latA = toRadians(pointA.latitude);
	const latB = toRadians(pointB.latitude);
	const haversine =
		Math.sin(deltaLat / 2) ** 2 +
		Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLng / 2) ** 2;

	return (
		2 *
		earthRadiusMiles *
		Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
	);
}

function getZipOrigin(zip, gyms) {
	const normalizedZip = zip.trim();
	if (normalizedZip.length < 5) return null;
	return gyms.find((gym) => gym.zip === normalizedZip) || null;
}

function filterGymsByZipRadius(gyms, zip, radiusMiles) {
	if (zip.trim().length < 5) return gyms;
	const origin = getZipOrigin(zip, gyms);
	if (!origin) return [];

	return gyms.filter(
		(gym) => getDistanceMiles(origin, gym) <= Number(radiusMiles),
	);
}

function uniqueCoaches(coaches) {
	return Array.from(
		new Map(coaches.map((coach) => [coach.id, coach])).values(),
	);
}

function buildGymCluster(id, gyms) {
	const coaches = uniqueCoaches(gyms.flatMap((gym) => gym.coachesAtGym));
	const weightTotal = gyms.reduce(
		(total, gym) => total + Math.max(gym.coachCount, 1),
		0,
	);
	const weightedLatitude =
		gyms.reduce(
			(total, gym) => total + gym.latitude * Math.max(gym.coachCount, 1),
			0,
		) / weightTotal;
	const weightedLongitude =
		gyms.reduce(
			(total, gym) => total + gym.longitude * Math.max(gym.coachCount, 1),
			0,
		) / weightTotal;

	return {
		id,
		gyms,
		coaches,
		lat: weightedLatitude,
		lng: weightedLongitude,
		count: coaches.length,
		gymCount: gyms.length,
	};
}

function clusterGyms(gyms, zoom) {
	if (zoom <= 4) {
		const stateGroups = new Map();
		gyms.forEach((gym) => {
			if (!stateGroups.has(gym.state)) stateGroups.set(gym.state, []);
			stateGroups.get(gym.state).push(gym);
		});

		return Array.from(stateGroups.entries()).map(([state, stateGyms]) =>
			buildGymCluster(`state-${state}`, stateGyms),
		);
	}

	const gridSize = CLUSTER_GRID_SIZE_DEG[Math.min(zoom, 8)] ?? 0;
	if (!gridSize) {
		return gyms.map((gym) => ({
			id: `single-${gym.id}`,
			gyms: [gym],
			coaches: gym.coachesAtGym,
			lat: gym.latitude,
			lng: gym.longitude,
			count: gym.coachCount,
			gymCount: 1,
		}));
	}

	const cells = new Map();
	gyms.forEach((gym) => {
		const cellLat = Math.floor(gym.latitude / gridSize);
		const cellLng = Math.floor(gym.longitude / gridSize);
		const key = `${cellLat},${cellLng}`;
		if (!cells.has(key)) {
			cells.set(key, { gyms: [] });
		}
		cells.get(key).gyms.push(gym);
	});

	return Array.from(cells.entries()).map(([key, cell]) =>
		buildGymCluster(`cluster-${key}`, cell.gyms),
	);
}

function useIsDesktop() {
	const [isDesktop, setIsDesktop] = useState(
		typeof window !== "undefined" ? window.innerWidth >= 1024 : true,
	);
	useEffect(() => {
		const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
		handleResize();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);
	return isDesktop;
}

function normalizeToken(token) {
	return token
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")
		.replace(/ies$/, "y")
		.replace(/ing$/, "")
		.replace(/ers$/, "er")
		.replace(/s$/, "");
}

function tokenizeText(text) {
	return String(text || "")
		.toLowerCase()
		.split(/[^a-z0-9]+/i)
		.map(normalizeToken)
		.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function expandTokens(tokens) {
	const expanded = [];
	tokens.forEach((token) => {
		expanded.push({ token, weight: 1 });
		(SEMANTIC_SYNONYMS[token] || []).forEach((synonym) => {
			expanded.push({ token: normalizeToken(synonym), weight: 0.72 });
		});
	});
	return expanded.filter(
		({ token }) => token.length > 1 && !STOP_WORDS.has(token),
	);
}

function getCoachSearchText(coach) {
	return [
		coach.name,
		coach.title,
		coach.city,
		coach.bio,
		coach.state,
		coach.stateAbbr,
		coach.gyms?.map((gym) =>
			[
				gym.name,
				gym.city,
				gym.state,
				gym.zip,
				gym.tags?.join(" "),
				gym.description,
			].join(" "),
		),
		coach.specialties?.join(" "),
		coach.onlineTraining ? "online training" : "",
	].join(" ");
}

function getGymSearchText(gym) {
	return [
		gym.name,
		gym.address,
		gym.city,
		gym.state,
		gym.zip,
		gym.tags?.join(" "),
		gym.description,
		gym.coachesAtGym
			?.map((coach) =>
				[coach.name, coach.title, coach.specialties?.join(" ")].join(" "),
			)
			.join(" "),
	].join(" ");
}

function buildWeightedVector(weightedTokens, idfMap = {}) {
	return weightedTokens.reduce((vector, { token, weight }) => {
		const idf = idfMap[token] || 1;
		vector[token] = (vector[token] || 0) + weight * idf;
		return vector;
	}, {});
}

function cosineSimilarity(vectorA, vectorB) {
	let dot = 0,
		magA = 0,
		magB = 0;
	Object.entries(vectorA).forEach(([token, value]) => {
		dot += value * (vectorB[token] || 0);
		magA += value * value;
	});
	Object.values(vectorB).forEach((value) => {
		magB += value * value;
	});
	if (!magA || !magB) return 0;
	return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function rankCoachesBySemanticSearch(coaches, query) {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) return coaches;

	const documents = coaches.map((coach, index) => {
		const baseTokens = tokenizeText(getCoachSearchText(coach));
		const expandedTokens = expandTokens(baseTokens);
		return {
			coach,
			index,
			tokens: expandedTokens,
			uniqueTokens: new Set(expandedTokens.map(({ token }) => token)),
		};
	});

	const documentFrequency = {};
	documents.forEach((doc) => {
		doc.uniqueTokens.forEach((token) => {
			documentFrequency[token] = (documentFrequency[token] || 0) + 1;
		});
	});

	const idfMap = Object.fromEntries(
		Object.entries(documentFrequency).map(([token, count]) => [
			token,
			Math.log((documents.length + 1) / (count + 1)) + 1,
		]),
	);

	const queryTokens = expandTokens(tokenizeText(trimmedQuery));
	const queryVector = buildWeightedVector(queryTokens, idfMap);

	return documents
		.map((doc) => {
			const coachVector = buildWeightedVector(doc.tokens, idfMap);
			return {
				coach: doc.coach,
				index: doc.index,
				score: cosineSimilarity(queryVector, coachVector),
			};
		})
		.filter(({ score }) => score > 0.01)
		.sort((a, b) =>
			b.score !== a.score ? b.score - a.score : a.index - b.index,
		)
		.map(({ coach }) => coach);
}

function rankGymsBySemanticSearch(gyms, query) {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) return gyms;

	const queryTokens = expandTokens(tokenizeText(trimmedQuery)).map(
		({ token }) => token,
	);
	return gyms.filter((gym) => {
		const gymTokens = new Set(tokenizeText(getGymSearchText(gym)));
		return queryTokens.some((token) => gymTokens.has(token));
	});
}

function getOuterRingsFromGeometry(geometry) {
	if (!geometry) return [];
	if (geometry.type === "Polygon")
		return geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
	if (geometry.type === "MultiPolygon") {
		return geometry.coordinates
			.map((p) => p?.[0])
			.filter((r) => Array.isArray(r) && r.length > 2);
	}
	return [];
}

function getRingAreaAndCentroid(ring) {
	let doubledArea = 0,
		centroidLng = 0,
		centroidLat = 0;
	for (let i = 0; i < ring.length - 1; i++) {
		const [lng1, lat1] = ring[i],
			[lng2, lat2] = ring[i + 1];
		const cross = lng1 * lat2 - lng2 * lat1;
		doubledArea += cross;
		centroidLng += (lng1 + lng2) * cross;
		centroidLat += (lat1 + lat2) * cross;
	}
	if (Math.abs(doubledArea) < 0.000001) {
		const total = ring.reduce(
			(acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
			{ lng: 0, lat: 0 },
		);
		return {
			area: 0,
			center: [total.lat / ring.length, total.lng / ring.length],
		};
	}
	return {
		area: Math.abs(doubledArea / 2),
		center: [centroidLat / (3 * doubledArea), centroidLng / (3 * doubledArea)],
	};
}

function getBestStateLabelLatLng(feature, fallbackCenter) {
	const stateName = feature.properties.name;
	if (STATE_LABEL_COORD_OVERRIDES[stateName])
		return L.latLng(STATE_LABEL_COORD_OVERRIDES[stateName]);
	const rings = getOuterRingsFromGeometry(feature.geometry);
	if (!rings.length) return fallbackCenter;
	const largestRing = rings
		.map((ring) => ({ ring, ...getRingAreaAndCentroid(ring) }))
		.sort((a, b) => b.area - a.area)[0];
	if (!largestRing?.center) return fallbackCenter;
	return L.latLng(largestRing.center[0], largestRing.center[1]);
}

function runSelfTests() {
	const coaches = getAllCoaches();
	console.assert(
		getStateByAbbr("CA")?.name === "California",
		"CA state lookup should return California",
	);
	console.assert(
		coaches.every((c) => c.state && c.abbr),
		"Every coach should include state metadata",
	);
	console.assert(
		STATE_ABBR_BY_NAME["New York"] === "NY",
		"State abbreviation lookup should include New York",
	);
}
if (typeof window !== "undefined") runSelfTests();

const styles = {
	shell: {
		minHeight: "100vh",
		background:
			"radial-gradient(circle at top left, rgba(198,197,195,0.08), transparent 34%), linear-gradient(135deg, #1E1C1E, #373537)",
		color: palette.text,
		fontFamily:
			"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
		position: "relative",
		overflow: "hidden",
	},
	map: {
		width: "100%",
		height: "100dvh",
		filter: "grayscale(1) contrast(1.05) brightness(0.82)",
	},
	introOverlay: {
		position: "fixed",
		inset: 0,
		zIndex: 1200,
		display: "grid",
		placeItems: "center",
		padding: 22,
		background: "rgba(0,0,0,0.48)",
		backdropFilter: "blur(7px)",
		WebkitBackdropFilter: "blur(7px)",
	},
	introModal: {
		position: "relative",
		width: "min(560px, calc(100vw - 44px))",
		padding: "28px 28px 26px",
		background:
			"linear-gradient(145deg, rgba(30,28,30,0.96), rgba(55,53,55,0.9))",
		border: `1px solid ${palette.border}`,
		borderRadius: 24,
		boxShadow: "0 34px 90px rgba(0,0,0,0.52)",
		color: palette.text,
	},
	introCloseButton: {
		position: "absolute",
		top: 16,
		right: 16,
		width: 40,
		height: 40,
		borderRadius: 999,
		border: `1px solid ${palette.border}`,
		background: "rgba(198,197,195,0.07)",
		color: palette.graphite100,
		cursor: "pointer",
		fontSize: 22,
		lineHeight: 1,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
	},
	eyebrow: {
		margin: "0 0 8px",
		fontSize: 11,
		letterSpacing: "0.18em",
		textTransform: "uppercase",
		color: palette.muted,
	},
	title: {
		margin: 0,
		fontSize: 24,
		lineHeight: 1.12,
		fontWeight: 650,
		letterSpacing: "-0.04em",
		color: palette.muted,
	},
	description: {
		margin: "10px 0 0",
		color: palette.muted,
		fontSize: 14,
		lineHeight: 1.5,
	},
	stats: {
		display: "grid",
		gridTemplateColumns: "repeat(3, 1fr)",
		gap: 10,
		marginTop: 16,
	},
	stat: {
		padding: "11px 10px",
		border: `1px solid ${palette.border}`,
		borderRadius: 12,
		background: "rgba(198,197,195,0.045)",
	},
	statStrong: {
		display: "block",
		fontSize: 17,
		lineHeight: 1,
		color: palette.text,
	},
	statLabel: {
		display: "block",
		marginTop: 5,
		fontSize: 11,
		color: palette.muted,
	},
	semanticSearchButton: {
		position: "absolute",
		zIndex: 902,
		left: 24,
		bottom: 158,
		display: "inline-flex",
		alignItems: "center",
		gap: 9,
		padding: "13px 17px",
		background: palette.panel,
		border: `1px solid ${palette.border}`,
		borderRadius: 999,
		color: palette.text,
		backdropFilter: "blur(18px)",
		boxShadow: "0 20px 60px rgba(0,0,0,0.36)",
		cursor: "pointer",
		fontWeight: 700,
		fontSize: 14,
		lineHeight: 1,
	},
	semanticSearchButtonActive: {
		background: palette.graphite100,
		color: palette.graphite900,
		border: "1px solid rgba(198,197,195,0.46)",
	},
	semanticSearchIcon: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		color: "currentColor",
		fontSize: 15,
		lineHeight: 1,
		fontWeight: 400,
		transform: "translateY(-0.5px)",
	},
	controls: {
		position: "absolute",
		zIndex: 900,
		left: 24,
		bottom: 86,
		display: "flex",
		gap: 10,
		padding: 8,
		background: palette.panel,
		border: `1px solid ${palette.border}`,
		borderRadius: 999,
		backdropFilter: "blur(18px)",
		boxShadow: "0 20px 60px rgba(0,0,0,0.36)",
	},
	favoritesBar: {
		position: "absolute",
		zIndex: 901,
		left: 24,
		bottom: 24,
		display: "inline-flex",
		alignItems: "center",
		gap: 10,
		padding: "13px 17px",
		background: palette.panel,
		border: `1px solid ${palette.border}`,
		borderRadius: 999,
		color: palette.text,
		backdropFilter: "blur(18px)",
		boxShadow: "0 20px 60px rgba(0,0,0,0.36)",
		cursor: "pointer",
		fontWeight: 700,
		fontSize: 14,
		lineHeight: 1,
	},
	favoritesCount: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		minWidth: 24,
		height: 24,
		padding: "0 7px",
		borderRadius: 999,
		background: palette.graphite100,
		color: palette.graphite900,
		fontSize: 12,
		fontWeight: 850,
	},
	controlButton: {
		border: 0,
		borderRadius: 999,
		padding: "11px 14px",
		cursor: "pointer",
		color: palette.text,
		background: "transparent",
		font: "inherit",
		fontSize: 13,
		transition: "background 160ms ease, color 160ms ease, transform 160ms ease",
	},
	activeControl: {
		background: palette.graphite100,
		color: palette.graphite900,
	},
	glassPanel: {
		position: "fixed",
		top: 0,
		right: 0,
		height: "100vh",
		width: 430,
		background:
			"linear-gradient(145deg, rgba(30,28,30,0.96) 0%, rgba(55,53,55,0.94) 100%)",
		boxShadow: "-2px 0 56px rgba(0,0,0,0.46)",
		borderLeft: `1px solid ${palette.border}`,
		zIndex: 1000,
		padding: "34px 34px 22px",
		display: "flex",
		flexDirection: "column",
		gap: 22,
		transition:
			"transform 0.46s cubic-bezier(.22,.7,.24,1), opacity 0.28s ease, right 0.46s cubic-bezier(.22,.7,.24,1)",
		backdropFilter: "blur(18px) saturate(130%)",
		overflowY: "hidden",
		overscrollBehavior: "contain",
	},
	glassPanelHidden: {
		transform: "translateX(104%)",
		pointerEvents: "none",
		opacity: 0,
	},
	glassPanelShown: { transform: "none", pointerEvents: "all", opacity: 1 },
	backArrow: {
		cursor: "pointer",
		width: 38,
		height: 38,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		opacity: 0.92,
		fontSize: 22,
		fontWeight: "bold",
		color: palette.graphite100,
		background: "rgba(198,197,195,0.06)",
		border: `1px solid ${palette.border}`,
		borderRadius: 999,
		outline: "none",
		transition: "background 160ms ease, transform 160ms ease",
	},
	heartButton: {
		cursor: "pointer",
		width: 42,
		height: 42,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: 21,
		color: palette.graphite100,
		background: "rgba(198,197,195,0.06)",
		border: `1px solid ${palette.border}`,
		borderRadius: 999,
		outline: "none",
		transition: "background 160ms ease, transform 160ms ease, color 160ms ease",
	},
	heartButtonActive: {
		background: "rgba(217,189,125,0.16)",
		border: "1px solid rgba(217,189,125,0.46)",
		color: "#F2D88B",
	},
	profileTopRow: {
		width: "100%",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 2,
	},
	coachListHeader: {
		display: "flex",
		alignItems: "center",
		gap: 13,
		marginBottom: 14,
	},
	searchInput: {
		width: "100%",
		padding: "12px 16px",
		borderRadius: 13,
		fontSize: 15,
		lineHeight: 1.35,
		margin: 0,
		outline: "none",
		background: "rgba(30,28,30,0.72)",
		border: `1px solid ${palette.border}`,
		color: palette.text,
		boxShadow: "0 1.5px 8px rgba(0,0,0,0.22) inset",
		fontFamily: "inherit",
		minHeight: 46,
		height: 46,
		maxHeight: 46,
		resize: "none",
		overflowY: "hidden",
		appearance: "none",
	},
	searchInputCompact: {
		minHeight: 42,
		height: 42,
		maxHeight: 42,
		padding: "10px 14px",
		borderRadius: 12,
		fontSize: 16,
	},
	searchInputWrap: {
		position: "relative",
		margin: "0 0 22px 0",
	},
	searchPlaceholderMarquee: {
		position: "absolute",
		left: 17,
		right: 17,
		top: "50%",
		transform: "translateY(-50%)",
		overflow: "hidden",
		whiteSpace: "nowrap",
		pointerEvents: "none",
		color: "rgba(198,197,195,0.58)",
		fontSize: 15,
		lineHeight: 1.35,
	},
	coachCard: {
		background:
			"linear-gradient(90deg, rgba(55,53,55,0.72), rgba(78,76,78,0.42))",
		borderRadius: 18,
		padding: "18px 20px",
		marginBottom: 18,
		boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
		display: "flex",
		alignItems: "center",
		gap: 16,
		cursor: "pointer",
		border: `1px solid ${palette.border}`,
		width: "100%",
		textAlign: "left",
		fontFamily: "inherit",
		transition:
			"border-color 0.18s ease, box-shadow 0.26s ease, transform 0.18s ease",
		position: "relative",
	},
	coachCardCompact: {
		borderRadius: 15,
		padding: "13px 14px",
		marginBottom: 10,
		gap: 12,
		boxShadow: "0 8px 22px rgba(0,0,0,0.20)",
	},
	coachCardHovered: {
		border: "1px solid rgba(198,197,195,0.34)",
		boxShadow: "0 18px 42px rgba(0,0,0,0.34)",
		transform: "translateY(-2px)",
		zIndex: 3,
	},
	headshot: {
		width: 68,
		height: 68,
		borderRadius: "50%",
		objectFit: "cover",
		border: "3px solid rgba(198,197,195,0.20)",
		background: palette.graphite800,
		margin: 0,
		filter: "grayscale(0.15)",
	},
	headshotCompact: {
		width: 52,
		height: 52,
		borderWidth: 2,
	},
	coachInfo: { flex: 1, minWidth: 0 },
	coachName: {
		fontWeight: 650,
		fontSize: 17,
		marginBottom: 2,
		color: palette.text,
	},
	coachNameCompact: {
		fontSize: 15.5,
		marginBottom: 1,
	},
	coachTitle: { fontSize: 14, color: palette.graphite100, marginBottom: 3 },
	coachLocation: { fontSize: 13, color: palette.muted, marginBottom: 4 },
	coachGymLine: {
		fontSize: 13.5,
		color: palette.graphite100,
		fontWeight: 620,
		lineHeight: 1.35,
		marginBottom: 5,
	},
	coachRating: {
		fontSize: 13.5,
		color: palette.graphite100,
		fontWeight: 650,
		marginBottom: 2,
		marginLeft: 1,
	},
	tagList: { display: "flex", gap: 7, flexWrap: "wrap", marginTop: 7 },
	tag: {
		display: "inline-block",
		fontSize: 12.4,
		fontWeight: 550,
		padding: "4px 10px",
		background: "rgba(198,197,195,0.08)",
		color: palette.graphite100,
		border: `1px solid ${palette.border}`,
		borderRadius: 999,
		marginTop: 2,
		letterSpacing: 0.1,
	},
	profilePanel: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: 15,
		marginTop: 2,
	},
	profileHeadshot: {
		width: 118,
		height: 118,
		borderRadius: "50%",
		objectFit: "cover",
		border: "4px solid rgba(198,197,195,0.24)",
		boxShadow: "0 18px 56px rgba(0,0,0,0.42)",
		marginBottom: 4,
		marginTop: 6,
		background: palette.graphite800,
		filter: "grayscale(0.1)",
	},
	profileName: {
		fontWeight: 720,
		fontSize: 25,
		color: palette.text,
		lineHeight: 1.08,
		marginBottom: 2,
		textAlign: "center",
	},
	profileTitle: {
		color: palette.graphite100,
		fontSize: 16,
		fontWeight: 550,
		marginBottom: 4,
		textAlign: "center",
	},
	profileLocation: {
		color: palette.muted,
		fontSize: 14,
		marginBottom: 3,
		textAlign: "center",
	},
	profileBio: {
		color: "rgba(242,241,239,0.78)",
		fontSize: 14.8,
		lineHeight: 1.55,
		marginBottom: 8,
		textAlign: "center",
		maxWidth: 320,
	},
	profileStats: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		marginBottom: 10,
		flexWrap: "wrap",
	},
	profileStat: {
		color: palette.graphite100,
		fontSize: 13.8,
		fontWeight: 550,
		background: "rgba(198,197,195,0.07)",
		border: `1px solid ${palette.border}`,
		padding: "7px 12px",
		borderRadius: 999,
		margin: 0,
	},
	primaryButton: {
		display: "block",
		width: "100%",
		background: palette.graphite100,
		color: palette.graphite900,
		fontWeight: 750,
		fontSize: 16.5,
		border: "none",
		borderRadius: 999,
		padding: "15px 0",
		marginTop: 10,
		marginBottom: 20,
		cursor: "pointer",
		boxShadow: "0 18px 42px rgba(0,0,0,0.30)",
		letterSpacing: 0.1,
		transition: "filter 160ms ease, transform 160ms ease",
	},
	contactPanel: {
		display: "flex",
		flexDirection: "column",
		height: "100%",
		minHeight: 0,
		gap: 0,
	},
	contactTopRow: {
		width: "100%",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 22,
	},
	contactHeader: {
		display: "flex",
		alignItems: "center",
		gap: 14,
		paddingBottom: 18,
		borderBottom: "1px solid rgba(198,197,195,0.12)",
	},
	contactAvatar: {
		width: 58,
		height: 58,
		borderRadius: "50%",
		objectFit: "cover",
		border: "2px solid rgba(198,197,195,0.22)",
		background: palette.graphite800,
		filter: "grayscale(0.08)",
		flexShrink: 0,
	},
	contactName: {
		fontSize: 18,
		fontWeight: 760,
		color: palette.text,
		lineHeight: 1.15,
		marginBottom: 5,
	},
	contactSpecialty: {
		fontSize: 13,
		color: palette.muted,
		lineHeight: 1.35,
	},
	messageArea: {
		flex: 1,
		display: "flex",
		flexDirection: "column",
		justifyContent: "flex-end",
		padding: "22px 0 0",
		minHeight: 0,
	},
	messageHint: {
		alignSelf: "center",
		maxWidth: 300,
		margin: "28px 0 auto",
		padding: "14px 16px",
		borderRadius: 18,
		background: "rgba(198,197,195,0.055)",
		border: `1px solid ${palette.border}`,
		color: "rgba(242,241,239,0.72)",
		fontSize: 13.5,
		lineHeight: 1.45,
		textAlign: "center",
	},
	messageSentBubble: {
		alignSelf: "flex-end",
		maxWidth: "86%",
		padding: "12px 14px",
		borderRadius: "18px 18px 6px 18px",
		background: palette.graphite100,
		color: palette.graphite900,
		fontSize: 14,
		lineHeight: 1.45,
		fontWeight: 560,
		boxShadow: "0 14px 32px rgba(0,0,0,0.26)",
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
	},
	messageInputWrap: {
		display: "flex",
		alignItems: "flex-end",
		gap: 10,
		paddingTop: 16,
		borderTop: "1px solid rgba(198,197,195,0.10)",
	},
	messageInput: {
		flex: 1,
		minHeight: 52,
		maxHeight: 112,
		resize: "none",
		overflowY: "hidden",
		borderRadius: 18,
		padding: "14px 15px",
		outline: "none",
		background: "rgba(30,28,30,0.76)",
		border: `1px solid ${palette.border}`,
		color: palette.text,
		fontFamily: "inherit",
		fontSize: 14.5,
		lineHeight: 1.4,
		boxShadow: "0 1.5px 8px rgba(0,0,0,0.22) inset",
	},
	sendButton: {
		width: 54,
		height: 54,
		borderRadius: 999,
		border: "none",
		background: palette.graphite100,
		color: palette.graphite900,
		cursor: "pointer",
		fontSize: 20,
		fontWeight: 850,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		boxShadow: "0 16px 34px rgba(0,0,0,0.32)",
		flexShrink: 0,
	},
	sendButtonDisabled: {
		opacity: 0.45,
		cursor: "not-allowed",
		boxShadow: "none",
	},
	emptyState: {
		color: "rgba(198,197,195,0.72)",
		marginTop: 50,
		fontSize: 15,
		textAlign: "center",
		lineHeight: 1.55,
	},
	coachListPanelInner: {
		overflowY: "auto",
		height: "100%",
		maxHeight: "100%",
		overscrollBehaviorY: "contain",
		marginRight: -24,
		padding: "0 24px 6px 0",
		scrollbarGutter: "stable",
	},
	mobileSheetHandle: {
		display: "block",
		width: 42,
		height: 4,
		borderRadius: 999,
		background: "rgba(198,197,195,0.22)",
		margin: "0 auto 14px",
		flexShrink: 0,
	},
};

function CoachTag({ children }) {
	return <span style={styles.tag}>{children}</span>;
}
function StarRating({ value }) {
	return <span style={styles.coachRating}>★ {value}</span>;
}

function getCoachGymNames(coach) {
	return coach.gyms?.map((gym) => gym.name).filter(Boolean) || [];
}

function CoachCard({
	coach,
	onClick,
	hovered,
	onMouseEnter,
	onMouseLeave,
	compact = false,
}) {
	const gymNames = getCoachGymNames(coach);
	const gymCities = coach.gyms?.map((gym) => gym.city).filter(Boolean) || [];
	const cityLabel = [...new Set(gymCities)].join(" + ") || coach.city;

	return (
		<div
			style={{
				...styles.coachCard,
				...(compact ? styles.coachCardCompact : {}),
				...(hovered ? styles.coachCardHovered : {}),
			}}
			onClick={onClick}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<img
				src={coach.headshot}
				alt={coach.name}
				style={{
					...styles.headshot,
					...(compact ? styles.headshotCompact : {}),
				}}
				loading="lazy"
			/>
			<div style={styles.coachInfo}>
				<div
					style={{
						...styles.coachName,
						...(compact ? styles.coachNameCompact : {}),
					}}
				>
					{coach.name}
				</div>
				<div
					style={{
						...styles.coachTitle,
						...(compact ? { fontSize: 12.8, marginBottom: 2 } : {}),
					}}
				>
					{coach.title}
				</div>
				<div
					style={{
						...styles.coachLocation,
						...(compact ? { fontSize: 12.5, marginBottom: 3 } : {}),
					}}
				>
					{cityLabel}
				</div>
				<div
					style={{
						...styles.coachGymLine,
						...(compact ? { fontSize: 12.6, marginBottom: 3 } : {}),
					}}
				>
					{gymNames.slice(0, 2).join(" + ") || "Gym details coming soon"}
					{gymNames.length > 2 ? ` + ${gymNames.length - 2} more` : ""}
				</div>
				{coach.remoteAvailable && !compact ? (
					<div style={styles.coachLocation}>Remote coaching available</div>
				) : null}
				<StarRating value={coach.rating} />
				<div style={{ ...styles.tagList, ...(compact ? { marginTop: 4 } : {}) }}>
					{coach.specialties.map((tag) => (
						<CoachTag key={tag}>{tag}</CoachTag>
					))}
				</div>
			</div>
		</div>
	);
}

function GymCard({ gym, onClick, compact = false }) {
	return (
		<button
			type="button"
			style={{
				...styles.coachCard,
				...(compact ? styles.coachCardCompact : {}),
			}}
			onClick={onClick}
		>
			<div style={styles.coachInfo}>
				<div
					style={{
						...styles.coachName,
						...(compact ? styles.coachNameCompact : {}),
					}}
				>
					{gym.name}
				</div>
				<div style={styles.coachLocation}>
					{gym.city}, {gym.state}
				</div>
				<div style={styles.coachGymLine}>
					{gym.coachCount} {gym.coachCount === 1 ? "coach" : "coaches"}{" "}
					available
				</div>
				{gym.tags?.length ? (
					<div style={styles.tagList}>
						{gym.tags.slice(0, 4).map((tag) => (
							<CoachTag key={tag}>{tag}</CoachTag>
						))}
					</div>
				) : null}
			</div>
		</button>
	);
}

function StateCard({ state, onClick, compact = false }) {
	const gymCount = state.gyms?.length || 0;
	const coachCount = state.coaches?.length || 0;

	return (
		<button
			type="button"
			style={{
				...styles.coachCard,
				...(compact ? styles.coachCardCompact : {}),
			}}
			onClick={onClick}
		>
			<div style={styles.coachInfo}>
				<div
					style={{
						...styles.coachName,
						...(compact ? styles.coachNameCompact : {}),
					}}
				>
					{state.name}
				</div>
				<div style={styles.coachLocation}>{state.abbr}</div>
				<div style={styles.coachGymLine}>
					{gymCount} {gymCount === 1 ? "gym" : "gyms"} • {coachCount}{" "}
					{coachCount === 1 ? "coach" : "coaches"}
				</div>
				<div style={styles.tagList}>
					{state.gyms?.slice(0, 3).map((gym) => (
						<CoachTag key={gym.id}>{gym.city}</CoachTag>
					))}
				</div>
			</div>
		</button>
	);
}

function CoachProfile({
	coach,
	onBack,
	isFavorite,
	onToggleFavorite,
	onContact,
}) {
	const gymNames = getCoachGymNames(coach);

	return (
		<div style={styles.profilePanel}>
			<div style={styles.profileTopRow}>
				<button
					style={styles.backArrow}
					aria-label="Back to list"
					onClick={onBack}
				>
					←
				</button>
				<button
					style={{
						...styles.heartButton,
						...(isFavorite ? styles.heartButtonActive : {}),
					}}
					aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
					onClick={() => onToggleFavorite(coach.id)}
				>
					{isFavorite ? "♥" : "♡"}
				</button>
			</div>
			<img
				src={coach.headshot}
				alt={coach.name}
				style={styles.profileHeadshot}
				loading="lazy"
			/>
			<div style={styles.profileName}>{coach.name}</div>
			<div style={styles.profileTitle}>{coach.title}</div>
			<div style={styles.profileLocation}>
				Available at: {gymNames.join(" + ") || coach.city}
				{coach.remoteAvailable ? " • Remote coaching available" : ""}
			</div>
			<div style={styles.profileBio}>{coach.bio}</div>
			<div style={{ ...styles.tagList, justifyContent: "center" }}>
				{coach.specialties.map((tag) => (
					<CoachTag key={tag}>{tag}</CoachTag>
				))}
			</div>
			<div style={styles.profileStats}>
				<span style={styles.profileStat}>
					{coach.experience
						? `🏋️ ${coach.experience}`
						: `🏋️ ${coach.roster} athletes`}
				</span>
				{coach.roster ? (
					<span style={styles.profileStat}>Roster: {coach.roster}</span>
				) : null}
				{coach.onlineTraining ? (
					<span style={styles.profileStat}>Online coaching</span>
				) : null}
			</div>
			<button
				type="button"
				style={styles.primaryButton}
				onClick={() => onContact(coach)}
			>
				Contact now
			</button>
		</div>
	);
}

function ContactPanel({ coach, onBack, isDesktop }) {
	const messageInputRef = useRef(null);
	const [message, setMessage] = useState(
		`Hi ${coach.name.split(" ")[0]}, I found your profile on Weightlisted and wanted to ask about coaching.`,
	);
	const [sentMessage, setSentMessage] = useState("");

	const primarySpecialty = coach.specialties?.[0] || coach.title || "Coach";
	const specialtyLabel = coach.specialties?.length
		? coach.specialties.slice(0, 2).join(" • ")
		: coach.title;

	function resizeMessageInput(textarea) {
		if (!textarea) return;
		const maxHeight = 112;
		textarea.style.height = "auto";
		const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
		textarea.style.height = `${nextHeight}px`;
		textarea.style.overflowY =
			textarea.scrollHeight > maxHeight ? "auto" : "hidden";
	}

	useEffect(() => {
		resizeMessageInput(messageInputRef.current);
	}, [message]);

	function handleSend() {
		const trimmed = message.trim();
		if (!trimmed) return;
		setSentMessage(trimmed);
		setMessage("");
	}

	function handleMessageChange(event) {
		setMessage(event.target.value);
		resizeMessageInput(event.target);
	}

	function handleMessageKeyDown(event) {
		if (event.key === "Enter" && event.ctrlKey) {
			event.preventDefault();
			handleSend();
		}
	}

	return (
		<div
			style={{
				...styles.contactPanel,
				...(isDesktop ? {} : { minHeight: 0 }),
			}}
		>
			<div style={styles.contactTopRow}>
				<button
					type="button"
					style={styles.backArrow}
					aria-label="Back to coach profile"
					onClick={onBack}
				>
					←
				</button>
				<span
					style={{
						fontSize: 12,
						color: palette.muted,
						letterSpacing: "0.18em",
						textTransform: "uppercase",
					}}
				>
					Direct message
				</span>
			</div>

			<div style={styles.contactHeader}>
				<img
					src={coach.headshot}
					alt={coach.name}
					style={styles.contactAvatar}
					loading="lazy"
				/>
				<div style={{ minWidth: 0 }}>
					<div style={styles.contactName}>{coach.name}</div>
					<div style={styles.contactSpecialty}>
						{primarySpecialty}
						{specialtyLabel && specialtyLabel !== primarySpecialty
							? ` • ${specialtyLabel}`
							: ""}
					</div>
				</div>
			</div>

			<div
				style={{
					...styles.messageArea,
					...(isDesktop ? {} : { paddingTop: 14 }),
				}}
			>
				{sentMessage ? (
					<div style={styles.messageSentBubble}>{sentMessage}</div>
				) : (
					<div style={styles.messageHint}>
						Start with your goal, timeline, and whether you want in-person or
						online coaching.
					</div>
				)}

				<div style={styles.messageInputWrap}>
					<textarea
						ref={messageInputRef}
						style={styles.messageInput}
						placeholder="Type your message..."
						value={message}
						onChange={handleMessageChange}
						onKeyDown={handleMessageKeyDown}
						rows={1}
						autoFocus
					/>
					<button
						type="button"
						style={{
							...styles.sendButton,
							...(!message.trim() ? styles.sendButtonDisabled : {}),
						}}
						onClick={handleSend}
						disabled={!message.trim()}
						aria-label="Send message"
					>
						➤
					</button>
				</div>
			</div>
		</div>
	);
}

function GymListPanel({
	title,
	eyebrow,
	gyms,
	onBack,
	onSelectGym,
	search,
	setSearch,
	searchAutoFocus = false,
	onSearchFocus,
	onSearchBlur,
	isCompact = false,
}) {
	const filtered = rankGymsBySemanticSearch(gyms, search);

	return (
		<div className="coach-scroll-panel" style={styles.coachListPanelInner}>
			<div style={styles.coachListHeader}>
				<button
					style={styles.backArrow}
					aria-label="Back to map"
					onClick={onBack}
				>
					←
				</button>
				<div>
					<div
						style={{
							fontSize: 12,
							color: palette.muted,
							textTransform: "uppercase",
							letterSpacing: "0.18em",
						}}
					>
						{eyebrow}
					</div>
					<div
						style={{
							fontWeight: 720,
							fontSize: 21,
							color: palette.text,
							letterSpacing: -0.3,
						}}
					>
						{title}
					</div>
				</div>
			</div>
			<div style={styles.searchInputWrap}>
				<input
					type="search"
					className="coach-scroll-panel"
					style={{
						...styles.searchInput,
						...(isCompact ? styles.searchInputCompact : {}),
					}}
					placeholder=""
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					onFocus={onSearchFocus}
					onBlur={onSearchBlur}
					autoFocus={searchAutoFocus}
					enterKeyHint="search"
				/>
				{search ? null : (
					<div style={styles.searchPlaceholderMarquee}>
						<span className="coach-placeholder-marquee">
							Search gyms, cities, ZIPs, tags, or coach specialties
						</span>
					</div>
				)}
			</div>
			<div>
				{filtered.length === 0 ? (
					<div style={styles.emptyState}>
						No gyms found. Try a city, ZIP, gym name, or specialty.
					</div>
				) : null}
				{filtered.map((gym) => (
					<GymCard
						key={gym.id}
						gym={gym}
						onClick={() => onSelectGym(gym)}
						compact={isCompact}
					/>
				))}
			</div>
		</div>
	);
}

function StateListPanel({
	states,
	onBack,
	onSelectState,
	search,
	setSearch,
	searchAutoFocus = false,
	onSearchFocus,
	onSearchBlur,
	isCompact = false,
}) {
	const normalizedSearch = search.trim().toLowerCase();
	const filtered = normalizedSearch
		? states.filter((state) => {
				const stateSearchText = [
					state.name,
					state.abbr,
					state.gyms?.map((gym) => `${gym.name} ${gym.city}`).join(" "),
					state.coaches?.map((coach) => coach.name).join(" "),
				]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();

				return stateSearchText.includes(normalizedSearch);
			})
		: states;

	return (
		<div className="coach-scroll-panel" style={styles.coachListPanelInner}>
			<div style={styles.coachListHeader}>
				<button
					style={styles.backArrow}
					aria-label="Back to map"
					onClick={onBack}
				>
					←
				</button>
				<div>
					<div
						style={{
							fontSize: 12,
							color: palette.muted,
							textTransform: "uppercase",
							letterSpacing: "0.18em",
						}}
					>
						Choose a location
					</div>
					<div
						style={{
							fontWeight: 720,
							fontSize: 21,
							color: palette.text,
							letterSpacing: -0.3,
						}}
					>
						States
					</div>
				</div>
			</div>
			<div style={styles.searchInputWrap}>
				<input
					type="search"
					className="coach-scroll-panel"
					style={{
						...styles.searchInput,
						...(isCompact ? styles.searchInputCompact : {}),
					}}
					placeholder=""
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					onFocus={onSearchFocus}
					onBlur={onSearchBlur}
					autoFocus={searchAutoFocus}
					enterKeyHint="search"
				/>
				{search ? null : (
					<div style={styles.searchPlaceholderMarquee}>
						<span className="coach-placeholder-marquee">
							Search states, cities, gyms, or coaches
						</span>
					</div>
				)}
			</div>
			<div>
				{filtered.length === 0 ? (
					<div style={styles.emptyState}>
						No states found. Try a state, city, gym, or coach name.
					</div>
				) : null}
				{filtered.map((state) => (
					<StateCard
						key={state.abbr}
						state={state}
						onClick={() => onSelectState(state.abbr)}
						compact={isCompact}
					/>
				))}
			</div>
		</div>
	);
}

function CoachListPanel({
	title,
	eyebrow,
	coaches,
	onBack,
	search,
	setSearch,
	hoveredCoachId,
	setHoveredCoachId,
	profileCoach,
	setProfileCoach,
	favoriteCoachIds,
	onToggleFavorite,
	contactCoach,
	setContactCoach,
	isDesktop,
	emptyMessage,
	searchAutoFocus = false,
	onSearchFocus,
	onSearchBlur,
}) {
	const filtered = rankCoachesBySemanticSearch(coaches, search);
	const isCompact = !isDesktop;

	if (contactCoach) {
		return (
			<ContactPanel
				coach={contactCoach}
				onBack={() => setContactCoach(null)}
				isDesktop={isDesktop}
			/>
		);
	}

	if (profileCoach) {
		return (
			<CoachProfile
				coach={profileCoach}
				onBack={() => setProfileCoach(null)}
				isFavorite={favoriteCoachIds.includes(profileCoach.id)}
				onToggleFavorite={onToggleFavorite}
				onContact={setContactCoach}
			/>
		);
	}

	return (
		<div style={styles.coachListPanelInner}>
			<div style={styles.coachListHeader}>
				<button
					style={styles.backArrow}
					aria-label="Back to map"
					onClick={onBack}
				>
					←
				</button>
				<div>
					<div
						style={{
							fontSize: 12,
							color: palette.muted,
							textTransform: "uppercase",
							letterSpacing: "0.18em",
						}}
					>
						{eyebrow}
					</div>
					<div
						style={{
							fontWeight: 720,
							fontSize: 21,
							color: palette.text,
							letterSpacing: -0.3,
						}}
					>
						{title}
					</div>
				</div>
			</div>
			<div style={styles.searchInputWrap}>
				<input
					type="search"
					className="coach-scroll-panel"
					style={{
						...styles.searchInput,
						...(isCompact ? styles.searchInputCompact : {}),
					}}
					placeholder=""
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					onFocus={onSearchFocus}
					onBlur={onSearchBlur}
					autoFocus={searchAutoFocus}
					enterKeyHint="search"
				/>
				{search ? null : (
					<div style={styles.searchPlaceholderMarquee}>
						<span className="coach-placeholder-marquee">
							Describe what you want, a city, a gym, etc. ex. "Heavy Lifting"
						</span>
					</div>
				)}
			</div>
			<div>
				{filtered.length === 0 ? (
					<div style={styles.emptyState}>{emptyMessage}</div>
				) : null}
				{filtered.map((coach) => (
					<CoachCard
						key={coach.id}
						coach={coach}
						onClick={() => {
							setContactCoach(null);
							setProfileCoach(coach);
						}}
						compact={isCompact}
						hovered={hoveredCoachId === coach.id}
						onMouseEnter={() => setHoveredCoachId(coach.id)}
						onMouseLeave={() => setHoveredCoachId(null)}
					/>
				))}
			</div>
		</div>
	);
}

function createClusterIcon(count, active = false) {
	const isCluster = count > 1;
	// Scale size slightly with count, capped
	const size = active
		? 38
		: isCluster
			? Math.min(28 + (count - 1) * 3, 46)
			: 28;
	const fontSize = isCluster ? Math.max(10, Math.min(14, size * 0.35)) : 11;
	return L.divIcon({
		className: "",
		html: `<div class="coach-map-marker${active ? " active" : ""}${isCluster ? " cluster" : ""}" style="width:${size}px;height:${size}px;font-size:${fontSize}px;"><span>${count}</span></div>`,
		iconSize: [size, size],
		iconAnchor: [size / 2, size / 2],
	});
}

function getResponsiveStateLabelSize(map, bounds) {
	const nw = map.latLngToLayerPoint(bounds.getNorthWest());
	const se = map.latLngToLayerPoint(bounds.getSouthEast());
	const pixelWidth = Math.abs(se.x - nw.x);
	const pixelHeight = Math.abs(se.y - nw.y);
	const smallestSide = Math.min(pixelWidth, pixelHeight);
	return {
		fontSize: Math.max(5, Math.min(12, smallestSide * 0.18)),
		labelWidth: Math.max(12, Math.min(34, pixelWidth * 0.46)),
		opacity: smallestSide < 14 ? 0.08 : smallestSide < 24 ? 0.14 : 0.22,
	};
}

function createStateLabelIcon({
	abbr,
	hasCoaches,
	fontSize,
	labelWidth,
	opacity,
}) {
	return L.divIcon({
		className: "",
		html: `<div class="state-block-label ${hasCoaches ? "has-coaches" : ""}" style="font-size:${fontSize}px;width:${labelWidth}px;opacity:${opacity};">${abbr}</div>`,
		iconSize: [0, 0],
		iconAnchor: [0, 0],
	});
}

function addGlobalMapStyles() {
	const style = document.createElement("style");
	style.innerHTML = `
    .leaflet-container { background: ${palette.graphite900}; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .leaflet-control-zoom { border: 1px solid ${palette.border} !important; border-radius: 14px !important; overflow: hidden; box-shadow: 0 18px 45px rgba(0,0,0,0.28) !important; }
    .leaflet-control-zoom a { background: rgba(30,28,30,0.88) !important; color: ${palette.graphite100} !important; border-bottom: 1px solid ${palette.border} !important; }
    .leaflet-control-zoom a:hover { background: ${palette.graphite700} !important; color: white !important; }
    .leaflet-popup-content-wrapper { background: ${palette.graphite900}; color: ${palette.text}; border: 1px solid ${palette.border}; border-radius: 16px; box-shadow: 0 18px 50px rgba(0,0,0,0.45); }
    .leaflet-popup-tip { background: ${palette.graphite900}; }

    .coach-map-marker {
      border-radius: 999px;
      background: ${palette.graphite100};
      border: 5px solid ${palette.graphite800};
      box-shadow: 0 0 0 1px rgba(198,197,195,0.42), 0 12px 26px rgba(0,0,0,0.46);
      display: flex; align-items: center; justify-content: center;
      color: ${palette.graphite900};
      font-weight: 800;
      transition: width 220ms ease, height 220ms ease, font-size 220ms ease;
    }
    .coach-map-marker.active {
      background: #F2F1EF;
      box-shadow: 0 0 0 1px rgba(198,197,195,0.66), 0 18px 40px rgba(0,0,0,0.56);
    }
    .coach-map-marker.cluster {
      background: ${palette.graphite800};
      border-color: ${palette.graphite700};
      color: ${palette.text};
      box-shadow: 0 0 0 2px rgba(198,197,195,0.28), 0 14px 32px rgba(0,0,0,0.52);
    }

    .state-block-label { color: rgba(242,241,239,0.32); font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; text-align: center; text-shadow: 0 2px 6px rgba(0,0,0,0.62); pointer-events: none; user-select: none; white-space: nowrap; line-height: 1; transform: translate(-50%, -50%); transition: opacity 160ms ease, font-size 160ms ease; }
    .state-block-label.has-coaches { color: rgba(242,241,239,0.42); }
    .graphite-popup-title { margin: 0 0 5px; font-size: 15px; font-weight: 700; color: ${palette.text}; }
    .graphite-popup-meta { margin: 0; color: ${palette.muted}; font-size: 13px; line-height: 1.4; }

    .coach-tooltip-wrapper { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
    .coach-tooltip-wrapper::before { display: none !important; }

    .coach-hover-tooltip {
      pointer-events: none;
      background: linear-gradient(145deg, rgba(22,20,22,0.98), rgba(50,48,50,0.96));
      border: 1px solid rgba(198,197,195,0.16); border-radius: 18px; padding: 14px 16px;
      min-width: 220px; max-width: 260px;
      box-shadow: 0 28px 64px rgba(0,0,0,0.58), 0 0 0 0.5px rgba(198,197,195,0.08);
      backdrop-filter: blur(20px);
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      animation: tooltipFadeIn 140ms ease;
    }
    @keyframes tooltipFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .cht-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .cht-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(198,197,195,0.22); flex-shrink: 0; }
    .cht-name { font-size: 14px; font-weight: 700; color: #F2F1EF; margin: 0 0 1px; line-height: 1.2; }
    .cht-title { font-size: 12px; color: #A8A6A2; margin: 0; line-height: 1.3; }
    .cht-divider { height: 1px; background: rgba(198,197,195,0.10); margin: 9px 0; }
    .cht-location { font-size: 12px; color: #A8A6A2; margin: 0 0 5px; }
    .cht-rating { font-size: 12px; font-weight: 650; color: #C6C5C3; margin: 0 0 9px; }
    .cht-tags { display: flex; gap: 5px; flex-wrap: wrap; }
    .cht-tag { font-size: 11px; font-weight: 600; padding: 3px 9px; background: rgba(198,197,195,0.07); color: #C6C5C3; border: 1px solid rgba(198,197,195,0.13); border-radius: 999px; }

    .cluster-tooltip {
      pointer-events: none;
      background: linear-gradient(145deg, rgba(22,20,22,0.98), rgba(50,48,50,0.96));
      border: 1px solid rgba(198,197,195,0.16); border-radius: 14px; padding: 10px 14px;
      min-width: 140px;
      box-shadow: 0 18px 44px rgba(0,0,0,0.52);
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      animation: tooltipFadeIn 140ms ease;
    }
    .cluster-tooltip-title { font-size: 13px; font-weight: 700; color: #F2F1EF; margin: 0 0 4px; }
    .cluster-tooltip-sub { font-size: 11px; color: #A8A6A2; margin: 0; }

    .coach-scroll-panel {
      scrollbar-width: thin;
      scrollbar-color: rgba(198,197,195,0.34) transparent;
    }
    .coach-scroll-panel::-webkit-scrollbar { width: 6px; }
    .coach-scroll-panel::-webkit-scrollbar-track { background: transparent; }
    .coach-scroll-panel::-webkit-scrollbar-thumb {
      background: rgba(198,197,195,0.34);
      border-radius: 999px;
    }
    .coach-scroll-panel::-webkit-scrollbar-thumb:hover {
      background: rgba(198,197,195,0.48);
    }
    .coach-scroll-panel::-webkit-scrollbar-button {
      display: none;
      width: 0;
      height: 0;
    }

    .coach-placeholder-marquee {
      display: inline-block;
      min-width: max-content;
      padding-right: 48px;
      animation: coachPlaceholderScroll 8.5s linear infinite;
    }
    .side-panel-content {
      height: 100%;
      min-height: 0;
      animation: sidePanelContentIn 220ms cubic-bezier(.22,.7,.24,1) both;
      will-change: opacity, transform;
    }
    @keyframes sidePanelContentIn {
      from { opacity: 0; transform: translateX(10px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes coachPlaceholderScroll {
      0%, 16% { transform: translateX(0); }
      72%, 100% { transform: translateX(-46%); }
    }
  `;
	document.head.appendChild(style);
	return style;
}

function CoachMapApp({ onOpenApplication }) {
	const MOCK_STATES = useMemo(() => getStatesWithCoaches(), []);
	const mapNodeRef = useRef(null);
	const mapRef = useRef(null);
	const stateLayerRef = useRef(null);
	const isDesktop = useIsDesktop();
	const layersRef = useRef({
		stateZones: [],
		stateLabels: [],
		clusterMarkers: [],
	});
	const selectedStateRef = useRef(null);
	const allCoachesRef = useRef([]);
	const showOnlineRef = useRef(false);
	const zipSearchRef = useRef("");
	const radiusMilesRef = useRef(25);
	const filterRef = useRef("all");
	const renderClustersRef = useRef(null);

	const [selectedState, setSelectedState] = useState(null);
	const [search, setSearch] = useState("");
	const [hoveredCoachId, setHoveredCoachId] = useState(null);
	const [profileCoach, setProfileCoach] = useState(null);
	const [filter, setFilter] = useState("all");
	const [allPanelDismissed, setAllPanelDismissed] = useState(false);
	const [favoritesOpen, setFavoritesOpen] = useState(false);
	const [semanticSearchOpen, setSemanticSearchOpen] = useState(false);
	const [favoriteCoachIds, setFavoriteCoachIds] = useState([]);
	const [showIntroModal, setShowIntroModal] = useState(true);
	const [showOnline, setShowOnline] = useState(false);
	const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
	const [statesPanelOpen, setStatesPanelOpen] = useState(false);
	const [gymPanel, setGymPanel] = useState(null);
	const [clusterPanel, setClusterPanel] = useState(null);
	const [contactCoach, setContactCoach] = useState(null);
	const [zipSearch, setZipSearch] = useState("");
	const [radiusMiles, setRadiusMiles] = useState(25);
	const [searchFocused, setSearchFocused] = useState(false);

	const allCoaches = useMemo(() => getAllCoaches(), []);
	const allGyms = useMemo(() => getAllGyms(), []);
	const zipOrigin = useMemo(
		() => getZipOrigin(zipSearch, allGyms),
		[allGyms, zipSearch],
	);
	const zipRadiusGyms = useMemo(
		() => filterGymsByZipRadius(allGyms, zipSearch, radiusMiles),
		[allGyms, radiusMiles, zipSearch],
	);
	const zipRadiusCoaches = useMemo(
		() => uniqueCoaches(zipRadiusGyms.flatMap((gym) => gym.coachesAtGym)),
		[zipRadiusGyms],
	);
	const favoriteCoaches = useMemo(
		() => allCoaches.filter((c) => favoriteCoachIds.includes(c.id)),
		[allCoaches, favoriteCoachIds],
	);
	const zipFilterActive = zipSearch.trim().length >= 5;

	const panelVisible =
		(filter === "all" && !allPanelDismissed) ||
		Boolean(selectedState) ||
		statesPanelOpen ||
		favoritesOpen ||
		semanticSearchOpen ||
		showOnline ||
		zipFilterActive ||
		Boolean(gymPanel) ||
		Boolean(clusterPanel) ||
		Boolean(contactCoach);
	const state = selectedState ? getStateByAbbr(selectedState) : null;

	useEffect(() => {
		selectedStateRef.current = selectedState;
	}, [selectedState]);
	useEffect(() => {
		allCoachesRef.current = allCoaches;
	}, [allCoaches]);
	useEffect(() => {
		showOnlineRef.current = showOnline;
		renderClustersRef.current?.();
	}, [showOnline]);
	useEffect(() => {
		filterRef.current = filter;
	}, [filter]);
	useEffect(() => {
		zipSearchRef.current = zipSearch;
		radiusMilesRef.current = radiusMiles;
		renderClustersRef.current?.();
	}, [radiusMiles, zipSearch]);
	useEffect(() => {
		if (!zipOrigin || !mapRef.current) return;
		mapRef.current.flyTo([zipOrigin.latitude, zipOrigin.longitude], 9, {
			duration: 0.65,
		});
	}, [zipOrigin]);

	useEffect(() => {
		if (!panelVisible) {
			setSearchFocused(false);
		}
	}, [panelVisible]);

	useEffect(() => {
		if (!mapRef.current) return undefined;
		const timeout = window.setTimeout(() => {
			mapRef.current?.invalidateSize();
		}, 260);
		return () => window.clearTimeout(timeout);
	}, [isDesktop, panelVisible, searchFocused]);

	useEffect(() => {
		if (!mapNodeRef.current || mapRef.current) return undefined;

		let disposed = false;
		const style = addGlobalMapStyles();
		const map = L.map(mapNodeRef.current, {
			zoomControl: true,
			attributionControl: false,
			scrollWheelZoom: true,
		}).setView([38.8, -96.5], window.innerWidth >= 1024 ? 4 : 3);

		L.tileLayer(
			"https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
			{ maxZoom: 20 },
		).addTo(map);

		const gyms = getAllGyms();

		// ---- Cluster rendering ----
		function renderClusters() {
			if (disposed) return;

			// Remove existing cluster markers
			layersRef.current.clusterMarkers.forEach(({ layer }) => {
				if (map.hasLayer(layer)) map.removeLayer(layer);
			});
			layersRef.current.clusterMarkers = [];

			const zoom = map.getZoom();
			const visibleGyms = showOnlineRef.current
				? gyms
						.map((gym) => {
							const coachesAtGym = gym.coachesAtGym.filter(
								(coach) => coach.onlineTraining,
							);
							return {
								...gym,
								coachesAtGym,
								coachCount: coachesAtGym.length,
							};
						})
						.filter((gym) => gym.coachCount > 0)
				: gyms;
			const clusters = clusterGyms(visibleGyms, zoom);

			clusters.forEach((cluster) => {
				const {
					lat,
					lng,
					count,
					gyms: clusterGyms,
					coaches: clusterCoaches,
				} = cluster;
				const isMulti = cluster.gymCount > 1;
				const primaryGym = clusterGyms[0];
				const gymTags = [
					...new Set(clusterGyms.flatMap((gym) => gym.tags || [])),
				];

				// Build tooltip HTML
				let tooltipHtml;
				if (isMulti) {
					const stateLabel = primaryGym?.stateName || "";
					const cities = [...new Set(clusterGyms.map((gym) => gym.city))];
					const cityLabel =
						cities.length === 1 ? cities[0] : `${cities.length} cities`;
					tooltipHtml = `
						<div class="cluster-tooltip">
							<div class="cluster-tooltip-title">${count} coaches</div>
							<div class="cluster-tooltip-sub">📍 ${cluster.gymCount} gyms near ${cityLabel}${stateLabel ? `, ${stateLabel}` : ""}</div>
						</div>`;
				} else {
					tooltipHtml = `
						<div class="coach-hover-tooltip">
							<div class="cht-header">
								<div>
									<div class="cht-name">${primaryGym.name}</div>
									<div class="cht-title">${count} ${count === 1 ? "coach" : "coaches"} available</div>
								</div>
							</div>
							<div class="cht-divider"></div>
							<div class="cht-location">📍 ${primaryGym.city}, ${primaryGym.state}</div>
							<div class="cht-tags">${(primaryGym.tags || []).map((s) => `<span class="cht-tag">${s}</span>`).join("")}</div>
							<div class="cht-rating">${clusterCoaches
								.slice(0, 3)
								.map((coach) => coach.name)
								.join(" · ")}</div>
						</div>`;
				}

				const popupHtml = isMulti
					? `<p class="graphite-popup-title">${count} coaches nearby</p><p class="graphite-popup-meta">${cluster.gymCount} gyms · ${gymTags.slice(0, 4).join(" · ")}<br />${clusterCoaches
							.slice(0, 4)
							.map((coach) => coach.name)
							.join(" · ")}</p>`
					: `<p class="graphite-popup-title">${primaryGym.name}</p><p class="graphite-popup-meta">${primaryGym.city}, ${primaryGym.state}<br />${count} ${count === 1 ? "coach" : "coaches"} available<br />${(primaryGym.tags || []).join(" · ")}<br />${clusterCoaches
							.slice(0, 4)
							.map((coach) => coach.name)
							.join(" · ")}</p>`;

				const marker = L.marker([lat, lng], { icon: createClusterIcon(count) })
					.bindTooltip(tooltipHtml, {
						direction: "top",
						offset: [0, -Math.min(28 + (count - 1) * 3, 46) / 2 - 4],
						opacity: 1,
						className: "coach-tooltip-wrapper",
					})
					.bindPopup(popupHtml)
					.on("click", () => {
						if (isMulti) {
							const cities = [...new Set(clusterGyms.map((gym) => gym.city))];
							const states = [
								...new Set(clusterGyms.map((gym) => gym.stateName)),
							];
							const cityLabel =
								cities.length === 1 ? cities[0] : `${cities.length} cities`;
							const stateLabel =
								states.length === 1 ? states[0] : `${states.length} states`;

							if (filterRef.current === "coaches") {
								setGymPanel({
									id: cluster.id,
									gyms: clusterGyms,
									title: `${cluster.gymCount} Gyms`,
									eyebrow: `${cityLabel} • ${stateLabel}`,
								});
								setClusterPanel(null);
							} else {
								setGymPanel(null);
								setClusterPanel({
									id: cluster.id,
									coaches: clusterCoaches,
									title: `${count} Coaches at ${cluster.gymCount} Gyms`,
									eyebrow: `${cityLabel} • ${stateLabel}`,
								});
							}
							setSelectedState(null);
							setStatesPanelOpen(false);
							setFavoritesOpen(false);
							setSemanticSearchOpen(false);
							setShowOnline(false);
							setProfileCoach(null);
							setContactCoach(null);
							setSearch("");
							setLocationDropdownOpen(false);
							map.flyTo([lat, lng], Math.max(zoom, 6), { duration: 0.65 });
						} else {
							setSelectedState(primaryGym.state);
							setStatesPanelOpen(false);
							setGymPanel(null);
							setClusterPanel({
								id: primaryGym.id,
								coaches: clusterCoaches,
								title: primaryGym.name,
								eyebrow: `${primaryGym.city}, ${primaryGym.state} • ${count} ${count === 1 ? "coach" : "coaches"} available`,
							});
							setFavoritesOpen(false);
							setSemanticSearchOpen(false);
							setShowOnline(false);
							setProfileCoach(null);
							setContactCoach(null);
							setSearch("");
							setLocationDropdownOpen(false);
							map.flyTo([primaryGym.latitude, primaryGym.longitude], 10, {
								duration: 0.85,
							});
						}
					})
					.addTo(map);

				layersRef.current.clusterMarkers.push({
					abbr: primaryGym?.state,
					layer: marker,
					count,
				});
			});
		}

		// ---- State borders ----
		const statesGeoJsonUrl =
			"https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json";

		const updateStateLabels = () => {
			layersRef.current.stateLabels.forEach(
				({ stateName, layer, bounds, hasCoaches }) => {
					const labelScale = STATE_LABEL_SIZE_OVERRIDES[stateName] || 1;
					const { fontSize, labelWidth, opacity } = getResponsiveStateLabelSize(
						map,
						bounds,
					);
					const abbr = STATE_ABBR_BY_NAME[stateName];
					layer.setIcon(
						createStateLabelIcon({
							abbr,
							hasCoaches,
							fontSize: fontSize * labelScale,
							labelWidth: labelWidth * labelScale,
							opacity,
						}),
					);
				},
			);
		};

		fetch(statesGeoJsonUrl)
			.then((r) => r.json())
			.then((geojson) => {
				if (disposed) return;

				stateLayerRef.current = L.geoJSON(geojson, {
					style: (feature) => {
						const stateName = feature.properties.name;
						const hasCoaches = gyms.some((gym) => gym.stateName === stateName);
						return {
							color: hasCoaches
								? "rgba(218,220,215,0.48)"
								: "rgba(218,220,215,0.24)",
							weight: hasCoaches ? 0.95 : 0.55,
							fillColor: hasCoaches
								? "rgba(244,242,238,0.065)"
								: "rgba(244,242,238,0.025)",
							fillOpacity: 1,
						};
					},
					onEachFeature: (feature, layer) => {
						const stateName = feature.properties.name;
						const stateGyms = gyms.filter((gym) => gym.stateName === stateName);
						if (!stateGyms.length) return;
						layer.on("click", () => {
							const abbr = stateGyms[0].state;
							const stateItem = getStateByAbbr(abbr);
							setSelectedState(abbr);
							setStatesPanelOpen(false);
							setGymPanel(null);
							setClusterPanel(null);
							setFavoritesOpen(false);
							setSemanticSearchOpen(false);
							setProfileCoach(null);
							setContactCoach(null);
							setSearch("");
							setLocationDropdownOpen(false);
							if (stateItem) map.flyTo(stateItem.center, 6, { duration: 0.85 });
						});
						layer.on("mouseover", () =>
							layer.setStyle({
								color: "rgba(217,189,125,0.88)",
								fillColor: "rgba(217,189,125,0.12)",
								weight: 1.3,
							}),
						);
						layer.on("mouseout", () =>
							stateLayerRef.current?.resetStyle(layer),
						);
					},
				}).addTo(map);

				layersRef.current.stateZones = [
					{ abbr: "US_STATES", layer: stateLayerRef.current },
				];

				geojson.features.forEach((feature) => {
					const stateName = feature.properties.name;
					const abbr = STATE_ABBR_BY_NAME[stateName];
					if (!abbr) return;
					const hasCoaches = gyms.some((gym) => gym.stateName === stateName);
					const tempLayer = L.geoJSON(feature);
					const bounds = tempLayer.getBounds();
					const fallbackCenter = bounds.getCenter();
					const labelLatLng = getBestStateLabelLatLng(feature, fallbackCenter);
					const labelScale = STATE_LABEL_SIZE_OVERRIDES[stateName] || 1;
					const { fontSize, labelWidth, opacity } = getResponsiveStateLabelSize(
						map,
						bounds,
					);

					const labelMarker = L.marker(labelLatLng, {
						interactive: false,
						pane: "markerPane",
						icon: createStateLabelIcon({
							abbr,
							hasCoaches,
							fontSize: fontSize * labelScale,
							labelWidth: labelWidth * labelScale,
							opacity,
						}),
					}).addTo(map);

					layersRef.current.stateLabels.push({
						abbr,
						stateName,
						layer: labelMarker,
						bounds,
						center: labelLatLng,
						hasCoaches,
					});
				});

				map.on("zoomend", () => {
					updateStateLabels();
					renderClusters();
				});
				updateStateLabels();
				renderClusters();
			})
			.catch(() => {
				if (disposed) return;

				// State borders failed, still render clusters
				map.on("zoomend", renderClusters);
				renderClusters();
			});

		renderClustersRef.current = renderClusters;
		mapRef.current = map;

		return () => {
			disposed = true;
			map.off("zoomend");
			map.remove();
			mapRef.current = null;
			stateLayerRef.current = null;
			renderClustersRef.current = null;
			layersRef.current = {
				stateZones: [],
				stateLabels: [],
				clusterMarkers: [],
			};
			style.remove();
		};
	}, []);

	useEffect(() => {
		if (!mapRef.current) return;
		const shouldShowStates = filter === "all" || filter === "states";
		const shouldShowCoaches = filter === "all" || filter === "coaches";

		layersRef.current.stateZones.forEach(({ layer }) => {
			if (shouldShowStates && !mapRef.current.hasLayer(layer))
				layer.addTo(mapRef.current);
			if (!shouldShowStates && mapRef.current.hasLayer(layer))
				mapRef.current.removeLayer(layer);
		});
		layersRef.current.stateLabels.forEach(({ layer }) => {
			if (shouldShowStates && !mapRef.current.hasLayer(layer))
				layer.addTo(mapRef.current);
			if (!shouldShowStates && mapRef.current.hasLayer(layer))
				mapRef.current.removeLayer(layer);
		});
		layersRef.current.clusterMarkers.forEach(({ layer }) => {
			if (shouldShowCoaches && !mapRef.current.hasLayer(layer))
				layer.addTo(mapRef.current);
			if (!shouldShowCoaches && mapRef.current.hasLayer(layer))
				mapRef.current.removeLayer(layer);
		});
	}, [filter]);

	function toggleFavoriteCoach(coachId) {
		setFavoriteCoachIds((current) =>
			current.includes(coachId)
				? current.filter((id) => id !== coachId)
				: [...current, coachId],
		);
	}

	function resetToMap() {
		setSelectedState(null);
		setStatesPanelOpen(false);
		setFavoritesOpen(false);
		setSemanticSearchOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setShowOnline(false);
		setAllPanelDismissed(true);
		setGymPanel(null);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		if (mapRef.current)
			mapRef.current.flyTo([38.8, -96.5], 4, { duration: 0.8 });
	}

	function selectState(abbr) {
		const stateItem = getStateByAbbr(abbr);
		if (!stateItem) return;
		setSelectedState(abbr);
		setAllPanelDismissed(true);
		setStatesPanelOpen(false);
		setFavoritesOpen(false);
		setSemanticSearchOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setGymPanel(null);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		if (mapRef.current)
			mapRef.current.flyTo(stateItem.center, 6, { duration: 0.85 });
	}

	function clearLocation() {
		setSelectedState(null);
		setAllPanelDismissed(true);
		setStatesPanelOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setGymPanel(null);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		if (mapRef.current)
			mapRef.current.flyTo([38.8, -96.5], 4, { duration: 0.8 });
	}

	function openFavoritesPanel() {
		setSelectedState(null);
		setAllPanelDismissed(true);
		setStatesPanelOpen(false);
		setFavoritesOpen(true);
		setSemanticSearchOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setShowOnline(false);
		setGymPanel(null);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
	}

	function openSemanticSearchPanel() {
		setSelectedState(null);
		setAllPanelDismissed(true);
		setStatesPanelOpen(false);
		setFavoritesOpen(false);
		setSemanticSearchOpen(true);
		setProfileCoach(null);
		setContactCoach(null);
		setShowOnline(false);
		setGymPanel(null);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
	}

	function openOnlinePanel() {
		setAllPanelDismissed(true);
		setFavoritesOpen(false);
		setStatesPanelOpen(false);
		setSemanticSearchOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setGymPanel(null);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		setShowOnline((current) => !current);
		setFilter((current) => (current === "states" ? "all" : current));
	}

	function getScopedGymsForPanel() {
		if (zipFilterActive) return zipRadiusGyms;
		if (state?.gyms?.length) return state.gyms;
		return allGyms;
	}

	function openGymPanelForCurrentScope() {
		const gyms = getScopedGymsForPanel();
		const scopeTitle = zipFilterActive
			? `${zipSearch.trim()} Gyms`
			: state?.name
				? `${state.name} Gyms`
				: "Gyms";
		const scopeEyebrow = zipFilterActive
			? `${radiusMiles} mile radius • ${gyms.length} ${gyms.length === 1 ? "gym" : "gyms"}`
			: state?.name
				? `${state.name} • ${gyms.length} ${gyms.length === 1 ? "gym" : "gyms"}`
				: `${gyms.length} ${gyms.length === 1 ? "gym" : "gyms"} in directory`;

		setGymPanel({
			id: zipFilterActive
				? `zip-${zipSearch.trim()}`
				: state?.abbr || "all-gyms",
			gyms,
			title: scopeTitle,
			eyebrow: scopeEyebrow,
		});
		setStatesPanelOpen(false);
		setAllPanelDismissed(true);
		setClusterPanel(null);
		setFavoritesOpen(false);
		setSemanticSearchOpen(false);
		setShowOnline(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setLocationDropdownOpen(false);
	}

	function handleFilterChange(nextFilter) {
		setFilter(nextFilter);

		if (nextFilter === "states") {
			setAllPanelDismissed(true);
			setStatesPanelOpen(true);
			setGymPanel(null);
			setClusterPanel(null);
			setFavoritesOpen(false);
			setSemanticSearchOpen(false);
			setShowOnline(false);
			setProfileCoach(null);
			setContactCoach(null);
			setSearch("");
			setLocationDropdownOpen(false);
			return;
		}

		if (nextFilter === "coaches") {
			setAllPanelDismissed(true);
			openGymPanelForCurrentScope();
			return;
		}

		setAllPanelDismissed(false);
		setStatesPanelOpen(false);
		setGymPanel(null);
		setClusterPanel(null);
		setFavoritesOpen(false);
		setSemanticSearchOpen(false);
		setShowOnline(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setLocationDropdownOpen(false);
	}

	function selectGymFromPanel(gym) {
		const parentGymPanel = gymPanel;
		setSelectedState(gym.state);
		setAllPanelDismissed(true);
		setStatesPanelOpen(false);
		setGymPanel(null);
		setClusterPanel({
			id: gym.id,
			coaches: gym.coachesAtGym,
			title: gym.name,
			eyebrow: `${gym.city}, ${gym.state} • ${gym.coachCount} ${
				gym.coachCount === 1 ? "coach" : "coaches"
			} available`,
			parentGymPanel,
		});
		setFavoritesOpen(false);
		setSemanticSearchOpen(false);
		setShowOnline(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setLocationDropdownOpen(false);
		if (mapRef.current) {
			mapRef.current.flyTo([gym.latitude, gym.longitude], 10, {
				duration: 0.85,
			});
		}
	}

	function handlePanelBack() {
		if (clusterPanel?.parentGymPanel) {
			setGymPanel(clusterPanel.parentGymPanel);
			setClusterPanel(null);
			setProfileCoach(null);
			setContactCoach(null);
			setSearch("");
			return;
		}

		resetToMap();
	}

	const locationScopedCoaches = selectedState
		? state?.coaches || []
		: allCoaches;
	const locationAndOnlineCoaches = showOnline
		? locationScopedCoaches.filter((c) => c.onlineTraining)
		: locationScopedCoaches;
	const activePanelCoaches = clusterPanel
		? clusterPanel.coaches
		: semanticSearchOpen
			? allCoaches
		: favoritesOpen
			? favoriteCoaches
			: selectedState || showOnline || filter === "all"
				? locationAndOnlineCoaches
				: [];
	const activePanelTitle = clusterPanel
		? clusterPanel.title
		: semanticSearchOpen
			? "Coach Search"
			: favoritesOpen
				? "Favorites"
				: selectedState && showOnline
					? `${state?.name} Online Training`
					: selectedState
						? state?.name || ""
					: showOnline
						? "Online Training"
						: filter === "all"
							? "All Coaches"
							: "";
	const activePanelEyebrow = clusterPanel
		? clusterPanel.eyebrow
		: semanticSearchOpen
			? "Semantic matches"
			: favoritesOpen
				? "Saved coaches"
				: selectedState && showOnline
					? "Location + remote coaches"
					: selectedState
						? "Selected location"
					: showOnline
						? "Remote coaches"
						: filter === "all"
							? `${allCoaches.length} ${allCoaches.length === 1 ? "coach" : "coaches"} in directory`
							: "Selected filters";
	const activePanelEmptyMessage = clusterPanel
		? "No coaches found in this cluster."
		: semanticSearchOpen
			? "No matching coaches found. Try a broader phrase like strength, wellness, barbell, or performance."
			: favoritesOpen
				? "No favorites yet. Open a coach profile and tap the heart to save them here."
				: selectedState && showOnline
					? "No online training coaches found in this location."
					: showOnline
						? "No online training coaches found."
						: filter === "all"
							? "No coaches found yet."
							: "No matching coaches found.";

	const isMobile = !isDesktop;
	const mobilePanelHeight = contactCoach
		? "72dvh"
		: profileCoach
			? "66dvh"
			: searchFocused
				? "42dvh"
				: "58dvh";
	const mobileActionBottom = panelVisible
		? `calc(${mobilePanelHeight} + 14px + env(safe-area-inset-bottom))`
		: "calc(18px + env(safe-area-inset-bottom))";

	return (
		<main style={styles.shell}>
			{showIntroModal ? (
				<div
					style={styles.introOverlay}
					role="dialog"
					aria-modal="true"
					aria-labelledby="coach-map-intro-title"
				>
					<section style={styles.introModal}>
						<button
							type="button"
							style={styles.introCloseButton}
							onClick={() => setShowIntroModal(false)}
							aria-label="Close intro popup"
						>
							×
						</button>
						<p style={styles.eyebrow}>
							Find the coach who sees what you are capable of
						</p>
						<h1
							id="coach-map-intro-title"
							style={{
								...styles.title,
								fontSize: 32,
								color: palette.graphite100,
								paddingRight: 44,
							}}
						>
							Strength Coach Discovery
						</h1>
						<p style={{ ...styles.description, fontSize: 16, maxWidth: 460 }}>
							Connect with coaches who know how to turn raw effort into
							structure, discipline, and progress you can feel under the bar.
						</p>
						<div style={styles.stats}>
							<div style={styles.stat}>
								<strong style={styles.statStrong}>{MOCK_STATES.length}</strong>
								<span style={styles.statLabel}>States</span>
							</div>
							<div style={styles.stat}>
								<strong style={styles.statStrong}>{allCoaches.length}</strong>
								<span style={styles.statLabel}>Coaches</span>
							</div>
							<div style={styles.stat}>
								<strong style={styles.statStrong}>100%</strong>
								<span style={styles.statLabel}>Verified coaches</span>
							</div>
						</div>
					</section>
				</div>
			) : null}

			<div
				ref={mapNodeRef}
				style={{
					...styles.map,
					height: isMobile ? "100dvh" : styles.map.height,
				}}
			/>

			<button
				type="button"
				style={{
					...styles.semanticSearchButton,
					...(isMobile
						? {
								left: 14,
								right: "auto",
								bottom: mobileActionBottom,
								width: "calc(50vw - 22px)",
								justifyContent: "center",
								padding: "13px 12px",
								fontSize: 13,
							}
						: {}),
					...(semanticSearchOpen ? styles.semanticSearchButtonActive : {}),
				}}
				onClick={openSemanticSearchPanel}
				aria-label="Open semantic coach search"
			>
				<span style={styles.semanticSearchIcon}>⌕</span>
				<span>Search coaches</span>
			</button>

			<nav
				style={{
					...styles.controls,
					...(isMobile
						? {
								left: 14,
								right: 14,
								bottom: panelVisible
									? `calc(${mobilePanelHeight} + 74px + env(safe-area-inset-bottom))`
									: "calc(78px + env(safe-area-inset-bottom))",
								justifyContent: "center",
								gap: 6,
								padding: 6,
							}
						: {}),
				}}
				aria-label="Map filters"
			>
				{["all", "states", "coaches"].map((item) => (
					<button
						key={item}
						onClick={() => handleFilterChange(item)}
						style={{
							...styles.controlButton,
							...(isMobile
								? { flex: 1, padding: "10px 8px", fontSize: 12 }
								: {}),
							...(filter === item ? styles.activeControl : {}),
						}}
					>
						{item === "coaches"
							? "Gyms"
							: item[0].toUpperCase() + item.slice(1)}
					</button>
				))}
			</nav>

			<button
				type="button"
				style={{
					...styles.favoritesBar,
					...(isMobile
						? {
								left: "auto",
								right: 14,
								bottom: mobileActionBottom,
								width: "calc(50vw - 22px)",
								justifyContent: "center",
								padding: "13px 12px",
								fontSize: 13,
							}
						: {}),
				}}
				onClick={openFavoritesPanel}
				aria-label="Open favorite coaches"
			>
				<span>♡ Favorites</span>
				<span style={styles.favoritesCount}>{favoriteCoachIds.length}</span>
			</button>

			<div
				style={{
					position: "absolute",
					zIndex: 900,
					...(isMobile
						? {
								left: 14,
								right: 14,
								top: "calc(12px + env(safe-area-inset-top))",
							}
						: {
								right: isDesktop && panelVisible ? 458 : 24,
								top: 24,
							}),
					display: "flex",
					flexDirection: "column",
					alignItems: isMobile ? "stretch" : "flex-start",
					gap: 10,
					transition: "right 0.42s cubic-bezier(.66,.09,.28,1)",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: isMobile ? "row" : "column",
						gap: 10,
						width: isMobile ? "100%" : "auto",
					}}
				>
					<button
						type="button"
						onClick={() => setLocationDropdownOpen((current) => !current)}
						style={{
							border: `1px solid ${selectedState ? "rgba(198,197,195,0.46)" : palette.border}`,
							background: selectedState
								? palette.graphite100
								: "rgba(30,28,30,0.82)",
							color: selectedState ? palette.graphite900 : palette.text,
							borderRadius: 999,
							padding: "13px 17px",
							cursor: "pointer",
							backdropFilter: "blur(14px)",
							boxShadow: "0 14px 36px rgba(0,0,0,0.25)",
							fontWeight: 750,
							fontSize: 15,
							minWidth: 184,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
						}}
						aria-expanded={locationDropdownOpen ? "true" : "false"}
						aria-label="Choose coach location"
					>
						<span>
							📍{" "}
							{selectedState ? getStateByAbbr(selectedState)?.name : "Location"}
						</span>
					</button>

					<div
						style={{
							overflow: "hidden",
							...(isMobile
								? {
										position: "absolute",
										left: 0,
										right: 0,
										top: 58,
									}
								: {}),
							maxHeight: locationDropdownOpen ? (isMobile ? "42dvh" : 220) : 0,
							opacity: locationDropdownOpen ? 1 : 0,
							marginTop: locationDropdownOpen ? 0 : -4,
							transition:
								"max-height 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease, margin-top 0.22s ease",
							pointerEvents: locationDropdownOpen ? "all" : "none",
						}}
					>
						<div
							style={{
								padding: 8,
								borderRadius: 22,
								background:
									"linear-gradient(145deg, rgba(30,28,30,0.97), rgba(55,53,55,0.94))",
								border: `1px solid ${palette.border}`,
								boxShadow: "0 24px 70px rgba(0,0,0,0.48)",
								backdropFilter: "blur(18px)",
								display: "flex",
								flexDirection: "column",
								gap: 4,
								maxHeight: isMobile ? "40dvh" : 204,
								overflowY: "auto",
								overflowX: "hidden",
								scrollbarWidth: "thin",
								scrollbarColor: "rgba(198,197,195,0.2) transparent",
							}}
						>
							{selectedState && (
								<button
									type="button"
									onClick={clearLocation}
									style={{
										border: 0,
										background: "transparent",
										color: palette.muted,
										borderRadius: 16,
										padding: "10px 12px",
										textAlign: "left",
										cursor: "pointer",
										fontWeight: 500,
										fontSize: 14,
										fontFamily: "inherit",
									}}
								>
									Clear location
								</button>
							)}
							{MOCK_STATES.map((stateItem) => {
								const active = selectedState === stateItem.abbr;
								return (
									<button
										key={stateItem.abbr}
										type="button"
										onClick={() => selectState(stateItem.abbr)}
										style={{
											border: `1px solid ${active ? "rgba(198,197,195,0.46)" : "transparent"}`,
											background: active
												? "rgba(198,197,195,0.12)"
												: "rgba(198,197,195,0.045)",
											color: palette.text,
											borderRadius: 16,
											padding: "11px 12px",
											textAlign: "left",
											cursor: "pointer",
											fontWeight: 500,
											fontSize: 14,
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											gap: 10,
											flexShrink: 0,
											fontFamily: "inherit",
										}}
									>
										<span>{stateItem.name}</span>
										<span
											style={{
												color: active ? palette.graphite100 : palette.muted,
												fontSize: 12,
												fontWeight: 500,
											}}
										>
											{stateItem.abbr}
										</span>
									</button>
								);
							})}
						</div>
					</div>

					<button
						type="button"
						onClick={openOnlinePanel}
						style={{
							border: `1px solid ${showOnline ? "rgba(198,197,195,0.46)" : palette.border}`,
							background: showOnline
								? palette.graphite100
								: "rgba(30,28,30,0.82)",
							color: showOnline ? palette.graphite900 : palette.text,
							borderRadius: 999,
							padding: "13px 17px",
							cursor: "pointer",
							backdropFilter: "blur(14px)",
							boxShadow: "0 14px 36px rgba(0,0,0,0.25)",
							fontWeight: 750,
							fontSize: 15,
							minWidth: 184,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 9,
						}}
						aria-pressed={showOnline ? "true" : "false"}
					>
						🌐 Online Training
					</button>
					{onOpenApplication ? (
						<button
							type="button"
							onClick={onOpenApplication}
							style={{
								border: `1px solid ${palette.border}`,
								background: "rgba(30,28,30,0.82)",
								color: palette.text,
								borderRadius: 999,
								padding: "13px 17px",
								cursor: "pointer",
								backdropFilter: "blur(14px)",
								boxShadow: "0 14px 36px rgba(0,0,0,0.25)",
								fontWeight: 750,
								fontSize: 15,
								minWidth: 184,
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								...(isMobile
									? {
											flex: "1 1 100%",
											minWidth: 0,
											padding: "11px 10px",
											fontSize: 13,
										}
									: {}),
							}}
						>
							Apply as coach
						</button>
					) : null}
				</div>
			</div>

			<aside
				style={{
					...styles.glassPanel,
					width: isDesktop ? 430 : "100vw",
					height: isDesktop ? "100vh" : mobilePanelHeight,
					maxHeight: isDesktop ? "100vh" : "calc(100dvh - 84px)",
					top: isDesktop ? 0 : "auto",
					bottom: isDesktop ? "auto" : 0,
					right: 0,
					borderLeft: isDesktop ? `1px solid ${palette.border}` : "none",
					borderTop: isDesktop ? "none" : `1px solid ${palette.border}`,
					borderTopLeftRadius: isDesktop ? 0 : 24,
					borderTopRightRadius: isDesktop ? 0 : 24,
					padding: isDesktop
						? "34px 34px 22px"
						: "10px 16px calc(18px + env(safe-area-inset-bottom))",
					...(panelVisible
						? styles.glassPanelShown
						: {
								...styles.glassPanelHidden,
								transform: isDesktop ? "translateX(104%)" : "translateY(104%)",
							}),
				}}
				aria-hidden={!panelVisible}
			>
				{isMobile && panelVisible ? (
					<span style={styles.mobileSheetHandle} />
				) : null}
				<div
					key={
						statesPanelOpen
							? "states"
							: gymPanel
								? `gyms-${gymPanel.id}`
								: `coaches-${activePanelTitle || "map"}`
					}
					className="side-panel-content"
				>
					{statesPanelOpen ? (
						<StateListPanel
							states={MOCK_STATES}
							onBack={resetToMap}
							onSelectState={selectState}
							search={search}
							setSearch={setSearch}
							searchAutoFocus={isDesktop}
							onSearchFocus={() => setSearchFocused(true)}
							onSearchBlur={() => setSearchFocused(false)}
							isCompact={isMobile}
						/>
					) : gymPanel ? (
						<GymListPanel
							title={gymPanel.title}
							eyebrow={gymPanel.eyebrow}
							gyms={gymPanel.gyms}
							onBack={resetToMap}
							onSelectGym={selectGymFromPanel}
							search={search}
							setSearch={setSearch}
							searchAutoFocus={isDesktop}
							onSearchFocus={() => setSearchFocused(true)}
							onSearchBlur={() => setSearchFocused(false)}
							isCompact={isMobile}
						/>
					) : panelVisible ? (
						<CoachListPanel
							title={activePanelTitle}
							eyebrow={activePanelEyebrow}
							coaches={activePanelCoaches}
							onBack={handlePanelBack}
							profileCoach={profileCoach}
							setProfileCoach={setProfileCoach}
							search={search}
							setSearch={setSearch}
							hoveredCoachId={hoveredCoachId}
							setHoveredCoachId={setHoveredCoachId}
							favoriteCoachIds={favoriteCoachIds}
							onToggleFavorite={toggleFavoriteCoach}
							contactCoach={contactCoach}
							setContactCoach={setContactCoach}
							isDesktop={isDesktop}
							emptyMessage={activePanelEmptyMessage}
							searchAutoFocus={isDesktop}
							onSearchFocus={() => setSearchFocused(true)}
							onSearchBlur={() => setSearchFocused(false)}
						/>
					) : null}
				</div>
			</aside>
		</main>
	);
}

export default function App() {
	const [route, setRoute] = useState(() => getCurrentAppRoute());
	const [dataVersion, setDataVersion] = useState(0);

	useEffect(() => {
		function syncRoute() {
			setRoute(getCurrentAppRoute());
			if (typeof window !== "undefined") window.scrollTo(0, 0);
		}

		window.addEventListener("hashchange", syncRoute);
		window.addEventListener("popstate", syncRoute);
		return () => {
			window.removeEventListener("hashchange", syncRoute);
			window.removeEventListener("popstate", syncRoute);
		};
	}, []);

	useEffect(() => {
		function handleApplicationChange() {
			setDataVersion((current) => current + 1);
		}

		window.addEventListener(
			COACH_APPLICATION_CHANGED_EVENT,
			handleApplicationChange,
		);
		return () =>
			window.removeEventListener(
				COACH_APPLICATION_CHANGED_EVENT,
				handleApplicationChange,
			);
	}, []);

	useEffect(() => {
		let active = true;

		async function loadApprovedSupabaseCoaches() {
			try {
				await refreshApprovedCoachCache();
				if (active) setDataVersion((current) => current + 1);
			} catch (error) {
				console.error("Approved coaches could not be loaded.", error);
			}
		}

		loadApprovedSupabaseCoaches();

		return () => {
			active = false;
		};
	}, []);

	const goHome = () => navigateToAppRoute("/");
	const goToApplication = () => navigateToAppRoute("/coach-apply");

	if (SHOW_COACH_APPLICATION_CTA && route.path === "/coach-apply") {
		return (
			<CoachApplicationForm
				onBackToMap={goHome}
				adminHref="#/admin/coach-applications"
			/>
		);
	}

	if (route.path === "/admin/coach-applications") {
		return (
			<CoachApplicationAdmin
				onBackToMap={goHome}
				applicationHref="#/coach-apply"
				highlightedApplicationId={route.params.get("application")}
			/>
		);
	}

	return (
		<CoachMapApp
			key={`coach-map-${dataVersion}`}
			onOpenApplication={
				SHOW_COACH_APPLICATION_CTA ? goToApplication : undefined
			}
		/>
	);
}
