import React from "react";
import { useAuth } from "../lib/auth";

/**
 * DEV MODE BADGE
 * Flotante en esquina inferior derecha cuando dev bypass está activo.
 * Clickear para desactivar y recargar.
 */
export default function DevModeBadge() {
  const { devBypass, disableDevBypass } = useAuth();

  if (!devBypass) return null;

  return (
    <div
      onClick={disableDevBypass}
      className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded-full text-xs font-bold cursor-pointer hover:bg-red-700 transition shadow-lg"
      title="Click to disable dev bypass and reload"
    >
      🔴 DEV MODE
    </div>
  );
}
