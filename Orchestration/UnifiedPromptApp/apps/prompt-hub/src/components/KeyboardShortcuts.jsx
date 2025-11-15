import React, { useState } from 'react';
import { Keyboard, X } from 'lucide-react';

export default function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  const shortcuts = [
    { keys: ['Ctrl', 'S'], mac: ['⌘', 'S'], description: 'Save current goal' },
    { keys: ['Ctrl', 'E'], mac: ['⌘', 'E'], description: 'Edit agent instructions' },
    { keys: ['Shift', '?'], description: 'Show keyboard shortcuts' },
  ];

  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 p-3 bg-gray-200 dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors z-40"
        aria-label="Show keyboard shortcuts"
        title="Keyboard shortcuts (?)"
      >
        <Keyboard size={20} className="text-gray-700 dark:text-gray-300" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setIsOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-800 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <Keyboard className="text-blue-600 dark:text-blue-400" size={24} />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Keyboard Shortcuts</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-3">
              {shortcuts.map((shortcut, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-gray-700 dark:text-gray-300 text-sm">{shortcut.description}</span>
                  <div className="flex gap-1">
                    {(isMac && shortcut.mac ? shortcut.mac : shortcut.keys).map((key, keyIdx) => (
                      <kbd
                        key={keyIdx}
                        className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-xs font-mono text-gray-800 dark:text-gray-200"
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 rounded-b-xl">
              <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
                Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded text-xs">Shift</kbd> + <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded text-xs">?</kbd> to toggle this dialog
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
