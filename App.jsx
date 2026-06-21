import React, { useEffect, useMemo, useState } from "react";
import liftCelebrate from "./assets/portfolio/lift-celebrate.jpeg";
import mountainBlue from "./assets/portfolio/mountain-blue.jpeg";
import snowSelfie from "./assets/portfolio/snow-selfie.jpeg";
import carGuitar from "./assets/portfolio/car-guitar.jpeg";
import snowboardGroup from "./assets/portfolio/snowboard-group.jpeg";
import barbellFocus from "./assets/portfolio/barbell-focus-optimized.jpg";
import clubCollegiate from "./assets/portfolio/club-collegiate.png";
import clubPowerlifting from "./assets/portfolio/club-powerlifting.jpeg";
import "./App.css";

const contactLinks = [
	{ label: "Email", href: "mailto:ctzurdecker@outlook.com" },
	{ label: "LinkedIn", href: "https://linkedin.com/in/carinnetzurdecker" },
	{ label: "GitHub", href: "https://github.com/carinnetzur" },
	{ label: "Website", href: "https://carinnetz.com" },
];

const stats = [
	{ value: "11", label: "LLM automation agents owned end-to-end" },
	{ value: "60+", label: "hours/week of manual work removed from repetitive ops" },
	{ value: "30+", label: "client and external sites connected into workflows" },
	{ value: "5-8", label: "hours saved per consultant per week on case context" },
];

const skillGroups = [
	{
		title: "Product Engineering",
		items: ["React", "Vite", "JavaScript", "TypeScript", "HTML", "CSS", "Supabase", "SQL"],
	},
	{
		title: "AI Systems",
		items: [
			"LLM agents",
			"Prompt engineering",
			"NLP",
			"PyTorch",
			"Sentence-BERT",
			"Computer vision",
		],
	},
	{
		title: "Automation Ops",
		items: ["Make.com", "n8n", "REST APIs", "JSON payloads", "Glean", "SOQL", "RabbitMQ"],
	},
	{
		title: "Workflow Tools",
		items: ["GitHub", "Postman", "Jira", "Kibana", "Figma", "Jupyter", "GCP"],
	},
];

const experience = [
	{
		role: "Software Consultant",
		company: "Manhattan Associates",
		time: "Jan 2026 - Present",
		copy:
			"Building internal AI tools, investigating high-volume operational workflows, and supporting enterprise supply-chain platforms across GCP-hosted production environments.",
		highlights: ["Award-winning internal case management agent", "Root-cause analysis across SQL, APIs, logs, and JSON", "Cross-team visibility for multi-client portfolios"],
	},
	{
		role: "Applied AI Engineer Intern",
		company: "Rankey",
		time: "Apr 2025 - Nov 2025",
		copy:
			"Architected LLM automation agents across client operations, connecting data collection, reasoning, validation, and reporting systems.",
		highlights: ["11 LLM agents across 30+ client sites", "Reusable automation patterns", "20% revenue increase in 5 months"],
	},
	{
		role: "Founder / Software Engineer",
		company: "Weightlisted",
		time: "Jul 2025 - Present",
		copy:
			"Leading affordable web solutions for coaches, gyms, and small businesses, from client discovery and brand direction through deployment and launch support.",
		highlights: ["Responsive websites and platforms", "Directory search and filtering", "API scheduling and conversion-focused pages"],
	},
	{
		role: "Software Engineer & Scrum Master Intern",
		company: "Poozle",
		time: "Jun 2024 - Jan 2025",
		copy:
			"Built customer-facing React features for a production mobile app while supporting Agile delivery, frontend state logic, and REST API integration.",
		highlights: ["Location API functionality", "MongoDB-backed workflow persistence", "30% sprint velocity improvement"],
	},
];

const projects = [
	{
		id: "coach-discovery",
		title: "Coach Discovery Platform",
		tagline: "A searchable fitness discovery product for comparing coaches and gyms.",
		stack: ["React", "Vite", "Supabase", "SQL", "APIs", "TypeScript"],
		status: "In progress",
		date: "April 2026 - Present",
		problem:
			"Lifters need a faster way to find credible coaches and non-commercial gyms by location, specialty, availability, and market.",
		approach:
			"Designed a map-based directory with searchable coach profiles, gym listings, ratings, favorites, contact pathways, and specialty filters. Built a Supabase-backed data layer with SQL schema design, row-level access policies, and an edge function for coach submissions.",
		outcome:
			"Early product direction supports transparent coach comparison and gives future visitors a clear path to explore profiles, markets, and service fit.",
		links: { caseStudy: "#project-coach-discovery", live: "", repo: "" },
	},
	{
		id: "case-management",
		title: "Consultant Case Management Agent",
		tagline: "An internal AI agent that centralizes scattered case context.",
		stack: ["Glean", "SOQL", "Salesforce", "Jira", "Outlook", "LLMs"],
		status: "Award-winning",
		date: "March 2026",
		problem:
			"Consultants were piecing together Jira tickets, emails, internal documents, and notes to understand ongoing case history.",
		approach:
			"Built an AI agent that retrieves and organizes context into status updates, blockers, ownership, and next steps for multi-client portfolios.",
		outcome:
			"Reduced manual coordination by roughly 5-8 hours per consultant per week and improved cross-team case visibility.",
		links: { caseStudy: "#project-case-management", live: "", repo: "" },
	},
	{
		id: "edi-agent",
		title: "EDI Operations Email Intelligence Agent",
		tagline: "Turns multi-party operational email threads into structured dashboards.",
		stack: ["Glean", "SOQL", "Outlook", "LLMs", "Parsing Logic"],
		status: "Internal",
		date: "May 2026",
		problem:
			"EDI-related operational issues were hidden across carrier, shipper, 3PL, and enterprise email threads.",
		approach:
			"Parsed multi-party email threads, surfaced bottlenecks and delayed ownership, and converted communication history into structured operational views.",
		outcome:
			"Supported high-volume EDI operations and gave teams a cleaner way to analyze cross-party communication.",
		links: { caseStudy: "#project-edi-agent", live: "", repo: "" },
	},
	{
		id: "grocery-chatbot",
		title: "Grocery List AI Chatbot App",
		tagline: "A full-stack grocery planning app powered by natural language.",
		stack: ["Flutter", "Dart", "APIs", "Figma", "LLMs"],
		status: "Prototype",
		date: "Aug 2025 - Nov 2025",
		problem:
			"Meal planning gets messy when recipes, dietary goals, party sizes, and portion-scaled shopping lists all live in separate workflows.",
		approach:
			"Designed an AI chatbot interface where users describe meals, events, goals, or party sizes and receive structured grocery lists with normalized ingredients.",
		outcome:
			"Created a maintainable full-stack prototype that blends LLM planning with traditional recipe and ingredient logic.",
		links: { caseStudy: "#project-grocery-chatbot", live: "", repo: "" },
	},
	{
		id: "seo-pipeline",
		title: "AI SEO Extraction Pipeline",
		tagline: "Autonomous audit and content workflows across client sites.",
		stack: ["LLMs", "Make.com", "APIs", "JSON", "Python"],
		status: "Shipped",
		date: "Oct 2025",
		problem:
			"Manual SEO audits across many client sites were repetitive, slow, and hard to standardize.",
		approach:
			"Orchestrated multi-source data collection across client websites, sitemaps, robots.txt files, metadata, page structure, and crawl output. Used LLM reasoning chains to detect gaps and produce action-ready reports.",
		outcome:
			"Eliminated more than 10 hours per week of manual SEO analysis and produced structured reports for review and optimization planning.",
		links: { caseStudy: "#project-seo-pipeline", live: "", repo: "" },
	},
	{
		id: "book-recommender",
		title: "Book Recommendation System",
		tagline: "NLP recommendations across a large book corpus.",
		stack: ["Python", "Flask", "Sentence-BERT", "scikit-learn", "pandas"],
		status: "Academic",
		date: "Sept 2025",
		problem:
			"Readers need recommendations that understand semantic similarity, not only category labels or popularity.",
		approach:
			"Built a full-stack recommendation system using Sentence-BERT embeddings and cosine similarity across more than 50,000 books.",
		outcome:
			"Connected NLP-backed search with a lightweight application layer for exploring related titles.",
		links: { caseStudy: "#project-book-recommender", live: "", repo: "" },
	},
	{
		id: "ui-detection",
		title: "UI Element Detection for Visually Impaired Users",
		tagline: "Computer vision research for accessibility-oriented UI classification.",
		stack: ["Python", "PyTorch", "TorchVision", "Faster R-CNN", "LaTeX"],
		status: "Research",
		date: "April 2025",
		problem:
			"Assistive technologies benefit from reliable recognition of visual interface elements in app screens.",
		approach:
			"Built and optimized Faster R-CNN models using a ResNet backbone and the RICO dataset, then supported training, debugging, performance analysis, and paper development.",
		outcome:
			"Produced accessibility-focused computer vision work that classifies UI elements for visually impaired users.",
		links: { caseStudy: "#project-ui-detection", live: "", repo: "" },
	},
];

const cameraRoll = [
	{
		title: "Meet day voltage",
		src: liftCelebrate,
		className: "photo-a",
	},
	{
		title: "Mountain air",
		src: mountainBlue,
		className: "photo-b",
	},
	{
		title: "Snow day",
		src: snowSelfie,
		className: "photo-c",
	},
	{
		title: "Car guitar",
		src: carGuitar,
		className: "photo-d",
	},
	{
		title: "Board crew",
		src: snowboardGroup,
		className: "photo-e",
	},
	{
		title: "Barbell focus",
		src: barbellFocus,
		className: "photo-f",
	},
];

function getInitialProjectId() {
	if (typeof window === "undefined") {
		return projects[0].id;
	}

	const hashProjectId = window.location.hash.replace(/^#project-/, "");
	return projects.some((project) => project.id === hashProjectId) ? hashProjectId : projects[0].id;
}

function scrollToProject(projectId) {
	if (typeof window === "undefined") {
		return;
	}

	scrollToElement(`project-${projectId}`);
}

function scrollToElement(elementId) {
	if (typeof window === "undefined") {
		return;
	}

	const scroll = () => document.getElementById(elementId)?.scrollIntoView({ block: "start" });
	window.requestAnimationFrame(scroll);
	window.setTimeout(scroll, 120);
	window.setTimeout(scroll, 420);
	window.setTimeout(scroll, 900);
}

function App() {
	const [activeProjectId, setActiveProjectId] = useState(getInitialProjectId);
	const [activePhotoIndex, setActivePhotoIndex] = useState(0);
	const activeProject = useMemo(
		() => projects.find((project) => project.id === activeProjectId) ?? projects[0],
		[activeProjectId],
	);

	const selectProject = (projectId) => {
		setActiveProjectId(projectId);
		if (typeof window !== "undefined") {
			window.history.replaceState(null, "", `#project-${projectId}`);
			scrollToProject(projectId);
		}
	};

	useEffect(() => {
		const syncProjectFromHash = () => {
			const hash = window.location.hash;

			if (hash.startsWith("#project-")) {
				const hashProjectId = hash.replace(/^#project-/, "");
				if (!projects.some((project) => project.id === hashProjectId)) {
					return;
				}

				setActiveProjectId(hashProjectId);
				scrollToProject(hashProjectId);
				return;
			}

			if (hash.length > 1) {
				scrollToElement(hash.slice(1));
			}
		};

		syncProjectFromHash();
		window.addEventListener("hashchange", syncProjectFromHash);

		return () => window.removeEventListener("hashchange", syncProjectFromHash);
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		if (window.location.hash === `#project-${activeProjectId}`) {
			scrollToProject(activeProjectId);
		}
	}, [activeProjectId]);

	return (
		<main className="site-shell">
			<header className="site-header">
				<a className="wordmark" href="#top" aria-label="Carinne Tzurdecker home">
					CTZ
				</a>
				<nav className="nav-links" aria-label="Primary navigation">
					<a href="#work">Work</a>
					<a href="#projects">Projects</a>
					<a href="#camera-roll">Camera Roll</a>
					<a href="#contact">Contact</a>
				</nav>
			</header>

			<section className="hero-section" id="top">
				<div className="hero-lockup">
					<p className="hero-kicker">Mastering the art of</p>
					<h1>Modern Tech</h1>
					<div className="hero-bottom">
						<p className="section-code">Carinne Tzurdecker / Atlanta</p>
						<p className="lede">
							Software engineer building AI automation, workflow tools, and full-stack products with a
							product-minded, human-centered approach.
						</p>
						<div className="hero-actions" aria-label="Primary portfolio actions">
							<a href="#projects">View work</a>
							<a href="#camera-roll">Camera roll</a>
						</div>
					</div>
				</div>
			</section>

			<section className="impact-ledger" aria-label="Selected impact metrics">
				{stats.map((stat) => (
					<div className="ledger-item" key={stat.label}>
						<strong>{stat.value}</strong>
						<span>{stat.label}</span>
					</div>
				))}
			</section>

			<section className="work-section" id="work">
				<header className="section-heading">
					<span>01</span>
					<h2>Experience</h2>
				</header>
				<div className="work-intro">
					<p>
						I like building useful systems: clearer workflows, better handoffs, and products that help
						people understand what needs to happen next.
					</p>
				</div>
				<div className="timeline" aria-label="Professional experience">
					{experience.map((job) => (
						<article className="timeline-item" key={`${job.role}-${job.company}`}>
							<p className="timeline-meta">{job.time}</p>
							<div className="timeline-body">
								<h3>{job.role}</h3>
								<p className="company">{job.company}</p>
								<p>{job.copy}</p>
								<div className="mini-list">
									{job.highlights.map((highlight) => (
										<span key={highlight}>{highlight}</span>
									))}
								</div>
							</div>
						</article>
					))}
				</div>
			</section>

			<section className="tools-section" aria-label="Technical skills">
				<header className="section-heading compact">
					<span>Skills</span>
					<h2>Technical toolkit</h2>
				</header>
				<div className="tool-columns">
					{skillGroups.map((group, index) => (
						<article className={`tool-group tool-group-${index + 1}`} key={group.title}>
							<h3>{group.title}</h3>
							<div className="chips">
								{group.items.map((item) => (
									<span key={item}>{item}</span>
								))}
							</div>
						</article>
					))}
				</div>
			</section>

			<section className="projects-section" id="projects">
				<header className="section-heading project-heading">
					<span>02</span>
					<h2>Selected work</h2>
				</header>
				<div className="project-layout">
					<div className="project-list" aria-label="Project selector">
						{projects.map((project, index) => (
							<button
								className={project.id === activeProject.id ? "project-button active" : "project-button"}
								key={project.id}
								onClick={() => selectProject(project.id)}
								type="button"
							>
								<span>{String(index + 1).padStart(2, "0")}</span>
								<strong>{project.title}</strong>
								<small>{project.status}</small>
							</button>
						))}
					</div>

					<article className="project-detail" id={`project-${activeProject.id}`}>
						<header className="project-copy">
							<p className="project-date">{activeProject.date}</p>
							<h3>{activeProject.title}</h3>
							<p className="tagline">{activeProject.tagline}</p>
						</header>
						<div className="case-study-grid">
							<div>
								<span>Problem</span>
								<p>{activeProject.problem}</p>
							</div>
							<div>
								<span>Approach</span>
								<p>{activeProject.approach}</p>
							</div>
							<div>
								<span>Outcome</span>
								<p>{activeProject.outcome}</p>
							</div>
						</div>
						<div className="stack-row" aria-label="Project stack">
							{activeProject.stack.map((item) => (
								<span key={item}>{item}</span>
							))}
						</div>
						<div className="project-actions">
							<a href={activeProject.links.caseStudy}>Keep this record open</a>
							<button disabled type="button">
								Live link later
							</button>
							<button disabled type="button">
								Repo later
							</button>
						</div>
					</article>
				</div>
			</section>

			<section className="leadership-section">
				<header className="section-heading compact">
					<span>03</span>
					<h2>Community leadership</h2>
				</header>
				<div className="leadership-copy">
					<p>
						At Kennesaw State University Club Barbell, I helped run the less glamorous systems behind a
						visible team: officer coordination, budgeting, inventory, a club website, merchandise, campus
						presence, and a community that grew to 11K+ social followers.
					</p>
					<div className="leadership-collage" aria-label="Club Barbell photo collage">
						<figure className="club-photo club-photo-a">
							<img src={clubCollegiate} alt="KSU Club Barbell team at a collegiate meet" />
							<figcaption>Collegiate meet crew</figcaption>
						</figure>
						<figure className="club-photo club-photo-b">
							<img src={clubPowerlifting} alt="KSU Club Barbell team at a Powerlifting America event" />
							<figcaption>Club Barbell team</figcaption>
						</figure>
					</div>
				</div>
			</section>

			<section className="camera-section" id="camera-roll" aria-label="Personal photo collage">
				<div className="camera-heading">
					<p className="section-code">Outside the work</p>
					<h2>Camera roll, taped to the wall</h2>
					<p>
						A little proof that the person building agent workflows also lifts, wanders around in the
						snow, plays guitar in cars, and occasionally closes the laptop.
					</p>
				</div>
				<div className="photo-collage">
					{cameraRoll.map((photo, index) => (
						<figure
							className={`photo-card ${photo.className}${index === activePhotoIndex ? " active" : ""}`}
							key={photo.title}
							onFocus={() => setActivePhotoIndex(index)}
							onMouseEnter={() => setActivePhotoIndex(index)}
							tabIndex={0}
						>
							<img src={photo.src} alt={photo.title} />
							<figcaption>
								<span>{String(index + 1).padStart(2, "0")}</span>
								<strong>{photo.title}</strong>
							</figcaption>
						</figure>
					))}
				</div>
			</section>

			<section className="contact-section" id="contact">
				<div>
					<p className="section-code">Contact</p>
					<h2>Send the messy version first.</h2>
					<p>
						I am open to software engineering, applied AI, automation, and product-minded technical
						roles. Project pages can grow into deeper case studies as screenshots, metrics, and public
						links become shareable.
					</p>
				</div>
				<div className="contact-links">
					{contactLinks.map((link) => (
						<a href={link.href} key={link.label}>
							{link.label}
						</a>
					))}
				</div>
			</section>
		</main>
	);
}

export default App;
