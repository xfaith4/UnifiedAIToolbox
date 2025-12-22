import React, { useState, useEffect } from "react";
import { X, Save, FileEdit, AlertCircle } from "lucide-react";

const agentIcons = {
  Researcher: "🔬",
  Engineer: "⚙️",
  Critic: "🛡️",
  Synthesizer: "🔗",
  Commissioner: "⭐"
};

export default function AgentInstructionsEditor({ isOpen, onClose }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchAgentInstructions();
    }
  }, [isOpen]);

  const fetchAgentInstructions = async () => {
    setLoading(true);
    setError(null);
    try {
      // Note: API URL is localhost-only as this dashboard is designed for local development
      const res = await fetch("http://localhost:5050/api/agent-instructions");
      if (res.ok) {
        const data = await res.json();
        setAgents(data.Agents || []);
      } else {
        setError("Failed to load agent instructions");
      }
    } catch (err) {
      setError("Error loading agent instructions: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePromptChange = (index, newPrompt) => {
    const updated = [...agents];
    updated[index].prompt = newPrompt;
    setAgents(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    setError(null);

    try {
      // Note: API URL is localhost-only as this dashboard is designed for local development
      const res = await fetch("http://localhost:5050/api/agent-instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents }),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.status === "success") {
          setSaveStatus({
            type: "success",
            message: `✅ Agent instructions saved successfully! Branch: ${result.branch}`,
            details: result.message
          });
        } else if (result.status === "saved") {
          setSaveStatus({
            type: "warning",
            message: "⚠️ Changes saved locally",
            details: result.warning
          });
        }
      } else {
        setError("Failed to save agent instructions");
      }
    } catch (err) {
      setError("Error saving agent instructions: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-800 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <FileEdit className="text-green-600 dark:text-green-400" size={28} />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Agent Instructions Editor</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400"></div>
              <p className="text-gray-600 dark:text-gray-400 mt-3">Loading agent instructions...</p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 flex items-start gap-3">
              <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={20} />
              <div>
                <p className="text-red-800 dark:text-red-400 font-semibold">Error</p>
                <p className="text-red-700 dark:text-red-300 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {saveStatus && (
            <div className={`mb-4 p-4 rounded-lg border ${
              saveStatus.type === 'success' 
                ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20' 
                : 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20'
            } flex items-start gap-3`}>
              <AlertCircle 
                className={saveStatus.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'} 
                size={20} 
              />
              <div>
                <p className={`font-semibold ${
                  saveStatus.type === 'success' ? 'text-green-800 dark:text-green-400' : 'text-yellow-800 dark:text-yellow-400'
                }`}>
                  {saveStatus.message}
                </p>
                {saveStatus.details && (
                  <p className={`text-sm mt-1 ${
                    saveStatus.type === 'success' ? 'text-green-700 dark:text-green-300' : 'text-yellow-700 dark:text-yellow-300'
                  }`}>
                    {saveStatus.details}
                  </p>
                )}
              </div>
            </div>
          )}

          {!loading && agents.length > 0 && (
            <div className="space-y-6">
              {agents.map((agent, index) => (
                <div
                  key={agent.name}
                  className="border border-gray-200 dark:border-gray-800 rounded-lg p-5 bg-gray-50 dark:bg-gray-950/50 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{agentIcons[agent.name] || "🤖"}</span>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{agent.name}</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-500">Role: {agent.role}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-2">
                      Instruction Prompt
                    </label>
                    <textarea
                      className="w-full h-32 p-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-mono text-gray-900 dark:text-gray-200 focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent transition-all"
                      value={agent.prompt}
                      onChange={(e) => handlePromptChange(index, e.target.value)}
                      placeholder="Enter agent instruction prompt..."
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex justify-between items-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Changes will be saved to prompts/Agents.json and create a pull request for review.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-sm font-semibold transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-green-600 dark:bg-green-500 rounded-lg hover:bg-green-700 dark:hover:bg-green-600 text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
