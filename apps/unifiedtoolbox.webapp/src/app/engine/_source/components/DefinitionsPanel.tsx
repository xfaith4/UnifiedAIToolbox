import React from 'react';
// Fix: Corrected data import path
import { definitions } from '../data/definitions';
// Fix: Corrected icon import path
import { BookIcon, CloseIcon } from './icons';

interface DefinitionsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const DefinitionsPanel: React.FC<DefinitionsPanelProps> = ({ isOpen, onClose }) => {
    const panelVisibilityClass = isOpen ? 'translate-x-0' : '-translate-x-full';

    return (
        <div 
            className={`absolute top-0 left-0 h-full w-96 bg-gray-800/80 backdrop-blur-lg border-r border-gray-700 z-20 transform transition-transform duration-300 ease-in-out ${panelVisibilityClass}`}
        >
            <div className="p-4 flex flex-col h-full">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold flex items-center text-gray-100">
                        <BookIcon className="w-6 h-6 mr-2 text-indigo-400" />
                        Help & Concepts
                    </h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-700">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </div>
                <div className="space-y-4 overflow-y-auto flex-1">
                    {definitions.map(def => (
                        <div key={def.term}>
                            <h3 className="font-bold text-indigo-400">{def.term}</h3>
                            <p className="text-sm text-gray-300">{def.definition}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DefinitionsPanel;
