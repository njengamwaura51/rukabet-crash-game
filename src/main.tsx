import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

Sentry.init({
  dsn: "https://e47e74734f7f90e718a5637f457da8c4@o4512272097083392.ingest.us.sentry.io/4512272155738112",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration()
  ],
  // Tracing
  tracesSampleRate: 1.0, // Capture 100% of the transactions
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: [
    "localhost",
    /^\/api/,
    /^https:\/\/rukabet\.live\/api/,
    /^https:\/\/rukabet-app\.onrender\.com\/api/
  ],
  // Session Replay
  replaysSessionSampleRate: 0.1, // Sample 10% in normal sessions
  replaysOnErrorSampleRate: 1.0 // 100% sample rate on error
});

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
