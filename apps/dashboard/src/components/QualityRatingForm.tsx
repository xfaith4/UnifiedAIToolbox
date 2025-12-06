/**
 * Quality Rating Form Component
 * Allows users to submit quality ratings for runs
 */
import React, { useState } from 'react';
import { CheckCircle, XCircle, Star, AlertCircle, Save } from 'lucide-react';

interface QualityRatingFormProps {
  runId: string;
  apiBaseUrl?: string;
  adminToken?: string;
  onSuccess?: () => void;
}

const QualityRatingForm: React.FC<QualityRatingFormProps> = ({
  runId,
  apiBaseUrl = 'http://localhost:8000',
  adminToken,
  onSuccess
}) => {
  const [success, setSuccess] = useState<boolean | null>(null);
  const [qualityScore, setQualityScore] = useState<number>(0.7);
  const [strategy, setStrategy] = useState('');
  const [notes, setNotes] = useState('');
  const [needsManualFix, setNeedsManualFix] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (success === null) {
      setError('Please select success or failure status');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSubmitSuccess(false);

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (adminToken) {
        headers['X-Admin-Token'] = adminToken;
      }

      const response = await fetch(
        `${apiBaseUrl}/metrics/quality/runs/${runId}/rating`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            success,
            quality_score: qualityScore,
            strategy: strategy || null,
            notes: notes || null,
            needs_manual_fix: needsManualFix
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to submit rating');
      }

      setSubmitSuccess(true);
      
      // Call success callback immediately
      if (onSuccess) {
        onSuccess();
      }
      
      // Reset form after brief success message
      const resetTimeout = setTimeout(() => {
        setSuccess(null);
        setQualityScore(0.7);
        setStrategy('');
        setNotes('');
        setNeedsManualFix(false);
        setSubmitSuccess(false);
      }, 2000);
      
      // Cleanup timeout on unmount
      return () => clearTimeout(resetTimeout);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit rating');
      console.error('Error submitting quality rating:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Star className="w-5 h-5 text-yellow-500" />
        Rate Run Quality
      </h3>

      {submitSuccess && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-800 dark:text-green-300 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Quality rating submitted successfully!
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Success Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Run Status *
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSuccess(true)}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                success === true
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : 'border-gray-300 dark:border-gray-600 hover:border-green-400 dark:hover:border-green-500'
              }`}
            >
              <CheckCircle className="w-5 h-5 mx-auto mb-1" />
              <span className="text-sm font-medium">Success</span>
            </button>
            <button
              type="button"
              onClick={() => setSuccess(false)}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                success === false
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                  : 'border-gray-300 dark:border-gray-600 hover:border-red-400 dark:hover:border-red-500'
              }`}
            >
              <XCircle className="w-5 h-5 mx-auto mb-1" />
              <span className="text-sm font-medium">Failed</span>
            </button>
          </div>
        </div>

        {/* Quality Score */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Quality Score: {(qualityScore * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={qualityScore}
            onChange={(e) => setQualityScore(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span>Poor (0%)</span>
            <span>Excellent (100%)</span>
          </div>
        </div>

        {/* Strategy */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Strategy (optional)
          </label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select strategy...</option>
            <option value="multi-agent">Multi-Agent</option>
            <option value="single-shot">Single-Shot</option>
            <option value="iterative">Iterative</option>
            <option value="test-suite">Test Suite</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add any observations about this run's quality..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Manual Fix Needed */}
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="manual-fix"
            checked={needsManualFix}
            onChange={(e) => setNeedsManualFix(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="manual-fix" className="flex-1 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">Required manual intervention</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Check this if the run needed human fixes or adjustments to achieve the result
            </p>
          </label>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || success === null}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Submit Rating
            </>
          )}
        </button>
      </form>

      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
        Run ID: <span className="font-mono">{runId}</span>
      </p>
    </div>
  );
};

export default QualityRatingForm;
