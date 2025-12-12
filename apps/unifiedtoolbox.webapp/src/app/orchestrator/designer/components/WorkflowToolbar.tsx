'use client';

import { Save, FolderOpen, Play, LayoutGrid, Trash2 } from 'lucide-react';

interface WorkflowToolbarProps {
    workflowName: string;
    onSave: () => void;
    onLoad: () => void;
    onRun: () => void;
    onAutoLayout: () => void;
    onClear: () => void;
    isSaving?: boolean;
    isRunning?: boolean;
}

export default function WorkflowToolbar({
    workflowName,
    onSave,
    onLoad,
    onRun,
    onAutoLayout,
    onClear,
    isSaving = false,
    isRunning = false,
}: WorkflowToolbarProps) {
    return (
        <div className="w-full rounded-3xl border border-slate-800 bg-slate-900/70 px-4 py-3 shadow-[0_18px_40px_rgba(2,6,23,0.7)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold text-slate-100">
                        {workflowName || 'Untitled Workflow'}
                    </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={onLoad}
                        className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-2 transition-colors"
                    >
                        <FolderOpen className="w-4 h-4" />
                        Load
                    </button>

                    <button
                        onClick={onSave}
                        disabled={isSaving}
                        className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>

                    <button
                        onClick={onAutoLayout}
                        className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-2 transition-colors"
                    >
                        <LayoutGrid className="w-4 h-4" />
                        Auto Layout
                    </button>

                    <button
                        onClick={onClear}
                        className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-red-400 rounded-lg border border-slate-700 flex items-center gap-2 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        Clear
                    </button>

                    <button
                        onClick={onRun}
                        disabled={isRunning}
                        className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Play className="w-4 h-4" />
                        {isRunning ? 'Running...' : 'Run Workflow'}
                    </button>
                </div>
            </div>
        </div>
    );
}
