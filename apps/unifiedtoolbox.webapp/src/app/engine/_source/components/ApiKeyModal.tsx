import React from 'react';
import { WarningIcon } from './icons';

const ApiKeyModal: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-xl border border-yellow-500/50">
        <div className="p-6">
          <div className="text-center">
            <WarningIcon className="w-16 h-16 mx-auto text-yellow-400 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">API Key Not Configured</h2>
            <p className="text-gray-300 mb-6">
              The application requires an OpenAI API key to function, but it has not been configured in your local environment.
            </p>
            <div className="bg-gray-900 p-4 rounded-lg text-left space-y-4">
              <h3 className="font-semibold text-lg text-white">How to fix this:</h3>
              <ol className="list-decimal list-inside text-gray-300 space-y-2">
                <li>
                  If you run the webapp directly, add your key to{" "}
                  <code className="bg-gray-700 text-indigo-300 px-1.5 py-0.5 rounded">apps/unifiedtoolbox.webapp/.env.local</code>.
                </li>
                <li>
                  If you start via <code className="bg-gray-700 text-indigo-300 px-1.5 py-0.5 rounded">Start-Toolbox.ps1</code>, add your key to{" "}
                  <code className="bg-gray-700 text-indigo-300 px-1.5 py-0.5 rounded">.env</code> at the repo root.
                </li>
              </ol>
              <p className="mb-2">Add your API key on a single line:</p>
              <div className="bg-gray-900 p-2 rounded mb-4 font-mono text-xs overflow-x-auto">
                <code>NEXT_PUBLIC_API_KEY=sk-proj-your...api...key...here</code>
              </div>
              <p className="text-xs text-gray-400">
                After updating the env file, restart the dev server (env vars are read at startup), then reload this page.
              </p>
            </div>
          </div>
        </div>
        <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
