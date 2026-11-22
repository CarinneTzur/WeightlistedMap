import AppErrorBoundary from "./components/AppErrorBoundary";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import App from "../App.jsx";
import { AuthProvider } from "./auth/AuthContext";
import { isStaging } from "./lib/environment";

createRoot(document.getElementById("root")).render(
	<StrictMode>
		<AppErrorBoundary><AuthProvider>
			{isStaging && <div role="status" className="staging-badge" title="Test data only. Interview bookings disabled."><span>STAGING</span><span className="staging-badge-detail"> · test data only · interview bookings disabled</span></div>}
			<App />
		</AuthProvider></AppErrorBoundary>
	</StrictMode>,
);

