/**
 * Cost tracking page for monitoring AI API usage and costs
 */
import React from 'react';
import CostTracker from '../components/CostTracker';

const CostsPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          AI Provider Costs
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Monitor and track costs for OpenAI, Anthropic, and other AI provider API calls
        </p>
      </div>
      
      <CostTracker 
        apiBaseUrl={import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}
      />
    </div>
  );
};

export default CostsPage;
