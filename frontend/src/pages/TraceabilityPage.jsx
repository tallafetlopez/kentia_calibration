import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { LifecycleBadge, fmtDateShort } from "../lib/constants";
import { CircuitBoard, Database, Car, GitBranch } from "lucide-react";

export default function TraceabilityPage() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/traceability").then((r) => setData(r.data)); }, []);
  if (!data) return <div className="tiny-label pulse-slow">Loading traceability…</div>;

  return (
    <div className="space-y-6" data-testid="page-traceability">
      <div>
        <div className="tiny-label">Workflow 8</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo" }}>Traceability Explorer</h1>
        <p className="mt-1 text-sm text-slate-600">Software Release → Dataset → Vehicle_SW_ID → VIN / Variant / Manufacturing Order.</p>
      </div>

      <div className="space-y-5">
        {data.software_releases.map((sr) => {
          const dsList = data.datasets.filter((d) => d.software_release_id === sr.id);
          return (
            <div key={sr.id} className="panel p-0 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CircuitBoard className="w-4 h-4 text-slate-700" />
                  <Link to={`/software-releases/${sr.id}`} className="font-semibold text-slate-900 hover:underline" style={{ fontFamily: "Chivo" }}>
                    {sr.software_release_identifier}
                  </Link>
                  <span className="text-xs font-mono text-slate-500">v{sr.version}</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${sr.status === "VALID_FOR_CALIBRATION" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-700 border-slate-200"}`}>{sr.status}</span>
              </div>
              <div className="p-5 space-y-3">
                {dsList.length === 0 && <div className="text-xs text-slate-500">No datasets under this release.</div>}
                {dsList.map((d) => {
                  const vsids = data.vehicle_sw_ids.filter((v) => v.dataset_id === d.id);
                  return (
                    <div key={d.id} className="border-l-2 border-slate-200 pl-4 ml-1 relative" data-testid={`trace-ds-${d.dataset_name}`}>
                      <div className="absolute -left-[5px] top-2 w-2 h-2 rounded-full bg-slate-300" />
                      <div className="flex items-center gap-2 flex-wrap">
                        <Database className="w-3.5 h-3.5 text-slate-500" />
                        <Link to={`/datasets/${d.id}`} className="font-medium text-slate-900 hover:underline">{d.dataset_name}</Link>
                        <LifecycleBadge state={d.lifecycle_state} />
                        <span className="text-[10px] font-mono text-slate-500">{d.deployment_context}</span>
                      </div>
                      {vsids.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {vsids.map((v) => (
                            <div key={v.id} className="flex items-center gap-2 text-xs text-slate-700 pl-4 border-l-2 border-slate-100">
                              <Car className="w-3 h-3 text-slate-400" />
                              <span className="font-mono text-slate-900">{v.id.slice(0, 8)}…</span>
                              <span className="text-slate-500">→</span>
                              <span className="font-mono text-slate-700">{v.vin || v.variant_id || v.manufacturing_order_reference || v.service_case_reference}</span>
                              <span className="text-slate-400">·</span>
                              <span className="text-[10px] font-mono text-slate-500">{fmtDateShort(v.creation_date)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {d.baseline_dataset_id && (
                        <div className="mt-1 text-[10px] font-mono text-slate-500 flex items-center gap-1"><GitBranch className="w-3 h-3" /> derived from baseline</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
