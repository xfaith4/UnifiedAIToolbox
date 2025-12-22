'use client';

import { useState } from 'react';
import { Sparkles, TrendingUp, CheckCircle2, AlertCircle } from 'lucide-react';
import type { QualityMetrics, Suggestion } from '@/lib/services/promptAnalyzer';

interface QualityScoreProps {
    metrics: QualityMetrics;
    onAnalyze: () => void;
    isAnalyzing?: boolean;
}

export default function QualityScore({ metrics, onAnalyze, isAnalyzing = false }: QualityScoreProps) {
    const getScoreColor = (score: number) => {
        if (score >= 8) return 'text-green-400';
        if (score >= 6) return 'text-yellow-400';
        return 'text-red-400';
    };

    const getScoreLabel = (score: number) => {
        if (score >= 8) return 'Excellent';
        if (score >= 6) return 'Good';
        if (score >= 4) return 'Fair';
        return 'Needs Work';
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-400" />
                    Prompt Quality
                </h3>
                <button
                    onClick={onAnalyze}
                    disabled={isAnalyzing}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                    {isAnalyzing ? 'Analyzing...' : 'Re-analyze'}
                </button>
            </div>

            {/* Overall Score */}
            <div className="text-center">
                <div className={`text-5xl font-bold ${getScoreColor(metrics.overall)}`}>
                    {metrics.overall.toFixed(1)}
                </div>
                <div className="text-sm text-slate-400 mt-1">{getScoreLabel(metrics.overall)}</div>
                <div className="text-xs text-slate-500 mt-2">
                    Last analyzed: {new Date(metrics.lastAnalyzed).toLocaleString()}
                </div>
            </div>

            {/* Metric Breakdown */}
            <div className="space-y-3">
                <MetricBar label="Clarity" value={metrics.clarity} />
                <MetricBar label="Specificity" value={metrics.specificity} />
                <MetricBar label="Structure" value={metrics.structure} />
                <MetricBar label="Completeness" value={metrics.completeness} />
            </div>

            {/* Suggestions */}
            {metrics.suggestions.length > 0 && (
                <div className="pt-4 border-t border-slate-800">
                    <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Suggestions ({metrics.suggestions.length})
                    </h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {metrics.suggestions.map((suggestion) => (
                            <SuggestionCard key={suggestion.id} suggestion={suggestion} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function MetricBar({ label, value }: { label: string; value: number }) {
    const percentage = (value / 10) * 100;
    const getColor = () => {
        if (value >= 8) return 'bg-green-500';
        if (value >= 6) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    return (
        <div>
            <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">{label}</span>
                <span className="text-slate-400">{value.toFixed(1)}/10</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                    className={`h-full ${getColor()} transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
    const [isExpanded, setIsExpanded] = useState(false);

    const getSeverityIcon = () => {
        switch (suggestion.severity) {
            case 'high':
                return <AlertCircle className="w-4 h-4 text-red-400" />;
            case 'medium':
                return <AlertCircle className="w-4 h-4 text-yellow-400" />;
            default:
                return <CheckCircle2 className="w-4 h-4 text-blue-400" />;
        }
    };

    const getSeverityColor = () => {
        switch (suggestion.severity) {
            case 'high':
                return 'border-red-500/30 bg-red-950/20';
            case 'medium':
                return 'border-yellow-500/30 bg-yellow-950/20';
            default:
                return 'border-blue-500/30 bg-blue-950/20';
        }
    };

    return (
        <div className={`border rounded-lg p-3 ${getSeverityColor()}`}>
            <div className="flex items-start gap-2">
                {getSeverityIcon()}
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200">{suggestion.message}</p>
                    {suggestion.suggestedChange && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="text-xs text-blue-400 hover:text-blue-300 mt-1"
                        >
                            {isExpanded ? 'Hide' : 'Show'} suggestion
                        </button>
                    )}
                    {isExpanded && suggestion.suggestedChange && (
                        <div className="mt-2 p-2 bg-slate-900/50 rounded text-xs text-slate-300 border border-slate-700">
                            {suggestion.suggestedChange}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
