import React, { useState, useEffect } from "react";
import { Circle, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const agentIcons = {
  Researcher: "🔬",
  Engineer: "⚙️",
  Critic: "🛡️",
  Synthesizer: "🔗",
  Commissioner: "⭐"
};

const agentColors = {
  Researcher: "border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20",
  Engineer: "border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/20",
  Critic: "border-red-400 dark:border-red-500 bg-red-50 dark:bg-red-900/20",
  Synthesizer: "border-purple-400 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/20",
  Commissioner: "border-yellow-400 dark:border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
};

const statusIcons = {
  idle: Circle,
  working: Loader2,
  complete: CheckCircle2,
  error: AlertCircle
};

const statusColors = {
  idle: "text-gray-400 dark:text-gray-500",
  working: "text-yellow-600 dark:text-yellow-400 animate-spin",
  complete: "text-green-600 dark:text-green-400",
  error: "text-red-600 dark:text-red-400"
};

export default function AgentActivityStatus({ runId, isActive }) {
  const [agentStatuses, setAgentStatuses] = useState({});
  const [improvements, setImprovements] = useState([]);

  const agents = ["Researcher", "Engineer", "Critic", "Synthesizer", "Commissioner"];

  const fetchStatus = async () => {
    if (!runId) return;

    try {
      const res = await fetch(`http://localhost:5050/api/run-status/${runId}`);
      if (res.ok) {
        const statuses = await res.json();
        
        // Build current status for each agent (latest status per agent)
        const currentStatuses = {};
        statuses.forEach(s => {
          currentStatuses[s.agent] = {
            status: s.status,
            timestamp: s.timestamp
          };
        });
        
        setAgentStatuses(currentStatuses);
      }
    } catch (err) {
      console.error("Error fetching agent status:", err);
    }
  };

  const fetchImprovements = async () => {
    if (!runId) return;

    try {
      const res = await fetch(`http://localhost:5050/api/run-improvements/${runId}`);
      if (res.ok) {
        const data = await res.json();
        setImprovements(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Error fetching improvements:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchImprovements();

    // Poll for updates if active
    if (isActive) {
      const interval = setInterval(() => {
        fetchStatus();
        fetchImprovements();
      }, 3000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, isActive]);

  const getAgentStatus = (agentName) => {
    return agentStatuses[agentName]?.status || "idle";
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {agents.map(agent => {
          const status = getAgentStatus(agent);
          const StatusIcon = statusIcons[status];
          const colorClass = agentColors[agent] || "border-gray-500 bg-gray-950/20";
          const iconColor = statusColors[status];

          return (
            <div
              key={agent}
              className={`p-4 border-2 rounded-lg ${colorClass} transition-all hover:shadow-md`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-2xl">{agentIcons[agent] || "🤖"}</div>
                <StatusIcon size={20} className={iconColor} />
              </div>
              <div className="font-semibold text-sm text-gray-900 dark:text-white">{agent}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 capitalize">{status}</div>
            </div>
          );
        })}
      </div>

      {/* Agent Improvements Section */}
      {improvements.length > 0 && (
        <div className="mt-6 p-4 border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-400 mb-3 flex items-center gap-2">
            <AlertCircle size={20} />
            Commissioner's Agent Improvement Suggestions
          </h3>
          <div className="space-y-3">
            {improvements.map((improvement, idx) => (
              <div key={idx} className="bg-white dark:bg-gray-900 p-3 rounded border border-yellow-200 dark:border-gray-700">
                <div className="font-semibold text-yellow-700 dark:text-yellow-300 mb-1">
                  {agentIcons[improvement.agent]} {improvement.agent}
                </div>
                <div className="text-sm text-gray-800 dark:text-gray-300">{improvement.suggestion}</div>
                <div className="text-xs text-gray-600 dark:text-gray-500 mt-2">
                  {new Date(improvement.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
