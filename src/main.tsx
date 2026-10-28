import "./lib/installToastTrace";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerShareTarget } from "./features/claims/shareInbox/registerShareTarget";

createRoot(document.getElementById("root")!).render(<App />);
registerShareTarget();
