/**
 * Codex Run Viewer Component
 * 
 * Displays Codex swarm execution progress and findings.
 */

import React, { useState, useEffect } from 'react';
import {
  startCodexRun,
  getCodexRunStatus,
  listCodexRuns,
  getCodexFindings,
  cancelCodexRun,
  streamCodexRun,
  type CodexRunStatus,
  type CodexFinding,
} from '../services/githubApi';

interface CodexRunViewerProps {
  clonePath?: string;
  cloneId?: string;
  darkMode?: boolean;
}

export function CodexRunViewer({ clonePath, cloneId, darkMode = false }: CodexRunViewerProps) {
  const [runs, setRuns] = useState<CodexRunStatus[]>([]);
  const [selectedRun, setSelectedRun] = useState<CodexRunStatus | null>(null);
  const [findings, setFindings] = useState<CodexFinding[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState('gpt-4');
  const [maxParallel, setMaxParallel] = useState(3);

  // Load runs on mount
  useEffect(() => {
    loadRuns();
  }, []);

  // Auto-refresh selected run status
  useEffect(() => {
    if (!selectedRun || selectedRun.status === 'completed' || selectedRun.status === 'failed' || selectedRun.status === 'cancelled') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const status = await getCodexRunStatus(selectedRun.run_id);
        setSelectedRun(status);
        
        if (status.status === 'completed') {
          const findingsData = await getCodexFindings(status.run_id);
          setFindings(findingsData.findings);
        }
      } catch (err) {
        console.error('Failed to refresh run status:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedRun]);

  const loadRuns = async () => {
    try {
      const data = await listCodexRuns();
      setRuns(data.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs');
    }
  };

  const handleStartRun = async () => {
    if (!clonePath) {
      setError('No repository path provided');
      return;
    }

    setStarting(true);
    setError(null);
    setLogs([]);

    try {
      const response = await startCodexRun({
        repo_path: clonePath,
        model,
        max_parallel: maxParallel,
      });

      // Start streaming logs
      const eventSource = streamCodexRun(response.run_id);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.log_line) {
            setLogs(prev => [...prev, data.log_line]);
          }
          
          if (data.status) {
            // Refresh runs list
            loadRuns();
            
            if (data.status === 'completed' || data.status === 'failed') {
              eventSource.close();
              setStarting(false);
              
              if (data.status === 'completed') {
                // Load findings
                getCodexFindings(response.run_id).then((findingsData) => {
                  setFindings(findingsData.findings);
                });
              }
            }
          }
        } catch (err) {
          console.error('Failed to parse event:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource error:', err);
        eventSource.close();
        setStarting(false);
        setError('Connection to server lost');
      };

      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
      setStarting(false);
    }
  };

  const handleSelectRun = async (run: CodexRunStatus) => {
    setSelectedRun(run);
    setLogs([]);
    
    if (run.status === 'completed') {
      try {
        const findingsData = await getCodexFindings(run.run_id);
        setFindings(findingsData.findings);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load findings');
      }
    }
  };

  const handleCancelRun = async (runId: string) => {
    try {
      await cancelCodexRun(runId);
      await loadRuns();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel run');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#28a745';
      case 'running': return '#007bff';
      case 'failed': return '#dc3545';
      case 'cancelled': return '#6c757d';
      default: return '#ffc107';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✅';
      case 'running': return '⏳';
      case 'failed': return '❌';
      case 'cancelled': return '🚫';
      default: return '⏸️';
    }
  };

  return (
    <div style={{
      padding: '20px',
      backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
      color: darkMode ? '#e0e0e0' : '#333333',
      borderRadius: '8px',
    }}>
      <h2>Codex Swarm Execution</h2>

      {/* Start New Run */}
      {clonePath && (
        <div style={{
          padding: '15px',
          marginBottom: '20px',
          backgroundColor: darkMode ? '#2d2d2d' : '#f5f5f5',
          border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
          borderRadius: '4px',
        }}>
          <h3>Start New Codex Run</h3>
          <p><strong>Repository:</strong> {clonePath}</p>
          {cloneId && <p><strong>Clone ID:</strong> {cloneId}</p>}
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px' }}>Model:</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
                  color: darkMode ? '#e0e0e0' : '#333333',
                  border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                  borderRadius: '4px',
                }}
              >
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px' }}>Max Parallel:</label>
              <input
                type="number"
                value={maxParallel}
                onChange={(e) => setMaxParallel(parseInt(e.target.value) || 3)}
                min="1"
                max="10"
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
                  color: darkMode ? '#e0e0e0' : '#333333',
                  border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>
          
          <button
            onClick={handleStartRun}
            disabled={starting}
            style={{
              padding: '10px 20px',
              backgroundColor: starting ? '#666' : '#007bff',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: starting ? 'not-allowed' : 'pointer',
            }}
          >
            {starting ? 'Running...' : 'Start Codex Swarm'}
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div style={{
          padding: '10px',
          marginBottom: '20px',
          backgroundColor: '#ff000020',
          border: '1px solid #ff0000',
          borderRadius: '4px',
          color: darkMode ? '#ff6b6b' : '#cc0000',
        }}>
          {error}
        </div>
      )}

      {/* Live Logs */}
      {logs.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3>Live Logs</h3>
          <div style={{
            maxHeight: '300px',
            overflowY: 'auto',
            padding: '10px',
            backgroundColor: darkMode ? '#0d1117' : '#f6f8fa',
            border: `1px solid ${darkMode ? '#30363d' : '#d0d7de'}`,
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '0.9em',
          }}>
            {logs.map((log, index) => (
              <div key={index} style={{ marginBottom: '2px' }}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run History */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Run History</h3>
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {runs.length === 0 ? (
            <p style={{ opacity: 0.6 }}>No runs yet</p>
          ) : (
            runs.map((run) => (
              <div
                key={run.run_id}
                onClick={() => handleSelectRun(run)}
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  backgroundColor: selectedRun?.run_id === run.run_id
                    ? (darkMode ? '#3a3a3a' : '#e3f2fd')
                    : (darkMode ? '#2d2d2d' : '#f9f9f9'),
                  border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                      {getStatusIcon(run.status)} {run.run_id.substring(0, 8)}...
                      <span style={{
                        marginLeft: '10px',
                        padding: '2px 8px',
                        backgroundColor: getStatusColor(run.status),
                        color: '#ffffff',
                        borderRadius: '4px',
                        fontSize: '0.85em',
                      }}>
                        {run.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
                      Started: {new Date(run.start_time).toLocaleString()}
                    </div>
                    {run.findings_count !== undefined && (
                      <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
                        Findings: {run.findings_count}
                      </div>
                    )}
                  </div>
                  {run.status === 'running' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelRun(run.run_id);
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#dc3545',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.9em',
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Findings Display */}
      {selectedRun && findings.length > 0 && (
        <div>
          <h3>Findings for Run {selectedRun.run_id.substring(0, 8)}...</h3>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {findings.map((finding) => (
              <div
                key={finding.id}
                style={{
                  padding: '15px',
                  marginBottom: '10px',
                  backgroundColor: darkMode ? '#2d2d2d' : '#f9f9f9',
                  border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                  borderRadius: '4px',
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                  Agent: {finding.agent_role} | Shard: {finding.shard}
                </div>
                <div style={{
                  padding: '10px',
                  backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
                  border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.9em',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}>
                  {finding.log_content}
                </div>
                <div style={{ fontSize: '0.85em', opacity: 0.6, marginTop: '8px' }}>
                  Log file: {finding.log_file}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CodexRunViewer;
