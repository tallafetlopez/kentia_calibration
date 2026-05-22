import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";

// ─── Colour helpers ───────────────────────────────────────────────────────────
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
const MAP_STOPS = [
  { t: 0.0,  c: [20,  68,  84]  }, { t: 0.25, c: [35,  134, 136] },
  { t: 0.5,  c: [120, 198, 121] }, { t: 0.75, c: [249, 200, 78]  },
  { t: 1.0,  c: [238, 105, 85]  },
];
function mapColor(t) {
  let i = 0;
  while (i < MAP_STOPS.length - 1 && t > MAP_STOPS[i + 1].t) i++;
  const a = MAP_STOPS[i], b = MAP_STOPS[Math.min(MAP_STOPS.length - 1, i + 1)];
  const u = (t - a.t) / ((b.t - a.t) || 1);
  return `rgb(${lerp(a.c[0],b.c[0],u)},${lerp(a.c[1],b.c[1],u)},${lerp(a.c[2],b.c[2],u)})`;
}
function fmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "");
  return Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2);
}

// ─── Curve chart ──────────────────────────────────────────────────────────────
function CurveChart({ param }) {
  if (!param) return null;
  const xRaw = Array.isArray(param.x_axis) ? param.x_axis : [];
  const yRaw = Array.isArray(param.values)  ? param.values  : [];
  const n    = Math.min(xRaw.length || yRaw.length, yRaw.length || xRaw.length);
  const xVals = (n > 0 ? xRaw.slice(0, n) : yRaw.map((_, i) => i)).map((v, i) => { const x = Number(v); return Number.isFinite(x) ? x : i; });
  const yVals = (n > 0 ? yRaw.slice(0, n) : []).map(v => { const y = Number(v); return Number.isFinite(y) ? y : 0; });
  const hasData = yVals.length > 1;
  const W = 580, H = 300, pL = 58, pR = 18, pT = 14, pB = 44;
  const plotW = W - pL - pR, plotH = H - pT - pB;
  const minY = hasData ? Math.min(...yVals) : 0, maxY = hasData ? Math.max(...yVals) : 1, rangeY = maxY - minY || 1;
  const points = hasData ? yVals.map((v, i) => `${pL + (i/(yVals.length-1||1))*plotW},${pT+plotH-((v-minY)/rangeY)*plotH}`).join(" ") : "";
  const xTicks = hasData ? Array.from({length: Math.min(7, yVals.length)}, (_,i) => Math.round((i*(yVals.length-1))/Math.max(1,Math.min(7,yVals.length)-1))) : [];
  const yTicks = [0,0.25,0.5,0.75,1.0].map(t => ({ val: minY+t*rangeY, y: pT+(1-t)*plotH }));

  return (
    <div className="p-3 flex flex-col gap-2">
      <div>
        <p className="text-xs font-mono font-semibold text-gray-800">{param.name}</p>
        <p className="text-[11px] text-gray-500">{param.long_name || param.long_identifier}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">X: {param.unit_x||"–"} → Y: {param.unit_w||"–"}</p>
      </div>
      {!hasData
        ? <div className="flex items-center justify-center h-48 bg-gray-50 border border-gray-200 rounded text-xs text-gray-400">No plottable data</div>
        : <svg viewBox={`0 0 ${W} ${H}`} className="w-full border border-gray-200 rounded bg-white" style={{height:260}}>
            {yTicks.map(({y,val},ti) => (<g key={ti}><line x1={pL} y1={y} x2={pL+plotW} y2={y} stroke="#f0f0f0"/><text x={pL-6} y={y+3.5} textAnchor="end" fontSize="9" fill="#9ca3af">{fmt(val)}</text></g>))}
            {xTicks.map(idx => { const cx=pL+(idx/(yVals.length-1||1))*plotW; return (<g key={idx}><line x1={cx} y1={pT} x2={cx} y2={pT+plotH} stroke="#f5f5f5"/><text x={cx} y={H-14} textAnchor="middle" fontSize="9" fill="#9ca3af">{fmt(xVals[idx])}</text></g>); })}
            <rect x={pL} y={pT} width={plotW} height={plotH} fill="none" stroke="#d1d5db"/>
            <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
            {xTicks.map(idx => { const cx=pL+(idx/(yVals.length-1||1))*plotW, cy=pT+plotH-((yVals[idx]-minY)/rangeY)*plotH; return <circle key={idx} cx={cx} cy={cy} r="2.5" fill="#2563eb" stroke="#fff" strokeWidth="1"/>; })}
            <text x={pL+plotW/2} y={H-2} textAnchor="middle" fontSize="10" fill="#6b7280">{param.unit_x||"X"}</text>
            <text x={12} y={pT+plotH/2} textAnchor="middle" fontSize="10" fill="#6b7280" transform={`rotate(-90 12 ${pT+plotH/2})`}>{param.unit_w||"Y"}</text>
          </svg>
      }
    </div>
  );
}

// ─── Map chart ────────────────────────────────────────────────────────────────
function MapChart({ param }) {
  const [mode, setMode] = useState("heatmap");
  const [flatAssist, setFlatAssist] = useState(true);
  if (!param) return null;
  const rawRows = Array.isArray(param.values) ? param.values : [];
  const zRows = rawRows.filter(r => Array.isArray(r) && r.length > 0).map(r => r.map(v => { const n=Number(v); return Number.isFinite(n)?n:null; }));
  const rowCount = zRows.length, colCount = zRows.reduce((m,r)=>Math.max(m,r.length),0);
  const hasData = rowCount>0 && colCount>0;
  const z = zRows.map(r => r.length===colCount ? r : Array.from({length:colCount},(_,i)=>i<r.length?r[i]:null));
  const xSource = Array.isArray(param.x_axis)?param.x_axis:[], ySource = Array.isArray(param.y_axis)?param.y_axis:[];
  const x = xSource.length===colCount ? xSource.map((v,i)=>{const n=Number(v);return Number.isFinite(n)?n:i;}) : Array.from({length:colCount},(_,i)=>i);
  const y = ySource.length===rowCount  ? ySource.map((v,i)=>{const n=Number(v);return Number.isFinite(n)?n:i;}) : Array.from({length:rowCount},(_,i)=>i);
  const fv = z.flat().filter(v=>Number.isFinite(v));
  const zMinRaw=fv.length?Math.min(...fv):0, zMaxRaw=fv.length?Math.max(...fv):1, zIsFlat=zMinRaw===zMaxRaw;
  const assistAmp=Math.max(Math.abs(zMinRaw||1)*0.01,0.08);
  const zForPlot = zIsFlat&&flatAssist ? z.map((row,ri)=>row.map((v,ci)=>{if(!Number.isFinite(v))return null; const ry=rowCount>1?ri/(rowCount-1):0.5,rx=colCount>1?ci/(colCount-1):0.5; return v+(Math.sin(rx*Math.PI)*Math.cos(ry*Math.PI)-((rx-0.5)**2+(ry-0.5)**2)*0.2)*assistAmp;})) : z;
  const dv=zForPlot.flat().filter(v=>Number.isFinite(v));
  const zMin=dv.length?Math.min(...dv):0, zMax=dv.length?Math.max(...dv):1;
  const tNorm=v=>Math.max(0,Math.min(1,(Number(v)-zMin)/((zMax-zMin)||1)));
  const colorAt=v=>mapColor(tNorm(v));
  const W=580,H=340,pL=62,pR=72,pT=14,pB=48,plotW=W-pL-pR,plotH=H-pT-pB;
  const xTickIdx=Array.from({length:Math.min(6,colCount)},(_,i)=>Math.round((i*(colCount-1))/Math.max(1,Math.min(6,colCount)-1)));
  const yTickIdx=Array.from({length:Math.min(6,rowCount)},(_,i)=>Math.round((i*(rowCount-1))/Math.max(1,Math.min(6,rowCount)-1)));

  const legend = (
    <g>
      <defs><linearGradient id="lgL" x1="0" y1="1" x2="0" y2="0">{[0,.25,.5,.75,1].map(t=><stop key={t} offset={`${t*100}%`} stopColor={colorAt(zMin+t*(zMax-zMin))}/>)}</linearGradient></defs>
      <rect x={W-58} y={pT} width={12} height={plotH} rx={2} fill="url(#lgL)" stroke="#d1d5db"/>
      {[0,.5,1].map(t=><text key={t} x={W-42} y={pT+(1-t)*plotH+3.5} fontSize="9" fill="#6b7280">{fmt(zMin+t*(zMax-zMin))}</text>)}
      <text x={W-50} y={pT-4} textAnchor="middle" fontSize="9" fill="#6b7280">{param.unit_w||"Z"}</text>
    </g>
  );

  const heatmap = () => {
    const cw=plotW/Math.max(1,colCount), ch=plotH/Math.max(1,rowCount);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full border border-gray-200 rounded bg-white" style={{height:290}}>
        <rect x={pL} y={pT} width={plotW} height={plotH} fill="#f9fafb" stroke="#d1d5db"/>
        {zForPlot.map((row,ri)=>row.map((v,ci)=>Number.isFinite(v)?<rect key={`${ri}-${ci}`} x={pL+ci*cw+.5} y={pT+ri*ch+.5} width={Math.max(1,cw-1)} height={Math.max(1,ch-1)} fill={colorAt(v)} rx={Math.min(2,cw*.1)}/>:null))}
        {Array.from({length:colCount+1},(_,i)=><line key={i} x1={pL+i*(plotW/colCount)} y1={pT} x2={pL+i*(plotW/colCount)} y2={pT+plotH} stroke="#fff" opacity=".3"/>)}
        {Array.from({length:rowCount+1},(_,i)=><line key={i} x1={pL} y1={pT+i*(plotH/rowCount)} x2={pL+plotW} y2={pT+i*(plotH/rowCount)} stroke="#fff" opacity=".3"/>)}
        {xTickIdx.map(idx=><text key={idx} x={pL+(idx+.5)*(plotW/colCount)} y={H-18} textAnchor="middle" fontSize="9" fill="#9ca3af">{fmt(x[idx])}</text>)}
        {yTickIdx.map(idx=><text key={idx} x={pL-6} y={pT+(idx+.5)*(plotH/rowCount)+3.5} textAnchor="end" fontSize="9" fill="#9ca3af">{fmt(y[idx])}</text>)}
        <text x={pL+plotW/2} y={H-4} textAnchor="middle" fontSize="10" fill="#6b7280">{param.unit_x||"X"}</text>
        <text x={14} y={pT+plotH/2} textAnchor="middle" fontSize="10" fill="#6b7280" transform={`rotate(-90 14 ${pT+plotH/2})`}>{param.unit_y||"Y"}</text>
        {legend}
      </svg>
    );
  };

  const surface = () => {
    const sx=plotW/Math.max(1,colCount+rowCount), sy=plotH/Math.max(1,colCount+rowCount), zScale=Math.max(14,plotH*.22);
    const pb=(ri,ci,v)=>{const nz=tNorm(v);return[(ci-ri)*sx,-(ci+ri)*sy-nz*zScale,nz];};
    let minPx=Infinity,maxPx=-Infinity,minPy=Infinity,maxPy=-Infinity;
    for(let ri=0;ri<rowCount;ri++) for(let ci=0;ci<colCount;ci++){const v=zForPlot[ri]?.[ci];if(!Number.isFinite(v))continue;const[px,py]=pb(ri,ci,v);if(px<minPx)minPx=px;if(px>maxPx)maxPx=px;if(py<minPy)minPy=py;if(py>maxPy)maxPy=py;}
    if(!Number.isFinite(minPx)){minPx=0;maxPx=1;minPy=-1;maxPy=0;}
    const dx=(pL+plotW/2)-(minPx+maxPx)/2, dy=(pT+plotH/2)-(minPy+maxPy)/2;
    const proj=(ri,ci,v)=>{const[px,py]=pb(ri,ci,v);return[px+dx,py+dy];};
    const bands=[];
    for(let ri=0;ri<rowCount-1;ri++){const top=[],bot=[],vals=[];for(let ci=0;ci<colCount;ci++){const vT=zForPlot[ri]?.[ci],vB=zForPlot[ri+1]?.[ci];if(!Number.isFinite(vT)||!Number.isFinite(vB))continue;top.push(`${proj(ri,ci,vT)[0]},${proj(ri,ci,vT)[1]}`);bot.push(`${proj(ri+1,ci,vB)[0]},${proj(ri+1,ci,vB)[1]}`);vals.push(vT,vB);}if(top.length>=2)bands.push({key:`b${ri}`,pts:`${top.join(" ")} ${bot.reverse().join(" ")}`,color:colorAt(vals.reduce((a,b)=>a+b,0)/vals.length)});}
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full border border-gray-200 rounded bg-white" style={{height:290}}>
        <rect x={pL} y={pT} width={plotW} height={plotH} fill="#f8fafc" stroke="#d1d5db"/>
        {bands.map(b=><polygon key={b.key} points={b.pts} fill={b.color} fillOpacity=".78" stroke="none"/>)}
        {Array.from({length:rowCount},(_,ri)=><polyline key={ri} points={Array.from({length:colCount},(_,ci)=>{const v=zForPlot[ri]?.[ci],p=proj(ri,ci,Number.isFinite(v)?v:zMin);return`${p[0]},${p[1]}`;}).join(" ")} fill="none" stroke="#0f172a" strokeOpacity=".4" strokeWidth="1"/>)}
        {Array.from({length:colCount},(_,ci)=><polyline key={ci} points={Array.from({length:rowCount},(_,ri)=>{const v=zForPlot[ri]?.[ci],p=proj(ri,ci,Number.isFinite(v)?v:zMin);return`${p[0]},${p[1]}`;}).join(" ")} fill="none" stroke="#0f172a" strokeOpacity=".28" strokeWidth=".8"/>)}
        <text x={pL+plotW/2} y={H-4} textAnchor="middle" fontSize="10" fill="#6b7280">{param.unit_x||"X"}</text>
        <text x={14} y={pT+plotH/2} textAnchor="middle" fontSize="10" fill="#6b7280" transform={`rotate(-90 14 ${pT+plotH/2})`}>{param.unit_y||"Y"}</text>
        {legend}
      </svg>
    );
  };

  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-mono font-semibold text-gray-800 truncate">{param.name}</p>
          <p className="text-[11px] text-gray-500 truncate">{param.long_name||param.long_identifier}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">X:{param.unit_x||"–"} · Y:{param.unit_y||"–"} · Z:{param.unit_w||"–"} · {rowCount}×{colCount}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex rounded border border-gray-300 overflow-hidden text-[10px]">
            {["heatmap","surface"].map(m=><button key={m} onClick={()=>setMode(m)} className={`px-2.5 py-0.5 ${mode===m?"bg-gray-800 text-white":"bg-white text-gray-600 hover:bg-gray-50"}`}>{m==="heatmap"?"Heatmap":"3D"}</button>)}
          </div>
          {zIsFlat && <button onClick={()=>setFlatAssist(v=>!v)} className={`text-[10px] px-2 py-0.5 rounded border ${flatAssist?"bg-amber-100 border-amber-300 text-amber-900":"bg-white border-gray-300 text-gray-600"}`}>Assist {flatAssist?"ON":"OFF"}</button>}
        </div>
      </div>
      {!hasData
        ? <div className="flex items-center justify-center h-48 bg-gray-50 border border-gray-200 rounded text-xs text-gray-400">No plottable data</div>
        : <>{zIsFlat&&<p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">Flat map: all Z={zMinRaw}. Assist ON adds synthetic contrast.</p>}{mode==="heatmap"?heatmap():surface()}</>
      }
    </div>
  );
}

// ─── Scalar gauge ─────────────────────────────────────────────────────────────
function ScalarGauge({ label }) {
  if (!label) return null;
  const val = Number(label.value ?? 0);
  const lo  = Number(label.lower_limit ?? 0);
  const hi  = Number(label.upper_limit ?? 1);
  const range = hi - lo || 1;
  const pct = Math.max(0, Math.min(1, (val - lo) / range));
  const outOfRange = val < lo || val > hi;
  const W = 540, barH = 26, pL = 64, pR = 20, barY = 70;
  const barW = W - pL - pR;
  const valX = pL + pct * barW;
  return (
    <div className="p-4">
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-mono font-bold text-gray-900">
          {Number.isFinite(val) ? val.toFixed(5) : "—"}
        </span>
        <span className="text-sm text-gray-500">{label.unit || ""}</span>
        {outOfRange && (
          <span className="text-xs text-red-600 font-semibold bg-red-50 border border-red-200 px-2 py-0.5 rounded">
            OUT OF RANGE
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} 120`} className="w-full" style={{height: 90}}>
        <rect x={pL} y={barY} width={barW} height={barH} rx={4} fill="#e5e7eb"/>
        <rect x={pL} y={barY} width={pct * barW} height={barH} rx={4}
          fill={outOfRange ? "#ef4444" : "#2563eb"} opacity="0.85"/>
        <line x1={valX} y1={barY - 8} x2={valX} y2={barY + barH + 8}
          stroke={outOfRange ? "#dc2626" : "#1d4ed8"} strokeWidth="2"/>
        <text x={pL} y={barY - 12} textAnchor="middle" fontSize="10" fill="#6b7280">{lo.toFixed(2)}</text>
        <text x={pL + barW} y={barY - 12} textAnchor="middle" fontSize="10" fill="#6b7280">{hi.toFixed(2)}</text>
        <text x={valX} y={barY + barH + 20} textAnchor="middle" fontSize="10"
          fill={outOfRange ? "#dc2626" : "#2563eb"} fontWeight="600">{val.toFixed(4)}</text>
        <text x={pL - 4} y={barY + barH / 2 + 4} textAnchor="end" fontSize="9" fill="#9ca3af">min</text>
        <text x={pL + barW + 4} y={barY + barH / 2 + 4} textAnchor="start" fontSize="9" fill="#9ca3af">max</text>
      </svg>
      <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-50 rounded p-2 border border-gray-100">
          <span className="text-gray-400">Lower limit </span>
          <span className="font-mono font-semibold text-gray-700">{lo} {label.unit || ""}</span>
        </div>
        <div className="bg-gray-50 rounded p-2 border border-gray-100">
          <span className="text-gray-400">Upper limit </span>
          <span className="font-mono font-semibold text-gray-700">{hi} {label.unit || ""}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Data tab ─────────────────────────────────────────────────────────────────
function DataTab({ label }) {
  if (!label) return null;
  const type = label.type || label._type;
  if (type === "scalar") {
    return (
      <div className="p-4 space-y-3 text-xs">
        <div className="grid grid-cols-[160px_1fr] gap-y-2 font-mono">
          {[
            ["Current value", `${label.value ?? "—"} ${label.unit || ""}`],
            ["Lower limit",   `${label.lower_limit ?? "—"} ${label.unit || ""}`],
            ["Upper limit",   `${label.upper_limit ?? "—"} ${label.unit || ""}`],
            ["Out of range",  label.out_of_range ? "YES" : "No"],
          ].map(([k, v]) => (
            <React.Fragment key={k}>
              <span className="text-gray-400">{k}</span>
              <span className={`font-semibold ${k === "Out of range" && label.out_of_range ? "text-red-600" : "text-gray-800"}`}>{v}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }
  if (type === "curve") {
    const xVals = label.x_axis || [];
    const yVals = label.values || [];
    const n = Math.max(xVals.length, yVals.length);
    return (
      <div className="overflow-auto" style={{maxHeight: 420}}>
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="px-3 py-1.5 text-left border border-gray-200 text-gray-600 font-semibold">
                X [{label.unit_x || "—"}]
              </th>
              <th className="px-3 py-1.5 text-left border border-gray-200 text-gray-600 font-semibold">
                Y [{label.unit || label.unit_w || "—"}]
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="px-3 py-0.5 border border-gray-100 tabular-nums">{fmt(xVals[i])}</td>
                <td className="px-3 py-0.5 border border-gray-100 tabular-nums">{fmt(yVals[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  // Map
  const zRows = (label.values || []).filter(r => Array.isArray(r));
  const xAxis = label.x_axis || [];
  const yAxis = label.y_axis || [];
  const fv    = zRows.flat().filter(v => Number.isFinite(Number(v)));
  const zMin  = fv.length ? Math.min(...fv.map(Number)) : 0;
  const zMax  = fv.length ? Math.max(...fv.map(Number)) : 1;
  const tNorm = v => Math.max(0, Math.min(1, (Number(v) - zMin) / ((zMax - zMin) || 1)));
  return (
    <div className="overflow-auto" style={{maxHeight: 420}}>
      <table className="text-[10px] font-mono border-collapse">
        <thead className="bg-gray-100 sticky top-0">
          <tr>
            <th className="px-2 py-1 border border-gray-200 text-gray-500 font-semibold whitespace-nowrap">
              {label.unit_y || "Y"} \ {label.unit_x || "X"}
            </th>
            {xAxis.map((x, i) => (
              <th key={i} className="px-2 py-1 border border-gray-200 text-gray-600 whitespace-nowrap">{fmt(x)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zRows.map((row, ri) => (
            <tr key={ri}>
              <td className="px-2 py-0.5 border border-gray-100 bg-gray-50 text-gray-500 font-semibold whitespace-nowrap">
                {fmt(yAxis[ri])}
              </td>
              {row.map((v, ci) => {
                const t   = tNorm(v);
                const bg  = mapColor(t);
                const col = t > 0.55 ? "#111" : "#fff";
                return (
                  <td key={ci} className="px-1.5 py-0.5 border border-gray-100 tabular-nums text-right"
                    style={{ background: bg, color: col, minWidth: 36 }}>
                    {fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Maturity tab ─────────────────────────────────────────────────────────────
function MaturityTab({ label, onSaveMaturity }) {
  const [saving,       setSaving]       = useState(false);
  const [pendingScore, setPendingScore] = useState(null);
  const [note,         setNote]         = useState("");
  if (!label) return null;
  const score   = label.maturity_score || 0;
  const history = label.maturity_history || [];
  const milestones = [
    { pct: 25,  desc: "Initial values documented" },
    { pct: 50,  desc: "Reviewed by deputy owner" },
    { pct: 75,  desc: "Approved by Engineering Manager" },
    { pct: 100, desc: "Released & locked for production" },
  ];
  const barColor = score >= 100 ? "#059669" : score >= 75 ? "#d97706" : score >= 50 ? "#2563eb" : "#6b7280";
  return (
    <div className="p-4 space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Maturity Score</span>
          <span className="text-2xl font-bold font-mono" style={{color: barColor}}>
            {score}<span className="text-sm font-normal text-gray-400"> / 100</span>
          </span>
        </div>
        <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{width: `${score}%`, background: barColor}}/>
          {[25, 50, 75].map(p => (
            <div key={p} className="absolute top-0 bottom-0 w-px bg-white opacity-60" style={{left: `${p}%`}}/>
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-gray-400 mt-0.5 px-0.5">
          {[0, 25, 50, 75, 100].map(p => <span key={p}>{p}%</span>)}
        </div>
      </div>
      <div className="space-y-3">
        {milestones.map(m => {
          const done = score >= m.pct;
          const hist = history.find(h => h.score === m.pct);
          return (
            <div key={m.pct} className="flex items-start gap-3">
              <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 text-[9px] font-bold ${
                done ? "bg-green-500 border-green-500 text-white" : "bg-white border-gray-300 text-gray-300"
              }`}>
                {done ? "✓" : ""}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold ${done ? "text-gray-800" : "text-gray-400"}`}>{m.pct}%</span>
                  <span className={`text-xs ${done ? "text-gray-600" : "text-gray-400"}`}>{m.desc}</span>
                </div>
                {hist && (
                  <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
                    {hist.date} · {hist.user}{hist.status ? ` · ${hist.status}` : ""}
                  </div>
                )}
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                done ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-50 text-gray-400 border border-gray-200"
              }`}>
                {done ? "DONE" : "PENDING"}
              </span>
            </div>
          );
        })}
      </div>
      {history.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">History</p>
          <div className="border border-gray-100 rounded overflow-hidden">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] px-2 py-1 bg-white border-b border-gray-100 last:border-0">
                <span className="font-mono font-bold text-gray-700 w-8">{h.score}%</span>
                <span className="text-gray-500">{h.date}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-600">{h.user}</span>
                {h.note && <span className="text-gray-400 italic truncate max-w-[120px]">{h.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ── Set score ──────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4 space-y-2">
        <p className="text-xs font-semibold text-gray-600">Set Maturity Score</p>
        <div className="flex gap-2 flex-wrap">
          {[0, 25, 50, 75, 100].map(s => (
            <button
              key={s}
              disabled={saving}
              onClick={async () => {
                if (!onSaveMaturity) return;
                setPendingScore(s);
                setSaving(true);
                try { await onSaveMaturity(label.name, s, note); setNote(""); }
                finally { setSaving(false); setPendingScore(null); }
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded border transition-colors disabled:opacity-50 ${
                score === s
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {saving && pendingScore === s ? "…" : `${s}%`}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional note…"
          rows={2}
          className="w-full border border-gray-200 rounded px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
    </div>
  );
}

// ─── Info tab ─────────────────────────────────────────────────────────────────
function InfoTab({ label, onSaveMeta }) {
  const [editing, setEditing] = useState(false);
  const [form,    setForm]    = useState({ owner: "", deputy: "", comment: "", user_status: "START" });
  const [saving,  setSaving]  = useState(false);
  if (!label) return null;
  const type = label.type || label._type;

  const startEdit = () => {
    setForm({
      owner:       label.owner       || "",
      deputy:      label.deputy      || "",
      comment:     label.comment     || "",
      user_status: label.user_status || "START",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!onSaveMeta) return;
    setSaving(true);
    try { await onSaveMeta(label.name, form); setEditing(false); }
    finally { setSaving(false); }
  };

  const readOnlyRows = [
    ["Name",             label.name],
    ["Long Identifier",  label.long_identifier || label.long_name || "—"],
    ["Type",             (type || "—").toUpperCase() + (label.value_preview ? ` · ${label.value_preview}` : "")],
    ["Unit (Z / Value)", label.unit             || "—"],
    ["Unit (X axis)",    label.unit_x           || "—"],
    ["Unit (Y axis)",    label.unit_y           || "—"],
    ["Lower Limit",      label.lower_limit      ?? "—"],
    ["Upper Limit",      label.upper_limit      ?? "—"],
    ["Address",          label.address          || "—"],
    ["Function",         label.function         || "—"],
    ["In A2L",           label.in_a2l  ? "Yes" : "No"],
    ["In DCM",           label.in_dcm  ? "Yes" : "No"],
    ["Out of Range",     label.out_of_range ? "YES" : "No"],
    ["System Status",    label.system_status    || "—"],
    ["Maturity Score",   `${label.maturity_score || 0} / 100`],
    ["Last Modified",    label.last_modified ? new Date(label.last_modified).toLocaleString() : "—"],
  ];

  const editableFields = [
    { key: "Owner",       field: "owner",       ft: "text"     },
    { key: "Deputy",      field: "deputy",      ft: "text"     },
    { key: "User Status", field: "user_status", ft: "select",  opts: ["START", "IN_PROGRESS", "DONE", "APPROVED"] },
    { key: "Comment",     field: "comment",     ft: "textarea" },
  ];

  return (
    <div className="p-2 overflow-auto space-y-3">
      {/* ── Editable section ─────────────────────────────────────────────── */}
      <div className="border border-gray-200 rounded overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Editable Metadata</span>
          {!editing
            ? <button onClick={startEdit}
                className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded border border-blue-200 bg-white">
                Edit
              </button>
            : <div className="flex gap-1.5">
                <button onClick={() => setEditing(false)} disabled={saving}
                  className="text-[10px] px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="text-[10px] px-2 py-0.5 rounded border border-blue-500 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
          }
        </div>
        <table className="w-full text-[11px] border-collapse">
          <tbody>
            {editableFields.map(({ key, field, ft, opts }) => (
              <tr key={key} className="border-b border-gray-100 last:border-0">
                <td className="py-1.5 px-2 font-semibold text-gray-500 whitespace-nowrap w-28 align-middle">{key}</td>
                <td className="py-1.5 px-2 align-middle">
                  {!editing
                    ? <span className="font-mono text-gray-800">{label[field] || "—"}</span>
                    : ft === "select"
                      ? <select value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                          {opts.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      : ft === "textarea"
                        ? <textarea value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                            rows={2} className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-[11px] resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"/>
                        : <input value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                            className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400"/>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* ── Read-only metadata ───────────────────────────────────────────── */}
      <table className="w-full text-[11px] border-collapse">
        <tbody>
          {readOnlyRows.map(([k, v]) => (
            <tr key={k} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-1.5 px-2 font-semibold text-gray-500 whitespace-nowrap w-36 align-top">{k}</td>
              <td className="py-1.5 px-2 font-mono text-gray-800 break-all align-top">{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Compare helpers ──────────────────────────────────────────────────────────
function computeDelta(oldV, newV) {
  const o = parseFloat(oldV);
  const n = parseFloat(newV);
  if (!isFinite(o) || !isFinite(n)) return null;
  const delta = n - o;
  if (delta === 0) return null;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(5).replace(/\.?0+$/, "")}`;
}

// ─── Compare tab ──────────────────────────────────────────────────────────────
function CompareTab({ label, baseValue, baseSrId }) {
  const [baseDetail, setBaseDetail] = useState(null);
  const [loading,    setLoading]    = useState(false);

  useEffect(() => {
    if (!baseSrId || !label?.name) return;
    setLoading(true);
    api.get(`/v1/sw-releases/${baseSrId}/labels/${encodeURIComponent(label.name)}`)
      .then(r => setBaseDetail(r.data))
      .catch(() => setBaseDetail(null))
      .finally(() => setLoading(false));
  }, [baseSrId, label?.name]);

  if (loading) return <div className="p-4 text-xs text-gray-400">Loading base release data...</div>;
  if (!baseDetail) return <div className="p-4 text-xs text-gray-400">Not available in base release</div>;

  const type = label?.type || label?._type;

  if (type === "scalar") {
    const curr = parseFloat(label.value);
    const base = parseFloat(baseDetail.value);
    const delta = (isFinite(curr) && isFinite(base)) ? curr - base : null;
    return (
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-gray-200 rounded p-3">
            <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Base release</p>
            <p className="text-base font-mono text-gray-800">{baseDetail.value ?? "—"} {label.unit}</p>
          </div>
          <div className="border border-blue-300 rounded p-3 bg-blue-50">
            <p className="text-[10px] text-blue-700 uppercase font-semibold mb-1">Current release</p>
            <p className="text-base font-mono text-blue-900">{label.value ?? "—"} {label.unit}</p>
          </div>
        </div>
        {delta !== null && (
          <div className="text-center">
            <p className="text-[10px] text-gray-500 uppercase font-semibold">Delta</p>
            <p className={`text-sm font-mono font-semibold ${delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-700" : "text-gray-500"}`}>
              {delta > 0 ? "+" : ""}{delta.toFixed(5).replace(/\.?0+$/, "")} {label.unit}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (type === "curve") {
    const xCurr = label.x_axis || [];
    const yCurr = Array.isArray(label.values) ? (Array.isArray(label.values[0]) ? label.values[0] : label.values) : [];
    const yBase = Array.isArray(baseDetail.values) ? (Array.isArray(baseDetail.values[0]) ? baseDetail.values[0] : baseDetail.values) : [];
    const allY  = [...yCurr, ...yBase].filter(v => isFinite(v));
    if (allY.length === 0) return <div className="p-3 text-xs text-gray-400">No plottable data</div>;
    const yMin = Math.min(...allY), yMax = Math.max(...allY);
    const W = 540, H = 280, pL = 50, pR = 20, pT = 14, pB = 36;
    const plotW = W - pL - pR, plotH = H - pT - pB;
    const xS = i => pL + (xCurr.length > 1 ? (i / (xCurr.length - 1)) * plotW : plotW / 2);
    const yS = v => pT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
    const pathCurr = yCurr.map((v, i) => `${i === 0 ? "M" : "L"}${xS(i)},${yS(v)}`).join(" ");
    const pathBase = yBase.map((v, i) => `${i === 0 ? "M" : "L"}${xS(i)},${yS(v)}`).join(" ");
    return (
      <div className="p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full border border-gray-200 rounded bg-white" style={{height:240}}>
          <rect x={pL} y={pT} width={plotW} height={plotH} fill="#fafafa" stroke="#d1d5db"/>
          <path d={pathBase} fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="4 2"/>
          <path d={pathCurr} fill="none" stroke="#2563eb" strokeWidth="2"/>
          <text x={pL + plotW / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#6b7280">{label.unit_x || "X"}</text>
          <text x={14} y={pT + plotH / 2} textAnchor="middle" fontSize="10" fill="#6b7280"
            transform={`rotate(-90 14 ${pT + plotH / 2})`}>{label.unit_w || label.unit || "Y"}</text>
        </svg>
        <div className="flex gap-4 mt-2 text-[11px]">
          <span className="flex items-center gap-1">
            <span style={{width:14, height:0, borderTop:"2px dashed #9ca3af", display:"inline-block"}}/>
            Base release
          </span>
          <span className="flex items-center gap-1">
            <span style={{width:14, height:2, background:"#2563eb", display:"inline-block"}}/>
            Current release
          </span>
        </div>
      </div>
    );
  }

  if (type === "map") {
    return (
      <div className="p-3 text-xs text-gray-600">
        <p className="mb-2 font-semibold">Map comparison:</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-gray-200 rounded p-2">
            <p className="text-[10px] font-semibold text-gray-500 mb-1">BASE</p>
            <p className="font-mono text-[10px]">
              Dimensions: {Array.isArray(baseDetail.values) ? `${baseDetail.values.length}x${baseDetail.values[0]?.length || 0}` : "—"}
            </p>
            <p className="font-mono text-[10px]">
              Range: {(() => {
                const flat = (baseDetail.values || []).flat().filter(isFinite);
                return flat.length ? `${Math.min(...flat).toFixed(3)} to ${Math.max(...flat).toFixed(3)}` : "—";
              })()}
            </p>
          </div>
          <div className="border border-blue-300 rounded p-2 bg-blue-50">
            <p className="text-[10px] font-semibold text-blue-700 mb-1">CURRENT</p>
            <p className="font-mono text-[10px]">
              Dimensions: {Array.isArray(label.values) ? `${label.values.length}x${label.values[0]?.length || 0}` : "—"}
            </p>
            <p className="font-mono text-[10px]">
              Range: {(() => {
                const flat = (label.values || []).flat().filter(isFinite);
                return flat.length ? `${Math.min(...flat).toFixed(3)} to ${Math.max(...flat).toFixed(3)}` : "—";
              })()}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[10px] text-gray-400 italic">Full delta heatmap in next iteration.</p>
      </div>
    );
  }

  return null;
}

// ─── Chart panel (tabbed) ─────────────────────────────────────────────────────
function ChartPanel({ param, loading, onClose, onSaveMeta, onSaveMaturity, compareActive, baseValue, baseSrId }) {
  const [tab, setTab] = useState("chart");
  useEffect(() => { setTab("chart"); }, [param?.name]);
  if (!param && !loading) return null;
  const type = param?._type || param?.type;
  const TABS = [
    { id: "chart",    label: "Chart"    },
    { id: "data",     label: "Data"     },
    ...(compareActive ? [{ id: "compare", label: "Compare" }] : []),
    { id: "maturity", label: "Maturity" },
    { id: "info",     label: "Info"     },
  ];
  return (
    <div className="flex flex-col border-l border-gray-200 bg-white overflow-hidden shrink-0" style={{width:600,minWidth:600}}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
        {param && !loading && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${
            type === "curve" ? "bg-blue-100 text-blue-700" :
            type === "map"   ? "bg-violet-100 text-violet-700" :
                               "bg-gray-100 text-gray-600"
          }`}>{type || "—"}</span>
        )}
        <span className="flex-1 text-[11px] font-mono font-semibold text-gray-800 truncate min-w-0">
          {loading ? "Loading…" : (param?.name || "")}
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1 shrink-0">×</button>
      </div>
      {/* Subtitle */}
      {param && !loading && (param.long_identifier || param.long_name) && (
        <div className="px-3 py-1 bg-gray-50 border-b border-gray-100 text-[10px] text-gray-500 truncate shrink-0">
          {param.long_identifier || param.long_name}
          {param.unit && <span className="ml-2 text-gray-400">· {param.unit}</span>}
          {param.lower_limit != null && (
            <span className="ml-2 text-gray-400">· [{param.lower_limit} … {param.upper_limit}]</span>
          )}
        </div>
      )}
      {/* Tabs */}
      {!loading && param && (
        <div className="flex border-b border-gray-200 bg-white shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 text-[11px] font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? "border-blue-500 text-blue-700 bg-blue-50/40"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-32 text-xs text-gray-400">
            Loading parameter data…
          </div>
        )}
        {!loading && param && tab === "chart" && (
          type === "curve" ? <CurveChart param={param} /> :
          type === "map"   ? <MapChart param={param} />   :
                             <ScalarGauge label={param} />
        )}
        {!loading && param && tab === "data"     && <DataTab label={param} />}
        {!loading && param && tab === "compare"  && <CompareTab label={param} baseValue={baseValue} baseSrId={baseSrId} />}
        {!loading && param && tab === "maturity" && <MaturityTab label={param} onSaveMaturity={onSaveMaturity} />}
        {!loading && param && tab === "info"     && <InfoTab label={param} onSaveMeta={onSaveMeta} />}
      </div>
    </div>
  );
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
const SYS_STATUS = {
  DOC_OK:      { cls: "bg-green-50 text-green-700 border-green-200",   label: "DOC_OK"     },
  WARNING:     { cls: "bg-amber-50 text-amber-700 border-amber-200",   label: "WARNING"    },
  MISSING_A2L: { cls: "bg-orange-50 text-orange-700 border-orange-200",label: "NO A2L"     },
  MISSING_DCM: { cls: "bg-blue-50 text-blue-700 border-blue-200",      label: "NO DCM"     },
  ERROR:       { cls: "bg-red-50 text-red-700 border-red-200",         label: "ERROR"      },
};
const USER_STATUS = {
  START:       { cls: "bg-gray-100 text-gray-600",   label: "START"       },
  IN_PROGRESS: { cls: "bg-blue-50 text-blue-700",    label: "IN PROGRESS" },
  DONE:        { cls: "bg-green-50 text-green-700",  label: "DONE"        },
  APPROVED:    { cls: "bg-emerald-50 text-emerald-700", label: "APPROVED" },
};
const TYP_ICON = {
  scalar: <span title="Scalar"   className="text-gray-500 font-bold text-[10px] select-none">S</span>,
  curve:  <span title="Curve"    className="text-blue-500 font-bold text-[11px] select-none">~</span>,
  map:    <span title="Map"      className="text-violet-500 font-bold text-[10px] select-none">▦</span>,
};

function SortHeader({ col, label, sortCol, sortDir, onSort, className = "" }) {
  const active = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-2 py-1.5 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200 cursor-pointer select-none hover:bg-gray-200 ${className}`}
      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >
      {label}
      {active && <span className="ml-0.5 text-gray-400">{sortDir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

function sortItems(items, col, dir) {
  return [...items].sort((a, b) => {
    const av = a[col] ?? "", bv = b[col] ?? "";
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return dir === "asc" ? cmp : -cmp;
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 100;

export default function SwReleaseLabelViewer() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const [allLabels,     setAllLabels]     = useState([]);
  const [summary,       setSummary]       = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [loadMsg,       setLoadMsg]       = useState("Parsing A2L + DCM files…");
  const [error,         setError]         = useState(null);

  // Filters
  const [search,         setSearch]         = useState("");
  const [filterType,     setFilterType]     = useState("");
  const [filterFunction, setFilterFunction] = useState("");
  const [filterStatus,   setFilterStatus]   = useState("");

  // Sort
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  // Pagination
  const [page, setPage] = useState(0);

  // Chart panel
  const [selectedParam, setSelectedParam] = useState(null);
  const [chartLoading,  setChartLoading]  = useState(false);

  // Phase 5 — toolbar
  const [reloadKey,      setReloadKey]      = useState(0);
  const [quickFilter,    setQuickFilter]    = useState("");
  const [compareId,      setCompareId]      = useState("");
  const [baseLabels,     setBaseLabels]     = useState({});
  const [compareLoading, setCompareLoading] = useState(false);
  const [swReleases,     setSwReleases]     = useState([]);

  // Export DCM modal
  const [showExportDcmModal,    setShowExportDcmModal]    = useState(false);
  const [exportFilters,         setExportFilters]         = useState({ scope: "saved", maturity: [], filename: "" });
  const [exporting,             setExporting]             = useState(false);

  // Missing DCM default assignment modal
  const [showDefaultAssignModal, setShowDefaultAssignModal] = useState(false);

  // SW Release info + upload
  const [swReleaseInfo,  setSwReleaseInfo]  = useState(null);
  const [uploadingA2l,   setUploadingA2l]   = useState(false);
  const [uploadingDcm,   setUploadingDcm]   = useState(false);
  const a2lUploadRef = useRef(null);
  const dcmUploadRef = useRef(null);

  // ── Fetch SW Release info ─────────────────────────────────────────────────────
  useEffect(() => {
    api.get(`/v1/sw-releases/${id}`)
      .then(r => setSwReleaseInfo(r.data))
      .catch(() => {});
  }, [id, reloadKey]);

  // ── Fetch SW Releases for compare dropdown ───────────────────────────────────
  useEffect(() => {
    api.get("/v1/sw-releases").then(r => setSwReleases(r.data || [])).catch(() => {});
  }, []);

  // ── Fetch labels ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setLoadMsg("Parsing A2L + DCM files… (first load may take a few seconds)");
      try {
        const [labelsRes, sumRes] = await Promise.all([
          api.get(`/v1/sw-releases/${id}/labels/merged`, { params: { limit: 2000, offset: 0 } }),
          api.get(`/v1/sw-releases/${id}/labels/summary`),
        ]);
        if (!cancelled) {
          setAllLabels(labelsRes.data.items || []);
          setSummary(sumRes.data);
        }
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.detail || e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, reloadKey]);

  useEffect(() => { setPage(0); }, [search, filterType, filterFunction, filterStatus, quickFilter, sortCol, sortDir]);

  // ── Filtered + sorted labels ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = allLabels;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(l => l.name.toLowerCase().includes(q) || (l.long_identifier||"").toLowerCase().includes(q));
    }
    if (filterType)     r = r.filter(l => l.type          === filterType);
    if (filterFunction) r = r.filter(l => l.function       === filterFunction);
    if (filterStatus)   r = r.filter(l => l.system_status  === filterStatus);
    if (quickFilter === "out_of_range") r = r.filter(l => l.out_of_range);
    if (quickFilter === "missing_dcm")  r = r.filter(l => !l.in_dcm);
    if (quickFilter === "missing_a2l")  r = r.filter(l => !l.in_a2l);
    if (quickFilter === "saved")        r = r.filter(l => l.save);
    if (quickFilter === "changed")      r = r.filter(l => baseLabels[l.name] !== undefined && baseLabels[l.name] !== l.value_preview);
    return sortItems(r, sortCol, sortDir);
  }, [allLabels, search, filterType, filterFunction, filterStatus, quickFilter, baseLabels, sortCol, sortDir]);

  const pageItems  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // Unique functions for dropdown
  const functionList = useMemo(() => {
    const s = new Set(allLabels.map(l => l.function).filter(Boolean));
    return Array.from(s).sort();
  }, [allLabels]);

  // ── Sort handler ─────────────────────────────────────────────────────────────
  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  // ── Chart detail ─────────────────────────────────────────────────────────────
  const openDetail = async (label) => {
    setChartLoading(true);
    setSelectedParam({ _type: label.type, type: label.type, name: label.name, long_name: label.long_identifier });
    try {
      const { data } = await api.get(`/v1/sw-releases/${id}/labels/${encodeURIComponent(label.name)}`);
      setSelectedParam({ ...data, _type: data.type, long_name: data.long_identifier || data.long_name });
    } catch (e) {
      console.error(e);
      setSelectedParam(null);
    } finally {
      setChartLoading(false);
    }
  };

  // ── Metadata save ────────────────────────────────────────────────────────────
  const saveMeta = async (labelName, data) => {
    await api.put(`/v1/sw-releases/${id}/labels/${encodeURIComponent(labelName)}/metadata`, data);
    setAllLabels(prev => prev.map(l =>
      l.name === labelName ? { ...l, ...data } : l
    ));
    setSelectedParam(prev => prev ? { ...prev, ...data } : prev);
    toast.success("Metadata saved");
  };

  const saveMaturity = async (labelName, score, note) => {
    await api.put(`/v1/sw-releases/${id}/labels/${encodeURIComponent(labelName)}/maturity`, { score, note });
    const entry = { score, note, user: "me", date: new Date().toISOString().slice(0, 10) };
    setAllLabels(prev => prev.map(l =>
      l.name === labelName ? { ...l, maturity_score: score } : l
    ));
    setSelectedParam(prev => prev ? {
      ...prev,
      maturity_score:   score,
      maturity_history: [...(prev.maturity_history || []), entry],
    } : prev);
    toast.success(`Maturity → ${score}%`);
  };

  // ── Phase 5 handlers ─────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ["Name","Type","System Status","Maturity","Value or Dim","Owner","Deputy","Function","User Status","Comment","In A2L","In DCM","Out of Range"];
    const rows = filtered.map(l => [
      l.name, l.type, l.system_status, l.maturity_score ?? 0,
      l.value_preview ?? "", l.owner ?? "", l.deputy ?? "",
      l.function ?? "", l.user_status ?? "", l.comment ?? "",
      l.in_a2l ? "Y" : "N", l.in_dcm ? "Y" : "N", l.out_of_range ? "Y" : "N",
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `labels_${id}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} labels to CSV`);
  };

  const toggleSave = async (label) => {
    const newSave = !label.save;
    try {
      await api.put(`/v1/sw-releases/${id}/labels/${encodeURIComponent(label.name)}/metadata`, { save: newSave });
      setAllLabels(prev => prev.map(l => l.name === label.name ? { ...l, save: newSave } : l));
      if (selectedParam?.name === label.name) setSelectedParam(prev => prev ? { ...prev, save: newSave } : prev);
    } catch (e) {
      toast.error("Failed to update save flag");
    }
  };

  const loadCompare = async (srId) => {
    setCompareLoading(true);
    try {
      const { data } = await api.get(`/v1/sw-releases/${srId}/labels/merged`, { params: { limit: 2000, offset: 0 } });
      const map = {};
      (data.items || []).forEach(l => { map[l.name] = l.value_preview ?? null; });
      setBaseLabels(map);
    } catch (e) {
      toast.error("Failed to load base release labels");
      setCompareId("");
    } finally {
      setCompareLoading(false);
    }
  };

  const clearCompare = () => {
    setCompareId(""); setBaseLabels({}); if (quickFilter === "changed") setQuickFilter("");
  };

  const exportDCM = async () => {
    setExporting(true);
    try {
      let label_names = null;
      if (exportFilters.scope === "filtered") label_names = filtered.map(l => l.name);
      else if (exportFilters.scope === "all")  label_names = allLabels.map(l => l.name);
      const body = {
        label_names,
        only_saved:    exportFilters.scope === "saved",
        only_maturity: exportFilters.maturity.length ? exportFilters.maturity : null,
        filename:      exportFilters.filename || undefined,
      };
      const resp = await api.post(`/v1/sw-releases/${id}/labels/export-dcm`, body, { responseType: "blob" });
      const blob = new Blob([resp.data], { type: "application/octet-stream" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = exportFilters.filename || `export_${new Date().toISOString().slice(0, 10)}.dcm`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("DCM exported");
      setShowExportDcmModal(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // ── Upload handlers ──────────────────────────────────────────────────────────
  const uploadA2L = async (file) => {
    if (!file) return;
    setUploadingA2l(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/v1/sw-releases/${id}/a2l/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("A2L uploaded");
      setReloadKey(k => k + 1);
      const r = await api.get(`/v1/sw-releases/${id}`);
      setSwReleaseInfo(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "A2L upload failed");
    } finally {
      setUploadingA2l(false);
    }
  };

  const uploadDCM = async (file) => {
    if (!file) return;
    setUploadingDcm(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/v1/sw-releases/${id}/dcm/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("DCM uploaded");
      setReloadKey(k => k + 1);
      const r = await api.get(`/v1/sw-releases/${id}`);
      setSwReleaseInfo(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "DCM upload failed");
    } finally {
      setUploadingDcm(false);
    }
  };

  // ── Loading / error ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-xs text-gray-500">{loadMsg}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8 max-w-lg">
        <div className="mb-4 p-4 rounded border border-red-300 bg-red-50">
          <p className="font-semibold text-sm text-red-800 mb-1">Error loading labels</p>
          <p className="text-xs text-red-700">{error}</p>
        </div>
        <button onClick={() => navigate(-1)} className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-xs">Back</button>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 130px)" }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 px-3 py-2 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <button onClick={() => navigate("/software-releases")}
            className="text-xs text-gray-500 hover:text-gray-800 shrink-0 mt-0.5">
            Back
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm font-bold text-gray-900 leading-tight">
                {swReleaseInfo?.identifier || swReleaseInfo?.version || "Release"}
                {swReleaseInfo?.version ? ` · v${swReleaseInfo.version}` : ""}
              </h1>
              {swReleaseInfo?.status && (
                <span className="text-[10px] px-1.5 py-px rounded bg-gray-100 text-gray-700 font-semibold">
                  {swReleaseInfo.status}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 truncate">
              {swReleaseInfo?.supplier ? `${swReleaseInfo.supplier} · ` : ""}
              A2L: {swReleaseInfo?.a2l_path ? "loaded" : "not uploaded"}
              {" · "}
              DCM: {swReleaseInfo?.dcm_path ? "loaded" : "not uploaded"}
            </p>
          </div>
        </div>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); }}
          placeholder="Search name / description…"
          className="border border-gray-300 rounded px-2.5 py-1 text-xs w-60 focus:outline-none focus:ring-1 focus:ring-blue-400 shrink-0"
        />
      </div>

      {/* ── Toolbar ribbon ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-white shrink-0 flex-wrap">
        <button onClick={exportCSV}
          className="text-[11px] font-semibold px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors">
          Export CSV
        </button>
        <button onClick={() => setShowExportDcmModal(true)}
          className="text-[11px] font-semibold px-2.5 py-1 rounded border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
          Export DCM
        </button>
        <button onClick={() => { setReloadKey(k => k + 1); setSelectedParam(null); }}
          className="text-[11px] font-semibold px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors">
          Reload
        </button>
        <div className="w-px h-4 bg-gray-200"/>
        <input ref={a2lUploadRef} type="file" accept=".a2l,.A2L" style={{display:"none"}}
          onChange={e => uploadA2L(e.target.files?.[0])} />
        <input ref={dcmUploadRef} type="file" accept=".dcm,.DCM" style={{display:"none"}}
          onChange={e => uploadDCM(e.target.files?.[0])} />
        <button onClick={() => a2lUploadRef.current?.click()} disabled={uploadingA2l}
          className="text-[11px] font-semibold px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50 transition-colors">
          {uploadingA2l ? "Uploading..." : (swReleaseInfo?.a2l_path ? "Replace A2L" : "Upload A2L")}
        </button>
        <button onClick={() => dcmUploadRef.current?.click()} disabled={uploadingDcm}
          className="text-[11px] font-semibold px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50 transition-colors">
          {uploadingDcm ? "Uploading..." : (swReleaseInfo?.dcm_path ? "Replace DCM" : "Upload DCM")}
        </button>
        <button onClick={() => navigate(`/software-releases/${id}/merge`)}
          className="text-[11px] font-semibold px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors">
          Merge
        </button>
        <div className="w-px h-4 bg-gray-200"/>
        <span className="text-[10px] text-gray-500 font-semibold shrink-0">Compare with:</span>
        <select
          value={compareId}
          onChange={e => {
            const v = e.target.value;
            setCompareId(v);
            if (v) loadCompare(v); else clearCompare();
          }}
          className="border border-gray-300 rounded px-1.5 py-0.5 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-[220px]"
        >
          <option value="">— none —</option>
          {swReleases.filter(r => String(r._id || r.id) !== id).map(r => (
            <option key={r._id || r.id} value={r._id || r.id}>
              {r.version || r.name || r._id}
            </option>
          ))}
        </select>
        {compareLoading && <span className="text-[10px] text-gray-400 animate-pulse">Loading…</span>}
        {compareId && !compareLoading && (
          <>
            <span className="text-[10px] text-emerald-600 font-medium">
              {Object.keys(baseLabels).length} base labels
            </span>
            <button onClick={clearCompare} className="text-[10px] text-red-400 hover:text-red-600">Clear</button>
          </>
        )}
      </div>

      {/* ── Summary bar ──────────────────────────────────────────────────────── */}
      {summary && (
        <div className="flex items-center gap-4 px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-[10px] text-gray-500 shrink-0 flex-wrap">
          <span className="font-semibold text-gray-700">{summary.total?.toLocaleString()} params</span>
          <span>Scalars: <b className="text-gray-700">{(summary.by_type?.scalar??0).toLocaleString()}</b></span>
          <span>Curves: <b className="text-gray-700">{summary.by_type?.curve??0}</b></span>
          <span>Maps: <b className="text-gray-700">{summary.by_type?.map??0}</b></span>
          {summary.out_of_range > 0 && <span className="text-amber-600 font-medium">{summary.out_of_range} out of range</span>}
          {summary.missing_a2l  > 0 && <span className="text-orange-600">{summary.missing_a2l} no A2L</span>}
          {summary.missing_dcm  > 0 && <span className="text-blue-600">{summary.missing_dcm} no DCM</span>}
          {filtered.length < allLabels.length && (
            <span className="ml-auto text-blue-600 font-medium">Filtered: {filtered.length.toLocaleString()}</span>
          )}
        </div>
      )}

      {/* ── Missing DCM warning banner ───────────────────────────────────────── */}
      {quickFilter === "missing_dcm" && filtered.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 flex items-center justify-between text-xs shrink-0">
          <span className="text-amber-800">
            {filtered.length} labels in A2L but missing DCM value.
          </span>
          <button onClick={() => setShowDefaultAssignModal(true)}
            className="text-[11px] px-2.5 py-0.5 bg-amber-600 text-white rounded hover:bg-amber-700">
            Assign defaults…
          </button>
        </div>
      )}

      {/* ── Filter bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-white shrink-0 flex-wrap">
        <label className="text-[10px] text-gray-500 font-semibold">FILTER:</label>
        {/* Type */}
        <select value={filterType} onChange={e=>setFilterType(e.target.value)}
          className="border border-gray-300 rounded px-1.5 py-0.5 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
          <option value="">All Types</option>
          <option value="scalar">Scalar</option>
          <option value="curve">Curve</option>
          <option value="map">Map</option>
        </select>
        {/* Function */}
        <select value={filterFunction} onChange={e=>setFilterFunction(e.target.value)}
          className="border border-gray-300 rounded px-1.5 py-0.5 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
          <option value="">All Functions</option>
          {functionList.map(fn => <option key={fn} value={fn}>{fn}</option>)}
        </select>
        {/* System Status */}
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded px-1.5 py-0.5 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
          <option value="">All Status</option>
          <option value="DOC_OK">DOC_OK</option>
          <option value="WARNING">WARNING</option>
          <option value="MISSING_A2L">Missing A2L</option>
          <option value="MISSING_DCM">Missing DCM</option>
        </select>
        {/* Clear */}
        {(filterType||filterFunction||filterStatus||search) &&
          <button onClick={()=>{setFilterType("");setFilterFunction("");setFilterStatus("");setSearch("");}}
            className="text-[10px] text-red-500 hover:text-red-700 ml-1">Clear</button>
        }
        <div className="w-px h-4 bg-gray-200 mx-1"/>
        {/* Quick filters */}
        {[
          { id: "",             label: "All"        },
          { id: "out_of_range", label: "OOR"         },
          { id: "missing_dcm",  label: "No DCM"      },
          { id: "missing_a2l",  label: "No A2L"      },
          { id: "saved",        label: "Saved"        },
          ...(compareId ? [{ id: "changed", label: "Changed" }] : []),
        ].map(q => (
          <button key={q.id} onClick={() => setQuickFilter(q.id)}
            className={`text-[10px] px-2 py-0.5 rounded border font-semibold transition-colors whitespace-nowrap ${
              quickFilter === q.id
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}>
            {q.label}
          </button>
        ))}
      </div>

      {/* ── Body: table + chart ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-w-0">
          <table className="w-full border-collapse" style={{ tableLayout: "fixed", fontSize: 10.5 }}>
            <colgroup>
              <col style={{width:28}}/>   {/* Typ */}
              <col style={{width:200}}/>  {/* Name */}
              <col style={{width:34}}/>   {/* Save */}
              <col style={{width:90}}/>   {/* Status */}
              <col style={{width:54}}/>   {/* Scor */}
              <col style={{width:108}}/> {/* Value or Dim */}
              <col style={{width:108}}/> {/* Value or Dim Old */}
              <col style={{width:64}}/>   {/* Flags */}
              <col style={{width:72}}/>   {/* Owner */}
              <col style={{width:72}}/>   {/* Deputy */}
              <col style={{width:90}}/>   {/* Function */}
              <col style={{width:60}}/>   {/* Fn Ver */}
              <col style={{width:84}}/>   {/* User Status */}
              <col/>                       {/* Comment */}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <th className="px-1 py-1.5 text-center text-[10px] font-bold text-gray-600 border-r border-gray-200 select-none" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Typ</th>
                <SortHeader col="name"           label="Name"           sortCol={sortCol} sortDir={sortDir} onSort={handleSort}/>
                <th className="px-1 py-1.5 text-center text-[10px] font-bold text-gray-600 border-r border-gray-200 select-none" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Save</th>
                <SortHeader col="system_status"  label="Status"         sortCol={sortCol} sortDir={sortDir} onSort={handleSort}/>
                <SortHeader col="maturity_score" label="Scor"           sortCol={sortCol} sortDir={sortDir} onSort={handleSort}/>
                <SortHeader col="value_preview"  label="Value or Dim"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort}/>
                <th className="px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 border-r border-gray-200 select-none" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Value Old</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-bold text-gray-600 border-r border-gray-200 select-none" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Flags</th>
                <SortHeader col="owner"          label="Owner"          sortCol={sortCol} sortDir={sortDir} onSort={handleSort}/>
                <SortHeader col="deputy"         label="Deputy"         sortCol={sortCol} sortDir={sortDir} onSort={handleSort}/>
                <SortHeader col="function"       label="Function"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort}/>
                <th className="px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 border-r border-gray-200 select-none" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Fn Ver</th>
                <SortHeader col="user_status"    label="User Status"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort}/>
                <th className="px-2 py-1.5 text-left text-[10px] font-bold text-gray-600 select-none" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Comment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((l, i) => {
                const isClickable = true;
                const isSelected  = selectedParam?.name === l.name;
                const sysS  = SYS_STATUS[l.system_status]  || SYS_STATUS.DOC_OK;
                const userS = USER_STATUS[l.user_status]   || USER_STATUS.START;
                return (
                  <tr
                    key={l.name}
                    onClick={() => openDetail(l)}
                    style={{ height: 22 }}
                    className={[
                      isSelected  ? "bg-blue-50 border-l-2 border-blue-500" : (i%2===0 ? "bg-white" : "bg-gray-50/50"),
                      isClickable ? "cursor-pointer hover:bg-blue-50/50" : "cursor-default",
                      "transition-colors",
                    ].join(" ")}
                  >
                    {/* Typ */}
                    <td className="px-1 py-0 text-center border-r border-gray-100">{TYP_ICON[l.type]}</td>
                    {/* Name */}
                    <td className="px-2 py-0 border-r border-gray-100 truncate">
                      <span style={{fontFamily:"'Consolas','Courier New',monospace",fontSize:11,color:isClickable?"#2563eb":"#1f2937"}}>
                        {l.name}
                      </span>
                    </td>
                    {/* Save (checkbox toggle) */}
                    <td className="px-1 py-0 text-center border-r border-gray-100"
                      onClick={e => { e.stopPropagation(); toggleSave(l); }}>
                      <input
                        type="checkbox"
                        checked={!!l.save}
                        onChange={e => { e.stopPropagation(); toggleSave(l); }}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: "pointer", width: 12, height: 12 }}
                        title={l.save ? "Saved — click to unsave" : "Click to save"}
                      />
                    </td>
                    {/* System Status */}
                    <td className="px-1.5 py-0 border-r border-gray-100">
                      <span className={`inline-block text-[9px] font-semibold px-1 py-px rounded border leading-tight ${sysS.cls}`}>
                        {sysS.label}
                      </span>
                    </td>
                    {/* Scor */}
                    <td className="px-2 py-0 text-right border-r border-gray-100 font-mono text-gray-600 tabular-nums">
                      {l.maturity_score || 0}
                    </td>
                    {/* Value or Dim */}
                    <td className="px-2 py-0 border-r border-gray-100 font-mono truncate text-gray-800">
                      {l.out_of_range
                        ? <span className="text-red-600">{l.value_preview}</span>
                        : l.value_preview ?? "—"
                      }
                    </td>
                    {/* Value or Dim Old (compare) */}
                    <td className="px-2 py-0 border-r border-gray-100 font-mono truncate">
                      {baseLabels[l.name] !== undefined ? (
                        <div className="flex items-baseline gap-1">
                          <span className={baseLabels[l.name] !== l.value_preview ? "text-amber-700" : "text-gray-400"}>
                            {baseLabels[l.name] ?? "—"}
                          </span>
                          {baseLabels[l.name] !== l.value_preview && (() => {
                            const d = computeDelta(baseLabels[l.name], l.value_preview);
                            return d ? <span className="text-[10px] text-amber-600">({d})</span> : null;
                          })()}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {/* Label Flags */}
                    <td className="px-1 py-0 border-r border-gray-100 text-[9px] text-gray-500 truncate">
                      {(l.label_flags||[]).join(", ") || ""}
                    </td>
                    {/* Owner */}
                    <td className="px-2 py-0 border-r border-gray-100 text-gray-600 truncate">{l.owner||""}</td>
                    {/* Deputy */}
                    <td className="px-2 py-0 border-r border-gray-100 text-gray-500 truncate">{l.deputy||""}</td>
                    {/* Function */}
                    <td className="px-2 py-0 border-r border-gray-100 text-gray-600 truncate font-mono">{l.function||""}</td>
                    {/* Function Version */}
                    <td className="px-2 py-0 border-r border-gray-100 text-gray-400 truncate">{l.function_version||""}</td>
                    {/* User Status */}
                    <td className="px-1.5 py-0 border-r border-gray-100">
                      <span className={`inline-block text-[9px] font-semibold px-1 py-px rounded leading-tight ${userS.cls}`}>
                        {userS.label}
                      </span>
                    </td>
                    {/* Comment */}
                    <td className="px-2 py-0 text-gray-400 truncate">{l.comment||""}</td>
                  </tr>
                );
              })}
              {pageItems.length === 0 && (
                <tr><td colSpan={14} className="py-8 text-center text-xs text-gray-400">No labels match your filters.</td></tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 bg-gray-50 text-[10px] text-gray-600 sticky bottom-0">
              <span>{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE, filtered.length)} / {filtered.length.toLocaleString()}</span>
              <div className="flex gap-1">
                <button disabled={page===0} onClick={()=>setPage(p=>p-1)}
                  className="px-2 py-0.5 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100">Prev</button>
                <span className="px-2 py-0.5 text-gray-400">Page {page+1}/{totalPages}</span>
                <button disabled={page+1>=totalPages} onClick={()=>setPage(p=>p+1)}
                  className="px-2 py-0.5 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100">Next</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Chart panel ──────────────────────────────────────────────────── */}
        <ChartPanel
          param={chartLoading ? null : selectedParam}
          loading={chartLoading}
          onClose={() => { setSelectedParam(null); setChartLoading(false); }}
          onSaveMeta={saveMeta}
          onSaveMaturity={saveMaturity}
          compareActive={!!compareId}
          baseValue={selectedParam ? baseLabels[selectedParam.name] : undefined}
          baseSrId={compareId || undefined}
        />
      </div>

      {/* ── Export DCM modal ─────────────────────────────────────────────────── */}
      {showExportDcmModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
             onClick={() => setShowExportDcmModal(false)}>
          <div className="bg-white rounded shadow-lg p-5 w-[420px] max-w-[90vw]"
               onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sm mb-3">Export DCM</h3>

            <label className="block text-[11px] font-semibold text-gray-600 mb-1">Scope</label>
            <div className="flex flex-col gap-1 mb-3">
              {[
                { v: "saved",    label: `Only saved labels (${allLabels.filter(l=>l.save).length})` },
                { v: "filtered", label: `Current filtered view (${filtered.length})` },
                { v: "all",      label: `All labels in release (${allLabels.length})` },
              ].map(o => (
                <label key={o.v} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="radio" name="dcm-scope" checked={exportFilters.scope === o.v}
                    onChange={() => setExportFilters(f => ({...f, scope: o.v}))} />
                  {o.label}
                </label>
              ))}
            </div>

            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              Maturity filter <span className="font-normal text-gray-400">(empty = all)</span>
            </label>
            <div className="flex gap-3 mb-3">
              {[0, 25, 50, 75, 100].map(m => (
                <label key={m} className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox"
                    checked={exportFilters.maturity.includes(m)}
                    onChange={e => setExportFilters(f => ({
                      ...f,
                      maturity: e.target.checked
                        ? [...f.maturity, m]
                        : f.maturity.filter(x => x !== m)
                    }))} />
                  {m}%
                </label>
              ))}
            </div>

            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              Filename <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              value={exportFilters.filename}
              onChange={e => setExportFilters(f => ({...f, filename: e.target.value}))}
              placeholder="my_export.dcm"
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs mb-4"
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowExportDcmModal(false)}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={exportDCM} disabled={exporting}
                className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">
                {exporting ? "Exporting…" : "Export DCM"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign default values modal ──────────────────────────────────────── */}
      {showDefaultAssignModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
             onClick={() => setShowDefaultAssignModal(false)}>
          <div className="bg-white rounded shadow-lg p-5 w-[480px] max-w-[90vw]"
               onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sm mb-2">Assign default values</h3>
            <p className="text-xs text-gray-600 mb-3">
              {filtered.length} labels are missing DCM values. These labels are in A2L but have no calibration data.
            </p>

            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded text-xs mb-4">
              <table className="w-full">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Label</th>
                    <th className="text-left px-2 py-1">A2L lower limit</th>
                    <th className="text-left px-2 py-1">A2L upper limit</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map(l => (
                    <tr key={l.name} className="border-t border-gray-100">
                      <td className="px-2 py-0.5 font-mono text-blue-600">{l.name}</td>
                      <td className="px-2 py-0.5 font-mono">{l.lower_limit ?? "—"}</td>
                      <td className="px-2 py-0.5 font-mono">{l.upper_limit ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 100 && (
                <p className="text-center text-gray-400 py-1 text-[10px]">…and {filtered.length - 100} more</p>
              )}
            </div>

            <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-3">
              Default value assignment (writing to DCM) is planned for v1.1.
              For now, use Export DCM with scope "all" and edit values externally.
            </p>

            <div className="flex justify-end">
              <button onClick={() => setShowDefaultAssignModal(false)}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
