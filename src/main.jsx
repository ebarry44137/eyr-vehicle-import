import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import ImporterPortalPage from "./modules/importer-portal/ImporterPortalPage.jsx";
// EYR-USA-V39.9.19.1
import UsaYardPage from "./modules/usa-yard/UsaYardPage.jsx";

const isClientPortal = window.location.pathname.startsWith("/portal");
const isUsaYard = window.location.pathname === "/usa" || window.location.pathname.startsWith("/usa/");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isUsaYard ? <UsaYardPage standalone /> : isClientPortal ? <ImporterPortalPage /> : <App />}
  </StrictMode>,
);
