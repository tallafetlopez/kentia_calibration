/**
 * NewDatasetModal.jsx
 * Modal for creating a new Dataset in HERKO Calibration Manager
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const NewDatasetModal = ({ isOpen, onClose, onSuccess, currentUser }) => {
  const [formData, setFormData] = useState({
    name: '',
    sw_release_id: '',
    context: 'PRODUCTION',
    mode: 'IMPORT_S37',
    derived_from: '',
    author: currentUser?.email || '',
  });

  const [swReleases, setSwReleases] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadSwReleases();
    }
  }, [isOpen]);

  const loadSwReleases = async () => {
    try {
      const response = await axios.get(
        'http://localhost:8000/api/v1/sw-releases?status=VALID_FOR_CALIBRATION'
      );
      setSwReleases(response.data);
    } catch (error) {
      console.error('Failed to load SW Releases:', error);
    }
  };

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Dataset name is required';
    }
    if (!formData.sw_release_id) {
      newErrors.sw_release_id = 'SW Release is required';
    }
    if (!formData.context) {
      newErrors.context = 'Context is required';
    }
    if (!formData.mode) {
      newErrors.mode = 'Mode is required';
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
        name: formData.name,
        sw_release_id: formData.sw_release_id,
        context: formData.context,
        mode: formData.mode,
        derived_from: formData.derived_from || null,
        author: formData.author,
      };

      await axios.post('http://localhost:8000/api/v1/datasets', payload);

      // Reset form
      setFormData({
        name: '',
        sw_release_id: '',
        context: 'PRODUCTION',
        mode: 'IMPORT_S37',
        derived_from: '',
        author: currentUser?.email || '',
      });
      setErrors({});

      onSuccess();
      onClose();
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to create dataset';
      setApiError(message);
    } finally {
      setLoading(false);
    }
  };

  const selectedRelease = swReleases.find((r) => r.id === formData.sw_release_id);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="bg-gray-800 px-6 py-4 rounded-t-lg">
          <h2 className="text-white text-lg font-semibold">New Dataset</h2>
        </div>

        {/* Body */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Dataset Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dataset Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. DS_Base_Euro6d_Prod"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.name && (
                <p className="text-red-500 text-xs mt-1">{errors.name}</p>
              )}
            </div>

            {/* SW Release */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                SW Release *
              </label>
              <select
                name="sw_release_id"
                value={formData.sw_release_id}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.sw_release_id ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">-- Select SW Release --</option>
                {swReleases.map((release) => (
                  <option key={release.id} value={release.id}>
                    {release.identifier} · v{release.version} ({release.supplier})
                  </option>
                ))}
              </select>
              {errors.sw_release_id && (
                <p className="text-red-500 text-xs mt-1">{errors.sw_release_id}</p>
              )}
            </div>

            {/* Context */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Context *
              </label>
              <select
                name="context"
                value={formData.context}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.context ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="PRODUCTION">PRODUCTION</option>
                <option value="DEVELOPMENT">DEVELOPMENT</option>
                <option value="VARIANT_SPECIFIC">VARIANT_SPECIFIC</option>
                <option value="POST_SALES">POST_SALES</option>
                <option value="VIN_SPECIFIC">VIN_SPECIFIC</option>
              </select>
              {errors.context && (
                <p className="text-red-500 text-xs mt-1">{errors.context}</p>
              )}
            </div>

            {/* Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mode *
              </label>
              <select
                name="mode"
                value={formData.mode}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.mode ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="IMPORT_S37">IMPORT_S37</option>
                <option value="COPY_EXISTING">COPY_EXISTING</option>
                <option value="REUSE_BASELINE">REUSE_BASELINE</option>
                <option value="MERGE">MERGE</option>
              </select>
              {errors.mode && (
                <p className="text-red-500 text-xs mt-1">{errors.mode}</p>
              )}
            </div>

            {/* Derived From */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Derived From (optional)
              </label>
              <input
                type="text"
                name="derived_from"
                value={formData.derived_from}
                onChange={handleChange}
                placeholder="e.g. DS_Base_Euro6d_Dev"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Author */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Author
              </label>
              <input
                type="text"
                name="author"
                value={formData.author}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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

export default NewDatasetModal;
