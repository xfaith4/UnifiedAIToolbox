'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Node } from 'reactflow';

interface ConfigPanelProps {
    node: Node | null;
    onClose: () => void;
    onUpdate: (nodeId: string, data: any) => void;
}

export default function ConfigPanel({ node, onClose, onUpdate }: ConfigPanelProps) {
    const [config, setConfig] = useState(node?.data || {});

    if (!node) return null;

    const handleSave = () => {
        onUpdate(node.id, config);
        onClose();
    };

    return (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-900 border-l border-slate-800 shadow-xl z-10 overflow-y-auto">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between">
                <h3 className="font-semibold text-slate-200">Configure Node</h3>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-slate-800 rounded transition-colors"
                >
                    <X className="w-5 h-5 text-slate-400" />
                </button>
            </div>

            <div className="p-4 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Agent Name
                    </label>
                    <input
                        type="text"
                        value={config.agentName || ''}
                        onChange={(e) => setConfig({ ...config, agentName: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Role
                    </label>
                    <input
                        type="text"
                        value={config.agentRole || ''}
                        onChange={(e) => setConfig({ ...config, agentRole: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Custom Prompt (Optional)
                    </label>
                    <textarea
                        value={config.prompt || ''}
                        onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
                        rows={6}
                        placeholder="Override the default agent prompt..."
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Configuration
                    </label>
                    <textarea
                        value={JSON.stringify(config.config || {}, null, 2)}
                        onChange={(e) => {
                            try {
                                const parsed = JSON.parse(e.target.value);
                                setConfig({ ...config, config: parsed });
                            } catch (error) {
                                // Invalid JSON, ignore
                            }
                        }}
                        rows={4}
                        placeholder='{"key": "value"}'
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                </div>

                <div className="pt-4 border-t border-slate-800">
                    <button
                        onClick={handleSave}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
