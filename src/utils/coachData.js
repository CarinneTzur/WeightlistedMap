import { coaches } from "../data/coaches";
import { gyms } from "../data/gyms";

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
	return coaches.filter((coach) => coach.approved).map(enrichCoachWithGyms);
}

export function getAllGyms() {
	const approvedCoaches = getApprovedCoaches();
	return gyms
		.map((gym) => {
			const coachesAtGym = approvedCoaches.filter((coach) =>
				coach.gymIds?.includes(gym.id),
			);

			return {
				...gym,
				stateName: STATE_CENTERS[gym.state]?.name || gym.state,
				coachesAtGym,
				coachCount: coachesAtGym.length,
			};
		})
		.filter((gym) => gym.coachCount > 0);
}

export function getGymsByIds(gymIds = []) {
	return gymIds.map((id) => gyms.find((gym) => gym.id === id)).filter(Boolean);
}

function enrichCoachWithGyms(coach) {
	const coachGyms = getGymsByIds(coach.gymIds);
	const primaryGym = coachGyms[0] || null;
	const stateMeta = primaryGym ? STATE_CENTERS[primaryGym.state] : null;

	return {
		...coach,
		gyms: coachGyms,
		primaryGym,
		city: primaryGym ? `${primaryGym.city}, ${primaryGym.state}` : "",
		state: stateMeta?.name || primaryGym?.state || "",
		stateAbbr: primaryGym?.state || "",
		stateName: stateMeta?.name || primaryGym?.state || "",
		abbr: primaryGym?.state || "",
		onlineTraining: coach.onlineTraining ?? coach.remoteAvailable ?? false,
		remoteAvailable: coach.remoteAvailable ?? coach.onlineTraining ?? false,
	};
}

export function getStatesWithCoaches() {
	const approvedCoaches = getApprovedCoaches();

	const grouped = approvedCoaches.reduce((acc, coach) => {
		coach.gyms.forEach((gym) => {
			const stateMeta = STATE_CENTERS[gym.state];

			if (!stateMeta) return;

			if (!acc[gym.state]) {
				acc[gym.state] = {
					abbr: gym.state,
					name: stateMeta.name,
					center: stateMeta.center,
					coaches: [],
					gyms: [],
				};
			}

			if (!acc[gym.state].gyms.some((existing) => existing.id === gym.id)) {
				acc[gym.state].gyms.push(gym);
			}

			if (acc[gym.state].coaches.some((existing) => existing.id === coach.id)) {
				return;
			}

			acc[gym.state].coaches.push({
				...coach,
				city: `${gym.city}, ${gym.state}`,
				abbr: gym.state,
				state: stateMeta.name,
				stateName: stateMeta.name,
			});
		});

		return acc;
	}, {});

	return Object.values(grouped);
}

export function getAllCoaches() {
	return getApprovedCoaches();
}

export function getStateByAbbr(abbr) {
	return getStatesWithCoaches().find((state) => state.abbr === abbr) || null;
}
