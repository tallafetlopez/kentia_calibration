import React, { useState, useMemo } from "react";

/**
 * A2L PARAMETERS TABLE
 * Shows all scalars, maps, and curves with filtering
 */
export default function A2LParametersTab({ a2lData }) {
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const scalars = Array.isArray(a2lData?.scalars) ? a2lData.scalars : [];
  const maps = Array.isArray(a2lData?.maps) ? a2lData.maps : [];
  const curves = Array.isArray(a2lData?.curves) ? a2lData.curves : [];

  // Filter and search
  const filtered = useMemo(() => {
    let items = [];

    if (filterType === "all" || filterType === "scalars") {
      items = items.concat(
        scalars.map((s) => ({
          ...s,
          type: "Scalar",
          typeLabel: "S",
          name: s?.name || "-",
          long_identifier: s?.long_identifier || "",
          unit: s.unit || "-",
        }))
      );
    }
    if (filterType === "all" || filterType === "maps") {
      items = items.concat(
        maps.map((m) => ({
          ...m,
          type: "Map",
          typeLabel: "M",
          name: m?.name || "-",
          long_identifier: m?.long_identifier || "",
          dims: `${m?.rows ?? "-"}x${m?.cols ?? "-"}`,
          unit: m.unit || "-",
        }))
      );
    }
    if (filterType === "all" || filterType === "curves") {
      items = items.concat(
        curves.map((c) => ({
          ...c,
          type: "Curve",
          typeLabel: "C",
          name: c?.name || "-",
          long_identifier: c?.long_identifier || "",
          size: c?.size ?? "-",
          unit: c.unit || "-",
        }))
      );
    }

    // Search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      items = items.filter(
        (item) =>
          (item?.name || "").toLowerCase().includes(q) ||
          (item?.long_identifier || "").toLowerCase().includes(q)
      );
    }

    return items;
  }, [filterType, searchTerm, scalars, maps, curves]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-4 items-center">
        {/* Search */}
        <input
          type="text"
          placeholder="Search parameters..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
        />

        {/* Filter Pills */}
        <div className="flex gap-2">
          {[
            { label: "All", value: "all" },
            { label: "Scalars", value: "scalars" },
            { label: "Maps", value: "maps" },
            { label: "Curves", value: "curves" },
          ].map((pill) => (
            <button
              key={pill.value}
              onClick={() => setFilterType(pill.value)}
              className={`px-3 py-1 rounded text-xs font-semibold transition ${
                filterType === pill.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-gray-600">
        {filtered.length} parameter{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* Table */}
      <div className="border border-gray-300 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b border-gray-300">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Type</th>
              <th className="px-4 py-2 text-left font-semibold">Name</th>
              <th className="px-4 py-2 text-left font-semibold">
                Long Identifier
              </th>
              <th className="px-4 py-2 text-left font-semibold">Unit</th>
              <th className="px-4 py-2 text-center font-semibold">Size/Dims</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, idx) => (
              <tr
                key={`${item.typeLabel}-${item.name}-${idx}`}
                className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
              >
                <td className="px-4 py-2 font-mono text-xs bg-gray-100">
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    {item.typeLabel}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{item.name}</td>
                <td className="px-4 py-2 text-xs text-gray-700">
                  {item.long_identifier || "—"}
                </td>
                <td className="px-4 py-2 text-xs">{item.unit}</td>
                <td className="px-4 py-2 text-center text-xs font-mono">
                  {item.dims || item.size || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No parameters match your search
        </div>
      )}
    </div>
  );
}
