import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import AppLayout from "./AppLayout";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="tiny-label pulse-slow">Loading workspace</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}
