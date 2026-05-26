/**
 * GenerateVehicleSwIdModal.jsx
 * Modal for generating a new Vehicle SW ID in HERKO Calibration Manager
 */

import React, { useState, useEffect } from 'react';
import { api as axios } from '../lib/api';

const GenerateVehicleSwIdModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    dataset_id: '',
    vin: '',
    variant: '',
    mfg_order_ref: '',
    service_case_ref: '',
  });

  const [datasets, setDatasets] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [generatedId, setGeneratedId] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadDatasets();
    }
  }, [isOpen]);

  const loadDatasets = async () => {
    try {
      const response = await axios.get(
        `/v1/datasets?state=RELEASE_CANDIDATE&state=RELEASED`
      );
      setDatasets(response.data);
    } catch (error) {
      console.error('Failed to load datasets:', error);
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
    if (!formData.dataset_id) {
      newErrors.dataset_id = 'Dataset is required';
    }
    if (formData.vin && formData.vin.length !== 17) {
      newErrors.vin = 'VIN must be exactly 17 characters';
    }
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    setGeneratedId('');

    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      const payload = {
        dataset_id: formData.dataset_id,
        vin: formData.vin || null,
        variant: formData.variant || null,
        mfg_order_ref: formData.mfg_order_ref || null,
        service_case_ref: formData.service_case_ref || null,
      };

      const response = await axios.post(
        `/v1/vehicle-sw-ids/generate`,
        payload
      );

      setGeneratedId(response.data.vehicle_sw_id);

      // Reset form after 2 seconds
      setTimeout(() => {
        setFormData({
          dataset_id: '',
          vin: '',
          variant: '',
          mfg_order_ref: '',
          service_case_ref: '',
        });
        setErrors({});
        setGeneratedId('');
        onSuccess();
        onClose();
      }, 2000);
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to generate Vehicle SW ID';
      setApiError(message);
    } finally {
      setLoading(false);
    }
  };

  const selectedDataset = datasets.find((d) => d.id === formData.dataset_id);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="bg-gray-800 px-6 py-4 rounded-t-lg">
          <h2 className="text-white text-lg font-semibold">Generate Vehicle SW ID</h2>
        </div>

        {/* Body */}
        <div className="p-6">
          {!generatedId ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Dataset */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dataset *
                </label>
                <select
                  name="dataset_id"
                  value={formData.dataset_id}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.dataset_id ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">-- Select Dataset --</option>
                  {datasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name} · {dataset.state} · {dataset.sw_release_identifier}
                    </option>
                  ))}
                </select>
                {errors.dataset_id && (
                  <p className="text-red-500 text-xs mt-1">{errors.dataset_id}</p>
                )}
              </div>

              {/* VIN */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  VIN (optional)
                </label>
                <input
                  type="text"
                  name="vin"
                  value={formData.vin}
                  onChange={handleChange}
                  placeholder="17 alphanumeric characters"
                  maxLength="17"
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.vin ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.vin && (
                  <p className="text-red-500 text-xs mt-1">{errors.vin}</p>
                )}
              </div>

              {/* Variant */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Variant (optional)
                </label>
                <input
                  type="text"
                  name="variant"
                  value={formData.variant}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Manufacturing Order Ref */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Manufacturing Order Ref (optional)
                </label>
                <input
                  type="text"
                  name="mfg_order_ref"
                  value={formData.mfg_order_ref}
                  onChange={handleChange}
                  placeholder="e.g. MO-A2A1493B"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Service Case Reference */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service Case Reference (optional)
                </label>
                <input
                  type="text"
                  name="service_case_ref"
                  value={formData.service_case_ref}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  {loading ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Vehicle SW ID generated successfully!</p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-xs text-gray-600 mb-2">Vehicle SW ID:</p>
                <p className="font-mono text-sm font-semibold text-green-700 break-all">
                  {generatedId}
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedId);
                  alert('Copied to clipboard!');
                }}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                Copy ID
              </button>
              <p className="text-xs text-gray-500 text-center">
                Closing in a moment...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GenerateVehicleSwIdModal;
