'use client';

import { useState } from 'react';
import { Sparkles, Copy, Check, Loader2 } from 'lucide-react';

interface ImprovedPromptViewerProps {
    original: string;
    improved: string;
    reasoning?: string;
    onAccept: (improvedPrompt: string) => void;
    onReject: () => void;
}

export default function ImprovedPromptViewer({
    original,
    improved,
    reasoning,
    onAccept,
    onReject,
}: ImprovedPromptViewerProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(improved);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    AI-Improved Version
                </h3>
                <button
                    onClick={handleCopy}
                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                    title="Copy to clipboard"
                >
                    {copied ? (
                        <Check className="w-4 h-4 text-green-400" />
                    ) : (
                        <Copy className="w-4 h-4 text-slate-400" />
                    )}
                </button>
            </div>

            {reasoning && (
                <div className="bg-blue-950/20 border border-blue-500/30 rounded-lg p-3">
                    <h4 className="text-sm font-semibold text-blue-300 mb-1">Why these changes?</h4>
                    <p className="text-sm text-slate-300">{reasoning}</p>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                {/* Original */}
                <div>
                    <h4 className="text-sm font-semibold text-slate-400 mb-2">Original</h4>
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 max-h-96 overflow-y-auto">
                        <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono">
                            {original}
                        </pre>
                    </div>
                </div>

                {/* Improved */}
                <div>
                    <h4 className="text-sm font-semibold text-green-400 mb-2">Improved</h4>
                    <div className="bg-green-950/10 border border-green-500/30 rounded-lg p-4 max-h-96 overflow-y-auto">
                        <pre className="text-sm text-slate-200 whitespace-pre-wrap font-mono">
                            {improved}
                        </pre>
                    </div>
                </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-800">
                <button
                    onClick={() => onAccept(improved)}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors"
                >
                    Accept & Replace
                </button>
                <button
                    onClick={onReject}
                    className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition-colors"
                >
                    Keep Original
                </button>
            </div>
        </div>
    );
}

interface AnalyzeButtonProps {
    onAnalyze: () => void;
    isAnalyzing: boolean;
    hasApiKey: boolean;
}

export function AnalyzeButton({ onAnalyze, isAnalyzing, hasApiKey }: AnalyzeButtonProps) {
    return (
        <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${hasApiKey
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
            {isAnalyzing ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing with GPT-4...
                </>
            ) : (
                <>
                    <Sparkles className="w-4 h-4" />
                    {hasApiKey ? 'Analyze with GPT-4' : 'Analyze Prompt'}
                </>
            )}
        </button>
    );
}
