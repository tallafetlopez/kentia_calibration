import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";

// ─── Colour helpers ───────────────────────────────────────────────────────────
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

const MAP_STOPS = [
  { t: 0.0,  c: [20,  68,  84]  },
  { t: 0.25, c: [35,  134, 136] },
  { t: 0.5,  c: [120, 198, 121] },
  { t: 0.75, c: [249, 200, 78]  },
  { t: 1.0,  c: [238, 105, 85]  },
];

function mapColor(t) {
  let i = 0;
  while (i < MAP_STOPS.length - 1 && t > MAP_STOPS[i + 1].t) i++;
  const a = MAP_STOPS[i];
  const b = MAP_STOPS[Math.min(MAP_STOPS.length - 1, i + 1)];
  const u = (t - a.t) / ((b.t - a.t) || 1);
  return `rgb(${lerp(a.c[0],b.c[0],u)},${lerp(a.c[1],b.c[1],u)},${lerp(a.c[2],b.c[2],u)})`;
}

function fmt(v, dec = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 100)  return n.toFixed(1);
  return n.toFixed(dec);
}

// ─── Curve chart ──────────────────────────────────────────────────────────────
function CurveChart({ param }) {
  if (!param) return null;

  const xRaw = Array.isArray(param.x_axis) ? param.x_axis : [];
  const yRaw = Array.isArray(param.values)  ? param.values  : [];
  const n    = Math.min(xRaw.length || yRaw.length, yRaw.length || xRaw.length);
  const xVals = (n > 0 ? xRaw.slice(0, n) : yRaw.map((_, i) => i)).map((v, i) => { const x = Number(v); return Number.isFinite(x) ? x : i; });
  const yVals = (n > 0 ? yRaw.slice(0, n) : []).map((v) => { const y = Number(v); return Number.isFinite(y) ? y : 0; });

  const hasData = yVals.length > 1;
  const W = 580; const H = 300;
  const pL = 58; const pR = 18; const pT = 14; const pB = 44;
  const plotW = W - pL - pR;
  const plotH = H - pT - pB;

  const minY = hasData ? Math.min(...yVals) : 0;
  const maxY = hasData ? Math.max(...yVals) : 1;
  const rangeY = maxY - minY || 1;

  const points = hasData
    ? yVals.map((v, i) => {
        const x = pL + (i / (yVals.length - 1 || 1)) * plotW;
        const y = pT + plotH - ((v - minY) / rangeY) * plotH;
        return `${x},${y}`;
      }).join(" ")
    : "";

  const xTicks = hasData
    ? Array.from({ length: Math.min(7, yVals.length) }, (_, i) =>
        Math.round((i * (yVals.length - 1)) / Math.max(1, Math.min(7, yVals.length) - 1)))
    : [];

  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map((t) => ({
    t,
    val: minY + t * rangeY,
    y: pT + (1 - t) * plotH,
  }));

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-mono font-semibold text-gray-800">{param.name}</p>
          <p className="text-[11px] text-gray-500">{param.long_name}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">X: {param.unit_x || "–"}  →  Y: {param.unit_w || "–"}</p>
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center h-48 bg-gray-50 border border-gray-200 rounded text-xs text-gray-400">
          No plottable data
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full border border-gray-200 rounded bg-white" style={{ height: 260 }}>
          {yTicks.map(({ y, val }, ti) => (
            <g key={`yg-${ti}`}>
              <line x1={pL} y1={y} x2={pL + plotW} y2={y} stroke="#f0f0f0" strokeWidth="1" />
              <text x={pL - 6} y={y + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">{fmt(val)}</text>
            </g>
          ))}
          {xTicks.map((idx) => {
            const cx = pL + (idx / (yVals.length - 1 || 1)) * plotW;
            return (
              <g key={`xg-${idx}`}>
                <line x1={cx} y1={pT} x2={cx} y2={pT + plotH} stroke="#f5f5f5" strokeWidth="1" />
                <text x={cx} y={H - 14} textAnchor="middle" fontSize="9" fill="#9ca3af">{fmt(xVals[idx])}</text>
              </g>
            );
          })}
          <rect x={pL} y={pT} width={plotW} height={plotH} fill="none" stroke="#d1d5db" />
          <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          {xTicks.map((idx) => {
            const cx = pL + (idx / (yVals.length - 1 || 1)) * plotW;
            const cy = pT + plotH - ((yVals[idx] - minY) / rangeY) * plotH;
            return <circle key={`pt-${idx}`} cx={cx} cy={cy} r="2.5" fill="#2563eb" stroke="#fff" strokeWidth="1" />;
          })}
          <text x={pL + plotW / 2} y={H - 2} textAnchor="middle" fontSize="10" fill="#6b7280">{param.unit_x || "X"}</text>
          <text x={12} y={pT + plotH / 2} textAnchor="middle" fontSize="10" fill="#6b7280" transform={`rotate(-90 12 ${pT + plotH / 2})`}>{param.unit_w || "Y"}</text>
        </svg>
      )}
    </div>
  );
}

// ─── Map chart ────────────────────────────────────────────────────────────────
function MapChart({ param }) {
  const [mode, setMode] = useState("heatmap");
  const [flatAssist, setFlatAssist] = useState(true);
  if (!param) return null;

  const rawRows = Array.isArray(param.values) ? param.values : [];
  const zRows = rawRows
    .filter((r) => Array.isArray(r) && r.length > 0)
    .map((r) => r.map((v) => { const n = Number(v); return Number.isFinite(n) ? n : null; }));

  const rowCount = zRows.length;
  const colCount = zRows.reduce((m, r) => Math.max(m, r.length), 0);
  const hasData  = rowCount > 0 && colCount > 0;

  const z = zRows.map((r) =>
    r.length === colCount ? r : Array.from({ length: colCount }, (_, i) => i < r.length ? r[i] : null)
  );

  const xSource = Array.isArray(param.x_axis) ? param.x_axis : [];
  const ySource = Array.isArray(param.y_axis) ? param.y_axis : [];
  const x = xSource.length === colCount ? xSource.map((v, i) => { const n = Number(v); return Number.isFinite(n) ? n : i; }) : Array.from({ length: colCount }, (_, i) => i);
  const y = ySource.length === rowCount  ? ySource.map((v, i) => { const n = Number(v); return Number.isFinite(n) ? n : i; }) : Array.from({ length: rowCount  }, (_, i) => i);

  const finiteVals = z.flat().filter((v) => Number.isFinite(v));
  const zMinRaw = finiteVals.length ? Math.min(...finiteVals) : 0;
  const zMaxRaw = finiteVals.length ? Math.max(...finiteVals) : 1;
  const zIsFlat = zMinRaw === zMaxRaw;

  const assistAmp = Math.max(Math.abs(zMinRaw || 1) * 0.01, 0.08);
  const zForPlot  = zIsFlat && flatAssist
    ? z.map((row, ri) => row.map((v, ci) => {
        if (!Number.isFinite(v)) return null;
        const ry = rowCount > 1 ? ri / (rowCount - 1) : 0.5;
        const rx = colCount > 1 ? ci / (colCount - 1) : 0.5;
        return v + (Math.sin(rx * Math.PI) * Math.cos(ry * Math.PI) - ((rx - 0.5) ** 2 + (ry - 0.5) ** 2) * 0.2) * assistAmp;
      }))
    : z;

  const dVals = zForPlot.flat().filter((v) => Number.isFinite(v));
  const zMin = dVals.length ? Math.min(...dVals) : 0;
  const zMax = dVals.length ? Math.max(...dVals) : 1;
  const tNorm = (v) => Math.max(0, Math.min(1, (Number(v) - zMin) / ((zMax - zMin) || 1)));
  const colorAt = (v) => mapColor(tNorm(v));

  const W = 580; const H = 340;
  const pL = 62; const pR = 72; const pT = 14; const pB = 48;
  const plotW = W - pL - pR;
  const plotH = H - pT - pB;

  const xTickIdx = Array.from({ length: Math.min(6, colCount) }, (_, i) => Math.round((i * (colCount - 1)) / Math.max(1, Math.min(6, colCount) - 1)));
  const yTickIdx = Array.from({ length: Math.min(6, rowCount) }, (_, i) => Math.round((i * (rowCount - 1)) / Math.max(1, Math.min(6, rowCount) - 1)));

  const renderLegend = () => (
    <g>
      <defs>
        <linearGradient id="lgMap" x1="0" y1="1" x2="0" y2="0">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <stop key={t} offset={`${t * 100}%`} stopColor={colorAt(zMin + t * (zMax - zMin))} />
          ))}
        </linearGradient>
      </defs>
      <rect x={W - 58} y={pT} width={12} height={plotH} rx={2} fill="url(#lgMap)" stroke="#d1d5db" />
      {[0, 0.5, 1].map((t) => (
        <text key={t} x={W - 42} y={pT + (1 - t) * plotH + 3.5} fontSize="9" fill="#6b7280">{fmt(zMin + t * (zMax - zMin))}</text>
      ))}
      <text x={W - 50} y={pT - 4} textAnchor="middle" fontSize="9" fill="#6b7280">{param.unit_w || "Z"}</text>
    </g>
  );

  const renderHeatmap = () => {
    const cw = plotW / Math.max(1, colCount);
    const ch = plotH / Math.max(1, rowCount);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full border border-gray-200 rounded bg-white" style={{ height: 290 }}>
        <rect x={pL} y={pT} width={plotW} height={plotH} fill="#f9fafb" stroke="#d1d5db" />
        {zForPlot.map((row, ri) => row.map((v, ci) =>
          Number.isFinite(v) ? (
            <rect key={`c-${ri}-${ci}`} x={pL + ci * cw + 0.5} y={pT + ri * ch + 0.5}
              width={Math.max(1, cw - 1)} height={Math.max(1, ch - 1)}
              fill={colorAt(v)} rx={Math.min(2, cw * 0.1)} />
          ) : null
        ))}
        {Array.from({ length: colCount + 1 }, (_, i) => (
          <line key={`vx-${i}`} x1={pL + i * (plotW / colCount)} y1={pT} x2={pL + i * (plotW / colCount)} y2={pT + plotH} stroke="#fff" opacity="0.3" />
        ))}
        {Array.from({ length: rowCount + 1 }, (_, i) => (
          <line key={`hy-${i}`} x1={pL} y1={pT + i * (plotH / rowCount)} x2={pL + plotW} y2={pT + i * (plotH / rowCount)} stroke="#fff" opacity="0.3" />
        ))}
        {xTickIdx.map((idx) => {
          const xx = pL + (idx + 0.5) * (plotW / colCount);
          return <text key={`xt-${idx}`} x={xx} y={H - 18} textAnchor="middle" fontSize="9" fill="#9ca3af">{fmt(x[idx])}</text>;
        })}
        {yTickIdx.map((idx) => {
          const yy = pT + (idx + 0.5) * (plotH / rowCount);
          return <text key={`yt-${idx}`} x={pL - 6} y={yy + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">{fmt(y[idx])}</text>;
        })}
        <text x={pL + plotW / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="#6b7280">{param.unit_x || "X"}</text>
        <text x={14} y={pT + plotH / 2} textAnchor="middle" fontSize="10" fill="#6b7280" transform={`rotate(-90 14 ${pT + plotH / 2})`}>{param.unit_y || "Y"}</text>
        {renderLegend()}
      </svg>
    );
  };

  const renderSurface = () => {
    const sx = plotW / Math.max(1, colCount + rowCount);
    const sy = plotH / Math.max(1, colCount + rowCount);
    const zScale = Math.max(14, plotH * 0.22);

    const projectBase = (ri, ci, v) => {
      const nz = tNorm(v);
      return [(ci - ri) * sx, -(ci + ri) * sy - nz * zScale, nz];
    };

    let minPx = Infinity, maxPx = -Infinity, minPy = Infinity, maxPy = -Infinity;
    for (let ri = 0; ri < rowCount; ri++) {
      for (let ci = 0; ci < colCount; ci++) {
        const v = zForPlot[ri]?.[ci];
        if (!Number.isFinite(v)) continue;
        const [px, py] = projectBase(ri, ci, v);
        if (px < minPx) minPx = px; if (px > maxPx) maxPx = px;
        if (py < minPy) minPy = py; if (py > maxPy) maxPy = py;
      }
    }
    if (!Number.isFinite(minPx)) { minPx = 0; maxPx = 1; minPy = -1; maxPy = 0; }

    const dx = (pL + plotW / 2) - (minPx + maxPx) / 2;
    const dy = (pT + plotH / 2) - (minPy + maxPy) / 2;
    const project = (ri, ci, v) => { const [px, py, nz] = projectBase(ri, ci, v); return [px + dx, py + dy, nz]; };

    const bands = [];
    for (let ri = 0; ri < rowCount - 1; ri++) {
      const top = [], bottom = [], vals = [];
      for (let ci = 0; ci < colCount; ci++) {
        const vT = zForPlot[ri]?.[ci], vB = zForPlot[ri + 1]?.[ci];
        if (!Number.isFinite(vT) || !Number.isFinite(vB)) continue;
        top.push(`${project(ri, ci, vT)[0]},${project(ri, ci, vT)[1]}`);
        bottom.push(`${project(ri + 1, ci, vB)[0]},${project(ri + 1, ci, vB)[1]}`);
        vals.push(vT, vB);
      }
      if (top.length >= 2) {
        bands.push({ key: `b-${ri}`, points: `${top.join(" ")} ${bottom.reverse().join(" ")}`, color: colorAt(vals.reduce((a, b) => a + b, 0) / vals.length) });
      }
    }

    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full border border-gray-200 rounded bg-white" style={{ height: 290 }}>
        <rect x={pL} y={pT} width={plotW} height={plotH} fill="#f8fafc" stroke="#d1d5db" />
        {bands.map((b) => <polygon key={b.key} points={b.points} fill={b.color} fillOpacity="0.78" stroke="none" />)}
        {Array.from({ length: rowCount }, (_, ri) => {
          const pts = Array.from({ length: colCount }, (_, ci) => { const v = zForPlot[ri]?.[ci]; const p = project(ri, ci, Number.isFinite(v) ? v : zMin); return `${p[0]},${p[1]}`; }).join(" ");
          return <polyline key={`r-${ri}`} points={pts} fill="none" stroke="#0f172a" strokeOpacity="0.4" strokeWidth="1" />;
        })}
        {Array.from({ length: colCount }, (_, ci) => {
          const pts = Array.from({ length: rowCount }, (_, ri) => { const v = zForPlot[ri]?.[ci]; const p = project(ri, ci, Number.isFinite(v) ? v : zMin); return `${p[0]},${p[1]}`; }).join(" ");
          return <polyline key={`c-${ci}`} points={pts} fill="none" stroke="#0f172a" strokeOpacity="0.28" strokeWidth="0.8" />;
        })}
        <text x={pL + plotW / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="#6b7280">{param.unit_x || "X"}</text>
        <text x={14} y={pT + plotH / 2} textAnchor="middle" fontSize="10" fill="#6b7280" transform={`rotate(-90 14 ${pT + plotH / 2})`}>{param.unit_y || "Y"}</text>
        {renderLegend()}
      </svg>
    );
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-mono font-semibold text-gray-800 truncate">{param.name}</p>
          <p className="text-[11px] text-gray-500 truncate">{param.long_name}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">X: {param.unit_x || "–"} · Y: {param.unit_y || "–"} · Z: {param.unit_w || "–"} · {rowCount}×{colCount}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex rounded border border-gray-300 overflow-hidden text-[10px]">
            {["heatmap", "surface"].map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-2.5 py-0.5 ${mode === m ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                {m === "heatmap" ? "Heatmap" : "3D"}
              </button>
            ))}
          </div>
          {zIsFlat && (
            <button onClick={() => setFlatAssist((v) => !v)}
              className={`text-[10px] px-2 py-0.5 rounded border ${flatAssist ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-white border-gray-300 text-gray-600"}`}>
              Assist {flatAssist ? "ON" : "OFF"}
            </button>
          )}
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center h-48 bg-gray-50 border border-gray-200 rounded text-xs text-gray-400">
          No plottable data
        </div>
      ) : (
        <>
          {zIsFlat && (
            <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Flat map: all Z = {zMinRaw}. Assist adds synthetic contrast for perception.
            </p>
          )}
          {mode === "heatmap" ? renderHeatmap() : renderSurface()}
        </>
      )}
    </div>
  );
}

// ─── Right chart panel ────────────────────────────────────────────────────────
function ChartPanel({ param, loading, onClose }) {
  if (!param && !loading) return null;

  return (
    <div className="flex flex-col border-l border-gray-200 bg-white overflow-y-auto" style={{ width: 600, minWidth: 600 }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          {param ? (param._type === "curve" ? "Curve Chart" : "Map Chart") : "Loading…"}
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1">×</button>
      </div>

      {loading && (
        <div className="flex items-center justify-center flex-1 text-xs text-gray-400 py-16">
          Loading parameter data…
        </div>
      )}

      {!loading && param && (
        param._type === "curve"
          ? <CurveChart param={param} />
          : <MapChart param={param} />
      )}
    </div>
  );
}

// ─── Type badge ───────────────────────────────────────────────────────────────
const TYPE_BADGE = {
  scalar: <span className="text-[9px] font-bold px-1 py-px rounded bg-gray-100 text-gray-500 tracking-wide">SCALAR</span>,
  curve:  <span className="text-[9px] font-bold px-1 py-px rounded bg-blue-50   text-blue-600 tracking-wide">CURVE</span>,
  map:    <span className="text-[9px] font-bold px-1 py-px rounded bg-violet-50 text-violet-600 tracking-wide">MAP</span>,
};

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SwReleaseDCMViewer() {
  const { id }     = useParams();
  const navigate   = useNavigate();

  const [summary,      setSummary]      = useState(null);
  const [params,       setParams]       = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [search,       setSearch]       = useState("");
  const [page,         setPage]         = useState(0);
  const [selectedParam,setSelectedParam]= useState(null);
  const [chartLoading, setChartLoading] = useState(false);

  const PAGE_SIZE = 80;
  const API_LIMIT = 1000;

  const fetchAllByType = useCallback(async (type) => {
    const all = [];
    let offset = 0;
    while (true) {
      const { data } = await api.get(`/v1/sw-releases/${id}/dcm/parameters`, { params: { type, limit: API_LIMIT, offset } });
      const items = data?.items || [];
      all.push(...items);
      if (items.length < API_LIMIT || all.length >= (data?.total || 0)) break;
      offset += API_LIMIT;
    }
    return all;
  }, [id]);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const sumRes = await api.get(`/v1/sw-releases/${id}/dcm/summary`);
      setSummary(sumRes.data);
      const [scalars, curves, maps] = await Promise.all([
        fetchAllByType("scalar"),
        fetchAllByType("curve"),
        fetchAllByType("map"),
      ]);
      setParams({ scalars, curves, maps });
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, [id, fetchAllByType]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setPage(0); }, [search]);

  const openParamDetail = async (p) => {
    if (p._type === "scalar") return;
    setChartLoading(true);
    setSelectedParam({ _type: p._type, name: p.name });
    try {
      const { data } = await api.get(`/v1/sw-releases/${id}/dcm/parameters/${encodeURIComponent(p.name)}`);
      setSelectedParam({ ...data, _type: p._type });
    } catch (e) {
      console.error(e);
      setSelectedParam(null);
    } finally {
      setChartLoading(false);
    }
  };

  const allParams = useMemo(() => {
    if (!params) return [];
    const q = search.toLowerCase();
    const ok = (p) => !q || p.name.toLowerCase().includes(q) || (p.long_name || "").toLowerCase().includes(q);
    return [
      ...params.scalars.filter(ok).map((p) => ({ ...p, _type: "scalar" })),
      ...params.curves.filter(ok).map((p) => ({ ...p, _type: "curve"  })),
      ...params.maps.filter(ok).map((p)   => ({ ...p, _type: "map"    })),
    ];
  }, [params, search]);

  const paramsPage = allParams.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(allParams.length / PAGE_SIZE);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-500 text-sm">Parsing DCM file…</div>;
  }

  if (error) {
    const noDcm = error.toLowerCase().includes("no dcm") || error.toLowerCase().includes("not found");
    return (
      <div className="p-8 max-w-lg">
        <div className="mb-4 p-4 rounded border" style={{ borderColor: noDcm ? "#d97706" : "#ef4444", background: noDcm ? "#fffbeb" : "#fef2f2" }}>
          <p className="font-semibold text-sm mb-1" style={{ color: noDcm ? "#92400e" : "#991b1b" }}>{noDcm ? "No DCM file uploaded" : "Error loading DCM"}</p>
          <p className="text-xs" style={{ color: noDcm ? "#78350f" : "#7f1d1d" }}>
            {noDcm ? "Upload a .dcm file on the SW Release detail page first." : error}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate(-1)} className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-xs">← Back</button>
          {noDcm && <button onClick={() => navigate(`/software-releases/${id}`)} className="px-4 py-1.5 rounded text-xs text-white" style={{ background: "#2D5016" }}>Go to SW Release →</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 130px)" }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-3 py-2 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={() => navigate(-1)} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 shrink-0">
            ← Back to SW Release
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-gray-900 leading-tight">DCM Parameters</h1>
            {summary && (
              <p className="text-[11px] text-gray-400 truncate">
                {summary.filename} · {summary.summary.total_scalars?.toLocaleString()} scalars · {summary.summary.total_curves} curves · {summary.summary.total_maps} maps
              </p>
            )}
          </div>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or description…"
          className="border border-gray-300 rounded px-2.5 py-1 text-xs w-64 focus:outline-none focus:ring-1 focus:ring-blue-400 shrink-0"
        />
      </div>

      {/* ── Body: table + chart panel ─────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Parameter table ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-w-0">
          <table className="w-full border-collapse text-[11px]" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 210 }} />
              <col />
              <col style={{ width: 58 }} />
              <col style={{ width: 52 }} />
              <col style={{ width: 100 }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-gray-100 border-b border-gray-300">
              <tr>
                <th className="text-left px-2 py-1.5 text-[10px] font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">Name</th>
                <th className="text-left px-2 py-1.5 text-[10px] font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">Description</th>
                <th className="text-center px-1 py-1.5 text-[10px] font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">Type</th>
                <th className="text-left px-2 py-1.5 text-[10px] font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">Unit</th>
                <th className="text-right px-2 py-1.5 text-[10px] font-bold text-gray-600 uppercase tracking-wider">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paramsPage.map((p, i) => {
                const isClickable = p._type !== "scalar";
                const isSelected  = selectedParam?.name === p.name;
                return (
                  <tr
                    key={p.name}
                    onClick={() => openParamDetail(p)}
                    className={[
                      isSelected  ? "bg-blue-50 border-l-2 border-l-blue-500" : (i % 2 === 0 ? "bg-white" : "bg-gray-50/60"),
                      isClickable ? "cursor-pointer hover:bg-blue-50/60" : "",
                      "transition-colors",
                    ].join(" ")}
                    style={{ height: 26 }}
                  >
                    <td className="px-2 py-0 border-r border-gray-100 truncate" style={{ maxWidth: 210 }}>
                      <span style={{
                        fontFamily: "'Consolas','Courier New',monospace",
                        fontSize: 11,
                        color: isClickable ? "#2563eb" : "#1f2937",
                        whiteSpace: "nowrap",
                      }}>
                        {p.name}
                      </span>
                    </td>
                    <td className="px-2 py-0 text-gray-500 border-r border-gray-100 truncate" style={{ fontSize: 11 }}>
                      {p.long_name || "—"}
                    </td>
                    <td className="px-1 py-0 text-center border-r border-gray-100">
                      {TYPE_BADGE[p._type]}
                    </td>
                    <td className="px-2 py-0 text-gray-500 border-r border-gray-100 font-mono truncate">
                      {p.unit || "—"}
                    </td>
                    <td className="px-2 py-0 text-right font-mono">
                      {p._type === "scalar" ? (
                        <span className="text-gray-800">
                          {typeof p.value_preview === "number"
                            ? p.value_preview.toFixed(5)
                            : String(p.value_preview ?? "—")}
                        </span>
                      ) : (
                        <span className="text-blue-400 text-[10px]">View →</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {paramsPage.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-gray-400 text-xs">No parameters match your search.</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-1.5 border-t border-gray-200 bg-gray-50 text-[10px] text-gray-600 sticky bottom-0">
              <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, allParams.length)} / {allParams.length}</span>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                  className="px-2 py-0.5 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100">← Prev</button>
                <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}
                  className="px-2 py-0.5 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100">Next →</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Chart panel (right) ──────────────────────────────────── */}
        <ChartPanel
          param={chartLoading ? null : selectedParam}
          loading={chartLoading}
          onClose={() => { setSelectedParam(null); setChartLoading(false); }}
        />
      </div>
    </div>
  );
}
