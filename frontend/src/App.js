import React, { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { setupDevBypassInterceptors } from "./lib/devBypassSetup";
import ProtectedRoute from "./components/ProtectedRoute";
import DevModeBadge from "./components/DevModeBadge";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import SoftwareReleasesPage from "./pages/SoftwareReleasesPage";
import SwReleaseDetailPage from "./pages/SwReleaseDetailPage";
import DatasetsPage from "./pages/DatasetsPage";
import DatasetDetailPage from "./pages/DatasetDetailPage";
import ReviewCenterPage from "./pages/ReviewCenterPage";
import ReleaseCenterPage from "./pages/ReleaseCenterPage";
import VehicleAssignmentPage from "./pages/VehicleAssignmentPage";
import TraceabilityPage from "./pages/TraceabilityPage";
import AdminPage from "./pages/AdminPage";
import SwReleaseDCMViewer from "./pages/SwReleaseDCMViewer";
import WorkPackagesPage from "./pages/WorkPackagesPage";
import { Toaster } from "./components/ui/sonner";
import HerkoLabelsPage from "./pages/herko/HerkoLabelsPage";
import HerkoReviewPage from "./pages/herko/HerkoReviewPage";
import HerkoLayout from "./pages/herko/HerkoLayout";
import HerkoDatasetsPage from "./pages/herko/HerkoDatasetsPage";
import HerkoCreateDatasetPage from "./pages/herko/HerkoCreateDatasetPage";
import HerkoDatasetDetailPage from "./pages/herko/HerkoDatasetDetailPage";
import HerkoSwReleasesPage from "./pages/herko/HerkoSwReleasesPage";
import HerkoReleaseCenterPage from "./pages/herko/HerkoReleaseCenterPage";
import HerkoAuditLogPage from "./pages/herko/HerkoAuditLogPage";
import HerkoDashboardPage from "./pages/herko/HerkoDashboardPage";

// Initialize dev bypass interceptors if needed
setupDevBypassInterceptors();

function AppContent() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/software-releases"
            element={
              <ProtectedRoute>
                <SoftwareReleasesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/software-releases/:id"
            element={
              <ProtectedRoute>
                <SwReleaseDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/software-releases/:id/dcm"
            element={
              <ProtectedRoute>
                <SwReleaseDCMViewer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/datasets"
            element={
              <ProtectedRoute>
                <DatasetsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/datasets/:id"
            element={
              <ProtectedRoute>
                <DatasetDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/review-center"
            element={
              <ProtectedRoute>
                <ReviewCenterPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/release-center"
            element={
              <ProtectedRoute>
                <ReleaseCenterPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vehicle-assignment"
            element={
              <ProtectedRoute>
                <VehicleAssignmentPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/traceability"
            element={
              <ProtectedRoute>
                <TraceabilityPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/work-packages"
            element={
              <ProtectedRoute>
                <WorkPackagesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/labels"
            element={
              <ProtectedRoute>
                <HerkoLabelsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/datasets/:id/review"
            element={
              <ProtectedRoute>
                <HerkoReviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/herko"
            element={
              <ProtectedRoute>
                <HerkoLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HerkoDashboardPage />} />
            <Route path="dashboard" element={<HerkoDashboardPage />} />
            <Route path="datasets" element={<HerkoDatasetsPage />} />
            <Route path="datasets/create" element={<HerkoCreateDatasetPage />} />
            <Route path="datasets/:id" element={<HerkoDatasetDetailPage />} />
            <Route path="datasets/:id/review" element={<HerkoReviewPage />} />
            <Route path="sw-releases" element={<HerkoSwReleasesPage />} />
            <Route path="release-center" element={<HerkoReleaseCenterPage />} />
            <Route path="labels" element={<HerkoLabelsPage />} />
            <Route path="audit-log" element={<HerkoAuditLogPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
      <DevModeBadge />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
