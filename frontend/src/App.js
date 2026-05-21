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
import HerkoLayout from "./pages/herko/HerkoLayout";
import HerkoDatasetsPage from "./pages/herko/HerkoDatasetsPage";
import HerkoCreateDatasetPage from "./pages/herko/HerkoCreateDatasetPage";
import HerkoDatasetDetailPage from "./pages/herko/HerkoDatasetDetailPage";
import HerkoReviewPage from "./pages/herko/HerkoReviewPage";
import HerkoLabelsPage from "./pages/herko/HerkoLabelsPage";

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
              <ProtectedRoute noLayout>
                <HerkoLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HerkoDatasetsPage />} />
            <Route path="create" element={<HerkoCreateDatasetPage />} />
            <Route path=":id" element={<HerkoDatasetDetailPage />} />
            <Route path=":id/review" element={<HerkoReviewPage />} />
          </Route>
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
              <ProtectedRoute noLayout>
                <HerkoLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HerkoLabelsPage />} />
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
