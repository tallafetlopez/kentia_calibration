import axios from "axios";
import { toast } from "sonner";

// En producción/desktop no hay REACT_APP_BACKEND_URL → cadena vacía → rutas relativas (/api/...)
// En desarrollo puede apuntar a http://localhost:8000 si se define en .env
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
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

