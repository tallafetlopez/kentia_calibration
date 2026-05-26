import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("herko_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Error interceptor with logging
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || "unknown";
    const method = error.config?.method?.toUpperCase() || "unknown";
    const status = error.response?.status || "network error";

    console.error(
      `❌ API Error [${method} ${url}]: Status ${status}`,
      error.response?.data || error.message
    );

    return Promise.reject(error);
  }
);

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export async function apiCall(fn) {
  try {
    return await fn();
  } catch (e) {
    toast.error(formatApiErrorDetail(e.response?.data?.detail));
  }
}

// Tauri-compatible file save: uses native save dialog when running in Tauri,
// falls back to blob URL download in browser dev mode.
export async function triggerDownload(blob, filename) {
  if (window.__TAURI_INTERNALS__) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const ext = filename.split(".").pop();
      const filters = ext === "csv"
        ? [{ name: "CSV", extensions: ["csv"] }]
        : ext === "dcm"
        ? [{ name: "DCM", extensions: ["dcm"] }]
        : [{ name: "All files", extensions: ["*"] }];
      const path = await save({ defaultPath: filename, filters });
      if (!path) return; // user cancelled
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await writeFile(path, bytes);
      return;
    } catch (e) {
      console.error("Tauri save failed, falling back:", e);
    }
  }
  // Browser fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

