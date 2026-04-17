import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label as UILabel } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { ShieldAlert, Search, X, Download, Copy, Filter } from "lucide-react";

/**
 * Excel-style labels grid.
 * - Click (or double-click) a cell to edit inline
 * - Enter = save + move down, Tab = save + move right, Escape = cancel
 * - Checkbox column selects rows for mass edit
 * - Sticky header, zebra rows, monospace values
 * - Enum columns (level, confidence, regulatory, parametrizable) open a small inline select
 */

const COLS = [
  { key: "__select__", label: "", width: 36, kind: "select" },
  { key: "__row__", label: "#", width: 44, kind: "row" },
  { key: "label_name", label: "Label", width: 220, kind: "text", readonly: true, sticky: true },
  { key: "data_type", label: "Type", width: 80, kind: "text", readonly: true },
  { key: "current_value", label: "Value", width: 130, kind: "text" },
  { key: "unit", label: "Unit", width: 70, kind: "text", readonly: true },
  { key: "level", label: "Level", width: 140, kind: "enum", options: ["CONFIGURATION", "CARRY_OVER", "VARIANT_SPECIFIC", "VEHICLE_SPECIFIC"] },
  { key: "confidence_status", label: "Confidence", width: 120, kind: "enum", options: ["EMPTY", "CALIBRATED", "VALIDATED", "DOCUMENTED"] },
  { key: "regulatory_relevance", label: "Reg.", width: 70, kind: "enum", options: ["NO", "YES"] },
  { key: "regulation_reference", label: "Regulation", width: 130, kind: "text" },
  { key: "parametrizable_in_customer", label: "Cust.", width: 70, kind: "enum", options: ["NO", "YES"] },
  { key: "change_justification", label: "Change justification", width: 240, kind: "text" },
  { key: "comments", label: "Comments", width: 200, kind: "text" },
];

const EDITABLE_KEYS = [
  "current_value", "level", "confidence_status", "regulatory_relevance",
  "regulation_reference", "parametrizable_in_customer",
  "parametrizable_override_justification", "change_justification", "comments",
];

function toneForConfidence(v) {
  if (v === "EMPTY") return "bg-amber-50 text-amber-700 border-amber-200";
  if (v === "DOCUMENTED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (v === "VALIDATED") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function LabelsGrid({ datasetId, labels, readOnly, onReload }) {
  const [filter, setFilter] = useState({ q: "", modified: false, regulatory: false, incomplete: false, onlyCustomer: false });
  const [selected, setSelected] = useState(new Set());
  const [editCell, setEditCell] = useState(null); // {rowId, key, value}
  const [massOpen, setMassOpen] = useState(false);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    return labels.filter((l) => {
      if (filter.q && !l.label_name.toLowerCase().includes(filter.q.toLowerCase())) return false;
      if (filter.modified && !l.modified) return false;
      if (filter.regulatory && l.regulatory_relevance !== "YES") return false;
      if (filter.onlyCustomer && l.parametrizable_in_customer !== "YES") return false;
      if (filter.incomplete && !(l.confidence_status === "EMPTY" || (l.regulatory_relevance === "YES" && !l.change_justification))) return false;
      return true;
    });
  }, [labels, filter]);

  useEffect(() => {
    if (editCell && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.select) inputRef.current.select();
    }
  }, [editCell]);

  const startEdit = (label, key) => {
    if (readOnly) { toast.error("Dataset is read-only"); return; }
    const col = COLS.find((c) => c.key === key);
    if (!col || col.readonly || !EDITABLE_KEYS.includes(key)) return;
    setEditCell({ rowId: label.id, key, value: label[key] ?? "" });
  };

  const saveCell = async (commitValue, moveDir) => {
    if (!editCell) return;
    const currentLabel = labels.find((l) => l.id === editCell.rowId);
    if (!currentLabel) { setEditCell(null); return; }
    const newVal = commitValue;
    if ((currentLabel[editCell.key] ?? "") === newVal) {
      // no change, just move or close
      if (moveDir) moveEdit(editCell, moveDir);
      else setEditCell(null);
      return;
    }
    try {
      await api.patch(`/datasets/${datasetId}/labels/${editCell.rowId}`, { [editCell.key]: newVal });
      toast.success("Saved", { duration: 1200 });
      await onReload();
      if (moveDir) moveEdit(editCell, moveDir);
      else setEditCell(null);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
      setEditCell(null);
    }
  };

  const moveEdit = (from, dir) => {
    const rowIdx = filtered.findIndex((l) => l.id === from.rowId);
    const editableCols = COLS.filter((c) => EDITABLE_KEYS.includes(c.key));
    const colIdx = editableCols.findIndex((c) => c.key === from.key);
    let nextRow = rowIdx;
    let nextCol = colIdx;
    if (dir === "down") nextRow = Math.min(filtered.length - 1, rowIdx + 1);
    if (dir === "right") {
      if (colIdx < editableCols.length - 1) nextCol = colIdx + 1;
      else { nextRow = Math.min(filtered.length - 1, rowIdx + 1); nextCol = 0; }
    }
    const nextLabel = filtered[nextRow];
    const nextKey = editableCols[nextCol]?.key;
    if (nextLabel && nextKey) {
      setEditCell({ rowId: nextLabel.id, key: nextKey, value: nextLabel[nextKey] ?? "" });
    } else {
      setEditCell(null);
    }
  };

  const toggleRow = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((l) => l.id)));
  };

  const exportCsv = () => {
    const headers = COLS.filter((c) => !["__select__", "__row__"].includes(c.key)).map((c) => c.key);
    const rows = filtered.map((l) => headers.map((h) => {
      const v = l[h] ?? "";
      const s = typeof v === "string" ? v.replace(/"/g, '""') : String(v);
      return `"${s}"`;
    }).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `labels_${datasetId.slice(0,8)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const copySelected = async () => {
    const chosen = filtered.filter((l) => selected.has(l.id));
    if (chosen.length === 0) { toast.error("Select at least one row"); return; }
    const headers = ["label_name", "current_value", "unit", "level", "confidence_status", "regulatory_relevance", "parametrizable_in_customer"];
    const text = [headers.join("\t"), ...chosen.map((l) => headers.map((h) => l[h] ?? "").join("\t"))].join("\n");
    try { await navigator.clipboard.writeText(text); toast.success(`Copied ${chosen.length} rows`); }
    catch { toast.error("Clipboard not available"); }
  };

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="panel p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Filter labels…" className="pl-8 h-8 text-xs" data-testid="lbl-search" />
        </div>
        <FilterChip active={filter.modified} onClick={() => setFilter({ ...filter, modified: !filter.modified })}>Modified</FilterChip>
        <FilterChip active={filter.regulatory} onClick={() => setFilter({ ...filter, regulatory: !filter.regulatory })} tone="red">Regulatory</FilterChip>
        <FilterChip active={filter.incomplete} onClick={() => setFilter({ ...filter, incomplete: !filter.incomplete })} tone="amber">Incomplete</FilterChip>
        <FilterChip active={filter.onlyCustomer} onClick={() => setFilter({ ...filter, onlyCustomer: !filter.onlyCustomer })} tone="blue">Customer param.</FilterChip>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={copySelected} disabled={selected.size === 0} data-testid="lbl-copy">
          <Copy className="w-3 h-3 mr-1.5" /> Copy ({selected.size})
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportCsv} data-testid="lbl-export">
          <Download className="w-3 h-3 mr-1.5" /> CSV
        </Button>
        <Button size="sm" className="h-8 text-xs bg-slate-900 hover:bg-slate-800" onClick={() => setMassOpen(true)} disabled={readOnly || selected.size === 0} data-testid="lbl-mass-edit">
          Mass edit ({selected.size})
        </Button>
      </div>

      {/* Grid */}
      <div className="panel p-0 overflow-hidden">
        <div className="relative overflow-auto" style={{ maxHeight: "70vh" }}>
          <table className="w-full text-[12px] border-collapse" style={{ tableLayout: "fixed" }}>
            <colgroup>
              {COLS.map((c) => <col key={c.key} style={{ width: `${c.width}px` }} />)}
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 border-b border-slate-300">
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className={`tiny-label text-slate-600 font-semibold px-2 py-2 border-r border-slate-200 text-left ${c.sticky ? "sticky left-[80px] bg-slate-100 z-10" : ""}`}
                    style={c.kind === "select" || c.kind === "row" ? { position: "sticky", left: c.kind === "select" ? 0 : 36, background: "#F1F5F9", zIndex: 11 } : undefined}
                  >
                    {c.kind === "select" ? (
                      <Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} data-testid="lbl-select-all" />
                    ) : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {filtered.map((l, idx) => {
                const isSel = selected.has(l.id);
                const zebra = idx % 2 === 0 ? "bg-white" : "bg-slate-50/40";
                return (
                  <tr key={l.id} className={`${zebra} border-b border-slate-100 hover:bg-blue-50/40 transition-colors`} data-testid={`lbl-row-${l.label_name}`}>
                    {COLS.map((c) => {
                      if (c.kind === "select") return (
                        <td key={c.key} className="px-2 py-1 border-r border-slate-100 sticky left-0 bg-inherit z-[1]">
                          <Checkbox checked={isSel} onCheckedChange={() => toggleRow(l.id)} data-testid={`lbl-select-${l.label_name}`} />
                        </td>
                      );
                      if (c.kind === "row") return (
                        <td key={c.key} className="px-2 py-1 border-r border-slate-100 text-[10px] text-slate-400 text-right sticky bg-inherit z-[1]" style={{ left: 36 }}>{idx + 1}</td>
                      );
                      const isEditing = editCell?.rowId === l.id && editCell?.key === c.key;
                      const rawVal = l[c.key];
                      const cellKey = `${l.id}-${c.key}`;

                      // static render for readonly or label name
                      const isStatic = c.readonly || !EDITABLE_KEYS.includes(c.key);

                      return (
                        <td
                          key={c.key}
                          onDoubleClick={() => startEdit(l, c.key)}
                          onClick={() => { if (editCell && editCell.rowId === l.id && editCell.key === c.key) return; if (!isStatic) startEdit(l, c.key); }}
                          className={`px-2 py-1 border-r border-slate-100 align-middle ${c.sticky ? "sticky bg-inherit z-[1]" : ""} ${isStatic ? "cursor-default" : "cursor-cell hover:bg-amber-50/60"}`}
                          style={c.sticky ? { left: 80 } : undefined}
                          data-testid={`lbl-cell-${l.label_name}-${c.key}`}
                        >
                          {isEditing ? (
                            c.kind === "enum" ? (
                              <EnumCellEditor
                                value={editCell.value}
                                options={c.options}
                                onChange={(v) => setEditCell({ ...editCell, value: v })}
                                onCommit={(v, dir) => saveCell(v, dir)}
                                onCancel={() => setEditCell(null)}
                              />
                            ) : (
                              <input
                                ref={inputRef}
                                className="w-full bg-white border border-blue-500 rounded-sm px-1.5 py-0.5 text-[12px] font-mono outline-none"
                                value={editCell.value}
                                onChange={(e) => setEditCell({ ...editCell, value: e.target.value })}
                                onBlur={() => saveCell(editCell.value, null)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") { e.preventDefault(); setEditCell(null); }
                                  else if (e.key === "Enter") { e.preventDefault(); saveCell(editCell.value, "down"); }
                                  else if (e.key === "Tab") { e.preventDefault(); saveCell(editCell.value, "right"); }
                                }}
                              />
                            )
                          ) : (
                            <CellValue col={c} label={l} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={COLS.length} className="py-10 text-center text-sm text-slate-500 font-sans">No labels match filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-slate-50 border-t border-slate-200 px-3 py-1.5 flex items-center gap-3 text-[11px] text-slate-500 font-mono">
          <span>{filtered.length} of {labels.length} rows</span>
          <span>·</span>
          <span>{selected.size} selected</span>
          <span>·</span>
          <span>Double-click a cell to edit · Tab → next cell · Enter → next row · Esc = cancel</span>
        </div>
      </div>

      <MassEditDialog
        open={massOpen}
        onOpenChange={setMassOpen}
        count={selected.size}
        onApply={async (patch) => {
          try {
            const { data } = await api.post(`/datasets/${datasetId}/labels/mass-update`, { label_ids: Array.from(selected), patch });
            toast.success(`Updated ${data.updated} labels`);
            setMassOpen(false);
            setSelected(new Set());
            await onReload();
          } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
        }}
      />
    </div>
  );
}

function FilterChip({ active, onClick, tone = "slate", children }) {
  const toneMap = {
    slate: active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200",
    red: active ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-700 border-slate-200",
    amber: active ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-700 border-slate-200",
    blue: active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[11px] font-mono px-2.5 h-8 rounded-md border transition ${toneMap[tone]}`}
    >
      <Filter className="w-3 h-3" /> {children}
      {active && <X className="w-3 h-3 ml-1 opacity-70" />}
    </button>
  );
}

function CellValue({ col, label }) {
  const v = label[col.key];
  if (col.key === "label_name") {
    return (
      <div className="flex items-center gap-1 truncate">
        <span className="text-slate-900 font-semibold truncate">{v}</span>
        {label.modified && <span className="text-[9px] px-1 rounded-sm bg-amber-100 text-amber-800 border border-amber-200">MOD</span>}
      </div>
    );
  }
  if (col.key === "regulatory_relevance") {
    return v === "YES" ? (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
        <ShieldAlert className="w-2.5 h-2.5" /> YES
      </span>
    ) : <span className="text-slate-400 text-[11px]">NO</span>;
  }
  if (col.key === "parametrizable_in_customer") {
    return v === "YES" ? (
      <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">YES</span>
    ) : <span className="text-slate-400 text-[11px]">NO</span>;
  }
  if (col.key === "confidence_status") {
    return <span className={`px-1.5 py-0.5 rounded-sm text-[10px] font-semibold border ${toneForConfidence(v)}`}>{v}</span>;
  }
  if (col.key === "level") {
    return <span className="text-[10px] text-slate-600">{v}</span>;
  }
  if (!v) return <span className="text-slate-300">—</span>;
  return <span className="text-slate-800 truncate block">{v}</span>;
}

function EnumCellEditor({ value, options, onChange, onCommit, onCancel }) {
  return (
    <select
      autoFocus
      value={value}
      onChange={(e) => { onChange(e.target.value); }}
      onBlur={(e) => onCommit(e.target.value, null)}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        if (e.key === "Enter") { e.preventDefault(); onCommit(e.target.value, "down"); }
        if (e.key === "Tab") { e.preventDefault(); onCommit(e.target.value, "right"); }
      }}
      className="w-full bg-white border border-blue-500 rounded-sm px-1 py-0.5 text-[12px] font-mono outline-none"
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function MassEditDialog({ open, onOpenChange, count, onApply }) {
  const [patch, setPatch] = useState({});
  useEffect(() => { if (open) setPatch({}); }, [open]);
  const set = (k, v) => setPatch((p) => ({ ...p, [k]: v === "" ? undefined : v }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Mass edit · {count} labels</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-500 -mt-2">Only fields you set below will be applied. Rows that violate rules are skipped.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <UILabel className="tiny-label">Level</UILabel>
            <Select value={patch.level || "__keep"} onValueChange={(v) => set("level", v === "__keep" ? "" : v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__keep">— keep —</SelectItem>
                {["CONFIGURATION", "CARRY_OVER", "VARIANT_SPECIFIC", "VEHICLE_SPECIFIC"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <UILabel className="tiny-label">Confidence</UILabel>
            <Select value={patch.confidence_status || "__keep"} onValueChange={(v) => set("confidence_status", v === "__keep" ? "" : v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__keep">— keep —</SelectItem>
                {["EMPTY", "CALIBRATED", "VALIDATED", "DOCUMENTED"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <UILabel className="tiny-label">Regulatory</UILabel>
            <Select value={patch.regulatory_relevance || "__keep"} onValueChange={(v) => set("regulatory_relevance", v === "__keep" ? "" : v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__keep">— keep —</SelectItem>
                <SelectItem value="NO">NO</SelectItem>
                <SelectItem value="YES">YES</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <UILabel className="tiny-label">Parametrizable in customer</UILabel>
            <Select value={patch.parametrizable_in_customer || "__keep"} onValueChange={(v) => set("parametrizable_in_customer", v === "__keep" ? "" : v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__keep">— keep —</SelectItem>
                <SelectItem value="NO">NO</SelectItem>
                <SelectItem value="YES">YES</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <UILabel className="tiny-label">Change justification</UILabel>
            <Textarea rows={2} value={patch.change_justification || ""} onChange={(e) => set("change_justification", e.target.value)} className="mt-1.5" />
          </div>
          <div className="col-span-2">
            <UILabel className="tiny-label">Comments</UILabel>
            <Textarea rows={2} value={patch.comments || ""} onChange={(e) => set("comments", e.target.value)} className="mt-1.5" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-slate-900 hover:bg-slate-800"
            onClick={() => {
              const cleaned = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== ""));
              if (Object.keys(cleaned).length === 0) { toast.error("Set at least one field"); return; }
              onApply(cleaned);
            }}
            data-testid="mass-apply"
          >Apply to {count} labels</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
