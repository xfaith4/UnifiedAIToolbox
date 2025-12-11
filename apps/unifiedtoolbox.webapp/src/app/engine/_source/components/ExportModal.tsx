import React, { useState, useMemo } from 'react';
import JSZip from 'jszip';
import type { Task, Artifact } from '../types';
import { CloseIcon, DownloadIcon, PaperclipIcon, LoadingIcon } from './icons';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, tasks }) => {
  const [isZipping, setIsZipping] = useState(false);

  const uniqueArtifacts = useMemo(() => {
    // Defensively handle potentially malformed task data from sources like localStorage.
    if (!Array.isArray(tasks)) {
      return [];
    }
    const allArtifacts = tasks.flatMap(task =>
      (task && Array.isArray(task.artifacts)) ? task.artifacts : []
    );

    const artifactMap = new Map<string, Artifact>();
    for (const artifact of allArtifacts) {
      // Ensure artifact is a valid object with a name before adding it.
      if (artifact && artifact.name) {
        artifactMap.set(artifact.name, artifact);
      }
    }
    return Array.from(artifactMap.values());
  }, [tasks]);

  if (!isOpen) return null;

  const handleDownloadZip = async () => {
    if (isZipping) return;
    setIsZipping(true);

    try {
      const zip = new JSZip();

      uniqueArtifacts.forEach(artifact => {
        if (artifact.type === 'IMAGE') {
          zip.file(artifact.name, artifact.content, { base64: true });
        } else {
          zip.file(artifact.name, artifact.content);
        }
      });

      const blob = await zip.generateAsync({ type: 'blob' });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'orchestrator-project.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

    } catch (error) {
      console.error("Failed to generate zip file:", error);
      alert("An error occurred while creating the zip file. Please check the console.");
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl border border-gray-700 transform transition-all animate-fade-in-up">
        <style>{`
          @keyframes fade-in-up {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; }
        `}</style>
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Export Orchestration Results</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-700 transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h3 className="flex items-center text-lg font-semibold mb-3">
              <PaperclipIcon className="w-5 h-5 mr-2 text-indigo-400" /> Generated Artifacts
            </h3>
            {uniqueArtifacts.length > 0 ? (
              <ul className="space-y-2">
                {uniqueArtifacts.map(artifact => (
                  <li key={artifact.id} className="flex items-center justify-between bg-gray-900/50 p-2 rounded">
                    <span className="font-mono text-sm">{artifact.name}</span>
                    <span className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded-full">{artifact.type}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400">No artifacts were generated.</p>
            )}
          </div>
        </div>

        <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors">
            Close
          </button>
          <button
            onClick={handleDownloadZip}
            disabled={isZipping || uniqueArtifacts.length === 0}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center transition-colors disabled:bg-indigo-400 disabled:cursor-wait"
          >
            {isZipping ? (
              <>
                <LoadingIcon className="w-5 h-5 mr-2 animate-spin" />
                Zipping...
              </>
            ) : (
              <>
                <DownloadIcon className="w-5 h-5 mr-2" />
                Download Project as .zip
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
