// src/main/preload.ts
import { contextBridge, ipcRenderer } from "electron";

type AppAPI = {
  /** Returns the app version string (e.g. "1.0.0"). */
  getVersion: () => Promise<string>;
  /** Returns the current platform (e.g. "darwin", "win32", "linux"). */
  getPlatform: () => Promise<NodeJS.Platform>;
};

const api: AppAPI = {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  getPlatform: () => ipcRenderer.invoke("app:getPlatform"),
};

// Expose a single, minimal namespace. Do not expose ipcRenderer directly.
contextBridge.exposeInMainWorld("phiExplorer", api);

/**
 * Optional: TypeScript support for renderer usage:
 *   window.phiExplorer.getVersion().then(...)
 */
declare global {
  interface Window {
    phiExplorer: AppAPI;
  }
}