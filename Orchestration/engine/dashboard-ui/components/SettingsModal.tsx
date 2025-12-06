import React from 'react';
import { CloseIcon, SettingsIcon } from './icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isApiKeyConfigured: boolean;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose,
  isApiKeyConfigured,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-lg border border-gray-700 transform transition-all animate-fade-in-up">
        <style>{`
          @keyframes fade-in-up {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; }
        `}</style>
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold flex items-center">
            <SettingsIcon className="w-6 h-6 mr-2 text-indigo-400" />
            Settings
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-700 transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
           <div className="flex items-center justify-between bg-gray-700/50 p-4 rounded-lg">
            <span className="font-medium text-gray-300">Google AI API Key Status</span>
            {isApiKeyConfigured ? (
              <span className="px-3 py-1 text-sm font-semibold text-green-200 bg-green-500/20 rounded-full">
                Configured
              </span>
            ) : (
              <span className="px-3 py-1 text-sm font-semibold text-red-200 bg-red-500/20 rounded-full">
                Not Found
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">
            The API key is configured via an <code className="bg-gray-700 text-indigo-300 px-1.5 py-0.5 rounded">.env</code> file in the project's root directory. For more details on local setup, please refer to the README file.
          </p>
        </div>

        <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end items-center gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;