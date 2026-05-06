import { api } from "./api";

/**
 * DEV BYPASS SETUP
 * Configura interceptores mock para axios cuando dev bypass está activo.
 * Esto permite que las llamadas API devuelvan datos vacíos en lugar de fallar.
 */

const MOCK_RESPONSES = {
  "/api/v1/sw-releases": { data: [] },
  "/api/v1/datasets": { data: [] },
  "/api/v1/vehicle-sw-ids": { data: [] },
  "/api/v1/traceability": {
    data: {
      sw_releases: [],
      datasets: [],
      vehicle_sw_ids: [],
    },
  },
  "/api/v1/traceability/audit-logs": { data: [] },
  "/api/v1/ecus": { data: [] },
};

export function setupDevBypassInterceptors() {
  const isDev =
    typeof window !== "undefined" &&
    (localStorage.getItem("dev_bypass") === "true" ||
      window.location.search.includes("?dev=true"));

  if (!isDev) return;

  console.warn(
    "🔴 DEV BYPASS INTERCEPTORS ACTIVE - API calls will return mock data"
  );

  // Response interceptor para devolver datos mock
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      // Si es dev bypass, devolver datos mock en lugar de error
      const url = error.config?.url || "";
      const method = error.config?.method?.toUpperCase() || "GET";

      // Solo interceptar GET requests
      if (method === "GET" && MOCK_RESPONSES[url]) {
        console.warn(
          `📦 DEV BYPASS: Returning mock data for ${method} ${url}`
        );
        return Promise.resolve({
          status: 200,
          data: MOCK_RESPONSES[url].data,
        });
      }

      // Para otros errores en dev, devolver error pero loguear
      console.error(
        `❌ DEV BYPASS: ${method} ${url} - Status ${error.response?.status}:`,
        error.response?.data?.detail || error.message
      );
      return Promise.reject(error);
    }
  );
}
