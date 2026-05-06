/**
 * DatasetStateTransitionButton.jsx
 * Reusable component for dataset state transitions
 */

import React, { useState } from 'react';
import axios from 'axios';
import { formatApiErrorDetail } from '../lib/api';

const DatasetStateTransitionButton = ({ datasetId, currentState, onTransitionSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Define valid state transitions
  const stateTransitions = {
    EDIT: {
      nextStates: [{ state: 'UNDER_APPROVAL', label: 'Submit for Approval' }],
    },
    UNDER_APPROVAL: {
      nextStates: [
        { state: 'APPROVED', label: 'Approve' },
        { state: 'EDIT', label: 'Reject' },
      ],
    },
    APPROVED: {
      nextStates: [{ state: 'RELEASE_CANDIDATE', label: 'Mark as Release Candidate' }],
    },
    RELEASE_CANDIDATE: {
      nextStates: [{ state: 'RELEASED', label: 'Release' }],
    },
    RELEASED: {
      nextStates: [],
    },
    DEPRECATED: {
      nextStates: [],
    },
  };

  const stateColors = {
    EDIT: 'bg-gray-500',
    UNDER_APPROVAL: 'bg-amber-500',
    APPROVED: 'bg-green-500',
    RELEASE_CANDIDATE: 'bg-purple-500',
    RELEASED: 'bg-blue-500',
    DEPRECATED: 'bg-red-500',
  };

  const transitions = stateTransitions[currentState]?.nextStates || [];

  if (transitions.length === 0) {
    return (
      <button
        disabled
        className="px-3 py-1 rounded text-sm text-white bg-gray-400 cursor-not-allowed"
      >
        {currentState}
      </button>
    );
  }

  const handleTransition = async (nextState) => {
    setLoading(true);
    setError('');

    try {
      await axios.post(
        `http://localhost:8000/api/v1/datasets/${datasetId}/transition`,
        { to_state: nextState }
      );

      onTransitionSuccess();
    } catch (err) {
      const message = formatApiErrorDetail(err.response?.data?.detail || err.message || 'Transition failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-start">
      <div className="flex gap-2">
        {transitions.map((transition) => (
          <button
            key={transition.state}
            onClick={() => handleTransition(transition.state)}
            disabled={loading}
            className={`px-3 py-1 rounded text-sm text-white ${stateColors[transition.state]} hover:opacity-90 disabled:opacity-50 transition-opacity`}
          >
            {loading ? 'Processing...' : transition.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="text-red-600 text-xs mt-2">{error}</p>
      )}
    </div>
  );
};

export default DatasetStateTransitionButton;
