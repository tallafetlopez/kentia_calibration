import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";

// ─── Mini inline SVG sparkline for curves ─────────────────────────────────────
function Sparkline({ values = [] }) {
  if (!values.length) return null;
  const W = 80, H = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  });
  return (
    <svg width={W} height={H} className="block">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="#4a5240"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Mini CSS heatmap preview (no Plotly) ─────────────────────────────────────
function MiniHeatmap({ values = [] }) {
  if (!values.length) return null;
  const flat = values.flat();
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const range = max - min || 1;
  const lerp = (v) => Math.round(((v - min) / range) * 255);

  // palette: low=#f0f4eb  high=#2d3a28
  const cellColor = (v) => {
    const t = (v - min) / range;
    const r = Math.round(240 + (45 - 240) * t);
    const g = Math.round(244 + (58 - 244) * t);
    const b = Math.round(235 + (40 - 235) * t);
    return `rgb(${r},${g},${b})`;
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${values[0]?.length || 1}, 8px)`,
        gap: "1px",
        width: "fit-content",
      }}
    >
      {values.map((row, ri) =>
        row.map((cell, ci) => (
          <div
            key={`${ri}-${ci}`}
            style={{ width: 8, height: 8, background: cellColor(cell) }}
          />
        ))
      )}
    </div>
  );
}

// ─── Full chart modal ─────────────────────────────────────────────────────────
function CurveChartModal({ param, onClose }) {
  if (!param) return null;

  const xRaw = Array.isArray(param.x_axis) ? param.x_axis : [];
  const yRaw = Array.isArray(param.values) ? param.values : [];
  const n = Math.max(0, Math.min(xRaw.length || yRaw.length, yRaw.length || xRaw.length));
  const xVals = (n > 0 ? xRaw.slice(0, n) : yRaw.map((_, i) => i)).map((v, i) => {
    const num = Number(v);
    return Number.isFinite(num) ? num : i;
  });
  const yVals = (n > 0 ? yRaw.slice(0, n) : []).map((v) => {
    const num = Number(v);
    return Number.isFinite(num) ? num : 0;
  });

  const hasData = yVals.length > 1;
  const W = 820;
  const H = 320;
  const padL = 54;
  const padR = 20;
  const padT = 14;
  const padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const minY = hasData ? Math.min(...yVals) : 0;
  const maxY = hasData ? Math.max(...yVals) : 1;
  const rangeY = maxY - minY || 1;

  const points = hasData
    ? yVals
        .map((v, i) => {
          const x = padL + (i / (yVals.length - 1 || 1)) * plotW;
          const y = padT + plotH - ((v - minY) / rangeY) * plotH;
          return `${x},${y}`;
        })
        .join(" ")
    : "";

  const tickIndices = hasData
    ? Array.from({ length: Math.min(6, yVals.length) }, (_, i) => Math.round((i * (yVals.length - 1)) / Math.max(1, Math.min(6, yVals.length) - 1)))
    : [];

  const fmt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(0) : String(v);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p
              className="font-bold text-gray-900"
              style={{ fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace", fontSize: 13 }}
            >
              {param.name}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{param.long_name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              X: {param.unit_x} → W: {param.unit_w}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        {!hasData ? (
          <div className="h-[320px] border border-gray-200 rounded flex items-center justify-center text-sm text-gray-500 bg-gray-50">
            This curve has no plottable numeric data.
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[320px] border border-gray-200 rounded bg-white">
            <rect x={padL} y={padT} width={plotW} height={plotH} fill="#f9fbf7" stroke="#e5e7eb" />
            <polyline points={points} fill="none" stroke="#2d3a28" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {tickIndices.map((idx) => {
              const cx = padL + (idx / (yVals.length - 1 || 1)) * plotW;
              const cy = padT + plotH - ((yVals[idx] - minY) / rangeY) * plotH;
              return <circle key={`pt-${idx}`} cx={cx} cy={cy} r="2.5" fill="#4a5240" />;
            })}

            <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#6b7280" />
            <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#6b7280" />

            {tickIndices.map((idx) => {
              const xx = padL + (idx / (yVals.length - 1 || 1)) * plotW;
              return (
                <text key={`xt-${idx}`} x={xx} y={H - 14} textAnchor="middle" fontSize="10" fill="#6b7280">
                  {fmt(xVals[idx])}
                </text>
              );
            })}

            {[0, 0.5, 1].map((t) => {
              const yy = padT + (1 - t) * plotH;
              const val = minY + t * rangeY;
              return (
                <text key={`yt-${t}`} x={padL - 8} y={yy + 3} textAnchor="end" fontSize="10" fill="#6b7280">
                  {val.toFixed(2)}
                </text>
              );
            })}

            <text x={padL + plotW / 2} y={H - 2} textAnchor="middle" fontSize="11" fill="#374151">
              {param.unit_x || "X"}
            </text>
            <text
              x={14}
              y={padT + plotH / 2}
              textAnchor="middle"
              fontSize="11"
              fill="#374151"
              transform={`rotate(-90 14 ${padT + plotH / 2})`}
            >
              {param.unit_w || "Y"}
            </text>
          </svg>
        )}
      </div>
    </div>
  );
}

function MapChartModal({ param, onClose }) {
  const [mode, setMode] = useState("heatmap");
  const [flatAssist, setFlatAssist] = useState(true);

  if (!param) return null;

  const rawRows = Array.isArray(param.values) ? param.values : [];
  const zRows = rawRows
    .filter((row) => Array.isArray(row) && row.length > 0)
    .map((row) => row.map((v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }));

  const rowCount = zRows.length;
  const colCount = zRows.reduce((m, row) => Math.max(m, row.length), 0);
  const hasData = rowCount > 0 && colCount > 0;

  const z = zRows.map((row) => {
    if (row.length === colCount) return row;
    return Array.from({ length: colCount }, (_, i) => (i < row.length ? row[i] : null));
  });

  const xSource = Array.isArray(param.x_axis) ? param.x_axis : [];
  const ySource = Array.isArray(param.y_axis) ? param.y_axis : [];

  const x =
    xSource.length === colCount
      ? xSource.map((v, i) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : i;
        })
      : Array.from({ length: colCount }, (_, i) => i);

  const y =
    ySource.length === rowCount
      ? ySource.map((v, i) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : i;
        })
      : Array.from({ length: rowCount }, (_, i) => i);

  const finiteValues = z.flat().filter((v) => Number.isFinite(v));
  const zMinRaw = finiteValues.length ? Math.min(...finiteValues) : 0;
  const zMaxRaw = finiteValues.length ? Math.max(...finiteValues) : 1;
  const zIsFlat = zMinRaw === zMaxRaw;

  const assistAmplitude = Math.max(Math.abs(zMinRaw || 1) * 0.01, 0.08);
  const zForPlot = zIsFlat && flatAssist
    ? z.map((row, ri) =>
        row.map((v, ci) => {
          if (!Number.isFinite(v)) return null;
          const ry = rowCount > 1 ? ri / (rowCount - 1) : 0.5;
          const rx = colCount > 1 ? ci / (colCount - 1) : 0.5;
          const wave = Math.sin(rx * Math.PI) * Math.cos(ry * Math.PI);
          const radial = ((rx - 0.5) ** 2 + (ry - 0.5) ** 2) * 0.2;
          const delta = (wave - radial) * assistAmplitude;
          return v + delta;
        })
      )
    : z;

  const zDisplayValues = zForPlot.flat().filter((v) => Number.isFinite(v));
  const zMin = zDisplayValues.length ? Math.min(...zDisplayValues) : 0;
  const zMax = zDisplayValues.length ? Math.max(...zDisplayValues) : 1;

  const tNorm = (v) => {
    const den = zMax - zMin || 1;
    return Math.max(0, Math.min(1, (Number(v) - zMin) / den));
  };

  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const colorAt = (v) => {
    const t = tNorm(v);
    // Teal -> cyan -> lime -> amber -> coral
    const stops = [
      { t: 0.0, c: [20, 68, 84] },
      { t: 0.25, c: [35, 134, 136] },
      { t: 0.5, c: [120, 198, 121] },
      { t: 0.75, c: [249, 200, 78] },
      { t: 1.0, c: [238, 105, 85] },
    ];
    let i = 0;
    while (i < stops.length - 1 && t > stops[i + 1].t) i += 1;
    const a = stops[i];
    const b = stops[Math.min(stops.length - 1, i + 1)];
    const u = (t - a.t) / ((b.t - a.t) || 1);
    return `rgb(${lerp(a.c[0], b.c[0], u)},${lerp(a.c[1], b.c[1], u)},${lerp(a.c[2], b.c[2], u)})`;
  };

  const chartW = 900;
  const chartH = 470;
  const padL = 70;
  const padR = 90;
  const padT = 18;
  const padB = 52;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const xTickIdx = Array.from({ length: Math.min(6, colCount) }, (_, i) => Math.round((i * (colCount - 1)) / Math.max(1, Math.min(6, colCount) - 1)));
  const yTickIdx = Array.from({ length: Math.min(6, rowCount) }, (_, i) => Math.round((i * (rowCount - 1)) / Math.max(1, Math.min(6, rowCount) - 1)));

  const fmt = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    if (Math.abs(n) >= 100) return n.toFixed(0);
    if (Math.abs(n) >= 10) return n.toFixed(1);
    return n.toFixed(2);
  };

  const renderLegend = () => (
    <g>
      <defs>
        <linearGradient id="mapLegend" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={colorAt(zMin)} />
          <stop offset="25%" stopColor={colorAt(zMin + 0.25 * (zMax - zMin || 1))} />
          <stop offset="50%" stopColor={colorAt(zMin + 0.5 * (zMax - zMin || 1))} />
          <stop offset="75%" stopColor={colorAt(zMin + 0.75 * (zMax - zMin || 1))} />
          <stop offset="100%" stopColor={colorAt(zMax)} />
        </linearGradient>
      </defs>
      <rect x={chartW - 52} y={padT} width={14} height={plotH} rx={3} fill="url(#mapLegend)" stroke="#d1d5db" />
      {[0, 0.5, 1].map((t) => (
        <text key={`lg-${t}`} x={chartW - 34} y={padT + (1 - t) * plotH + 4} fontSize="10" fill="#4b5563">
          {fmt(zMin + t * (zMax - zMin))}
        </text>
      ))}
      <text x={chartW - 38} y={padT - 6} textAnchor="middle" fontSize="10" fill="#4b5563">{param.unit_w || "Z"}</text>
    </g>
  );

  const renderHeatmap = () => {
    const cw = plotW / Math.max(1, colCount);
    const ch = plotH / Math.max(1, rowCount);

    return (
      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-[470px] border border-gray-200 rounded-lg bg-white">
        <defs>
          <linearGradient id="mapBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#eef2f7" />
          </linearGradient>
        </defs>
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="url(#mapBg)" stroke="#d1d5db" rx={6} />

        {zForPlot.map((row, ri) =>
          row.map((v, ci) => {
            if (!Number.isFinite(v)) return null;
            return (
              <rect
                key={`c-${ri}-${ci}`}
                x={padL + ci * cw + 0.5}
                y={padT + ri * ch + 0.5}
                width={Math.max(1, cw - 1)}
                height={Math.max(1, ch - 1)}
                fill={colorAt(v)}
                rx={Math.min(3, cw * 0.15)}
              />
            );
          })
        )}

        {Array.from({ length: colCount + 1 }, (_, i) => (
          <line key={`vx-${i}`} x1={padL + i * (plotW / colCount)} y1={padT} x2={padL + i * (plotW / colCount)} y2={padT + plotH} stroke="#ffffff" opacity="0.35" />
        ))}
        {Array.from({ length: rowCount + 1 }, (_, i) => (
          <line key={`hy-${i}`} x1={padL} y1={padT + i * (plotH / rowCount)} x2={padL + plotW} y2={padT + i * (plotH / rowCount)} stroke="#ffffff" opacity="0.35" />
        ))}

        {xTickIdx.map((idx) => {
          const xx = padL + (idx + 0.5) * (plotW / colCount);
          return (
            <text key={`xt-${idx}`} x={xx} y={chartH - 14} textAnchor="middle" fontSize="10" fill="#4b5563">
              {fmt(x[idx])}
            </text>
          );
        })}
        {yTickIdx.map((idx) => {
          const yy = padT + (idx + 0.5) * (plotH / rowCount);
          return (
            <text key={`yt-${idx}`} x={padL - 8} y={yy + 3} textAnchor="end" fontSize="10" fill="#4b5563">
              {fmt(y[idx])}
            </text>
          );
        })}

        <text x={padL + plotW / 2} y={chartH - 2} textAnchor="middle" fontSize="11" fill="#374151">{param.unit_x || "X"}</text>
        <text x={16} y={padT + plotH / 2} textAnchor="middle" fontSize="11" fill="#374151" transform={`rotate(-90 16 ${padT + plotH / 2})`}>
          {param.unit_y || "Y"}
        </text>

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
      const px = (ci - ri) * sx;
      const py = -(ci + ri) * sy - nz * zScale;
      return [px, py, nz];
    };

    let minPx = Number.POSITIVE_INFINITY;
    let maxPx = Number.NEGATIVE_INFINITY;
    let minPy = Number.POSITIVE_INFINITY;
    let maxPy = Number.NEGATIVE_INFINITY;

    for (let ri = 0; ri < rowCount; ri += 1) {
      for (let ci = 0; ci < colCount; ci += 1) {
        const v = zForPlot[ri]?.[ci];
        if (!Number.isFinite(v)) continue;
        const [px, py] = projectBase(ri, ci, v);
        if (px < minPx) minPx = px;
        if (px > maxPx) maxPx = px;
        if (py < minPy) minPy = py;
        if (py > maxPy) maxPy = py;
      }
    }

    if (!Number.isFinite(minPx) || !Number.isFinite(maxPx) || !Number.isFinite(minPy) || !Number.isFinite(maxPy)) {
      minPx = 0;
      maxPx = 1;
      minPy = -1;
      maxPy = 0;
    }

    const srcCx = (minPx + maxPx) / 2;
    const srcCy = (minPy + maxPy) / 2;
    const dstCx = padL + plotW / 2;
    const dstCy = padT + plotH / 2;
    const dx = dstCx - srcCx;
    const dy = dstCy - srcCy;

    const project = (ri, ci, v) => {
      const [px, py, nz] = projectBase(ri, ci, v);
      return [px + dx, py + dy, nz];
    };

    // Fill row bands coherently to avoid crossed quads and keep a clean surface.
    const rowBands = [];
    for (let ri = 0; ri < rowCount - 1; ri += 1) {
      const top = [];
      const bottom = [];
      const vals = [];
      for (let ci = 0; ci < colCount; ci += 1) {
        const vTop = zForPlot[ri]?.[ci];
        const vBottom = zForPlot[ri + 1]?.[ci];
        if (!Number.isFinite(vTop) || !Number.isFinite(vBottom)) continue;
        const pTop = project(ri, ci, vTop);
        const pBottom = project(ri + 1, ci, vBottom);
        top.push(`${pTop[0]},${pTop[1]}`);
        bottom.push(`${pBottom[0]},${pBottom[1]}`);
        vals.push(vTop, vBottom);
      }
      if (top.length >= 2 && bottom.length >= 2) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        rowBands.push({
          key: `band-${ri}`,
          points: `${top.join(" ")} ${bottom.reverse().join(" ")}`,
          color: colorAt(avg),
        });
      }
    }

    return (
      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-[470px] border border-gray-200 rounded-lg bg-white">
        <defs>
          <linearGradient id="surfaceBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#eef2f7" />
          </linearGradient>
        </defs>
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="url(#surfaceBg)" stroke="#d1d5db" rx={6} />

        {rowBands.map((b) => (
          <polygon key={b.key} points={b.points} fill={b.color} fillOpacity="0.78" stroke="none" />
        ))}

        {Array.from({ length: rowCount }, (_, ri) => {
          const pts = Array.from({ length: colCount }, (_, ci) => {
            const v = zForPlot[ri]?.[ci];
            const p = project(ri, ci, Number.isFinite(v) ? v : zMin);
            return `${p[0]},${p[1]}`;
          }).join(" ");
          return <polyline key={`r-${ri}`} points={pts} fill="none" stroke="#0f172a" strokeOpacity="0.45" strokeWidth="1.05" />;
        })}

        {Array.from({ length: colCount }, (_, ci) => {
          const pts = Array.from({ length: rowCount }, (_, ri) => {
            const v = zForPlot[ri]?.[ci];
            const p = project(ri, ci, Number.isFinite(v) ? v : zMin);
            return `${p[0]},${p[1]}`;
          }).join(" ");
          return <polyline key={`c-${ci}`} points={pts} fill="none" stroke="#0f172a" strokeOpacity="0.32" strokeWidth="1" />;
        })}

        <text x={padL + plotW / 2} y={chartH - 2} textAnchor="middle" fontSize="11" fill="#374151">{param.unit_x || "X"}</text>
        <text x={16} y={padT + plotH / 2} textAnchor="middle" fontSize="11" fill="#374151" transform={`rotate(-90 16 ${padT + plotH / 2})`}>
          {param.unit_y || "Y"}
        </text>
        <text x={chartW - 34} y={padT - 6} textAnchor="middle" fontSize="10" fill="#4b5563">{param.unit_w || "Z"}</text>
        {renderLegend()}
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p
              className="font-bold text-gray-900"
              style={{ fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace", fontSize: 13 }}
            >
              {param.name}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{param.long_name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Unit: {param.unit_w} · X: {param.unit_x} · Y: {param.unit_y}
            </p>
            {zIsFlat && (
              <p className="text-xs text-amber-700 mt-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                Flat map detected: all Z values are equal ({zMinRaw}).
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded border border-gray-300 overflow-hidden text-xs">
              {["heatmap", "surface"].map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1 capitalize ${mode === m ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  {m === "heatmap" ? "Heatmap" : "3D Surface"}
                </button>
              ))}
            </div>
            {zIsFlat && (
              <button
                onClick={() => setFlatAssist((v) => !v)}
                className={`text-xs px-2.5 py-1 rounded border ${flatAssist ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-white border-gray-300 text-gray-700"}`}
              >
                {flatAssist ? "Assist ON" : "Assist OFF"}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none ml-2">×</button>
          </div>
        </div>
        {!hasData ? (
          <div className="h-[460px] border border-gray-200 rounded flex items-center justify-center text-sm text-gray-500 bg-gray-50">
            This map has no plottable numeric data.
          </div>
        ) : (
          <div className="space-y-2">
            {zIsFlat && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Visualization note: original data are flat (min=max={zMinRaw}).
                {flatAssist ? " Assist mode adds tiny synthetic contrast only for visual perception." : " Assist mode is off, so the chart is mathematically flat."}
              </div>
            )}
            {mode === "heatmap" ? renderHeatmap() : renderSurface()}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function SwReleaseDCMViewer() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [params, setParams] = useState(null);   // { scalars, curves, maps }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("scalars");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedCurve, setSelectedCurve] = useState(null);
  const [selectedMap, setSelectedMap] = useState(null);

  const PAGE_SIZE = 50;
  const API_LIMIT = 1000;

  const fetchAllByType = useCallback(async (type) => {
    const allItems = [];
    let offset = 0;

    while (true) {
      const { data } = await api.get(`/v1/sw-releases/${id}/dcm/parameters`, {
        params: { type, limit: API_LIMIT, offset },
      });

      const pageItems = data?.items || [];
      allItems.push(...pageItems);

      if (pageItems.length < API_LIMIT || allItems.length >= (data?.total || 0)) {
        break;
      }
      offset += API_LIMIT;
    }

    return allItems;
  }, [id]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sumRes = await api.get(`/v1/sw-releases/${id}/dcm/summary`);
      setSummary(sumRes.data);

      // Fetch all types in backend-safe chunks (limit <= 1000)
      const [scalars, curves, maps] = await Promise.all([
        fetchAllByType("scalar"),
        fetchAllByType("curve"),
        fetchAllByType("map"),
      ]);

      setParams({
        scalars,
        curves,
        maps,
      });
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, [id, fetchAllByType]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setPage(0); }, [search, activeTab]);

  const openCurveDetail = async (name) => {
    try {
      const { data } = await api.get(`/v1/sw-releases/${id}/dcm/parameters/${encodeURIComponent(name)}`);
      setSelectedCurve(data);
    } catch (e) { console.error(e); }
  };

  const openMapDetail = async (name) => {
    try {
      const { data } = await api.get(`/v1/sw-releases/${id}/dcm/parameters/${encodeURIComponent(name)}`);
      setSelectedMap(data);
    } catch (e) { console.error(e); }
  };

  // Filtered scalars (client-side)
  const filteredScalars = useMemo(() => {
    if (!params) return [];
    const q = search.toLowerCase();
    if (!q) return params.scalars;
    return params.scalars.filter(
      (p) => p.name.toLowerCase().includes(q) || p.long_name.toLowerCase().includes(q)
    );
  }, [params, search]);

  const filteredCurves = useMemo(() => {
    if (!params) return [];
    const q = search.toLowerCase();
    if (!q) return params.curves;
    return params.curves.filter(
      (p) => p.name.toLowerCase().includes(q) || p.long_name.toLowerCase().includes(q)
    );
  }, [params, search]);

  const filteredMaps = useMemo(() => {
    if (!params) return [];
    const q = search.toLowerCase();
    if (!q) return params.maps;
    return params.maps.filter(
      (p) => p.name.toLowerCase().includes(q) || p.long_name.toLowerCase().includes(q)
    );
  }, [params, search]);

  const scalarsPage = filteredScalars.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalScalarPages = Math.ceil(filteredScalars.length / PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500">
        Parsing DCM file…
      </div>
    );
  }

  if (error) {
    const noDcm = error.toLowerCase().includes("no dcm") || error.toLowerCase().includes("not found");
    return (
      <div className="p-8 max-w-lg">
        <div className="mb-4 p-4 rounded-lg border" style={{ borderColor: noDcm ? "#d97706" : "#ef4444", background: noDcm ? "#fffbeb" : "#fef2f2" }}>
          <p className="font-semibold mb-1" style={{ color: noDcm ? "#92400e" : "#991b1b" }}>
            {noDcm ? "No DCM file uploaded" : "Error loading DCM"}
          </p>
          <p className="text-sm" style={{ color: noDcm ? "#78350f" : "#7f1d1d" }}>
            {noDcm
              ? "Upload a .dcm file on the SW Release detail page first, then return here."
              : error}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm">
            ← Back
          </button>
          {noDcm && (
            <button onClick={() => navigate(`/software-releases/${id}`)} className="px-4 py-2 rounded text-sm text-white" style={{ background: "#2D5016" }}>
              Go to SW Release →
            </button>
          )}
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "scalars", label: `Scalars (${params?.scalars.length ?? 0})` },
    { id: "curves", label: `Curves (${params?.curves.length ?? 0})` },
    { id: "maps", label: `Maps (${params?.maps.length ?? 0})` },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-gray-500 hover:text-gray-800 mb-2 flex items-center gap-1"
          >
            ← Back to SW Release
          </button>
          <h1 className="text-2xl font-bold text-gray-900">DCM Parameters</h1>
          {summary && (
            <p className="text-sm text-gray-500 mt-1">
              {summary.filename} · {summary.summary.total_scalars?.toLocaleString()} scalars ·{" "}
              {summary.summary.total_curves} curves · {summary.summary.total_maps} maps
            </p>
          )}
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === t.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or description…"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
      </div>

      {/* ── SCALARS TAB ───────────────────────────────────────────────────── */}
      {activeTab === "scalars" && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide w-64">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide w-24">Unit</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide w-32">Value</th>
              </tr>
            </thead>
            <tbody>
              {scalarsPage.map((p, i) => (
                <tr key={p.name} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td className="px-4 py-2.5 align-top">
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
                        fontSize: 12,
                        color: "#1f2937",
                      }}
                    >
                      {p.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs align-top">{p.long_name || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs align-top font-mono">{p.unit || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-800 align-top">
                    {typeof p.value_preview === "number"
                      ? p.value_preview.toPrecision(6)
                      : String(p.value_preview ?? "—")}
                  </td>
                </tr>
              ))}
              {scalarsPage.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">No scalars match your search.</td>
                </tr>
              )}
            </tbody>
          </table>
          {/* Pagination */}
          {totalScalarPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-600">
              <span>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredScalars.length)} of {filteredScalars.length}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
                >
                  ← Prev
                </button>
                <button
                  disabled={page + 1 >= totalScalarPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CURVES TAB ────────────────────────────────────────────────────── */}
      {activeTab === "curves" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCurves.map((p) => (
            <div key={p.name} className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2 hover:border-gray-400 transition">
              <p
                className="truncate"
                style={{
                  fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
                  fontSize: 12,
                  color: "#1f2937",
                }}
              >
                {p.name}
              </p>
              <p className="text-xs text-gray-400 truncate">{p.long_name || "—"}</p>
              <p className="text-xs text-gray-500 font-mono">{p.value_preview}</p>
              <Sparkline values={[]} />
              <button
                onClick={() => openCurveDetail(p.name)}
                className="mt-auto text-xs text-blue-600 hover:text-blue-800 text-left"
              >
                View chart →
              </button>
            </div>
          ))}
          {filteredCurves.length === 0 && (
            <div className="col-span-3 text-center text-gray-400 py-8">No curves match your search.</div>
          )}
        </div>
      )}

      {/* ── MAPS TAB ──────────────────────────────────────────────────────── */}
      {activeTab === "maps" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMaps.map((p) => (
            <div key={p.name} className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2 hover:border-gray-400 transition">
              <p
                className="truncate"
                style={{
                  fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
                  fontSize: 12,
                  color: "#1f2937",
                }}
              >
                {p.name}
              </p>
              <p className="text-xs text-gray-400 truncate">{p.long_name || "—"}</p>
              <p className="text-xs text-gray-500">{p.value_preview}</p>
              <MiniHeatmap values={[]} />
              <button
                onClick={() => openMapDetail(p.name)}
                className="mt-auto text-xs text-blue-600 hover:text-blue-800 text-left"
              >
                View map →
              </button>
            </div>
          ))}
          {filteredMaps.length === 0 && (
            <div className="col-span-2 text-center text-gray-400 py-8">No maps match your search.</div>
          )}
        </div>
      )}

      {/* Modals */}
      {selectedCurve && <CurveChartModal param={selectedCurve} onClose={() => setSelectedCurve(null)} />}
      {selectedMap && <MapChartModal param={selectedMap} onClose={() => setSelectedMap(null)} />}
    </div>
  );
}
