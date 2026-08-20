import React, { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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

const CoachApplicationAdmin = React.lazy(
	() => import("./src/components/CoachApplicationAdmin"),
);
const CoachApplicationForm = React.lazy(
	() => import("./src/components/CoachApplicationForm"),
);

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
	const path =
		normalizedPath === "/index.html"
			? "/"
			: normalizedPath.length > 1
				? normalizedPath.replace(/\/+$/, "")
				: normalizedPath;

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

function RouteLoading({ label }) {
	return (
		<main
			style={{
				minHeight: "100dvh",
				display: "grid",
				placeItems: "center",
				padding:
					"calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))",
				background: palette.graphite900,
				color: palette.text,
				fontFamily:
					"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
			}}
		>
			<div role="status" aria-live="polite" style={{ textAlign: "center" }}>
				<div style={{ fontWeight: 760, fontSize: 18 }}>{label}</div>
				<div style={{ color: palette.muted, marginTop: 6 }}>Loading…</div>
			</div>
		</main>
	);
}

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

function useViewportLayout() {
	const [viewport, setViewport] = useState(() => ({
		width: typeof window !== "undefined" ? window.innerWidth : 1440,
		height: typeof window !== "undefined" ? window.innerHeight : 900,
	}));

	useEffect(() => {
		const handleResize = () =>
			setViewport({ width: window.innerWidth, height: window.innerHeight });
		handleResize();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	return {
		...viewport,
		isDesktop: viewport.width >= 1024,
		isTablet: viewport.width >= 600 && viewport.width < 1024,
		isShortMobile: viewport.width < 1024 && viewport.height < 560,
	};
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

function rankCoachesBySemanticSearchTerms(coaches, queries) {
	const normalizedQueries = queries
		.map((query) => String(query || "").trim())
		.filter(Boolean);

	return normalizedQueries.reduce(
		(matches, query) => rankCoachesBySemanticSearch(matches, query),
		coaches,
	);
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
		overflowY: "auto",
		overscrollBehavior: "contain",
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
		maxHeight: "calc(100dvh - 28px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
		overflowY: "auto",
		overscrollBehavior: "contain",
	},
	introCloseButton: {
		position: "absolute",
		top: 16,
		right: 16,
		width: 44,
		height: 44,
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
		background: "rgba(30,28,30,0.94)",
		border: "1px solid rgba(242,241,239,0.28)",
		borderRadius: 999,
		color: palette.text,
		backdropFilter: "blur(18px)",
		boxShadow: "0 20px 60px rgba(0,0,0,0.42)",
		cursor: "pointer",
		fontWeight: 600,
		fontSize: 14,
		lineHeight: 1,
		minHeight: 44,
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
		fontWeight: 560,
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
		fontWeight: 650,
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
		fontWeight: 500,
		transition: "background 160ms ease, color 160ms ease, transform 160ms ease",
	},
	activeControl: {
		background: palette.graphite100,
		color: palette.graphite900,
		fontWeight: 600,
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
		width: 44,
		height: 44,
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
		width: 44,
		height: 44,
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
		minHeight: 44,
		height: 44,
		maxHeight: 44,
		padding: "10px 14px",
		borderRadius: 12,
		fontSize: 16,
	},
	searchInputWrap: {
		position: "relative",
		margin: "0 0 22px 0",
	},
	desktopSearchTagScroller: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		maxWidth: "100%",
		overflowX: "auto",
		overflowY: "hidden",
		overscrollBehaviorX: "contain",
		scrollbarWidth: "none",
		padding: "10px 2px 2px",
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
		padding: "12px 50px 12px 12px",
		marginBottom: 10,
		gap: 12,
		boxShadow: "0 8px 22px rgba(0,0,0,0.20)",
	},
	cardHeartButton: {
		position: "absolute",
		top: 10,
		right: 10,
		zIndex: 5,
		width: 36,
		height: 36,
		padding: 0,
		borderRadius: 999,
		border: `1px solid ${palette.border}`,
		background: "rgba(30,28,30,0.72)",
		color: palette.graphite100,
		fontSize: 19,
		lineHeight: 1,
		cursor: "pointer",
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
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
		flexShrink: 0,
	},
	headshotCompact: {
		width: 48,
		height: 48,
		border: "2px solid rgba(198,197,195,0.20)",
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
	coachAvailabilityLine: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		fontSize: 11.8,
		lineHeight: 1.35,
		color: palette.muted,
		marginBottom: 4,
	},
	coachAvailabilityDot: {
		width: 5,
		height: 5,
		borderRadius: 999,
		background: palette.graphite100,
		opacity: 0.72,
		flexShrink: 0,
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
		height: "100%",
		overflowY: "auto",
		overflowX: "hidden",
		overscrollBehavior: "contain",
		paddingBottom: 6,
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
		fontSize: 16,
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
	coachListPanelInnerCompact: {
		marginRight: 0,
		padding: "0 0 6px",
		scrollbarGutter: "auto",
		overflowX: "hidden",
	},
	mobileSheetHandle: {
		display: "inline-flex",
		width: 64,
		height: 30,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 999,
		background: "transparent",
		margin: "0 auto 4px",
		flexShrink: 0,
	},
	mobileHeader: {
		position: "fixed",
		zIndex: 920,
		top: 0,
		left: 0,
		right: 0,
		padding: "calc(12px + env(safe-area-inset-top)) 14px 12px",
		pointerEvents: "none",
	},
	mobileHeaderSurface: {
		width: "100%",
		maxWidth: 520,
		margin: "0 auto",
		padding: 12,
		border: `1px solid ${palette.border}`,
		borderRadius: 22,
		background: "rgba(30,28,30,0.88)",
		boxShadow: "0 18px 46px rgba(0,0,0,0.32)",
		backdropFilter: "blur(18px) saturate(125%)",
		WebkitBackdropFilter: "blur(18px) saturate(125%)",
		pointerEvents: "auto",
		transition: "padding 160ms ease, border-radius 160ms ease",
	},
	mobileCommandBar: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		minWidth: 0,
	},
	mobileSearchLauncher: {
		minWidth: 0,
		flex: "1 1 auto",
		height: 40,
		padding: "0 11px",
		borderRadius: 13,
		border: `1px solid ${palette.border}`,
		background: "rgba(17,16,18,0.78)",
		color: palette.graphite100,
		font: "inherit",
		fontSize: 13,
		fontWeight: 720,
		cursor: "pointer",
		display: "inline-flex",
		alignItems: "center",
		gap: 8,
		whiteSpace: "nowrap",
		overflow: "hidden",
	},
	mobileSearchLauncherActive: {
		borderColor: "rgba(242,241,239,0.54)",
		background: "rgba(198,197,195,0.1)",
		color: palette.text,
	},
	mobileSearchLauncherLabel: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	mobileToolbarButton: {
		position: "relative",
		height: 40,
		padding: "0 9px",
		borderRadius: 13,
		border: `1px solid ${palette.border}`,
		background: "rgba(198,197,195,0.06)",
		color: palette.text,
		font: "inherit",
		fontSize: 11.5,
		fontWeight: 720,
		cursor: "pointer",
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		gap: 5,
		whiteSpace: "nowrap",
		flexShrink: 0,
	},
	mobileExpandedSearchPanel: {
		borderTop: `1px solid ${palette.border}`,
		marginTop: 8,
		paddingTop: 8,
	},
	mobileHeaderTitleRow: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		marginBottom: 10,
	},
	mobileHeaderTitle: {
		margin: 0,
		fontSize: 19,
		fontWeight: 760,
		letterSpacing: "-0.025em",
		color: palette.text,
	},
	mobileSearchWrap: {
		position: "relative",
		marginBottom: 10,
	},
	mobileSearchIcon: {
		position: "absolute",
		left: 14,
		top: "50%",
		transform: "translateY(-50%)",
		color: palette.muted,
		fontSize: 16,
		pointerEvents: "none",
	},
	mobileSearchInput: {
		width: "100%",
		height: 44,
		padding: "0 42px 0 40px",
		borderRadius: 15,
		border: `1px solid ${palette.border}`,
		background: "rgba(17,16,18,0.78)",
		color: palette.text,
		font: "inherit",
		fontSize: 16,
		outline: "none",
		boxSizing: "border-box",
	},
	mobileIconButton: {
		position: "relative",
		width: 44,
		height: 44,
		borderRadius: 999,
		border: `1px solid ${palette.border}`,
		background: "rgba(198,197,195,0.06)",
		color: palette.text,
		fontSize: 21,
		cursor: "pointer",
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	mobileBadge: {
		position: "absolute",
		top: -4,
		right: -4,
		minWidth: 19,
		height: 19,
		padding: "0 5px",
		borderRadius: 999,
		background: palette.graphite100,
		color: palette.graphite900,
		fontSize: 10,
		fontWeight: 850,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		boxShadow: "0 0 0 2px rgba(30,28,30,0.94)",
	},
	mobileControlButton: {
		minHeight: 44,
		maxWidth: "100%",
		padding: "0 13px",
		borderRadius: 14,
		border: `1px solid ${palette.border}`,
		background: "rgba(198,197,195,0.06)",
		color: palette.text,
		font: "inherit",
		fontSize: 13,
		fontWeight: 680,
		cursor: "pointer",
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		gap: 7,
		whiteSpace: "nowrap",
	},
	mobileSearchTagScroller: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		minHeight: 40,
		overflowX: "auto",
		overflowY: "hidden",
		overscrollBehaviorX: "contain",
		WebkitOverflowScrolling: "touch",
		scrollSnapType: "x proximity",
		scrollbarWidth: "none",
		padding: "2px 1px 4px",
	},
	mobileSearchTag: {
		minHeight: 34,
		maxWidth: "min(72vw, 260px)",
		padding: "0 8px 0 11px",
		borderRadius: 999,
		border: "1px solid rgba(198,197,195,0.3)",
		background: "rgba(198,197,195,0.12)",
		color: palette.graphite100,
		fontSize: 12,
		fontWeight: 680,
		display: "inline-flex",
		alignItems: "center",
		gap: 7,
		flex: "0 0 auto",
		scrollSnapAlign: "start",
	},
	mobileSearchTagLabel: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	mobileSearchTagRemove: {
		width: 26,
		height: 26,
		padding: 0,
		border: 0,
		borderRadius: 999,
		background: "rgba(242,241,239,0.1)",
		color: "inherit",
		font: "inherit",
		fontSize: 16,
		lineHeight: 1,
		cursor: "pointer",
		flex: "0 0 auto",
	},
	mobileSearchTagHint: {
		color: palette.muted,
		fontSize: 12,
		lineHeight: 1.35,
		padding: "0 4px",
		whiteSpace: "nowrap",
	},
	mobileCompactToolbar: {
		display: "grid",
		gridTemplateColumns: "repeat(4, 44px)",
		justifyContent: "space-between",
		gap: 8,
	},
	mobileDialogOverlay: {
		position: "fixed",
		inset: 0,
		zIndex: 1400,
		display: "flex",
		alignItems: "flex-end",
		justifyContent: "center",
		padding: "0 10px",
		background: "rgba(0,0,0,0.54)",
		backdropFilter: "blur(6px)",
		WebkitBackdropFilter: "blur(6px)",
	},
	mobileDialog: {
		width: "min(560px, 100%)",
		maxHeight: "min(86dvh, 760px)",
		padding: "10px 16px calc(16px + env(safe-area-inset-bottom))",
		border: `1px solid ${palette.border}`,
		borderBottom: 0,
		borderTopLeftRadius: 26,
		borderTopRightRadius: 26,
		background: "linear-gradient(155deg, rgba(30,28,30,0.99), rgba(55,53,55,0.98))",
		boxShadow: "0 -24px 70px rgba(0,0,0,0.48)",
		display: "flex",
		flexDirection: "column",
		minHeight: 0,
	},
	mobileDialogHeader: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		padding: "4px 0 12px",
		borderBottom: `1px solid ${palette.border}`,
	},
	mobileDialogTitle: {
		margin: 0,
		fontSize: 20,
		fontWeight: 760,
		color: palette.text,
	},
	mobileDialogBody: {
		overflowY: "auto",
		overscrollBehavior: "contain",
		padding: "14px 0 4px",
		scrollbarWidth: "thin",
	},
	mobileSectionLabel: {
		margin: "18px 0 8px",
		fontSize: 11,
		fontWeight: 750,
		letterSpacing: "0.16em",
		textTransform: "uppercase",
		color: palette.muted,
	},
	mobileOptionButton: {
		width: "100%",
		minHeight: 48,
		padding: "10px 12px",
		borderRadius: 14,
		border: `1px solid ${palette.border}`,
		background: "rgba(198,197,195,0.055)",
		color: palette.text,
		font: "inherit",
		fontSize: 14,
		fontWeight: 620,
		textAlign: "left",
		cursor: "pointer",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
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
	isFavorite = false,
	onToggleFavorite,
	compact = false,
	clusterPreview = false,
}) {
	const gymNames = getCoachGymNames(coach);
	const gymCities = coach.gyms?.map((gym) => gym.city).filter(Boolean) || [];
	const cityLabel = [...new Set(gymCities)].join(" + ") || coach.city;
	const visibleSpecialties = clusterPreview
		? coach.specialties.slice(0, 2)
		: coach.specialties;
	const hasInPerson = gymNames.length > 0;
	const hasOnline = Boolean(coach.onlineTraining || coach.remoteAvailable);
	const availabilityLabel =
		hasInPerson && hasOnline
			? "In person + online"
			: hasOnline
				? "Online only"
				: "In person only";

	return (
		<div style={{ position: "relative", width: "100%" }}>
			<button
				type="button"
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
				{clusterPreview ? (
					<>
						{gymNames.length ? (
							<div
								style={{
									...styles.coachGymLine,
									fontSize: 12.6,
									marginBottom: 3,
								}}
							>
								{gymNames[0]}
								{gymNames.length > 1 ? ` + ${gymNames.length - 1} more` : ""}
							</div>
						) : null}
						<div style={styles.coachAvailabilityLine}>
							<span style={styles.coachAvailabilityDot} aria-hidden="true" />
							{availabilityLabel}
						</div>
					</>
				) : (
					<>
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
					</>
				)}
				{coach.remoteAvailable && !compact ? (
					<div style={styles.coachLocation}>Remote coaching available</div>
				) : null}
				<StarRating value={coach.rating} />
				<div style={{ ...styles.tagList, ...(compact ? { marginTop: 4 } : {}) }}>
					{visibleSpecialties.map((tag) => (
						<CoachTag key={tag}>{tag}</CoachTag>
					))}
				</div>
			</div>
			</button>
			{onToggleFavorite ? (
				<button
					type="button"
					style={{
						...styles.cardHeartButton,
						...(compact ? { top: 8, right: 8, width: 34, height: 34 } : {}),
						...(isFavorite ? styles.heartButtonActive : {}),
					}}
					aria-label={isFavorite ? `Remove ${coach.name} from favorites` : `Add ${coach.name} to favorites`}
					onClick={(event) => {
						event.stopPropagation();
						onToggleFavorite(coach.id);
					}}
				>
					{isFavorite ? "♥" : "♡"}
				</button>
			) : null}
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
		<div className="coach-scroll-panel" style={styles.profilePanel}>
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
		? coach.specialties.slice(1, 3).join(" • ")
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
					<div style={styles.messageSentBubble} aria-live="polite">
						{sentMessage}
					</div>
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
						aria-label={`Message to ${coach.name}`}
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
		<div
			className="coach-scroll-panel"
			style={{
				...styles.coachListPanelInner,
				...(isCompact ? styles.coachListPanelInnerCompact : {}),
			}}
		>
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
			{isCompact ? null : <div style={styles.searchInputWrap}>
				<input
					type="search"
					aria-label="Search gyms"
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
			</div>}
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
		<div
			className="coach-scroll-panel"
			style={{
				...styles.coachListPanelInner,
				...(isCompact ? styles.coachListPanelInnerCompact : {}),
			}}
		>
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
			{isCompact ? null : <div style={styles.searchInputWrap}>
				<input
					type="search"
					aria-label="Search states"
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
			</div>}
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
	onResultsScroll,
	headerAction,
	clusterPreview = false,
	searchTags = [],
	onCommitSearch,
	onRemoveSearchTag,
	searchTagScrollerRef,
}) {
	const filtered = rankCoachesBySemanticSearchTerms(coaches, [
		...searchTags,
		search,
	]);
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
		<div
			className="coach-scroll-panel"
			style={{
				...styles.coachListPanelInner,
				...(isCompact ? styles.coachListPanelInnerCompact : {}),
			}}
			onScroll={onResultsScroll}
		>
			<div style={styles.coachListHeader}>
				<button
					style={styles.backArrow}
					aria-label="Back to map"
					onClick={onBack}
				>
					←
				</button>
				<div style={{ flex: 1, minWidth: 0 }}>
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
				{headerAction ? (
					<button
						type="button"
						style={{ ...styles.mobileControlButton, minHeight: 40, padding: "0 11px", flexShrink: 0 }}
						onClick={headerAction.onClick}
					>
						{headerAction.label}
					</button>
				) : null}
			</div>
			{isCompact ? null : (
				<div style={styles.searchInputWrap}>
					<form style={{ position: "relative" }} onSubmit={onCommitSearch}>
						<input
							type="search"
							aria-label="Search coaches"
							className="coach-scroll-panel coach-search-input"
							style={styles.searchInput}
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
					</form>
					{searchTags.length ? (
						<div
							ref={searchTagScrollerRef}
							className="desktop-search-tags"
							style={styles.desktopSearchTagScroller}
							aria-label="Active search tags"
						>
							{searchTags.map((tag) => (
								<span key={tag} style={styles.mobileSearchTag}>
									<span style={styles.mobileSearchTagLabel}>{tag}</span>
									<button
										type="button"
										style={styles.mobileSearchTagRemove}
										onClick={() => onRemoveSearchTag(tag)}
										aria-label={`Remove ${tag} search`}
									>
										×
									</button>
								</span>
							))}
						</div>
					) : null}
				</div>
			)}
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
						clusterPreview={isCompact && clusterPreview}
						hovered={hoveredCoachId === coach.id}
						onMouseEnter={() => setHoveredCoachId(coach.id)}
						onMouseLeave={() => setHoveredCoachId(null)}
						isFavorite={favoriteCoachIds.includes(coach.id)}
						onToggleFavorite={onToggleFavorite}
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

function escapeMapHtml(value) {
	return String(value ?? "").replace(
		/[&<>"']/g,
		(character) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#039;",
			})[character],
	);
}

function getSingleGymTooltipPlacement(map, lat, lng, markerSize) {
	const mapRect = map.getContainer().getBoundingClientRect();
	const markerPoint = map.latLngToContainerPoint([lat, lng]);
	const edgeGap = 12;
	const overlayGap = 12;
	const tooltipHeight = 198;
	const tooltipWidth = 264;
	let topLimit = edgeGap;
	let bottomLimit = map.getSize().y - edgeGap;

	const mobileHeader = document.querySelector(".mobile-directory-header");
	if (mobileHeader) {
		const headerRect = mobileHeader.getBoundingClientRect();
		if (headerRect.width && headerRect.height) {
			topLimit = Math.max(
				topLimit,
				headerRect.bottom - mapRect.top + overlayGap,
			);
		}
	}

	const resultsSheet = document.querySelector(".mobile-results-sheet");
	if (resultsSheet) {
		const sheetRect = resultsSheet.getBoundingClientRect();
		const isBottomSheet =
			sheetRect.width >= mapRect.width * 0.7 &&
			sheetRect.top > mapRect.top + 80 &&
			sheetRect.top < mapRect.bottom;
		if (isBottomSheet) {
			bottomLimit = Math.min(
				bottomLimit,
				sheetRect.top - mapRect.top - overlayGap,
			);
		}
	}

	const roomAbove = markerPoint.y - topLimit;
	const roomBelow = bottomLimit - markerPoint.y;
	const roomLeft = markerPoint.x - edgeGap;
	const roomRight = map.getSize().x - markerPoint.x - edgeGap;
	const markerGap = markerSize / 2 + 9;

	if (roomAbove >= tooltipHeight) {
		return { direction: "top", offset: [0, -markerGap] };
	}
	if (roomBelow >= tooltipHeight) {
		return { direction: "bottom", offset: [0, markerGap] };
	}
	if (roomLeft >= tooltipWidth || roomRight >= tooltipWidth) {
		return roomLeft >= roomRight
			? { direction: "left", offset: [-markerGap, 0] }
			: { direction: "right", offset: [markerGap, 0] };
	}

	return roomAbove >= roomBelow
		? { direction: "top", offset: [0, -markerGap] }
		: { direction: "bottom", offset: [0, markerGap] };
}

function addGlobalMapStyles() {
	const style = document.createElement("style");
	style.innerHTML = `
    .leaflet-container { background: ${palette.graphite900}; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .leaflet-control-zoom { border: 1px solid ${palette.border} !important; border-radius: 14px !important; overflow: hidden; box-shadow: 0 18px 45px rgba(0,0,0,0.28) !important; }
    .leaflet-control-zoom a { width: 44px !important; height: 44px !important; line-height: 44px !important; background: rgba(30,28,30,0.88) !important; color: ${palette.graphite100} !important; border-bottom: 1px solid ${palette.border} !important; }
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

    .single-gym-preview {
      pointer-events: none;
      background: linear-gradient(145deg, rgba(22,20,22,0.98), rgba(45,42,45,0.97));
      border: 1px solid rgba(198,197,195,0.18); border-radius: 18px; padding: 14px;
      width: 232px; max-width: calc(100vw - 48px);
      box-shadow: 0 28px 64px rgba(0,0,0,0.58), 0 0 0 0.5px rgba(198,197,195,0.08);
      backdrop-filter: blur(20px);
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      animation: tooltipFadeIn 140ms ease;
    }
    @keyframes tooltipFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .sgp-topline { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
    .sgp-kicker { color: #A8A6A2; font-size: 10px; font-weight: 750; letter-spacing: 0.16em; text-transform: uppercase; }
    .sgp-count { color: #C6C5C3; font-size: 11px; font-weight: 650; white-space: nowrap; }
    .sgp-gym { color: #F2F1EF; font-size: 17px; font-weight: 760; letter-spacing: -0.02em; line-height: 1.22; }
    .sgp-location { display: flex; align-items: center; gap: 6px; color: #A8A6A2; font-size: 12px; margin-top: 4px; }
    .sgp-location-dot { width: 5px; height: 5px; border-radius: 50%; background: #C6C5C3; opacity: 0.72; flex: 0 0 auto; }
    .sgp-coach { display: flex; align-items: center; gap: 10px; border-top: 1px solid rgba(198,197,195,0.11); margin-top: 12px; padding-top: 12px; }
    .sgp-initials { display: grid; place-items: center; width: 34px; height: 34px; flex: 0 0 auto; border-radius: 50%; background: rgba(198,197,195,0.1); border: 1px solid rgba(198,197,195,0.15); color: #F2F1EF; font-size: 11px; font-weight: 760; letter-spacing: 0.04em; }
    .sgp-coach-copy { flex: 1; min-width: 0; }
    .sgp-coach-name { color: #F2F1EF; font-size: 13px; font-weight: 720; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sgp-coach-title { color: #A8A6A2; font-size: 11px; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sgp-tag { flex: 0 0 auto; max-width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 4px 8px; border-radius: 999px; background: rgba(198,197,195,0.08); color: #C6C5C3; border: 1px solid rgba(198,197,195,0.13); font-size: 10px; font-weight: 650; text-transform: capitalize; }
    .sgp-more { color: #A8A6A2; font-size: 10px; margin-top: 8px; padding-left: 44px; }
    .leaflet-popup-content .single-gym-preview { width: 220px; max-width: 100%; padding: 2px; border: 0; background: transparent; box-shadow: none; backdrop-filter: none; }

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
      height: auto;
      flex: 1;
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
    .mobile-search-tags::-webkit-scrollbar { display: none; }
    .desktop-search-tags::-webkit-scrollbar { display: none; }
    .coach-search-input:focus-visible { outline-offset: -2px !important; }
    .mobile-coach-search::placeholder { font-size: 13px; }
    button:focus-visible,
    input:focus-visible,
    textarea:focus-visible {
      outline: 2px solid rgba(242,241,239,0.86) !important;
      outline-offset: 2px;
    }
    @media (max-width: 1023px) {
      .coach-tooltip-wrapper { display: none !important; }
      .leaflet-top.leaflet-left {
        top: auto;
        bottom: calc(var(--mobile-results-height, 52dvh) + 12px);
        transition: bottom 300ms cubic-bezier(.22,.7,.24,1);
      }
      .leaflet-control-zoom {
        display: flex;
        margin: 0 0 0 14px !important;
        border-radius: 999px !important;
      }
      .leaflet-control-zoom a {
        width: 40px !important;
        height: 40px !important;
        line-height: 40px !important;
        border-right: 1px solid ${palette.border} !important;
        border-bottom: 0 !important;
      }
      .leaflet-control-zoom a:last-child { border-right: 0 !important; }
      .leaflet-popup-content { max-width: min(240px, calc(100vw - 64px)); }
    }
    @media (max-width: 359px) {
      .mobile-be-prefix { display: none; }
      .mobile-search-launcher { justify-content: center !important; }
      .mobile-search-launcher-label { display: none; }
    }
    @media (hover: none), (pointer: coarse) {
      .coach-tooltip-wrapper { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .coach-placeholder-marquee { animation: none !important; }
      .side-panel-content { animation: none !important; }
      .mobile-directory-header,
      .mobile-results-sheet,
      .leaflet-top.leaflet-left { transition: none !important; }
    }
  `;
	document.head.appendChild(style);
	return style;
}

function useMobileResultsHeader(isMobile) {
	const [collapsed, setCollapsed] = useState(false);
	const previousScrollTopRef = useRef(0);

	const onResultsScroll = (event) => {
		if (!isMobile) return;
		const nextScrollTop = event.currentTarget.scrollTop;
		const delta = nextScrollTop - previousScrollTopRef.current;
		if (nextScrollTop < 28) setCollapsed(false);
		else if (delta > 12 && nextScrollTop > 84) setCollapsed(true);
		else if (delta < -18) setCollapsed(false);
		previousScrollTopRef.current = nextScrollTop;
	};

	return { collapsed, setCollapsed, onResultsScroll };
}

function MobileBottomSheetDialog({ title, onClose, onBack, children, footer }) {
	const dialogRef = useRef(null);
	const actionRef = useRef(null);
	const onCloseRef = useRef(onClose);

	useEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);

	useEffect(() => {
		actionRef.current?.focus();
		const handleKeyDown = (event) => {
			if (event.key === "Escape") onCloseRef.current();
			if (event.key !== "Tab") return;
			const focusable = dialogRef.current?.querySelectorAll(
				'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
			);
			if (!focusable?.length) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<div
			style={styles.mobileDialogOverlay}
			role="presentation"
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section
				ref={dialogRef}
				style={styles.mobileDialog}
				role="dialog"
				aria-modal="true"
				aria-label={title}
			>
				<span
					aria-hidden="true"
					style={{
						width: 42,
						height: 4,
						borderRadius: 999,
						background: "rgba(198,197,195,0.28)",
						margin: "0 auto 8px",
					}}
				/>
				<header style={styles.mobileDialogHeader}>
					{onBack ? (
						<button
							type="button"
							ref={actionRef}
							style={styles.mobileIconButton}
							onClick={onBack}
							aria-label="Back to filters"
						>
							←
						</button>
					) : null}
					<h2 style={{ ...styles.mobileDialogTitle, flex: 1 }}>{title}</h2>
					{onBack ? null : (
						<button
							type="button"
							ref={actionRef}
							style={styles.mobileIconButton}
							onClick={onClose}
							aria-label={`Close ${title}`}
						>
							×
						</button>
					)}
				</header>
				<div className="coach-scroll-panel" style={styles.mobileDialogBody}>
					{children}
				</div>
				{footer}
			</section>
		</div>
	);
}

function MobileLocationSheet({
	states,
	gyms,
	selectedState,
	selectedGymId,
	onSelectState,
	onSelectGym,
	onClear,
	onBack,
	onClose,
}) {
	const [query, setQuery] = useState("");
	const normalizedQuery = query.trim().toLowerCase();
	const matchingStates = normalizedQuery
		? states.filter((state) =>
				`${state.name} ${state.abbr}`.toLowerCase().includes(normalizedQuery),
			)
		: states;
	const matchingGyms = normalizedQuery
		? gyms.filter((gym) => getGymSearchText(gym).toLowerCase().includes(normalizedQuery))
		: gyms;
	const selectedStateName = selectedState
		? getStateByAbbr(selectedState)?.name
		: null;

	return (
		<MobileBottomSheetDialog title="Choose location" onClose={onClose} onBack={onBack}>
			<div style={styles.mobileSearchWrap}>
				<span style={styles.mobileSearchIcon}>⌕</span>
				<input
					type="search"
					style={styles.mobileSearchInput}
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search city, state, or gym"
					aria-label="Search locations"
				/>
			</div>
			{selectedStateName || selectedGymId ? (
				<>
					<div style={styles.mobileSectionLabel}>Selected</div>
					<button
						type="button"
						style={{ ...styles.mobileOptionButton, borderColor: "rgba(198,197,195,0.34)" }}
						onClick={onClear}
						aria-label="Clear selected location"
					>
						<span>{selectedStateName || "Selected gym"}</span>
						<span aria-hidden="true">Clear ×</span>
					</button>
				</>
			) : null}
			<div style={styles.mobileSectionLabel}>States</div>
			<div style={{ display: "grid", gap: 8 }}>
				{matchingStates.map((state) => (
					<button
						key={state.abbr}
						type="button"
						style={{
							...styles.mobileOptionButton,
							...(selectedState === state.abbr
								? { background: "rgba(198,197,195,0.14)", borderColor: "rgba(198,197,195,0.34)" }
								: {}),
						}}
						onClick={() => onSelectState(state.abbr)}
					>
						<span>{state.name}</span>
						<span style={{ color: palette.muted, fontSize: 12 }}>{state.abbr}</span>
					</button>
				))}
			</div>
			<div style={styles.mobileSectionLabel}>Gyms</div>
			<div style={{ display: "grid", gap: 8 }}>
				{matchingGyms.map((gym) => (
					<button
						key={gym.id}
						type="button"
						style={{
							...styles.mobileOptionButton,
							...(selectedGymId === gym.id
								? { background: "rgba(198,197,195,0.14)", borderColor: "rgba(198,197,195,0.34)" }
								: {}),
						}}
						onClick={() => onSelectGym(gym)}
					>
						<span>{gym.name}</span>
						<span style={{ color: palette.muted, fontSize: 12, textAlign: "right" }}>
							{gym.city}, {gym.state}
						</span>
					</button>
				))}
			</div>
			{!matchingStates.length && !matchingGyms.length ? (
				<div style={styles.emptyState}>No locations match “{query}”.</div>
			) : null}
		</MobileBottomSheetDialog>
	);
}

function MobileFilterSheet({
	trainingType,
	onTrainingTypeChange,
	selectedLocationLabel,
	hasSelectedLocation,
	onOpenLocations,
	onClearLocation,
	resultCount,
	onClear,
	onApply,
	onClose,
}) {
	const choices = [
		{ value: "either", label: "Either", hint: "Show all available coaches" },
		{ value: "inPerson", label: "In person", hint: "Coaches available through listed gyms" },
		{ value: "online", label: "Online", hint: "Coaches offering online training" },
	];
	return (
		<MobileBottomSheetDialog
			title="Filters"
			onClose={onClose}
			footer={
				<div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, paddingTop: 12, borderTop: `1px solid ${palette.border}` }}>
					<button type="button" style={styles.mobileControlButton} onClick={onClear}>
						Clear
					</button>
					<button
						type="button"
						style={{ ...styles.mobileControlButton, background: palette.graphite100, color: palette.graphite900 }}
						onClick={onApply}
					>
						Show {resultCount} {resultCount === 1 ? "coach" : "coaches"}
					</button>
				</div>
			}
		>
			<div style={{ ...styles.mobileSectionLabel, marginTop: 0 }}>Location</div>
			<div style={{ display: "grid", gap: 8 }}>
				<button
					type="button"
					style={{
						...styles.mobileOptionButton,
						...(hasSelectedLocation
							? {
									background: "rgba(198,197,195,0.14)",
									borderColor: "rgba(198,197,195,0.34)",
								}
							: {}),
					}}
					onClick={onOpenLocations}
				>
					<span style={{ minWidth: 0, textAlign: "left" }}>
						<strong
							style={{
								display: "block",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{hasSelectedLocation ? selectedLocationLabel : "All locations"}
						</strong>
						<small style={{ color: palette.muted, fontSize: 11.5 }}>
							Search states, cities, and gyms
						</small>
					</span>
					<span aria-hidden="true">{hasSelectedLocation ? "Change" : "Choose"} ›</span>
				</button>
				{hasSelectedLocation ? (
					<button
						type="button"
						style={{ ...styles.mobileControlButton, justifySelf: "start", minHeight: 38 }}
						onClick={onClearLocation}
					>
						Clear location
					</button>
				) : null}
			</div>

			<div style={styles.mobileSectionLabel}>Training type</div>
			<div role="radiogroup" aria-label="Training type" style={{ display: "grid", gap: 8 }}>
				{choices.map((choice) => (
					<label
						key={choice.value}
						style={{
							...styles.mobileOptionButton,
							cursor: "pointer",
							...(trainingType === choice.value
								? { background: "rgba(198,197,195,0.14)", border: "1px solid rgba(242,241,239,0.92)" }
								: { border: "1px solid transparent" }),
						}}
					>
						<span>
							<strong style={{ display: "block", fontSize: 14 }}>{choice.label}</strong>
							<small style={{ color: palette.muted, fontSize: 11.5 }}>{choice.hint}</small>
						</span>
						<input
							type="radio"
							name="training-type"
							value={choice.value}
							checked={trainingType === choice.value}
							onChange={() => onTrainingTypeChange(choice.value)}
						/>
					</label>
				))}
			</div>
		</MobileBottomSheetDialog>
	);
}

function CoachMapApp({ onOpenApplication }) {
	const MOCK_STATES = useMemo(() => getStatesWithCoaches(), []);
	const mapNodeRef = useRef(null);
	const mapRef = useRef(null);
	const stateLayerRef = useRef(null);
	const introCloseButtonRef = useRef(null);
	const locationMenuRef = useRef(null);
	const mobileSheetDragStartYRef = useRef(null);
	const mobileSheetDragStartSnapRef = useRef("half");
	const mobileSheetDragMovedRef = useRef(false);
	const mobileSearchInputRef = useRef(null);
	const mobileSearchTagsRef = useRef(null);
	const desktopSearchTagsRef = useRef(null);
	const preFavoritesViewRef = useRef(null);
	const preLocationViewRef = useRef(null);
	const { isDesktop, isTablet, isShortMobile } = useViewportLayout();
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
	const renderClustersRef = useRef(null);

	const [selectedState, setSelectedState] = useState(null);
	const [search, setSearch] = useState("");
	const [searchTags, setSearchTags] = useState([]);
	const [hoveredCoachId, setHoveredCoachId] = useState(null);
	const [profileCoach, setProfileCoach] = useState(null);
	const [filter, setFilter] = useState("all");
	const [allPanelDismissed, setAllPanelDismissed] = useState(false);
	const [favoritesOpen, setFavoritesOpen] = useState(false);
	const [semanticSearchOpen, setSemanticSearchOpen] = useState(false);
	const [favoriteCoachIds, setFavoriteCoachIds] = useState([]);
	const [showIntroModal, setShowIntroModal] = useState(true);
	const [trainingType, setTrainingType] = useState("either");
	const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
	const [mobileLocationSheetOpen, setMobileLocationSheetOpen] = useState(false);
	const [mobileFilterSheetOpen, setMobileFilterSheetOpen] = useState(false);
	const [mobileSearchExpanded, setMobileSearchExpanded] = useState(false);
	const [mobileSheetSnap, setMobileSheetSnap] = useState("half");
	const [statesPanelOpen, setStatesPanelOpen] = useState(false);
	const [gymPanel, setGymPanel] = useState(null);
	const [clusterPanel, setClusterPanel] = useState(null);
	const [contactCoach, setContactCoach] = useState(null);
	const [zipSearch, setZipSearch] = useState("");
	const [radiusMiles, setRadiusMiles] = useState(25);
	const [searchFocused, setSearchFocused] = useState(false);
	const [mobileSheetDragOffset, setMobileSheetDragOffset] = useState(0);
	const [isMobileSheetDragging, setIsMobileSheetDragging] = useState(false);
	const showOnline = trainingType === "online";
	const inPersonOnly = trainingType === "inPerson";
	const { collapsed: mobileHeaderCollapsed, setCollapsed: setMobileHeaderCollapsed, onResultsScroll } =
		useMobileResultsHeader(!isDesktop);

	useEffect(() => {
		if (mobileHeaderCollapsed || profileCoach || contactCoach) {
			setMobileSearchExpanded(false);
		}
	}, [contactCoach, mobileHeaderCollapsed, profileCoach]);

	useEffect(() => {
		if (!searchTags.length) return;
		[mobileSearchTagsRef.current, desktopSearchTagsRef.current].forEach((tagScroller) => {
			tagScroller?.scrollTo?.({ left: tagScroller.scrollWidth, behavior: "smooth" });
		});
	}, [searchTags]);

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
		inPersonOnly ||
		zipFilterActive ||
		Boolean(gymPanel) ||
		Boolean(clusterPanel) ||
		Boolean(contactCoach);
	const state = selectedState ? getStateByAbbr(selectedState) : null;

	useEffect(() => {
		if (!showIntroModal) return undefined;

		introCloseButtonRef.current?.focus();
		const handleKeyDown = (event) => {
			if (event.key === "Escape") setShowIntroModal(false);
			if (event.key === "Tab") {
				event.preventDefault();
				introCloseButtonRef.current?.focus();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [showIntroModal]);

	useEffect(() => {
		if (!locationDropdownOpen) return undefined;
		const handleKeyDown = (event) => {
			if (event.key === "Escape") setLocationDropdownOpen(false);
		};
		const handlePointerDown = (event) => {
			if (!locationMenuRef.current?.contains(event.target)) {
				setLocationDropdownOpen(false);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		document.addEventListener("pointerdown", handlePointerDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("pointerdown", handlePointerDown);
		};
	}, [locationDropdownOpen]);

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
		if (isDesktop || (!profileCoach && !contactCoach)) return;
		setMobileSheetSnap("full");
		setMobileHeaderCollapsed(true);
	}, [contactCoach, isDesktop, profileCoach, setMobileHeaderCollapsed]);

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
				let singleGymPreviewHtml = "";
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
					const primaryCoach = clusterCoaches[0];
					const primarySpecialty =
						primaryCoach?.specialties?.[0] ||
						primaryCoach?.title ||
						primaryGym.tags?.[0] ||
						"Coaching";
					const coachInitials = primaryCoach?.name
						?.split(/\s+/)
						.filter(Boolean)
						.slice(0, 2)
						.map((part) => part[0])
						.join("")
						.toUpperCase();
					const additionalCoachCount = Math.max(clusterCoaches.length - 1, 0);
					singleGymPreviewHtml = `
						<div class="single-gym-preview">
							<div class="sgp-topline">
								<span class="sgp-kicker">Gym</span>
								<span class="sgp-count">${count} ${count === 1 ? "coach" : "coaches"}</span>
							</div>
							<div class="sgp-gym">${escapeMapHtml(primaryGym.name)}</div>
							<div class="sgp-location"><span class="sgp-location-dot"></span>${escapeMapHtml(primaryGym.city)}, ${escapeMapHtml(primaryGym.state)}</div>
							${
								primaryCoach
									? `<div class="sgp-coach">
										<span class="sgp-initials">${escapeMapHtml(coachInitials || "C")}</span>
										<div class="sgp-coach-copy">
											<div class="sgp-coach-name">${escapeMapHtml(primaryCoach.name)}</div>
											<div class="sgp-coach-title">${escapeMapHtml(primaryCoach.title)}</div>
										</div>
										<span class="sgp-tag">${escapeMapHtml(primarySpecialty)}</span>
									</div>`
									: ""
							}
							${additionalCoachCount ? `<div class="sgp-more">+${additionalCoachCount} more at this gym</div>` : ""}
						</div>`;
					tooltipHtml = singleGymPreviewHtml;
				}

				const popupHtml = isMulti
					? `<p class="graphite-popup-title">${count} coaches nearby</p><p class="graphite-popup-meta">${cluster.gymCount} gyms · ${gymTags.slice(0, 4).join(" · ")}<br />${clusterCoaches
							.slice(0, 4)
							.map((coach) => coach.name)
							.join(" · ")}</p>`
					: singleGymPreviewHtml;

				const markerSize =
					count > 1 ? Math.min(28 + (count - 1) * 3, 46) : 28;
				const singleGymPlacement = isMulti
					? null
					: getSingleGymTooltipPlacement(map, lat, lng, markerSize);
				const marker = L.marker([lat, lng], { icon: createClusterIcon(count) });

				if (!isMulti) {
					marker.on("mouseover focus", () => {
						const tooltip = marker.getTooltip();
						if (!tooltip) return;
						const placement = getSingleGymTooltipPlacement(
							map,
							lat,
							lng,
							markerSize,
						);
						tooltip.options.direction = placement.direction;
						tooltip.options.offset = placement.offset;
					});
				}

				marker.bindTooltip(tooltipHtml, {
						direction: singleGymPlacement?.direction || "top",
						offset:
							singleGymPlacement?.offset || [0, -markerSize / 2 - 4],
						opacity: 1,
						className: "coach-tooltip-wrapper",
					});

				if (window.innerWidth >= 1024) marker.bindPopup(popupHtml);

				marker
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

							setGymPanel(null);
							setClusterPanel({
								id: cluster.id,
								coaches: clusterCoaches,
								title: `${count} ${count === 1 ? "Coach" : "Coaches"}`,
								eyebrow:
									cities.length === 1
										? cityLabel
										: `${cityLabel}${stateLabel ? ` • ${stateLabel}` : ""}`,
								clusterPreview: true,
							});
							setSelectedState(null);
							setStatesPanelOpen(false);
							setFavoritesOpen(false);
							setSemanticSearchOpen(false);
							setTrainingType("either");
							setProfileCoach(null);
							setContactCoach(null);
							setSearch("");
							setLocationDropdownOpen(false);
							if (window.innerWidth < 1024) setMobileSheetSnap("half");
							map.flyTo([lat, lng], Math.max(zoom, 6), { duration: 0.65 });
						} else {
							setSelectedState(primaryGym.state);
							setStatesPanelOpen(false);
							setGymPanel(null);
							setClusterPanel({
								id: primaryGym.id,
								coaches: clusterCoaches,
								title: `${count} ${count === 1 ? "Coach" : "Coaches"}`,
								eyebrow: primaryGym.city,
								clusterPreview: true,
							});
							setFavoritesOpen(false);
							setSemanticSearchOpen(false);
							setTrainingType("either");
							setProfileCoach(null);
							setContactCoach(null);
							setSearch("");
							setLocationDropdownOpen(false);
							if (window.innerWidth < 1024) setMobileSheetSnap("half");
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

	function toggleMobileSearchControls() {
		if (mobileSearchExpanded) {
			setMobileSearchExpanded(false);
			return;
		}

		// Keep the render and focus inside the original tap so iOS opens the keyboard.
		flushSync(() => {
			setMobileHeaderCollapsed(false);
			setMobileSearchExpanded(true);
		});
		mobileSearchInputRef.current?.focus({ preventScroll: true });
	}

	function prepareMobileCoachSearch() {
		setAllPanelDismissed(false);
		setStatesPanelOpen(false);
		setGymPanel(null);
		setFilter("all");
		setMobileSheetSnap("half");
	}

	function saveCurrentSearchAsTag() {
		const nextTag = search.trim();
		if (!nextTag) return false;

		setSearchTags((current) =>
			current.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())
				? current
				: [...current, nextTag],
		);
		setSearch("");
		return true;
	}

	function commitMobileSearch(event) {
		event.preventDefault();
		if (!saveCurrentSearchAsTag()) return;
		prepareMobileCoachSearch();
		window.requestAnimationFrame(() =>
			mobileSearchInputRef.current?.focus({ preventScroll: true }),
		);
	}

	function commitDesktopSearch(event) {
		event.preventDefault();
		saveCurrentSearchAsTag();
	}

	function removeSearchTag(tagToRemove) {
		setSearchTags((current) => current.filter((tag) => tag !== tagToRemove));
	}

	function openMobileLocationPicker() {
		const map = mapRef.current;
		preLocationViewRef.current = {
			selectedState,
			allPanelDismissed,
			statesPanelOpen,
			favoritesOpen,
			semanticSearchOpen,
			trainingType,
			profileCoach,
			contactCoach,
			search,
			searchTags,
			filter,
			gymPanel,
			clusterPanel,
			mobileSheetSnap,
			mobileHeaderCollapsed,
			mapView: map
				? {
						center: map.getCenter(),
						zoom: map.getZoom(),
					}
				: null,
		};
		setMobileFilterSheetOpen(false);
		setMobileLocationSheetOpen(true);
	}

	function returnToMobileFilters() {
		preLocationViewRef.current = null;
		setMobileLocationSheetOpen(false);
		setMobileFilterSheetOpen(true);
	}

	function restorePreLocationView() {
		const previousView = preLocationViewRef.current;
		preLocationViewRef.current = null;
		if (!previousView) {
			resetToMap();
			return;
		}

		setSelectedState(previousView.selectedState);
		setAllPanelDismissed(previousView.allPanelDismissed);
		setStatesPanelOpen(previousView.statesPanelOpen);
		setFavoritesOpen(previousView.favoritesOpen);
		setSemanticSearchOpen(previousView.semanticSearchOpen);
		setTrainingType(previousView.trainingType);
		setProfileCoach(previousView.profileCoach);
		setContactCoach(previousView.contactCoach);
		setSearch(previousView.search);
		setSearchTags(previousView.searchTags);
		setFilter(previousView.filter);
		setGymPanel(previousView.gymPanel);
		setClusterPanel(previousView.clusterPanel);
		setMobileLocationSheetOpen(false);
		setMobileFilterSheetOpen(false);
		setMobileSheetSnap(previousView.mobileSheetSnap);
		setMobileHeaderCollapsed(previousView.mobileHeaderCollapsed);
		if (previousView.mapView && mapRef.current) {
			mapRef.current.setView(previousView.mapView.center, previousView.mapView.zoom, {
				animate: false,
			});
		}
	}

	function resetToMap() {
		preLocationViewRef.current = null;
		setSelectedState(null);
		setStatesPanelOpen(false);
		setFavoritesOpen(false);
		setSemanticSearchOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setSearchTags([]);
		setTrainingType("either");
		setAllPanelDismissed(isDesktop);
		setGymPanel(null);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		setMobileLocationSheetOpen(false);
		setMobileFilterSheetOpen(false);
		setMobileSheetSnap("collapsed");
		setMobileHeaderCollapsed(false);
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
		if (isDesktop) setSearch("");
		setGymPanel(null);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		setMobileLocationSheetOpen(false);
		setMobileSheetSnap("half");
		if (mapRef.current)
			mapRef.current.flyTo(stateItem.center, 6, { duration: 0.85 });
	}

	function clearLocation() {
		preLocationViewRef.current = null;
		setSelectedState(null);
		setAllPanelDismissed(true);
		setStatesPanelOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		if (isDesktop) setSearch("");
		setGymPanel(null);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		setMobileLocationSheetOpen(false);
		setMobileSheetSnap("half");
		if (mapRef.current)
			mapRef.current.flyTo([38.8, -96.5], 4, { duration: 0.8 });
	}

	function restorePreFavoritesView() {
		const previousView = preFavoritesViewRef.current;
		setFavoritesOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		if (!previousView) {
			resetToMap();
			return;
		}

		setSelectedState(previousView.selectedState);
		setAllPanelDismissed(previousView.allPanelDismissed);
		setStatesPanelOpen(previousView.statesPanelOpen);
		setSemanticSearchOpen(previousView.semanticSearchOpen);
		setTrainingType(previousView.trainingType);
		setGymPanel(previousView.gymPanel);
		setClusterPanel(previousView.clusterPanel);
		setSearch(previousView.search);
		setSearchTags(previousView.searchTags || []);
		setFilter(previousView.filter);
		setMobileSheetSnap(previousView.mobileSheetSnap);
		setMobileHeaderCollapsed(previousView.mobileHeaderCollapsed);
		preFavoritesViewRef.current = null;
	}

	function openFavoritesPanel() {
		if (favoritesOpen) return;
		preFavoritesViewRef.current = {
			selectedState,
			allPanelDismissed,
			statesPanelOpen,
			semanticSearchOpen,
			trainingType,
			gymPanel,
			clusterPanel,
			search,
			searchTags,
			filter,
			mobileSheetSnap,
			mobileHeaderCollapsed,
		};
		setSelectedState(null);
		setAllPanelDismissed(true);
		setStatesPanelOpen(false);
		setFavoritesOpen(true);
		setSemanticSearchOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setSearchTags([]);
		setTrainingType("either");
		setGymPanel(null);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		setMobileSheetSnap("half");
		setMobileHeaderCollapsed(false);
	}

	function openSemanticSearchPanel() {
		setSelectedState(null);
		setAllPanelDismissed(true);
		setStatesPanelOpen(false);
		setFavoritesOpen(false);
		setSemanticSearchOpen(true);
		setProfileCoach(null);
		setContactCoach(null);
		setTrainingType("either");
		setGymPanel(null);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		setMobileSheetSnap("half");
	}

	function openOnlinePanel() {
		setAllPanelDismissed(true);
		setFavoritesOpen(false);
		setStatesPanelOpen(false);
		setSemanticSearchOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		if (isDesktop) setSearch("");
		setGymPanel(null);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		setTrainingType((current) => (current === "online" ? "either" : "online"));
		setFilter((current) => (current === "states" ? "all" : current));
		setMobileSheetSnap("half");
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
		setTrainingType("either");
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
			setTrainingType("either");
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
		setTrainingType("either");
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
			clusterPreview: true,
			parentGymPanel,
		});
		setFavoritesOpen(false);
		setSemanticSearchOpen(false);
		if (isDesktop) setTrainingType("either");
		setProfileCoach(null);
		setContactCoach(null);
		if (isDesktop) setSearch("");
		setLocationDropdownOpen(false);
		setMobileLocationSheetOpen(false);
		setMobileSheetSnap("half");
		if (mapRef.current) {
			mapRef.current.flyTo([gym.latitude, gym.longitude], 10, {
				duration: 0.85,
			});
		}
	}

	function handlePanelBack() {
		if (favoritesOpen) {
			restorePreFavoritesView();
			return;
		}

		if (preLocationViewRef.current) {
			restorePreLocationView();
			return;
		}

		if (clusterPanel?.parentGymPanel) {
			setGymPanel(clusterPanel.parentGymPanel);
			setClusterPanel(null);
			setProfileCoach(null);
			setContactCoach(null);
			setSearch("");
			return;
		}

		if (!isDesktop && mobileSheetSnap === "full") {
			setMobileSheetSnap("half");
			return;
		}

		resetToMap();
	}

	function handleMobileSheetPointerDown(event) {
		if (isDesktop) return;
		mobileSheetDragStartYRef.current = event.clientY;
		mobileSheetDragStartSnapRef.current = effectiveMobileSheetSnap;
		mobileSheetDragMovedRef.current = false;
		setIsMobileSheetDragging(true);
		event.currentTarget.setPointerCapture?.(event.pointerId);
	}

	function handleMobileSheetPointerMove(event) {
		if (mobileSheetDragStartYRef.current == null) return;
		const delta = event.clientY - mobileSheetDragStartYRef.current;
		if (Math.abs(delta) > 8) mobileSheetDragMovedRef.current = true;
		setMobileSheetDragOffset(Math.max(-280, Math.min(280, delta)));
	}

	function handleMobileSheetPointerEnd(event) {
		if (mobileSheetDragStartYRef.current == null) return;
		const delta = event.clientY - mobileSheetDragStartYRef.current;
		const startSnap = mobileSheetDragStartSnapRef.current;
		const wasDragged = mobileSheetDragMovedRef.current;
		mobileSheetDragStartYRef.current = null;
		setIsMobileSheetDragging(false);
		setMobileSheetDragOffset(0);
		event.currentTarget.releasePointerCapture?.(event.pointerId);
		if (wasDragged && delta < -58) {
			setMobileSheetSnap(startSnap === "collapsed" ? "half" : "full");
		} else if (wasDragged && delta > 58) {
			setMobileSheetSnap(startSnap === "full" ? "half" : "collapsed");
		}
	}

	function handleMobileSheetHandleClick() {
		if (mobileSheetDragMovedRef.current) {
			mobileSheetDragMovedRef.current = false;
			return;
		}
		setMobileSheetSnap((current) =>
			current === "collapsed" ? "half" : current === "half" ? "full" : "half",
		);
	}

	const locationScopedCoaches = selectedState
		? state?.coaches || []
		: allCoaches;
	const locationAndTrainingCoaches = showOnline
		? locationScopedCoaches.filter((coach) => coach.onlineTraining)
		: inPersonOnly
			? locationScopedCoaches.filter((coach) => coach.gyms?.length)
			: locationScopedCoaches;
	const activePanelCoaches = clusterPanel
		? clusterPanel.coaches
		: semanticSearchOpen
			? allCoaches
		: favoritesOpen
			? favoriteCoaches
			: selectedState || showOnline || inPersonOnly || filter === "all"
				? locationAndTrainingCoaches
				: [];
	const filteredActivePanelCoaches = rankCoachesBySemanticSearchTerms(
		activePanelCoaches,
		[...searchTags, search],
	);
	const hasActiveSearch = Boolean(search.trim() || searchTags.length);
	const activePanelTitle = clusterPanel
		? clusterPanel.title
		: semanticSearchOpen
			? "Coach Search"
			: favoritesOpen
				? "Favorites"
				: selectedState && showOnline
					? `${state?.name} Online Training`
					: selectedState && inPersonOnly
						? `${state?.name} In-person Training`
					: selectedState
						? state?.name || ""
					: showOnline
						? "Online Training"
						: inPersonOnly
							? "In-person Training"
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
					: selectedState && inPersonOnly
						? "Location + in-person coaches"
					: selectedState
						? "Selected location"
					: showOnline
						? "Remote coaches"
						: inPersonOnly
							? "In-person coaches"
						: filter === "all"
							? `${allCoaches.length} ${allCoaches.length === 1 ? "coach" : "coaches"} in directory`
							: "Selected filters";
	const activePanelEmptyMessage = hasActiveSearch
		? "No matching coaches found. Remove a search tag or try a broader phrase."
		: clusterPanel
			? "No coaches found in this cluster."
			: semanticSearchOpen
				? "No matching coaches found. Try a broader phrase like strength, wellness, barbell, or performance."
				: favoritesOpen
					? "No favorites yet. Open a coach profile and tap the heart to save them here."
					: selectedState && showOnline
						? "No online training coaches found in this location."
						: selectedState && inPersonOnly
							? "No in-person coaches found in this location."
							: showOnline
								? "No online training coaches found."
								: inPersonOnly
									? "No in-person coaches found."
									: filter === "all"
										? "No coaches found yet."
										: "No matching coaches found.";

	const isMobile = !isDesktop;
	const effectiveMobileSheetSnap = profileCoach || contactCoach ? "full" : mobileSheetSnap;
	const mobilePanelHeight =
		effectiveMobileSheetSnap === "collapsed"
			? "calc(92px + env(safe-area-inset-bottom))"
			: effectiveMobileSheetSnap === "full"
				? "100dvh"
				: isShortMobile
					? "56dvh"
					: isTablet
						? "54dvh"
						: "52dvh";
	const effectivePanelVisible = isMobile ? true : panelVisible;
	const hideFloatingControls =
		(isShortMobile && panelVisible) ||
		(isMobile && Boolean(profileCoach || contactCoach));
	const mobileActionBottom = panelVisible
		? `calc(${mobilePanelHeight} + 14px + env(safe-area-inset-bottom))`
		: "calc(18px + env(safe-area-inset-bottom))";
	const mobilePanelBaseTransform = isTablet && !isShortMobile
		? "translateX(50%)"
		: "none";
	const mobilePanelTransform =
		isMobile && effectivePanelVisible && mobileSheetDragOffset
			? `${mobilePanelBaseTransform} translateY(${mobileSheetDragOffset}px)`
			: mobilePanelBaseTransform;
	const selectedLocationLabel = clusterPanel?.title || state?.name || "Locations";
	const hasSelectedLocation = Boolean(selectedState || clusterPanel);
	const activeMobileFilterCount =
		(trainingType === "either" ? 0 : 1) + (hasSelectedLocation ? 1 : 0);
	const hideMobileDirectoryHeader =
		Boolean(profileCoach || contactCoach) ||
		effectiveMobileSheetSnap === "full" ||
		mobileLocationSheetOpen ||
		mobileFilterSheetOpen;
	const mobileDialogOpen = mobileLocationSheetOpen || mobileFilterSheetOpen;

	return (
		<main style={styles.shell}>
			{showIntroModal ? (
				<div
					style={{
						...styles.introOverlay,
						...(isMobile ? { padding: 14, placeItems: "safe center" } : {}),
					}}
					role="dialog"
					aria-modal="true"
					aria-labelledby="coach-map-intro-title"
				>
					<section
						style={{
							...styles.introModal,
							...(isMobile
								? {
										width: "min(560px, calc(100vw - 28px))",
								padding: "24px 62px 22px 22px",
									}
								: {}),
						}}
					>
						<button
							type="button"
							ref={introCloseButtonRef}
							style={styles.introCloseButton}
							onClick={() => setShowIntroModal(false)}
							aria-label="Close intro popup"
						>
							×
						</button>
						<p style={{ ...styles.eyebrow, paddingRight: 46, lineHeight: 1.45 }}>
							Find the coach who sees what you are capable of
						</p>
						<h1
							id="coach-map-intro-title"
							style={{
								...styles.title,
								fontSize: isMobile ? "clamp(27px, 9vw, 32px)" : 32,
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
				role="region"
				aria-label="Interactive map of strength coaches"
				style={{
					...styles.map,
					height: isMobile ? "100dvh" : styles.map.height,
					...(isMobile ? { "--mobile-results-height": mobilePanelHeight } : {}),
				}}
				inert={isMobile && mobileDialogOpen ? "" : undefined}
			/>

			{isMobile && !hideMobileDirectoryHeader ? (
				<header style={styles.mobileHeader} aria-label="Coach directory controls">
					<div
						className="mobile-directory-header"
						style={{
							...styles.mobileHeaderSurface,
							padding: 8,
							borderRadius: 18,
						}}
					>
						<div style={styles.mobileCommandBar}>
							<button
								type="button"
								className="mobile-search-launcher"
								style={{
									...styles.mobileSearchLauncher,
									...(mobileSearchExpanded ? styles.mobileSearchLauncherActive : {}),
								}}
								onClick={toggleMobileSearchControls}
								aria-label={mobileSearchExpanded ? "Close coach search controls" : "Search coaches"}
								aria-expanded={mobileSearchExpanded}
								aria-controls="mobile-coach-search-panel"
							>
								<span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">⌕</span>
								<span className="mobile-search-launcher-label" style={styles.mobileSearchLauncherLabel}>Search</span>
							</button>
							<button
								type="button"
								style={styles.mobileToolbarButton}
								onClick={() => {
									setMobileSearchExpanded(false);
									setMobileFilterSheetOpen(true);
								}}
								aria-label={`Filters${activeMobileFilterCount ? `, ${activeMobileFilterCount} active` : ""}`}
							>
								<span aria-hidden="true">⚙</span>
								<span>Filters</span>
								{activeMobileFilterCount ? <span style={styles.mobileBadge}>{activeMobileFilterCount}</span> : null}
							</button>
							{onOpenApplication ? (
								<button
									type="button"
									style={styles.mobileToolbarButton}
									onClick={() => {
										setMobileSearchExpanded(false);
										onOpenApplication();
									}}
								>
									<span className="mobile-be-prefix">Be a </span>Coach
								</button>
							) : null}
							<button
								type="button"
								style={{ ...styles.mobileIconButton, width: 40, height: 40, fontSize: 20 }}
								onClick={() => {
									setMobileSearchExpanded(false);
									openFavoritesPanel();
								}}
								aria-label={`Favorites, ${favoriteCoachIds.length} saved`}
							>
								♡
								{favoriteCoachIds.length ? <span style={styles.mobileBadge}>{favoriteCoachIds.length}</span> : null}
							</button>
						</div>

						{mobileSearchExpanded ? (
							<div id="mobile-coach-search-panel" style={styles.mobileExpandedSearchPanel}>
								<form
									style={{ ...styles.mobileSearchWrap, marginBottom: 8 }}
									onSubmit={commitMobileSearch}
								>
									<span style={styles.mobileSearchIcon}>⌕</span>
									<input
										ref={mobileSearchInputRef}
										className="mobile-coach-search"
										type="search"
										style={styles.mobileSearchInput}
										value={search}
										onChange={(event) => {
											setSearch(event.target.value);
											prepareMobileCoachSearch();
										}}
										onFocus={() => {
											setSearchFocused(true);
											if (mobileSheetSnap === "collapsed") setMobileSheetSnap("half");
										}}
										onBlur={() => setSearchFocused(false)}
										enterKeyHint="search"
										autoComplete="off"
										placeholder="Search coach, city, gym, specialty"
										aria-label="Search coach, city, gym, or specialty"
									/>
									{search ? (
										<button
											type="button"
											style={{ ...styles.mobileIconButton, position: "absolute", top: 0, right: 0, border: 0, background: "transparent" }}
											onClick={() => setSearch("")}
											aria-label="Clear coach search"
										>
											×
										</button>
									) : null}
								</form>
								<div
									ref={mobileSearchTagsRef}
									className="mobile-search-tags"
									style={styles.mobileSearchTagScroller}
									aria-label="Active search tags"
									aria-live="polite"
								>
									{searchTags.length ? (
										searchTags.map((tag) => (
											<span key={tag} style={styles.mobileSearchTag}>
												<span style={styles.mobileSearchTagLabel}>{tag}</span>
												<button
													type="button"
													style={styles.mobileSearchTagRemove}
												onClick={() => removeSearchTag(tag)}
													aria-label={`Remove ${tag} search`}
												>
													×
												</button>
											</span>
										))
									) : (
										<span style={styles.mobileSearchTagHint}>
											Press return to keep a search and add another
										</span>
									)}
								</div>
							</div>
						) : null}
					</div>
				</header>
			) : null}

			{isMobile && mobileLocationSheetOpen ? (
				<MobileLocationSheet
					states={MOCK_STATES}
					gyms={allGyms}
					selectedState={selectedState}
					selectedGymId={clusterPanel?.id}
					onSelectState={selectState}
					onSelectGym={selectGymFromPanel}
					onClear={clearLocation}
					onBack={returnToMobileFilters}
					onClose={returnToMobileFilters}
				/>
			) : null}

			{isMobile && mobileFilterSheetOpen ? (
				<MobileFilterSheet
					trainingType={trainingType}
					selectedLocationLabel={selectedLocationLabel}
					hasSelectedLocation={hasSelectedLocation}
					onOpenLocations={openMobileLocationPicker}
					onClearLocation={clearLocation}
					onTrainingTypeChange={(nextType) => {
						setTrainingType(nextType);
						setFavoritesOpen(false);
						setSemanticSearchOpen(false);
						setAllPanelDismissed(false);
					}}
					resultCount={filteredActivePanelCoaches.length}
					onClear={() => {
						setTrainingType("either");
						clearLocation();
					}}
					onApply={() => {
						setMobileFilterSheetOpen(false);
						setMobileSheetSnap("half");
					}}
					onClose={() => setMobileFilterSheetOpen(false)}
				/>
			) : null}

			<button
				type="button"
				style={{
					...styles.semanticSearchButton,
					...(isMobile
						? {
								left: isTablet ? "calc(50% - 250px)" : 14,
								right: "auto",
								bottom: mobileActionBottom,
								width: isTablet ? 240 : "calc(50vw - 22px)",
								justifyContent: "center",
								padding: "13px 12px",
								fontSize: 13,
							}
						: {}),
					...(hideFloatingControls ? { display: "none" } : {}),
					...(semanticSearchOpen ? styles.semanticSearchButtonActive : {}),
					...(isMobile ? { display: "none" } : {}),
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
								left: isTablet ? "50%" : 14,
								right: isTablet ? "auto" : 14,
								width: isTablet ? "min(520px, calc(100vw - 28px))" : "auto",
								transform: isTablet ? "translateX(-50%)" : "none",
								bottom: panelVisible
									? `calc(${mobilePanelHeight} + 74px + env(safe-area-inset-bottom))`
									: "calc(78px + env(safe-area-inset-bottom))",
								justifyContent: "center",
								gap: 6,
								padding: 6,
							}
						: {}),
					...(hideFloatingControls ? { display: "none" } : {}),
					...(isMobile ? { display: "none" } : {}),
				}}
				aria-label="Map filters"
			>
				{["all", "states", "coaches"].map((item) => (
					<button
						key={item}
						onClick={() => handleFilterChange(item)}
						aria-pressed={filter === item}
						style={{
							...styles.controlButton,
							...(isMobile
								? {
										flex: 1,
										minHeight: 44,
										padding: "10px 8px",
										fontSize: 12,
									}
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
								right: isTablet ? "calc(50% - 250px)" : 14,
								bottom: mobileActionBottom,
								width: isTablet ? 240 : "calc(50vw - 22px)",
								justifyContent: "center",
								padding: "13px 12px",
								fontSize: 13,
							}
						: {}),
					...(hideFloatingControls ? { display: "none" } : {}),
					...(isMobile ? { display: "none" } : {}),
				}}
				onClick={openFavoritesPanel}
				aria-label="Open favorite coaches"
			>
				<span>♡ Favorites</span>
				<span style={styles.favoritesCount}>{favoriteCoachIds.length}</span>
			</button>

			<div
				ref={locationMenuRef}
				style={{
					position: "absolute",
					zIndex: 1100,
					...(isMobile
						? {
								left: 70,
								right: 12,
								top: "calc(12px + env(safe-area-inset-top))",
							}
						: {
								right: isDesktop && panelVisible ? 458 : 24,
								top: 24,
							}),
					display: "flex",
					flexDirection: "column",
					alignItems: isMobile ? "flex-end" : "flex-start",
					gap: 8,
					transition: "right 0.42s cubic-bezier(.66,.09,.28,1)",
					...(hideFloatingControls ? { display: "none" } : {}),
					...(isMobile ? { display: "none" } : {}),
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: isMobile ? "row" : "column",
						gap: 8,
						width: "auto",
					}}
				>
					<button
						type="button"
						onClick={() => setLocationDropdownOpen((current) => !current)}
						style={{
							border: `1px solid ${selectedState ? "rgba(198,197,195,0.46)" : palette.border}`,
							background: selectedState
								? palette.graphite100
								: "rgba(30,28,30,0.78)",
							color: selectedState ? palette.graphite900 : palette.text,
							borderRadius: 999,
							padding: "13px 17px",
							cursor: "pointer",
							backdropFilter: "blur(14px)",
							boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
							fontWeight: selectedState ? 600 : 540,
							fontSize: 14,
							minWidth: 184,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							...(isMobile
								? {
										width: "100%",
										minWidth: 0,
										minHeight: 44,
										padding: "11px 10px",
										fontSize: 13,
									}
								: {}),
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
										left: "auto",
										right: 0,
										width: "min(340px, calc(100vw - 28px))",
										top: 44,
									}
								: {}),
							maxHeight: locationDropdownOpen ? (isMobile ? "42dvh" : 220) : 0,
							opacity: locationDropdownOpen ? 1 : 0,
							marginTop: locationDropdownOpen ? 0 : -4,
							transition:
								"max-height 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease, margin-top 0.22s ease",
							pointerEvents: locationDropdownOpen ? "all" : "none",
						}}
						aria-hidden={!locationDropdownOpen}
						inert={locationDropdownOpen ? undefined : ""}
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
								: "rgba(30,28,30,0.78)",
							color: showOnline ? palette.graphite900 : palette.text,
							borderRadius: 999,
							padding: "13px 17px",
							cursor: "pointer",
							backdropFilter: "blur(14px)",
							boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
							fontWeight: showOnline ? 600 : 540,
							fontSize: 14,
							minWidth: 184,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 9,
							...(isMobile
								? {
										width: "auto",
										minWidth: 0,
										minHeight: 36,
										padding: "8px 10px",
										fontSize: 12,
									}
								: {}),
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
								background: "rgba(30,28,30,0.58)",
								color: palette.graphite100,
								borderRadius: 999,
								padding: "11px 17px",
								cursor: "pointer",
								backdropFilter: "blur(14px)",
								boxShadow: "0 10px 26px rgba(0,0,0,0.18)",
								fontWeight: 500,
								fontSize: 13.5,
								minWidth: 184,
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								...(isMobile
									? {
											width: "auto",
											minWidth: 68,
											minHeight: 36,
											padding: "8px 10px",
											fontSize: 12,
									}
									: {}),
							}}
						>
							{isMobile ? "Apply" : "Apply as coach"}
						</button>
					) : null}
				</div>
			</div>

			<aside
				className="mobile-results-sheet"
				style={{
					...styles.glassPanel,
					width: isDesktop
						? 430
						: isTablet && !isShortMobile
							? "min(680px, calc(100vw - 32px))"
							: "100vw",
					height: isDesktop ? "100vh" : mobilePanelHeight,
					maxHeight: "100dvh",
					top: isDesktop ? 0 : "auto",
					bottom: isDesktop ? "auto" : 0,
					right: isTablet && !isShortMobile ? "50%" : 0,
					borderLeft:
						isDesktop || (isTablet && !isShortMobile)
							? `1px solid ${palette.border}`
							: "none",
					borderRight:
						isTablet && !isShortMobile ? `1px solid ${palette.border}` : "none",
					borderTop: isDesktop ? "none" : `1px solid ${palette.border}`,
					borderTopLeftRadius:
						isDesktop || effectiveMobileSheetSnap === "full" ? 0 : 24,
					borderTopRightRadius:
						isDesktop || effectiveMobileSheetSnap === "full" ? 0 : 24,
					padding: isDesktop
						? "34px 34px 22px"
						: effectiveMobileSheetSnap === "full"
							? "calc(10px + env(safe-area-inset-top)) 16px calc(18px + env(safe-area-inset-bottom))"
							: "4px 16px calc(12px + env(safe-area-inset-bottom))",
					gap: isMobile ? 0 : styles.glassPanel.gap,
					...(effectivePanelVisible
						? {
								...styles.glassPanelShown,
								transform: mobilePanelTransform,
							transition: isMobileSheetDragging
								? "none"
								: "height 300ms cubic-bezier(.22,.7,.24,1), transform 300ms cubic-bezier(.22,.7,.24,1), opacity 180ms ease",
							}
						: {
								...styles.glassPanelHidden,
								transform: isDesktop
									? "translateX(104%)"
									: isTablet && !isShortMobile
										? "translate(50%, 104%)"
										: "translateY(104%)",
							}),
				}}
				aria-hidden={!effectivePanelVisible || (isMobile && mobileDialogOpen)}
				inert={effectivePanelVisible && !mobileDialogOpen ? undefined : ""}
			>
				{isMobile && effectivePanelVisible ? (
					<button
						type="button"
						style={{ ...styles.mobileSheetHandle, border: 0, padding: 0, cursor: "grab", touchAction: "none" }}
						aria-label={`Results drawer, ${effectiveMobileSheetSnap}. Drag or tap to change size`}
						onPointerDown={handleMobileSheetPointerDown}
						onPointerMove={handleMobileSheetPointerMove}
						onPointerUp={handleMobileSheetPointerEnd}
						onPointerCancel={handleMobileSheetPointerEnd}
						onClick={handleMobileSheetHandleClick}
					>
						<span
							aria-hidden="true"
							style={{ width: 42, height: 4, borderRadius: 999, background: "rgba(198,197,195,0.3)" }}
						/>
					</button>
				) : null}
				{isMobile && effectiveMobileSheetSnap === "collapsed" ? (
					<button
						type="button"
						style={{ border: 0, background: "transparent", color: palette.text, font: "inherit", textAlign: "left", padding: "2px 2px 8px", cursor: "pointer" }}
						onClick={() => setMobileSheetSnap("half")}
					>
						<strong style={{ display: "block", fontSize: 15 }}>
							{filteredActivePanelCoaches.length} {filteredActivePanelCoaches.length === 1 ? "coach" : "coaches"} nearby
						</strong>
						<span style={{ color: palette.muted, fontSize: 12 }}>Tap or drag up to browse</span>
					</button>
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
					style={{
						flex: 1,
						minHeight: 0,
						display:
							isMobile && effectiveMobileSheetSnap === "collapsed" ? "none" : "block",
					}}
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
					) : effectivePanelVisible ? (
						<CoachListPanel
							title={activePanelTitle}
							eyebrow={activePanelEyebrow}
							coaches={activePanelCoaches}
							onBack={handlePanelBack}
							profileCoach={profileCoach}
							setProfileCoach={setProfileCoach}
							search={search}
							setSearch={setSearch}
							searchTags={searchTags}
							onCommitSearch={commitDesktopSearch}
							onRemoveSearchTag={removeSearchTag}
							searchTagScrollerRef={desktopSearchTagsRef}
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
							onResultsScroll={onResultsScroll}
							clusterPreview={Boolean(clusterPanel?.clusterPreview)}
							headerAction={
								isMobile && effectiveMobileSheetSnap === "full"
									? {
										label: `Filters${activeMobileFilterCount ? ` ${activeMobileFilterCount}` : ""}`,
										onClick: () => setMobileFilterSheetOpen(true),
									}
									: null
							}
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
			<React.Suspense fallback={<RouteLoading label="Coach application" />}>
				<CoachApplicationForm
					onBackToMap={goHome}
					adminHref="#/admin/coach-applications"
				/>
			</React.Suspense>
		);
	}

	if (route.path === "/admin/coach-applications") {
		return (
			<React.Suspense fallback={<RouteLoading label="Admin review" />}>
				<CoachApplicationAdmin
					onBackToMap={goHome}
					applicationHref="#/coach-apply"
					highlightedApplicationId={route.params.get("application")}
				/>
			</React.Suspense>
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
