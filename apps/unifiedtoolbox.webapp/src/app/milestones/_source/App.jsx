// ### BEGIN FILE: MilestoneDashboard/src/App.jsx
import React, { useEffect, useState } from 'react';

export default function App() {
  const [goalData, setGoalData] = useState(null);
  const [logData, setLogData] = useState([]);
  const baseURL = '/milestone-data/';

  useEffect(() => {
    // Dynamically load both CurrentGoal and Milestone_Log
    async function loadData() {
      try {
        const goalResp = await fetch(`${baseURL}data/CurrentGoal.json`);
        if (goalResp.ok) {
          setGoalData(await goalResp.json());
        } else {
          console.warn('⚠️ Could not load CurrentGoal.json');
        }

        const logResp = await fetch(`${baseURL}data/Milestone_Log.json`);
        if (logResp.ok) {
          setLogData(await logResp.json());
        } else {
          console.warn('⚠️ Could not load Milestone_Log.json');
        }
      } catch (err) {
        console.error('❌ Failed to load dashboard data:', err);
      }
    }

    loadData();

    // Optional auto-refresh every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [baseURL]);

  if (!goalData) {
    return (
      <div style={{ color: '#ccc', fontFamily: 'sans-serif', padding: '2rem' }}>
        <h2>📊 Loading Milestone Dashboard...</h2>
        <p>Please wait while data initializes.</p>
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
