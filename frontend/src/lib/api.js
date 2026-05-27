import axios from "axios";
import { toast } from "sonner";
import { save } from "@tauri-apps/plugin-dialog";

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

// Encode blob to base64 once, reuse for both code paths
async function blobToBase64(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Shows native Tauri save dialog; falls back to ~/Downloads if not in Tauri.
// Blob URL fallback is last resort (works in browser dev, blocked in WebView2).
export async function triggerDownload(blob, filename) {
  const content_b64 = await blobToBase64(blob);

  // Try native save dialog (Tauri only)
  try {
    const outputPath = await save({ defaultPath: filename, title: "Guardar archivo" });
    if (outputPath) {
      await api.post("/v1/export/write-file", { filename, content_b64, output_path: outputPath });
      const name = outputPath.replace(/.*[\\/]/, "");
      toast.success(`Guardado: ${name}`);
      return;
    }
    // User cancelled dialog — stop here, don't fall through
    return;
  } catch (_) {
    // Not in Tauri or dialog unavailable — fall through to Downloads
  }

  // Fallback: write to ~/Downloads (no dialog)
  try {
    await api.post("/v1/export/write-file", { filename, content_b64 });
    toast.success(`Guardado en Descargas: ${filename}`);
    return;
  } catch (e) {
    console.warn("Backend export failed, trying blob URL:", e.message);
  }

  // Last resort: blob URL (works in browser dev mode, not in WebView2)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

