import React, { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { ScalarChart } from "./index";

export default function ScalarEditor({ swReleaseId, label, onChange }) {
  const [values, setValues] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      const r = await api.get(`/v1/sw-releases/${swReleaseId}/labels/${encodeURIComponent(label.name)}/values`);
      setValues(r.data);
      setEditValue(String(r.data.wp_value ?? ""));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { refresh(); }, [swReleaseId, label?.name]); // eslint-disable-line

  const apply = async (operation, valueOverride) => {
    setSaving(true);
    try {
      const payload = {
        operation,
        value: Number(valueOverride !== undefined ? valueOverride : editValue),
        cells: [],
      };
      const r = await api.put(
        `/v1/sw-releases/${swReleaseId}/labels/${encodeURIComponent(label.name)}/values`,
        payload,
      );
      setValues(v => ({ ...v, wp_value: r.data.wp_value, modified: true }));
      setEditValue(String(r.data.wp_value ?? ""));
      if (r.data.warnings?.length) {
        toast.warning(`${r.data.warnings.length} value(s) outside A2L limits`);
      } else {
        toast.success("Saved");
      }
      onChange?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm("Reset to reference page value?")) return;
    setSaving(true);
    try {
      const r = await api.post(
        `/v1/sw-releases/${swReleaseId}/labels/${encodeURIComponent(label.name)}/values/reset`,
        { cells: "all" },
      );
      setValues(v => ({ ...v, wp_value: r.data.wp_value, modified: r.data.modified }));
      setEditValue(String(r.data.wp_value ?? ""));
      toast.success("Reset to RP");
      onChange?.();
    } catch (e) {
      toast.error("Reset failed");
    } finally {
      setSaving(false);
    }
  };

  if (!values) return <div className="p-4 text-xs text-gray-400">Loading…</div>;

  const previewLabel = { ...label, value: Number(editValue) || values.wp_value };

  return (
    <div className="p-3 space-y-3">
      <ScalarChart label={previewLabel} compareValue={values.rp_value} />

      <div className="border border-gray-200 rounded p-3 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-gray-700 uppercase">Edit value</p>
          {values.modified && (
            <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold">
              Modified
            </span>
          )}
        </div>

        <div className="flex gap-2 mb-2">
          <input
            type="number"
            step="any"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
            placeholder="Enter new value"
          />
          <button
            onClick={() => apply("set")}
            disabled={saving || editValue === ""}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Set
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1 mb-2">
          {[
            { label: "−1",   op: "add", v: -1    },
            { label: "−0.1", op: "add", v: -0.1  },
            { label: "+0.1", op: "add", v:  0.1  },
            { label: "+1",   op: "add", v:  1    },
          ].map(({ label: lbl, op, v }) => (
            <button key={lbl} onClick={() => apply(op, v)} disabled={saving}
              className="px-2 py-1 text-[10px] border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50">
              {lbl}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1 mb-3">
          {[
            { label: "−5%",  op: "percentage", v: -5  },
            { label: "+5%",  op: "percentage", v:  5  },
            { label: "+10%", op: "percentage", v: 10  },
          ].map(({ label: lbl, op, v }) => (
            <button key={lbl} onClick={() => apply(op, v)} disabled={saving}
              className="px-2 py-1 text-[10px] border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50">
              {lbl}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="bg-gray-100 rounded p-1.5">
            <p className="text-gray-500 uppercase font-semibold">RP (reference)</p>
            <p className="font-mono text-gray-700">{values.rp_value ?? "—"} {label.unit || ""}</p>
          </div>
          <div className={`rounded p-1.5 ${values.modified ? "bg-amber-50" : "bg-gray-100"}`}>
            <p className="text-gray-500 uppercase font-semibold">WP (working)</p>
            <p className="font-mono font-semibold">{values.wp_value ?? "—"} {label.unit || ""}</p>
          </div>
        </div>

        {values.modified && (
          <button onClick={reset} disabled={saving}
            className="w-full mt-2 px-2 py-1 text-[10px] border border-gray-300 rounded bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-50">
            Reset to RP
          </button>
        )}
      </div>
    </div>
  );
}
