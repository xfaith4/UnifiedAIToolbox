import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, User, Brain, Shield, Layers, Award } from "lucide-react";

const agentIcons = {
  Researcher: Brain,
  Engineer: User,
  Critic: Shield,
  Synthesizer: Layers,
  Commissioner: Award,
};

const agentColors = {
  Researcher: "text-blue-400",
  Engineer: "text-green-400",
  Critic: "text-red-400",
  Synthesizer: "text-purple-400",
  Commissioner: "text-yellow-400",
};

export default function AgentDetails({ runFolder }) {
  const [expanded, setExpanded] = useState(false);
  const [agentData, setAgentData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Extract runId from runFolder path (handles both Windows and Unix paths)
  const runId = runFolder ? runFolder.match(/(\d{8}-\d{6})/)?.[1] : null;

  const fetchAgentData = async () => {
    if (!runId) return;
    
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:5050/api/run-agents/${runId}`);
      if (res.ok) {
        const data = await res.json();
        setAgentData(data);
      }
    } catch (err) {
      console.error("Error loading agent data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded && !agentData) {
      fetchAgentData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  const agentCount = agentData ? Object.keys(agentData).length : 0;

  return (
    <div className="w-full">
      <button
        onClick={toggleExpanded}
        className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition font-medium"
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span>
          {agentCount > 0 ? `${agentCount} Agents` : "View Agents"}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 pl-6">
          {loading && (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400"></div>
              Loading agents...
            </div>
          )}
          
          {agentData && Object.keys(agentData).length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-sm italic">No agent data available</p>
          )}

          {agentData && Object.entries(agentData).map(([agentName, content]) => {
            const Icon = agentIcons[agentName] || User;
            const color = agentColors[agentName] || "text-gray-400";
            
            return (
              <div key={agentName} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={18} className={color} />
                  <h4 className={`font-semibold ${color}`}>{agentName}</h4>
                </div>
                <div className="text-xs text-gray-800 dark:text-gray-300 font-mono whitespace-pre-wrap bg-white dark:bg-gray-950 p-2 rounded max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-800">
                  {content}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
