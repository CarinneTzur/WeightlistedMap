import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	define: { __STAGING_BUILD__: JSON.stringify(process.env.VERCEL_ENV === "preview" || process.env.VERCEL_GIT_COMMIT_REF === "codex/staging" || process.env.APP_ENV === "staging") },
	plugins: [react()],
	server: {
		host: "0.0.0.0",
		port: 5173,
		strictPort: true,
	},
});

