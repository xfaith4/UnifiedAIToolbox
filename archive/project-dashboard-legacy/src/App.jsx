// ### BEGIN FILE: MilestoneDashboard/src/App.jsx
import React, { useEffect, useState, useCallback } from 'react';
import SkeletonLoader from './components/SkeletonLoader';

export default function App() {
  const [goalData, setGoalData] = useState(null);
  const [logData, setLogData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const baseURL = import.meta.env.BASE_URL || '/';

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const [goalResp, logResp] = await Promise.all([
        fetch(`${baseURL}data/CurrentGoal.json`),
        fetch(`${baseURL}data/Milestone_Log.json`)
      ]);

      // Handle goal data response
      if (!goalResp.ok) {
        throw new Error('Failed to load goal data');
      }
      const goalData = await goalResp.json();
      setGoalData(goalData);

      // Handle log data response
      if (!logResp.ok) {
        throw new Error('Failed to load log data');
      }
      const logData = await logResp.json();
      setLogData(Array.isArray(logData) ? logData : []);
      
    } catch (err) {
      console.error('❌ Failed to load dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {

    loadData();

    // Optional auto-refresh every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [baseURL]);

  // Show loading state
  if (isLoading) {
    return (
      <div style={{
        padding: '2rem',
        maxWidth: '800px',
        margin: '0 auto',
        color: '#e6eef5'
      }}>
        <h2 style={{ marginBottom: '1.5rem', color: '#45d0a8' }}>📊 Loading Dashboard</h2>
        <SkeletonLoader count={5} height="20px" />
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div style={{
        padding: '2rem',
        background: '#1a1f2e',
        color: '#ff6b6b',
        borderRadius: '8px',
        maxWidth: '800px',
        margin: '2rem auto',
        textAlign: 'center'
      }}>
        <h2>⚠️ Error Loading Dashboard</h2>
        <p style={{ margin: '1rem 0' }}>{error}</p>
        <button
          onClick={loadData}
          style={{
            background: '#45d0a8',
            color: '#0b0f14',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            marginTop: '1rem'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', background: '#0b0f14', color: '#e6eef5', minHeight: '100vh', padding: '2rem' }}>
      <h1 style={{ color: '#45d0a8' }}>AI-Orchestration Milestone Dashboard</h1>

      <section style={{ marginTop: '2rem', background: '#111827', padding: '1rem', borderRadius: '12px' }}>
        <h2>🎯 Current Goal</h2>
        <p><strong>Goal:</strong> {goalData.goal}</p>
        <p><strong>Objective:</strong> {goalData.objective}</p>
        <p><strong>Success Criteria:</strong></p>
        <ul>
          {goalData.successCriteria?.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: '2rem', background: '#1e293b', padding: '1rem', borderRadius: '12px' }}>
        <h2>📜 Milestone Log</h2>
        {logData.length > 0 ? (
          <ul>
            {logData.map((entry, idx) => (
              <li key={idx}>
                <strong>{entry.timestamp}</strong> — {entry.message}
              </li>
            ))}
          </ul>
        ) : (
          <p>No log data available.</p>
        )}
      </section>

      <footer style={{ marginTop: '3rem', fontSize: '0.85rem', color: '#94a3b8' }}>
        <p>Last updated: {new Date().toLocaleString()}</p>
      </footer>
    </main>
  );
}
// ### END FILE
