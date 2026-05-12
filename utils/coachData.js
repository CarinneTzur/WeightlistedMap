import { coaches } from "../data/coaches";

export const STATE_CENTERS = {
	CA: {
		name: "California",
		center: [36.7783, -119.4179],
	},
	TX: {
		name: "Texas",
		center: [31.9686, -99.9018],
	},
	NY: {
		name: "New York",
		center: [42.1657, -74.9481],
	},
	GA: {
		name: "Georgia",
		center: [32.1656, -82.9001],
	},
};

export function getApprovedCoaches() {
	return coaches.filter((coach) => coach.approved);
}

export function getStatesWithCoaches() {
	const approvedCoaches = getApprovedCoaches();

	const grouped = approvedCoaches.reduce((acc, coach) => {
		const stateMeta = STATE_CENTERS[coach.stateAbbr];

		if (!stateMeta) return acc;

		if (!acc[coach.stateAbbr]) {
			acc[coach.stateAbbr] = {
				abbr: coach.stateAbbr,
				name: stateMeta.name,
				center: stateMeta.center,
				coaches: [],
			};
		}

		acc[coach.stateAbbr].coaches.push({
			...coach,
			city: `${coach.city}, ${coach.stateAbbr}`,
			abbr: coach.stateAbbr,
			state: stateMeta.name,
			stateName: stateMeta.name,
		});

		return acc;
	}, {});

	return Object.values(grouped);
}

export function getAllCoaches() {
	return getStatesWithCoaches().flatMap((state) =>
		state.coaches.map((coach) => ({
			...coach,
			abbr: state.abbr,
			state: state.name,
			stateAbbr: state.abbr,
			stateName: state.name,
		})),
	);
}

export function getStateByAbbr(abbr) {
	return getStatesWithCoaches().find((state) => state.abbr === abbr) || null;
}
