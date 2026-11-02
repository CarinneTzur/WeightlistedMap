import "./SocialLinks.css";

export const SOCIAL_PLATFORMS = [
	{
		id: "Instagram",
		label: "Instagram",
		placeholder: "@username",
		helper: "Handle or profile link",
		baseUrl: "https://www.instagram.com/",
	},
	{
		id: "TikTok",
		label: "TikTok",
		placeholder: "@username",
		helper: "Handle or profile link",
		baseUrl: "https://www.tiktok.com/@",
	},
	{
		id: "Facebook",
		label: "Facebook",
		placeholder: "@username",
		helper: "Username or page link",
		baseUrl: "https://www.facebook.com/",
	},
	{
		id: "Website",
		label: "Website",
		placeholder: "yourwebsite.com",
		helper: "Your coaching website",
		baseUrl: "",
	},
];

function platformKey(value = "") {
	return String(value).trim().toLowerCase();
}

function safeHttpUrl(value) {
	const trimmed = String(value || "").trim();
	if (!trimmed) return null;
	const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

	try {
		const url = new URL(candidate);
		return ["http:", "https:"].includes(url.protocol) ? url : null;
	} catch {
		return null;
	}
}

function handleFromUrl(url) {
	const segments = url.pathname.split("/").filter(Boolean);
	const lastSegment = segments.at(-1) || "";
	return decodeURIComponent(lastSegment).replace(/^@/, "");
}

function isOfficialPlatformUrl(url, platform) {
	const expectedHost = {
		Instagram: "instagram.com",
		TikTok: "tiktok.com",
		Facebook: "facebook.com",
	}[platform];
	const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
	return Boolean(expectedHost && (hostname === expectedHost || hostname.endsWith(`.${expectedHost}`)));
}

function normalizeHandle(value) {
	return String(value || "")
		.trim()
		.replace(/^@/, "")
		.replace(/^\/+|\/+$/g, "");
}

export function getSocialLinkPresentation(link) {
	const definition = SOCIAL_PLATFORMS.find(
		(platform) => platformKey(platform.id) === platformKey(link?.type),
	);
	const rawValue = String(link?.value || "").trim();
	if (!definition || !rawValue) return null;

	if (definition.id === "Website") {
		const url = safeHttpUrl(rawValue);
		if (!url) return null;
		const display = `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")}`;
		return { ...definition, href: url.href, display };
	}

	const looksLikeProfileUrl = /^https?:\/\//i.test(rawValue) || /^[^/\s]+\.[a-z]{2,}\//i.test(rawValue);
	const suppliedUrl = looksLikeProfileUrl ? safeHttpUrl(rawValue) : null;
	if (suppliedUrl && !isOfficialPlatformUrl(suppliedUrl, definition.id)) return null;
	const handle = suppliedUrl ? handleFromUrl(suppliedUrl) : normalizeHandle(rawValue);
	if (!handle) return null;
	const href = suppliedUrl?.href || `${definition.baseUrl}${encodeURIComponent(handle)}`;
	return { ...definition, href, display: `@${handle}` };
}

export function SocialIcon({ platform }) {
	const key = platformKey(platform);

	if (key === "instagram") {
		return (
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<rect x="3" y="3" width="18" height="18" rx="5" />
				<circle cx="12" cy="12" r="4" />
				<circle cx="17.4" cy="6.7" r="0.8" className="is-filled" />
			</svg>
		);
	}

	if (key === "tiktok") {
		return (
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M14 4v10.1a4.2 4.2 0 1 1-3.4-4.1" />
				<path d="M14 4c.6 2.8 2.2 4.3 5 4.8" />
			</svg>
		);
	}

	if (key === "facebook") {
		return (
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M14.5 21v-8h2.8l.5-3h-3.3V8.1c0-.9.4-1.6 1.7-1.6H18V3.8c-.7-.1-1.5-.2-2.4-.2-2.5 0-4.2 1.5-4.2 4.3V10H8.5v3h2.9v8" />
			</svg>
		);
	}

	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="9" />
			<path d="M3.5 12h17M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21M12 3C9.6 5.5 8.4 8.5 8.4 12s1.2 6.5 3.6 9" />
		</svg>
	);
}

export default function SocialLinks({ links = [], compact = false, className = "" }) {
	const presentations = SOCIAL_PLATFORMS.map((platform) => {
		const link = links.find((item) => platformKey(item?.type) === platformKey(platform.id));
		return getSocialLinkPresentation(link);
	}).filter(Boolean);

	if (!presentations.length) return null;

	return (
		<div className={`coach-social-links${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`} aria-label="Coach social profiles">
			{presentations.map((link) => (
				<a key={link.id} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${link.label} profile ${link.display}`}>
					<SocialIcon platform={link.id} />
					<span>{link.display}</span>
				</a>
			))}
		</div>
	);
}
