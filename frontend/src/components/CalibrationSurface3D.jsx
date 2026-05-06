import React, { useEffect, useState } from "react";
import Plot from "../lib/Plot";
import { api, formatApiErrorDetail } from "../lib/api";
import { HERKO_LAYOUT, HERKO_CONFIG } from "../lib/herkoChartTheme";

const SURFACE_DIMENSION = 16;

function sampleToSize(arr, size, fallbackStart = 0, fallbackEnd = 1) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return Array.from({ length: size }, (_, i) => {
      const ratio = size === 1 ? 0 : i / (size - 1);
      return Number((fallbackStart + ratio * (fallbackEnd - fallbackStart)).toFixed(3));
    });
  }
  return Array.from({ length: size }, (_, i) => {
    const sourceIndex = Math.round((i / (size - 1)) * (arr.length - 1));
    return arr[sourceIndex];
  });
}

function sampleMatrixTo16x16(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0 || !Array.isArray(matrix[0])) {
    return Array.from({ length: SURFACE_DIMENSION }, () => Array.from({ length: SURFACE_DIMENSION }, () => 0));
  }

  return Array.from({ length: SURFACE_DIMENSION }, (_, row) => {
    const srcRowIndex = Math.round((row / (SURFACE_DIMENSION - 1)) * (matrix.length - 1));
    const srcRow = Array.isArray(matrix[srcRowIndex]) ? matrix[srcRowIndex] : [];

    return Array.from({ length: SURFACE_DIMENSION }, (_, col) => {
      if (srcRow.length === 0) return 0;
      const srcColIndex = Math.round((col / (SURFACE_DIMENSION - 1)) * (srcRow.length - 1));
      const value = Number(srcRow[srcColIndex]);
      return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
    });
  });
}

function normalizeSurfaceData(surfaceData) {
  const x = sampleToSize(surfaceData?.x, SURFACE_DIMENSION, 800, 5000);
  const y = sampleToSize(surfaceData?.y, SURFACE_DIMENSION, 10, 90);
  const z = sampleMatrixTo16x16(surfaceData?.z);

  return {
    ...surfaceData,
    x,
    y,
    z,
    layers: 16,
  };
}

function Skeleton() {
  return (
    <div
      className="w-full h-72 bg-slate-200 border border-slate-300 rounded-sm"
      style={{ animation: "herkoPulse 1.5s ease-in-out infinite" }}
      aria-label="Loading 3D surface"
    >
      <div className="h-full flex items-center justify-center text-slate-500 text-sm">Loading 3D surface...</div>
    </div>
  );
}

function buildMockSurfaceData() {
  const x = Array.from({ length: SURFACE_DIMENSION }, (_, i) => Math.round(800 + i * ((5000 - 800) / (SURFACE_DIMENSION - 1))));
  const y = Array.from({ length: SURFACE_DIMENSION }, (_, i) => Math.round(10 + i * ((90 - 10) / (SURFACE_DIMENSION - 1))));

  const z = y.map((load) => {
    const loadFactor = load / 100;
    return x.map((rpm) => {
      const rpmFactor = (rpm - 800) / (5000 - 800);
      const base = 8 + rpmFactor * 14 + (1 - loadFactor) * 10;
      const ripple = Math.sin(rpm / 900 + load / 35) * 0.8;
      const value = Math.max(8, Math.min(32, base + ripple));
      return Number(value.toFixed(2));
    });
  });

  return {
    x,
    y,
    z,
    unit: "deg",
    x_label: "RPM",
    y_label: "Load %",
    layers: 16,
    map_name: "SparkAdvance_Map_Mock",
  };
}

/**
 * Chart B — 3D Calibration Map Surface
 * Renders a 3D surface from a 2D calibration matrix.
 * Data source: GET /api/v1/datasets/{id}/maps + /api/v1/datasets/{id}/maps/{name}
 */
export default function CalibrationSurface3D({ datasetId, useMock = false }) {
  const [maps, setMaps] = useState([]);
  const [selectedMap, setSelectedMap] = useState("");
  const [surfaceData, setSurfaceData] = useState(null);
  const [loadingMaps, setLoadingMaps] = useState(true);
  const [loadingSurface, setLoadingSurface] = useState(false);
  const [error, setError] = useState(null);

  // Load available maps
  useEffect(() => {
    if (useMock) {
      setMaps(["SparkAdvance_Map_Mock"]);
      setSelectedMap("SparkAdvance_Map_Mock");
      setSurfaceData(buildMockSurfaceData());
      setLoadingMaps(false);
      setLoadingSurface(false);
      setError(null);
      return;
    }

    if (!datasetId) return;
    setLoadingMaps(true);
    api
      .get(`/v1/datasets/${datasetId}/maps`)
      .then(({ data }) => {
        setMaps(data || []);
        if (data && data.length > 0) setSelectedMap(data[0].name || data[0]);
      })
      .catch((e) => setError(formatApiErrorDetail(e.response?.data?.detail || e.message)))
      .finally(() => setLoadingMaps(false));
  }, [datasetId, useMock]);

  // Load surface data when map selection changes
  useEffect(() => {
    if (useMock) return;
    if (!selectedMap || !datasetId) return;
    setLoadingSurface(true);
    api
      .get(`/v1/datasets/${datasetId}/maps/${encodeURIComponent(selectedMap)}`)
      .then(({ data }) => setSurfaceData(normalizeSurfaceData(data)))
      .catch((e) => setError(formatApiErrorDetail(e.response?.data?.detail || e.message)))
      .finally(() => setLoadingSurface(false));
  }, [selectedMap, datasetId, useMock]);

  if (loadingMaps) return <Skeleton />;

  if (error)
    return (
      <div className="w-full h-40 flex items-center justify-center text-red-600 text-sm">
        {error}
      </div>
    );

  if (maps.length === 0)
    return (
      <div className="w-full h-40 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
        <svg className="w-8 h-8 text-[#6b7a5e] opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 4" />
        </svg>
        No calibration maps available for this dataset.
      </div>
    );

  return (
    <div className="space-y-3">
      {/* Map selector */}
      <div className="flex items-center gap-3">
        <span className="tiny-label shrink-0">Select map</span>
        <select
          value={selectedMap}
          onChange={(e) => setSelectedMap(e.target.value)}
          className="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#4a5240]"
        >
          {maps.map((m) => {
            const name = typeof m === "string" ? m : m.name;
            return <option key={name} value={name}>{name}</option>;
          })}
        </select>
      </div>

      {loadingSurface ? (
        <Skeleton />
      ) : surfaceData ? (
        <Plot
          data={[
            {
              type: "surface",
              z: surfaceData.z,
              x: surfaceData.x,
              y: surfaceData.y,
              colorscale: "Viridis",
              opacity: 0.85,
              colorbar: { title: surfaceData.unit || "Value", tickfont: { size: 10 } },
              hovertemplate: "X: %{x}<br>Y: %{y}<br>Z: %{z:.4f}<extra></extra>",
            },
          ]}
          layout={{
            ...HERKO_LAYOUT,
            title: { text: useMock ? "Calibration Map (16x16x16)" : "Calibration Map", ...HERKO_LAYOUT.title },
            scene: {
              xaxis: { title: surfaceData.x_label || "X", gridcolor: "#C8C8C8" },
              yaxis: { title: surfaceData.y_label || "Y", gridcolor: "#C8C8C8" },
              zaxis: { title: surfaceData.unit || "Z", gridcolor: "#C8C8C8" },
              camera: { eye: { x: 1.6, y: 1.6, z: 1.0 } },
              bgcolor: "#F3F3F3",
            },
            height: 380,
            margin: { t: 36, r: 0, b: 0, l: 0 },
          }}
          config={HERKO_CONFIG}
          useResizeHandler
          style={{ width: "100%" }}
        />
      ) : null}
    </div>
  );
}
