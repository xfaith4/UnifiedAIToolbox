/**
 * Cost tracking page for monitoring AI API usage and environmental impact
 */
import React, { useState } from 'react';
import CostTracker from '../components/CostTracker';
import EnvironmentalMetrics from '../components/EnvironmentalMetrics';

const CostsPage: React.FC = () => {
  const [view, setView] = useState<'legacy' | 'environmental'>('environmental');
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              AI Cost & Environmental Impact
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Monitor costs, energy usage, and water consumption for AI operations
            </p>
          </div>
          
          {/* View Toggle */}
          <div className="flex gap-2 bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setView('environmental')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                view === 'environmental'
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Environmental
            </button>
            <button
              onClick={() => setView('legacy')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                view === 'legacy'
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Legacy
            </button>
          </div>
        </div>
      </div>
      
      {view === 'environmental' ? (
        <EnvironmentalMetrics 
          apiBaseUrl={import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}
        />
      ) : (
        <CostTracker 
          apiBaseUrl={import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}
        />
      )}
    </div>
  );
};

export default CostsPage;
