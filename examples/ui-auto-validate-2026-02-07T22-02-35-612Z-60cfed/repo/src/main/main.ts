// src/main/main.ts
import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PHI = (1 + Math.sqrt(5)) / 2;

type PhiCalcRequest = { A: number };
type PhiCalcResponse = {
  A: number;
  phi: number;
  A_times_phi: number;
  A_div_phi: number;
};

let mainWindow: BrowserWindow | null = null;

function isValidNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function getRendererUrl(): string | null {
  // Common patterns:
  // - Vite: process.env.VITE_DEV_SERVER_URL
  // - Custom: process.env.ELECTRON_RENDERER_URL
  const url = process.env.VITE_DEV_SERVER_URL ?? process.env.ELECTRON_RENDERER_URL;
  return url && url.length > 0 ? url : null;
}

function getIndexHtmlPath(): string {
  // Expected packaged location: dist/renderer/index.html (adjust if your build outputs elsewhere)
  return path.join(__dirname, "..", "..", "dist", "renderer", "index.html");
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: "Golden Ratio (φ) Explorer",
    backgroundColor: "#0b0f14",
    webPreferences: {
      // Secure defaults
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // If you later add a preload, set it here:
      // preload: path.join(__dirname, "preload.js"),
    },
  });

  // Basic navigation hardening: don't allow arbitrary new windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow http(s) to open in external browser, deny app popups.
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const devUrl = getRendererUrl();
    const allowed =
      (devUrl && url.startsWith(devUrl)) || url.startsWith("file://");
    if (!allowed) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  const devServerUrl = getRendererUrl();
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    await mainWindow.loadFile(getIndexHtmlPath());
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle("phi:calc", (_evt, payload: PhiCalcRequest): PhiCalcResponse => {
    const A = payload?.A;
    if (!isValidNumber(A)) {
      throw new Error("Invalid input: A must be a finite number.");
    }
    return {
      A,
      phi: PHI,
      A_times_phi: A * PHI,
      A_div_phi: A / PHI,
    };
  });

  ipcMain.handle("phi:references", () => {
    // Keep references in main to make renderer simpler; safe static data.
    return {
      phi: PHI,
      continuedFraction: "φ = 1 + 1/(1 + 1/(1 + 1/(…)))",
      identities: [
        "φ^2 = φ + 1",
        "1/φ = φ − 1",
        "F(n+1)/F(n) → φ as n → ∞ (Fibonacci ratio approximation)",
      ],
      decimals: "1.6180339887498948482045868343656381177203…",
    };
  });
}

async function main(): Promise<void> {
  registerIpc();

  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on("second-instance", async () => {
    if (!mainWindow) {
      await createMainWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  await app.whenReady();
  await createMainWindow();

  app.on("activate", async () => {
    // macOS: recreate when clicking dock icon and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });

  app.on("window-all-closed", () => {
    // Quit on all platforms except macOS
    if (process.platform !== "darwin") app.quit();
  });
}

void main();