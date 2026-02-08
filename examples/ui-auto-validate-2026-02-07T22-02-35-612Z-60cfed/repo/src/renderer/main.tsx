// src/renderer/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";

// If you add global styles later, uncomment and create the file.
// import "./styles.css";

type PropsWithChildren = { children?: React.ReactNode };

class RootErrorBoundary extends React.Component<PropsWithChildren, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep logging minimal but useful for offline desktop debugging.
    // In a PySide6 wrapper, these logs are visible in devtools / console.
    // eslint-disable-next-line no-console
    console.error("Renderer crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
          <h1 style={{ margin: "0 0 8px" }}>Golden Ratio (φ) Explorer</h1>
          <p style={{ margin: "0 0 12px" }}>
            The renderer encountered an error and could not continue.
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              padding: 12,
              border: "1px solid #ddd",
              borderRadius: 8,
              background: "#fafafa",
              overflow: "auto",
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function ensureRootElement(): HTMLElement {
  const el = document.getElementById("root");
  if (el) return el;

  // Fallback: create a root node so the app still mounts even if index.html is edited.
  const created = document.createElement("div");
  created.id = "root";
  document.body.appendChild(created);
  return created;
}

// Lazy import so main.tsx can stay stable even as App.tsx evolves.
async function bootstrap() {
  const rootEl = ensureRootElement();
  const root = ReactDOM.createRoot(rootEl);

  const { App } = await import("./App");

  root.render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>
  );
}

// Expose a tiny hook for desktop wrappers / debugging (no-op in production).
declare global {
  interface Window {
    __GRE__?: {
      version: string;
      reload: () => void;
    };
  }
}

if (import.meta.env.DEV) {
  window.__GRE__ = {
    version: "0.1.0",
    reload: () => window.location.reload(),
  };
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to bootstrap renderer:", err);
});