import React from 'react';
import { BookIcon } from './icons';

interface ExpectedOutputsPanelProps {
  onLearnMore?: () => void;
}

const ExpectedOutputsPanel: React.FC<ExpectedOutputsPanelProps> = ({ onLearnMore }) => {
  return (
    <section
      aria-label="Expected Outputs"
      className="p-4 border-b border-gray-700 bg-gray-900/30"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Expected Outputs</h2>
          {onLearnMore && (
            <button
              type="button"
              onClick={onLearnMore}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <BookIcon className="w-4 h-4 text-indigo-300" />
              Learn more
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
            <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Repo ZIP</div>
            <p className="mt-1 text-gray-300 text-sm">
              Exportable repository bundle (ZIP) containing generated source code.
            </p>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
            <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Build Instructions</div>
            <p className="mt-1 text-gray-300 text-sm">
              README or BUILD.md describing setup, run, build, and test steps.
            </p>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
            <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Acceptance Checks</div>
            <ul className="mt-2 space-y-1 text-gray-300 text-sm">
              {[
                'Project builds successfully',
                'Lint/tests pass (if configured)',
                'App starts and primary workflow loads',
                'Any required env vars are documented',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    disabled
                    aria-hidden="true"
                    className="mt-0.5 h-3.5 w-3.5 rounded border-gray-600 bg-gray-900/40"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ExpectedOutputsPanel;

