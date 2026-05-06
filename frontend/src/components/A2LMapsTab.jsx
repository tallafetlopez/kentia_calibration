import React, { useState } from "react";

/**
 * A2L MAPS TAB
 * Shows maps as visual mini grids and expandable heat tables
 */
export default function A2LMapsTab({ a2lData }) {
  const [expandedMapIdx, setExpandedMapIdx] = useState(null);
  const maps = Array.isArray(a2lData?.maps) ? a2lData.maps : [];

  if (maps.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No maps defined in this A2L file
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {maps.map((map, idx) => (
        <div key={idx} className="border border-gray-300 rounded-lg p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-mono font-bold text-sm">{map.name}</h3>
              <p className="text-xs text-gray-600">
                {map.long_identifier} · {map.rows}×{map.cols} · {map.unit}
              </p>
            </div>
            <button
              onClick={() =>
                setExpandedMapIdx(expandedMapIdx === idx ? null : idx)
              }
              className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs rounded font-semibold transition"
            >
              {expandedMapIdx === idx ? "▼ Collapse" : "▶ Expand"}
            </button>
          </div>

          {/* Mini Grid Preview */}
          {expandedMapIdx !== idx && (
            <div className="bg-gray-50 p-3 rounded">
              <MapGrid rows={map.rows} cols={map.cols} mini={true} />
            </div>
          )}

          {/* Expanded Heat Table */}
          {expandedMapIdx === idx && (
            <div className="bg-gray-50 p-4 rounded overflow-auto max-h-96">
              <MapGrid rows={map.rows} cols={map.cols} mini={false} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Map Grid Renderer
 * Shows dimension grid with mock heat-map coloring
 */
function MapGrid({ rows, cols, mini }) {
  const cellSize = mini ? 24 : 40;
  const gap = mini ? 2 : 4;

  // Generate mock values for heat-map (0-100 scale)
  const generateMockValue = (r, c) => {
    return Math.floor((((r * cols + c) % 255) / 255) * 100);
  };

  // Color interpolation: blue (0) → red (100)
  const getColorForValue = (value) => {
    const h = (1 - value / 100) * 240; // Hue: 240 (blue) to 0 (red)
    return `hsl(${h}, 100%, 50%)`;
  };

  return (
    <div className="inline-flex flex-col gap-1">
      {/* Column Headers */}
      <div className="flex gap-1 ml-8">
        {Array.from({ length: cols }).map((_, c) => (
          <div
            key={`ch-${c}`}
            style={{ width: cellSize, height: 20 }}
            className="flex items-center justify-center text-xs font-mono text-gray-600"
          >
            {c}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex flex-col gap-1">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={`row-${r}`} className="flex gap-1 items-center">
            {/* Row Header */}
            <div
              style={{ width: 28, height: cellSize }}
              className="flex items-center justify-center text-xs font-mono text-gray-600"
            >
              {r}
            </div>

            {/* Row Cells */}
            <div className="flex gap-1">
              {Array.from({ length: cols }).map((_, c) => {
                const value = generateMockValue(r, c);
                return (
                  <div
                    key={`cell-${r}-${c}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: getColorForValue(value),
                    }}
                    title={`[${r},${c}] = ${value}`}
                    className="rounded flex items-center justify-center text-xs text-white font-bold cursor-help"
                  >
                    {!mini && value}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      {!mini && (
        <div className="mt-4 p-2 bg-gray-100 rounded text-xs">
          <p className="font-semibold mb-2">Heat Map Legend (Mock Values)</p>
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 30,
                height: 20,
                backgroundColor: getColorForValue(0),
              }}
              className="rounded"
            ></div>
            <span>0% (Low)</span>
            <div
              style={{
                width: 30,
                height: 20,
                backgroundColor: getColorForValue(50),
              }}
              className="rounded"
            ></div>
            <span>50% (Mid)</span>
            <div
              style={{
                width: 30,
                height: 20,
                backgroundColor: getColorForValue(100),
              }}
              className="rounded"
            ></div>
            <span>100% (High)</span>
          </div>
        </div>
      )}
    </div>
  );
}
