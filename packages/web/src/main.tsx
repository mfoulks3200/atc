import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ padding: "2rem", color: "var(--text-primary)" }}>
      <h1>ATC Dashboard</h1>
      <p style={{ color: "var(--text-muted)" }}>Theme loaded successfully.</p>
    </div>
  </StrictMode>,
);
