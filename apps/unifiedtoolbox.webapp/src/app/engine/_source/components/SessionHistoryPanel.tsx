import React from 'react';
import type { Session } from '../types';
// Fix: Corrected icon import path
import { HistoryIcon, CloseIcon, RunIcon, TrashIcon } from './icons';

interface SessionHistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    sessions: Session[];
    onSelectSession: (sessionId: string) => void;
    onGoLive: () => void;
    onClearHistory: () => void;
    currentSessionId: string | null;
}

const SessionHistoryPanel: React.FC<SessionHistoryPanelProps> = ({ 
    isOpen, 
    onClose, 
    sessions, 
    onSelectSession, 
    onGoLive, 
    onClearHistory, 
    currentSessionId 
}) => {
    const panelVisibilityClass = isOpen ? 'translate-x-0' : '-translate-x-full';
    
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString();
    }

    const sortedSessions = [...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const handleClear = () => {
        if (window.confirm('Are you sure you want to clear all session history? This action cannot be undone.')) {
            onClearHistory();
        }
    };

    return (
        <div 
            className={`absolute top-0 left-0 h-full w-96 bg-gray-800/80 backdrop-blur-lg border-r border-gray-700 z-20 transform transition-transform duration-300 ease-in-out ${panelVisibilityClass}`}
        >
            <div className="p-4 flex flex-col h-full">
                 <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold flex items-center text-gray-100">
                        <HistoryIcon className="w-6 h-6 mr-2 text-indigo-400" />
                        Session History
                    </h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-700">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </div>
                <div className="flex flex-col space-y-3 text-sm text-gray-400 overflow-y-auto flex-1">
                    <button 
                        onClick={onGoLive}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${currentSessionId === 'live' ? 'bg-indigo-500/30 border-indigo-500' : 'bg-gray-900/50 border-gray-700 hover:border-indigo-400'}`}
                    >
                         <p className="font-semibold text-white flex items-center"><RunIcon className="w-4 h-4 mr-2"/> Live View</p>
                         <p className="text-xs mt-1">View the current or next orchestration run.</p>
                    </button>
                    {sortedSessions.length === 0 ? (
                        <p className="text-center italic mt-4">No completed sessions yet.</p>
                    ) : (
                        sortedSessions.map(session => (
                            <button 
                                key={session.id}
                                onClick={() => onSelectSession(session.id)}
                                className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${currentSessionId === session.id ? 'bg-indigo-500/30 border-indigo-500' : 'bg-gray-900/50 border-gray-700 hover:border-indigo-400'}`}
                            >
                                <p className="font-semibold text-gray-200 truncate">Goal: "{session.goal}"</p>
                                <div className="flex justify-between items-center text-xs mt-1">
                                    <p><span className="font-medium">Date:</span> {formatDate(session.date)}</p>
                                    {session.totalCost !== undefined && (
                                        <p className="font-mono text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                                            Cost: ${session.totalCost.toFixed(4)}
                                        </p>
                                    )}
                                </div>
                            </button>
                        ))
                    )}
                </div>
                 {sessions.length > 0 && (
                    <div className="pt-3 mt-3 border-t border-gray-700">
                        <button
                            onClick={handleClear}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md bg-red-600/20 text-red-300 hover:bg-red-600/40 hover:text-red-200 transition-colors"
                        >
                            <TrashIcon className="w-4 h-4" />
                            Clear All History
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SessionHistoryPanel;