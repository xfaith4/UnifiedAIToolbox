import React, { useState } from 'react';
// Fix: Corrected icon import path
import { CloseIcon, FeedbackIcon, LoadingIcon } from './icons';
import type { Session } from '../types';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  onRunFeedback: (session: Session, feedback: string) => Promise<string>;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, session, onRunFeedback }) => {
  const [feedback, setFeedback] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [proposal, setProposal] = useState<string | null>(null);
  
  if (!isOpen) return null;

  const handleClose = () => {
    // Reset state on close
    setFeedback('');
    setIsLoading(false);
    setProposal(null);
    onClose();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !feedback.trim()) return;

    setIsLoading(true);
    const result = await onRunFeedback(session, feedback);
    setProposal(result);
    setIsLoading(false);
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
          <h2 className="text-xl font-bold flex items-center">
            <FeedbackIcon className="w-6 h-6 mr-2 text-indigo-400" />
            Provide Feedback & Propose Agent Updates
          </h2>
          <button onClick={handleClose} className="p-1 rounded-full hover:bg-gray-700 transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {!session ? (
            <p className="text-center text-yellow-400">Please select a completed session from the history panel to provide feedback.</p>
          ) : isLoading ? (
             <div className="flex flex-col items-center justify-center h-48">
                <LoadingIcon className="w-12 h-12 animate-spin text-indigo-400"/>
                <p className="mt-4 text-gray-300">Running meta-orchestration... The Feedback Analyst agent is reviewing your request.</p>
            </div>
          ) : proposal ? (
            <div>
                <h3 className="font-bold text-lg mb-2 text-gray-100">Feedback Analysis Complete</h3>
                <div className="prose prose-invert bg-black/50 p-4 rounded-md max-w-none">
                     <pre className="bg-transparent p-0 text-white whitespace-pre-wrap font-sans">{proposal}</pre>
                </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="feedback-message" className="block text-sm font-medium text-gray-300 mb-1">
                  Your Feedback on the run for goal:{' '}
                  <span className="text-indigo-300 font-semibold">&quot;{session.goal}&quot;</span>
                </label>
                <textarea
                  id="feedback-message"
                  rows={6}
                  required
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="e.g., The generated code was good, but it didn't include any unit tests. The Code Writer agent should be updated to include a testing step."
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-y"
                ></textarea>
              </div>
              <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end gap-3 -mx-6 -mb-6">
                <button type="button" onClick={handleClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors">
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!feedback.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  Analyze & Propose Update
                </button>
              </div>
            </form>
          )}
        </div>
         {proposal && (
             <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
                <button type="button" onClick={handleClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors">
                    Close
                </button>
            </div>
         )}
      </div>
    </div>
  );
};

export default FeedbackModal;
