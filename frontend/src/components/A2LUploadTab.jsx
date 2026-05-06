import React, { useState, useRef } from "react";
import { api, formatApiErrorDetail } from "../lib/api";

/**
 * A2L UPLOAD TAB
 * Drag-and-drop A2L file upload with progress
 */
export default function A2LUploadTab({ swReleaseId, currentFile, onUploadSuccess }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleUpload = async (file) => {
    // Validate extension
    if (!file.name.endsWith(".a2l")) {
      setError("Only .a2l files are accepted");
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await api.post(
        `/v1/sw-releases/${swReleaseId}/a2l/upload`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (event) => {
            if (event.total) {
              setUploadProgress(Math.round((event.loaded / event.total) * 100));
            }
          },
        }
      );

      setUploadProgress(100);
      setIsUploading(false);

      // Call success callback
      onUploadSuccess(response.data);
    } catch (err) {
      setIsUploading(false);
      setUploadProgress(0);
      setError(formatApiErrorDetail(err.response?.data?.detail || err.message));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleUpload(files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files?.length > 0) {
      handleUpload(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Current File */}
      {currentFile && currentFile.has_file && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-4">
          <p className="text-sm font-semibold text-green-700">✓ File Uploaded</p>
          <p className="text-xs text-green-600 mt-1">
            <strong>{currentFile.filename}</strong> · {(currentFile.size_bytes / 1024).toFixed(1)} KB
          </p>
          <p className="text-xs text-gray-600 mt-2">
            Uploaded: {new Date(currentFile.uploaded_at).toLocaleString()}
          </p>
        </div>
      )}

      {/* Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : isUploading
            ? "border-gray-300 bg-gray-50"
            : "border-gray-300 bg-white hover:border-blue-400"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".a2l"
          onChange={handleFileInput}
          disabled={isUploading}
          className="hidden"
        />

        {isUploading ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">Uploading...</p>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-600">{uploadProgress}%</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-2xl">📄</p>
            <p className="text-sm font-semibold text-gray-700">
              Drag A2L file here or click to select
            </p>
            <p className="text-xs text-gray-500">
              Only .a2l files accepted
            </p>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3">
          <p className="text-sm text-red-700">❌ {error}</p>
        </div>
      )}

      {/* Help Text */}
      <p className="text-xs text-gray-600">
        Upload an A2L (ASAP2) file to view calibration parameters, maps, and curves.
      </p>
    </div>
  );
}
