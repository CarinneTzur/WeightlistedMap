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
			{isStaging && <div role="status" style={{position:"fixed",bottom:8,left:8,zIndex:99999,background:"#204a69",color:"white",padding:"6px 12px",borderRadius:8,fontSize:12}}>STAGING · test data only · interview bookings disabled</div>}
			<App />
		</AuthProvider></AppErrorBoundary>
	</StrictMode>,
);

