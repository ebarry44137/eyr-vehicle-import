import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import ImporterPortalPage from "./modules/importer-portal/ImporterPortalPage.jsx";

const isClientPortal = window.location.pathname.startsWith("/portal");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isClientPortal ? <ImporterPortalPage /> : <App />}
  </StrictMode>,
);
