import React from "react";

/**
 * AUTH ERROR FALLBACK
 * Mostrado cuando la autenticación falla o timeout ocurre después de 5 segundos.
 */
export default function AuthErrorFallback({ error, onRetry }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div
        className="bg-white p-8 rounded-lg shadow-md max-w-md w-full border-l-4 border-red-500"
        style={{ borderLeft: "4px solid #ef4444" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="text-2xl">⚠️</div>
          <h2 className="text-lg font-bold text-gray-800">Connection Error</h2>
        </div>

        {/* Error Message */}
        <p className="text-gray-600 text-sm mb-2">
          Could not connect to backend.
        </p>

        {/* Technical Details */}
        {error && (
          <div className="bg-gray-100 p-3 rounded text-xs text-gray-700 mb-6 font-mono overflow-auto max-h-24">
            {typeof error === "string" ? error : error.message || String(error)}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={onRetry}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition"
          >
            🔄 Retry
          </button>
          <button
            onClick={() => {
              localStorage.setItem("dev_bypass", "true");
              onRetry?.();
            }}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2 px-4 rounded transition"
          >
            🚀 Continue with Dev Mode
          </button>
        </div>

        {/* Help Text */}
        <p className="text-xs text-gray-500 mt-4 text-center">
          Make sure the backend is running at <code>{process.env.REACT_APP_BACKEND_URL}</code>
        </p>
      </div>
    </div>
  );
}
