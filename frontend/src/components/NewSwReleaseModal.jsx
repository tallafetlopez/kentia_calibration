/**
 * NewSwReleaseModal.jsx
 * Modal for creating a new SW Release in HERKO Calibration Manager
 */

import React, { useState } from 'react';
import { api as axios } from '../lib/api';

const NewSwReleaseModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    identifier: '',
    version: '',
    supplier: '',
    released_date: '',
    a2l_filename: '',
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData((prev) => ({
        ...prev,
        a2l_filename: file.name,
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.identifier.trim()) {
      newErrors.identifier = 'Identifier is required';
    }
    if (!formData.version.trim()) {
      newErrors.version = 'Version is required';
    }
    if (!formData.supplier.trim()) {
      newErrors.supplier = 'Supplier is required';
    }
    if (!formData.released_date) {
      newErrors.released_date = 'Released date is required';
    }
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      const payload = {
        identifier: formData.identifier,
        version: formData.version,
        supplier: formData.supplier,
        released_date: new Date(formData.released_date).toISOString(),
        a2l_filename: formData.a2l_filename || null,
      };

      await axios.post(`/v1/sw-releases`, payload);

      // Reset form
      setFormData({
        identifier: '',
        version: '',
        supplier: '',
        released_date: '',
        a2l_filename: '',
      });
      setErrors({});

      onSuccess();
      onClose();
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to create SW Release';
      setApiError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="bg-gray-800 px-6 py-4 rounded-t-lg">
          <h2 className="text-white text-lg font-semibold">New SW Release</h2>
        </div>

        {/* Body */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Identifier */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Identifier *
              </label>
              <input
                type="text"
                name="identifier"
                value={formData.identifier}
                onChange={handleChange}
                placeholder="e.g. ECM-SW-2025.1"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.identifier ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.identifier && (
                <p className="text-red-500 text-xs mt-1">{errors.identifier}</p>
              )}
            </div>

            {/* Version */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Version *
              </label>
              <input
                type="text"
                name="version"
                value={formData.version}
                onChange={handleChange}
                placeholder="e.g. 2.1.0"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.version ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.version && (
                <p className="text-red-500 text-xs mt-1">{errors.version}</p>
              )}
            </div>

            {/* Supplier */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supplier *
              </label>
              <input
                type="text"
                name="supplier"
                value={formData.supplier}
                onChange={handleChange}
                placeholder="e.g. Bosch"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.supplier ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.supplier && (
                <p className="text-red-500 text-xs mt-1">{errors.supplier}</p>
              )}
            </div>

            {/* Released Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Released Date *
              </label>
              <input
                type="date"
                name="released_date"
                value={formData.released_date}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.released_date ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.released_date && (
                <p className="text-red-500 text-xs mt-1">{errors.released_date}</p>
              )}
            </div>

            {/* A2L File */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                A2L File (optional)
              </label>
              <input
                type="file"
                accept=".a2l"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {formData.a2l_filename && (
                <p className="text-gray-600 text-xs mt-1">
                  Selected: {formData.a2l_filename}
                </p>
              )}
            </div>

            {/* API Error */}
            {apiError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
                {apiError}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NewSwReleaseModal;
