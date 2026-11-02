import founderPortrait from "../assets/coach-workspace-portrait.png";
import { FOUNDER_PREVIEW_COACH_ID } from "./founderPreview";
import { mockCoaches } from "./mockCoaches";

export const coaches = [
	{
		id: FOUNDER_PREVIEW_COACH_ID,
		name: "Weightlisted Founder",
		title: "Strength & Wellness Coach",
		gymIds: ["gym_weightlisted_founder_ny"],
		rating: 4.8,
		headshot: founderPortrait,
		specialties: ["Powerlifting", "General Fitness", "Nutrition"],
		bio: "Helping lifters train with clarity, confidence, and purpose through practical strength and wellness coaching.",
		experience: "8 years",
		roster: 18,
		onlineTraining: true,
		remoteAvailable: true,
		approved: true,
		isPreview: true,
	},
	...mockCoaches,
];
