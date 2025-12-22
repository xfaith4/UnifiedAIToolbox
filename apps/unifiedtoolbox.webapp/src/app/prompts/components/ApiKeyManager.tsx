'use client';

import { useState } from 'react';
import { Key, Eye, EyeOff, Check, X } from 'lucide-react';
import { validateOpenAIKey } from '@/lib/services/openai';

const API_KEY_STORAGE_KEY = 'openai-api-key';

interface ApiKeyManagerProps {
    onKeyChange: (apiKey: string | null) => void;
}

export default function ApiKeyManager({ onKeyChange }: ApiKeyManagerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [isValid, setIsValid] = useState<boolean | null>(null);
    const [hasStoredKey, setHasStoredKey] = useState(false);

    // Check for stored key on mount
    useState(() => {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
            if (stored) {
                setHasStoredKey(true);
                onKeyChange(stored);
            }
        }
    });

    const handleSave = async () => {
        if (!apiKey.trim()) return;

        setIsValidating(true);
        const valid = await validateOpenAIKey(apiKey);
        setIsValid(valid);
        setIsValidating(false);

        if (valid) {
            localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
            setHasStoredKey(true);
            onKeyChange(apiKey);
            setTimeout(() => {
                setIsOpen(false);
                setIsValid(null);
            }, 1500);
        }
    };

    const handleRemove = () => {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        setApiKey('');
        setHasStoredKey(false);
        setIsValid(null);
        onKeyChange(null);
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors flex items-center gap-2 ${hasStoredKey
                        ? 'bg-green-950/30 border-green-500/30 text-green-400 hover:bg-green-950/50'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
            >
                <Key className="w-4 h-4" />
                {hasStoredKey ? 'GPT-4 Enabled' : 'Add API Key'}
            </button>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                    <Key className="w-5 h-5 text-blue-400" />
                    OpenAI API Key
                </h3>

                <p className="text-sm text-slate-400 mb-4">
                    Add your OpenAI API key to enable GPT-4 powered prompt analysis and improvement.
                    Your key is stored locally and never sent to our servers.
                </p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            API Key
                        </label>
                        <div className="relative">
                            <input
                                type={showKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="sk-..."
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                            />
                            <button
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-700 rounded"
                            >
                                {showKey ? (
                                    <EyeOff className="w-4 h-4 text-slate-400" />
                                ) : (
                                    <Eye className="w-4 h-4 text-slate-400" />
                                )}
                            </button>
                        </div>
                        {isValid === false && (
                            <p className="text-sm text-red-400 mt-1">Invalid API key. Please check and try again.</p>
                        )}
                        {isValid === true && (
                            <p className="text-sm text-green-400 mt-1 flex items-center gap-1">
                                <Check className="w-4 h-4" />
                                API key validated successfully!
                            </p>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={handleSave}
                            disabled={!apiKey.trim() || isValidating}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isValidating ? 'Validating...' : 'Save Key'}
                        </button>
                        {hasStoredKey && (
                            <button
                                onClick={handleRemove}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            onClick={() => {
                                setIsOpen(false);
                                setIsValid(null);
                            }}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition-colors"
                        >
                            Cancel
                        </button>
                    </div>

                    <p className="text-xs text-slate-500">
                        Get your API key from{' '}
                        <a
                            href="https://platform.openai.com/api-keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300"
                        >
                            platform.openai.com/api-keys
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
