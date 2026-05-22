import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../lib/auth";
import A2LParametersTab from "../components/A2LParametersTab";
import A2LMapsTab from "../components/A2LMapsTab";
import A2LUploadTab from "../components/A2LUploadTab";

/**
 * SW RELEASE DETAIL PAGE
 * Two-column layout: metadata (left) + A2L viewer (right)
 */
export default function SwReleaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [swRelease, setSwRelease] = useState(null);
  const [v1SwReleaseId, setV1SwReleaseId] = useState(null);
  const [a2lData, setA2lData] = useState(null);
  const [a2lFileInfo, setA2lFileInfo] = useState(null);
  const [activeTab, setActiveTab] = useState("parameters");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // DCM state
  const [dcmSummary, setDcmSummary] = useState(null);
  const [dcmUploading, setDcmUploading] = useState(false);
  const [dcmDragOver, setDcmDragOver] = useState(false);
  const dcmInputRef = useRef(null);

  const resolveOrCreateV1Release = async (legacyRelease) => {
    const { data: v1Releases } = await api.get(`/v1/sw-releases`);
    const identifier = legacyRelease.software_release_identifier;
    const version = legacyRelease.version;

    const matches = (v1Releases || []).filter(
      (r) => r.identifier === identifier && r.version === version
    );
    // prefer the release that already has a DCM uploaded
    const existing = matches.find((r) => r.has_dcm) || matches[0];
    if (existing?.id) return existing.id;

    const releasedDate = legacyRelease.release_date
      ? new Date(legacyRelease.release_date).toISOString()
      : new Date().toISOString();

    const createBody = {
      identifier,
      version,
      supplier: legacyRelease.supplier || "Unknown",
      released_date: releasedDate,
      a2l_filename: legacyRelease.a2l_file_reference || null,
    };

    const { data: created } = await api.post(`/v1/sw-releases`, createBody);
    return created.id;
  };

  // Fetch SW Release and A2L data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch SW Release
        const srResponse = await api.get(`/software-releases/${id}`);
        setSwRelease(srResponse.data);

        // Resolve/Create corresponding v1 SW release for A2L/DCM endpoints
        let resolvedV1Id = null;
        try {
          resolvedV1Id = await resolveOrCreateV1Release(srResponse.data);
          setV1SwReleaseId(resolvedV1Id);
        } catch (resolveErr) {
          console.warn("Could not resolve v1 SW release for A2L/DCM:", resolveErr.message);
          setV1SwReleaseId(null);
        }

        // Fetch A2L file info
        try {
          if (!resolvedV1Id) throw new Error("No v1 release id");
          const infoResponse = await api.get(`/v1/sw-releases/${resolvedV1Id}/a2l/info`);
          setA2lFileInfo(infoResponse.data);

          // If file exists, fetch parsed data
          if (infoResponse.data.has_file) {
            const parseResponse = await api.get(`/v1/sw-releases/${resolvedV1Id}/a2l/parse`);
            setA2lData(parseResponse.data);
          }
        } catch (err) {
          // A2L endpoints may not exist yet, continue anyway
          console.warn("A2L endpoints not available:", err.message);
        }

        // Fetch DCM summary (if uploaded)
        try {
          if (!resolvedV1Id) throw new Error("No v1 release id");
          const dcmRes = await api.get(`/v1/sw-releases/${resolvedV1Id}/dcm/summary`);
          setDcmSummary(dcmRes.data);
        } catch (err) {
          // Not uploaded yet — that's fine
          setDcmSummary(null);
        }

        setError(null);
      } catch (err) {
        setError(formatApiErrorDetail(err.response?.data?.detail || err.message));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handleUploadSuccess = async (uploadResponse) => {
    // Reload A2L data after successful upload
    try {
      if (!v1SwReleaseId) throw new Error("No v1 release id");
      const parseResponse = await api.get(`/v1/sw-releases/${v1SwReleaseId}/a2l/parse`);
      setA2lData(parseResponse.data);
      setA2lFileInfo(uploadResponse);
      setActiveTab("parameters");
    } catch (err) {
      console.error("Failed to reload A2L data:", err);
    }
  };

  const handleDcmFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".dcm")) {
      alert("Only .dcm files are accepted");
      return;
    }
    setDcmUploading(true);
    try {
      if (!v1SwReleaseId) {
        throw new Error("This release is not mapped to v1 yet. Refresh and retry.");
      }
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post(`/v1/sw-releases/${v1SwReleaseId}/dcm/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDcmSummary(data);
    } catch (err) {
      alert(err.response?.data?.detail || "DCM upload failed");
    } finally {
      setDcmUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-300 rounded-lg">
        <p className="text-red-700">Error: {error}</p>
        <button
          onClick={() => navigate("/software-releases")}
          className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
        >
          Back to Releases
        </button>
      </div>
    );
  }

  if (!swRelease) {
    return <div className="p-6">SW Release not found</div>;
  }

  // Status colors
  const getStatusColor = (status) => {
    switch (status) {
      case "DRAFT":
        return "bg-gray-100 text-gray-700";
      case "VALID_FOR_CALIBRATION":
        return "bg-green-100 text-green-700";
      case "ARCHIVED":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{swRelease.software_release_identifier || swRelease.identifier}</h1>
          <p className="text-gray-600 mt-1">v{swRelease.version}</p>
        </div>
        <button
          onClick={() => navigate("/software-releases")}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
        >
          ← Back
        </button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-3 gap-6">
        {/* LEFT COLUMN — Metadata Card */}
        <div className="col-span-1">
          <div className="bg-white border border-gray-300 rounded-lg p-6 shadow-sm space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-600">IDENTIFIER</p>
              <p className="text-sm font-mono mt-1">
                {swRelease.software_release_identifier || swRelease.identifier}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-600">VERSION</p>
              <p className="text-lg font-bold mt-1">{swRelease.version}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-600">SUPPLIER</p>
              <p className="text-sm mt-1">{swRelease.supplier || "—"}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-600">STATUS</p>
              <p className={`text-xs font-semibold mt-1 px-3 py-1 rounded inline-block ${getStatusColor(swRelease.status)}`}>
                {swRelease.status}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-600">RELEASED DATE</p>
              <p className="text-sm mt-1">
                {swRelease.release_date ? new Date(swRelease.release_date).toLocaleDateString() : "—"}
              </p>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-gray-600">METADATA</p>
              <dl className="text-xs mt-2 space-y-1">
                <dt className="text-gray-600">Created by:</dt>
                <dd className="text-gray-700">{swRelease.created_by || swRelease.author || "—"}</dd>
                <dt className="text-gray-600 mt-2">Datasets linked:</dt>
                <dd className="text-gray-700">{swRelease.datasets_count || 0}</dd>
              </dl>
            </div>

            {/* DCM FILE section */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600">DCM FILE</p>
                {dcmSummary && (
                  <span className="text-xs text-green-700 font-semibold">✓ Parsed</span>
                )}
              </div>

              {dcmSummary ? (
                <div className="space-y-2">
                  <p
                    className="text-xs break-all"
                    style={{ fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace", color: "#1f2937" }}
                  >
                    {dcmSummary.filename}
                  </p>
                  <p className="text-xs text-gray-500">
                    Uploaded:{" "}
                    {dcmSummary.uploaded_at
                      ? new Date(dcmSummary.uploaded_at).toLocaleDateString("es-ES", {
                          day: "2-digit", month: "short", year: "numeric",
                        })
                      : "—"}{" "}
                    · {(dcmSummary.size_bytes / 1024 / 1024).toFixed(1)} MB
                  </p>
                  <div className="flex gap-3 text-xs font-semibold text-gray-700 mt-1">
                    <span>{dcmSummary.summary?.total_scalars?.toLocaleString()} Scalars</span>
                    <span>{dcmSummary.summary?.total_curves} Curves</span>
                    <span>{dcmSummary.summary?.total_maps} Maps</span>
                  </div>
                  <div className="flex gap-3 mt-1">
                    <button
                      onClick={() => navigate(`/software-releases/${v1SwReleaseId || id}/dcm`)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      View parameters ↗
                    </button>
                    <button
                      onClick={() => navigate(`/software-releases/${v1SwReleaseId || id}/labels`)}
                      className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold"
                    >
                      Label Viewer (CRETA) ↗
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-400 mb-2">No DCM uploaded</p>
                  {/* Drag & drop zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDcmDragOver(true); }}
                    onDragLeave={() => setDcmDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDcmDragOver(false);
                      handleDcmFile(e.dataTransfer.files[0]);
                    }}
                    onClick={() => dcmInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${dcmDragOver ? "#4a5240" : "#9aad8a"}`,
                      borderRadius: 4,
                      background: dcmDragOver ? "#f0f4eb" : "#f9fbf7",
                      color: "#6b7a5e",
                      padding: "12px 10px",
                      textAlign: "center",
                      cursor: "pointer",
                      fontSize: 11,
                      transition: "all 0.15s",
                    }}
                  >
                    {dcmUploading ? "Uploading…" : "Drag & drop .dcm file here or click to browse"}
                  </div>
                  <input
                    ref={dcmInputRef}
                    type="file"
                    accept=".dcm,.DCM"
                    style={{ display: "none" }}
                    onChange={(e) => handleDcmFile(e.target.files?.[0])}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — A2L Viewer */}
        <div className="col-span-2">
          <div className="bg-white border border-gray-300 rounded-lg shadow-sm">
            {/* Tabs */}
            <div className="flex border-b border-gray-300">
              {[
                { id: "parameters", label: "Parameters" },
                { id: "maps", label: "Maps" },
                { id: "upload", label: "Upload A2L" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-4 py-3 text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? "border-b-2 border-blue-600 text-blue-600 bg-blue-50"
                      : "text-gray-700 hover:text-gray-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === "parameters" && a2lData ? (
                <A2LParametersTab a2lData={a2lData} />
              ) : activeTab === "parameters" ? (
                <div className="text-center py-8 text-gray-500">
                  No A2L file uploaded yet. Upload one to see parameters.
                </div>
              ) : null}

              {activeTab === "maps" && a2lData ? (
                <A2LMapsTab a2lData={a2lData} />
              ) : activeTab === "maps" ? (
                <div className="text-center py-8 text-gray-500">
                  No A2L file uploaded yet. Upload one to see maps.
                </div>
              ) : null}

              {activeTab === "upload" && (
                <A2LUploadTab
                  swReleaseId={v1SwReleaseId || id}
                  currentFile={a2lFileInfo}
                  onUploadSuccess={handleUploadSuccess}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
