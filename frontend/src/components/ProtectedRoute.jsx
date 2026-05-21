import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import AppLayout from "./AppLayout";
import AuthErrorFallback from "./AuthErrorFallback";

export default function ProtectedRoute({ children, noLayout = false }) {
  const { user, loading, devBypass, authError, refresh } = useAuth();

  // Dev bypass active - skip all auth checks
  if (devBypass) {
    return noLayout ? children : <AppLayout>{children}</AppLayout>;
  }

  // Auth error occurred (timeout or network issue)
  if (authError && !loading) {
    return <AuthErrorFallback error={authError} onRetry={refresh} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="tiny-label pulse-slow mb-4">Loading workspace</div>
          <p className="text-xs text-gray-500">(5 second timeout active)</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return noLayout ? children : <AppLayout>{children}</AppLayout>;
}
