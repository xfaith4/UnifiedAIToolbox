// Orchestrator Page - Coordinate multi-agent workflows and GitHub integration
import React, { useState } from 'react';
import { 
  Play, GitBranch, FileText, Sparkles, 
  CheckCircle, XCircle, Clock, Settings 
} from 'lucide-react';

export default function OrchestratorPage() {
  const [activeTab, setActiveTab] = useState('supervisor');
  const [tasks, setTasks] = useState([
    { id: '1', name: 'Review PR #123', status: 'completed', timestamp: '2025-11-14 00:30' },
    { id: '2', name: 'Analyze logs', status: 'running', timestamp: '2025-11-14 01:15' },
    { id: '3', name: 'Refine prompts', status: 'queued', timestamp: '2025-11-14 01:20' }
  ]);

  const tabs = [
    { id: 'supervisor', label: 'Supervisor', icon: Settings },
    { id: 'tasks', label: 'Task Inbox', icon: FileText },
    { id: 'github', label: 'GitHub Repo', icon: GitBranch }
  ];

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={18} color="#10b981" />;
      case 'running':
        return <Clock size={18} color="#f59e0b" />;
      case 'failed':
        return <XCircle size={18} color="#ef4444" />;
      default:
        return <Clock size={18} color="#6b7280" />;
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '0.5rem' }}>
          Orchestrator
        </h1>
        <p style={{ color: '#94a3b8' }}>
          Coordinate multi-agent workflows and automate code reviews
        </p>
      </div>

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        borderBottom: '2px solid #334155',
        marginBottom: '2rem' 
      }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                background: activeTab === tab.id ? '#1e293b' : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === tab.id ? '#f1f5f9' : '#94a3b8',
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? '600' : '400',
                fontSize: '0.875rem',
                marginBottom: '-2px',
                transition: 'all 0.2s'
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'supervisor' && (
        <div>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '0.75rem',
            padding: '2rem'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#f1f5f9', marginBottom: '1.5rem' }}>
              Create Orchestration Task
            </h3>

            {/* Goal Input */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '600',
                color: '#cbd5e1', 
                marginBottom: '0.5rem' 
              }}>
                Goal / Objective
              </label>
              <textarea
                placeholder="Describe what you want to accomplish..."
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: '0.75rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '0.5rem',
                  color: '#e2e8f0',
                  fontSize: '0.875rem',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Model Selection */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '600',
                color: '#cbd5e1', 
                marginBottom: '0.5rem' 
              }}>
                Model
              </label>
              <select
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '0.5rem',
                  color: '#e2e8f0',
                  fontSize: '0.875rem',
                  cursor: 'pointer'
                }}
              >
                <option>gpt-4o</option>
                <option>gpt-4o-mini</option>
                <option>gpt-4-turbo</option>
                <option>claude-3-opus</option>
              </select>
            </div>

            {/* Agent Selection */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '600',
                color: '#cbd5e1', 
                marginBottom: '0.5rem' 
              }}>
                Agents
              </label>
              <div style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '0.5rem',
                padding: '1rem',
                minHeight: '100px'
              }}>
                <p style={{ color: '#64748b', fontSize: '0.875rem', textAlign: 'center', padding: '1rem' }}>
                  Select agents from the Agent Library to participate in this workflow
                </p>
                <button
                  onClick={() => window.location.href = '/agents'}
                  style={{
                    display: 'block',
                    margin: '0 auto',
                    padding: '0.5rem 1rem',
                    background: '#334155',
                    border: 'none',
                    borderRadius: '0.375rem',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}
                >
                  Browse Agents
                </button>
              </div>
            </div>

            {/* Prompt Selection */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '600',
                color: '#cbd5e1', 
                marginBottom: '0.5rem' 
              }}>
                Prompts
              </label>
              <div style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '0.5rem',
                padding: '1rem',
                minHeight: '100px'
              }}>
                <p style={{ color: '#64748b', fontSize: '0.875rem', textAlign: 'center', padding: '1rem' }}>
                  Select prompts to use as instructions for the agents
                </p>
                <button
                  onClick={() => window.location.href = '/prompts'}
                  style={{
                    display: 'block',
                    margin: '0 auto',
                    padding: '0.5rem 1rem',
                    background: '#334155',
                    border: 'none',
                    borderRadius: '0.375rem',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}
                >
                  Browse Prompts
                </button>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  background: '#334155',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.875rem'
                }}
              >
                Save Draft
              </button>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  background: '#3b82f6',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.875rem'
                }}
              >
                <Play size={16} />
                Run Orchestration
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div>
          <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
              {tasks.length} task{tasks.length !== 1 ? 's' : ''} in queue
            </p>
            <button
              onClick={() => alert('Sending selected tasks to AIRefiner...')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                background: '#8b5cf6',
                border: 'none',
                borderRadius: '0.375rem',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: '600'
              }}
            >
              <Sparkles size={14} />
              Send to AIRefiner
            </button>
          </div>

          <div style={{ display: 'grid', gap: '1rem' }}>
            {tasks.map(task => (
              <div
                key={task.id}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '0.75rem',
                  padding: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {getStatusIcon(task.status)}
                  <div>
                    <div style={{ fontWeight: '600', color: '#f1f5f9', marginBottom: '0.25rem' }}>
                      {task.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {task.timestamp} • {task.status}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => alert(`Viewing details for task ${task.id}`)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#334155',
                    border: 'none',
                    borderRadius: '0.375rem',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}
                >
                  View Details
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'github' && (
        <div>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '0.75rem',
            padding: '2rem'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#f1f5f9', marginBottom: '1.5rem' }}>
              GitHub Repository Integration
            </h3>

            {/* Repo Selection */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '600',
                color: '#cbd5e1', 
                marginBottom: '0.5rem' 
              }}>
                Repository
              </label>
              <select
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '0.5rem',
                  color: '#e2e8f0',
                  fontSize: '0.875rem',
                  cursor: 'pointer'
                }}
              >
                <option value="">Select a repository...</option>
                <option value="org/repo1">org/repo1</option>
                <option value="org/repo2">org/repo2</option>
              </select>
            </div>

            {/* Branch Selection */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '600',
                color: '#cbd5e1', 
                marginBottom: '0.5rem' 
              }}>
                Target Branch
              </label>
              <input
                type="text"
                placeholder="main"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '0.5rem',
                  color: '#e2e8f0',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            {/* Codex Options */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem',
                padding: '1rem',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '0.5rem'
              }}>
                <input 
                  type="checkbox" 
                  id="enable-codex"
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label 
                  htmlFor="enable-codex"
                  style={{ 
                    fontSize: '0.875rem', 
                    color: '#cbd5e1',
                    cursor: 'pointer',
                    flex: 1
                  }}
                >
                  Run Codex Swarm for automated code review
                </label>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  background: '#334155',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.875rem'
                }}
                onClick={() => alert('Cloning repository...')}
              >
                <GitBranch size={16} />
                Clone & Review
              </button>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  background: '#10b981',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.875rem'
                }}
                onClick={() => alert('Creating PR...')}
              >
                Create PR
              </button>
            </div>

            {/* Status Display */}
            <div style={{
              marginTop: '2rem',
              padding: '1rem',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '0.5rem'
            }}>
              <div style={{ 
                fontSize: '0.75rem', 
                color: '#64748b', 
                marginBottom: '0.5rem',
                fontWeight: '600'
              }}>
                SWARM STATUS
              </div>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>
                No active swarm runs. Configure a repository and click "Clone & Review" to start.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
