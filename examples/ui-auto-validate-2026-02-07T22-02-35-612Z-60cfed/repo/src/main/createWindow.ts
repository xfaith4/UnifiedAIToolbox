// src/main/createWindow.ts
import { BrowserWindow, app, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDevServerUrl(): string | null {
  const url =
    process.env.VITE_DEV_SERVER_URL ?? process.env.ELECTRON_RENDERER_URL;
  return url && url.length > 0 ? url : null;
}

function resolveProdIndexHtml(): string {
  // Try a few common output locations depending on how the project packages:
  // 1) electron-vite style: <app>/dist/renderer/index.html
  // 2) some setups:         <app>/renderer/index.html
  // 3) provided earlier:    <app>/dist/renderer/index.html relative to this file
  const candidates = [
    // When compiled to something like dist/main/createWindow.js:
    path.join(__dirname, "..", "renderer", "index.html"),
    path.join(__dirname, "..", "..", "renderer", "index.html"),

    path.join(__dirname, "..", "dist", "renderer", "index.html"),
    path.join(__dirname, "..", "..", "dist", "renderer", "index.html"),

    // Fallback to a direct relative path if bundler keeps folder structure:
    path.join(process.cwd(), "dist", "renderer", "index.html"),
  ];

  // Pick the first that exists (sync check to avoid async at startup)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs: typeof import("node:fs") = require("node:fs");
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // Default to the most likely candidate to provide a useful path in errors.
  return path.join(__dirname, "..", "..", "dist", "renderer", "index.html");
}

export type CreateWindowOptions = {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  title?: string;
};

export async function createWindow(
  opts: CreateWindowOptions = {}
): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: opts.width ?? 1100,
    height: opts.height ?? 760,
    minWidth: opts.minWidth ?? 900,
    minHeight: opts.minHeight ?? 600,
    title: opts.title ?? "Golden Ratio (φ) Explorer",
    backgroundColor: "#0b0f14",
    webPreferences: {
      // Secure defaults for an offline educational app
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // preload: path.join(__dirname, "preload.js"),
    },
  });

  // Block in-app popups; open external links in the user's default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Prevent navigation away from our app. Allow only our dev server or file://
  win.webContents.on("will-navigate", (event, url) => {
    const devUrl = getDevServerUrl();
    const allowed =
      (devUrl && url.startsWith(devUrl)) || url.startsWith("file://");

    if (!allowed) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  const devUrl = getDevServerUrl();

  // Prefer dev server if present and not packaged.
  if (!app.isPackaged && devUrl) {
    await win.loadURL(devUrl);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    const indexHtml = resolveProdIndexHtml();
    await win.loadFile(indexHtml);
  }

  return win;
}