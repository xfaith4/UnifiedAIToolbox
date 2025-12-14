// ### BEGIN FILE: MilestoneDashboard/src/App.jsx
import React, { useEffect, useMemo, useState } from 'react';

const baseURL = '/milestone-data/';

function normalizeGoal(raw = {}) {
  const goalText = raw.goal ?? raw.Goal ?? '';
  const objective = raw.objective ?? raw.Objective ?? extractSection(goalText, 'Action Plan');
  const successCriteria = raw.successCriteria ?? raw.SuccessCriteria ?? extractSuccessCriteria(goalText);

  return {
    goal: goalText || 'Goal not recorded yet',
    objective: objective || 'Objective not available',
    successCriteria: Array.isArray(successCriteria) ? successCriteria : [],
    score: raw.score ?? raw.Score ?? null,
    trend: raw.trend ?? raw.Trend ?? '↔',
    momentum: raw.momentum ?? raw.Momentum ?? 'Stable',
    timestamp: raw.timestamp ?? raw.Timestamp ?? null,
  };
}

function extractSection(text, label) {
  if (!text || !label) return '';
  const regex = new RegExp(`${label}:\\s*([^✅\\n]*)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

function extractSuccessCriteria(text) {
  if (!text) return [];
  const match = text.match(/✅\s*Success Criteria\s*:(.*)$/is);
  if (!match) return [];
  return match[1]
    .split(/[\r\n]+/)
    .map((line) => line.trim().replace(/^[-•]\s*/, ''))
    .filter(Boolean);
}

function normalizeLogEntries(entries = []) {
  return entries.map((entry = {}) => {
    const message =
      entry.message ??
      entry.Message ??
      entry.Goal ??
      entry.Outcome ??
      entry.Synthesis ??
      'Log entry missing context';

    const score = entry.Score ?? entry.score ?? null;
    const tokens = entry.Tokens ?? entry.tokens ?? '';
    const cost = entry.Cost ?? entry.cost ?? '';
    const outcome = entry.Outcome ?? entry.outcome ?? '';
    const baseTags = extractHashtags(message);
    const derivedTags = deriveMetricTags({ score, tokens, cost, outcome });

    return {
      timestamp: entry.timestamp ?? entry.Timestamp ?? '',
      message,
      goal: entry.Goal ?? entry.goal ?? '',
      outcome,
      score,
      tokens,
      cost,
      runFolder: entry.RunFolder ?? entry.runFolder ?? '',
      tags: Array.from(new Set([...baseTags, ...derivedTags])),
      derivedTags,
    };
  });
}

function deriveMetricTags({ score, tokens, cost, outcome }) {
  const tags = [];
  const normalizedOutcome = outcome ? outcome.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'unknown-outcome';
  tags.push(`outcome-${normalizedOutcome}`);

  if (typeof score === 'number') {
    if (score >= 8) tags.push('category-excellent');
    else if (score >= 6) tags.push('category-good');
    else tags.push('category-early');
    tags.push(`score-${Math.floor(score)}`);
  }

  const tokenValue = parseFloat(tokens) || 0;
  if (tokenValue > 1000) tags.push('tokens-heavy');
  else if (tokenValue > 500) tags.push('tokens-medium');
  else tags.push('tokens-light');

  const costValue = parseFloat(cost) || 0;
  if (costValue > 1) tags.push('cost-high');
  else if (costValue > 0.5) tags.push('cost-medium');
  else tags.push('cost-low');

  return tags;
}

function extractHashtags(text = '') {
  const matches = text.match(/#([\w-]+)/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((tag) => tag.slice(1))));
}

function buildHistogram(values = [], bucketCount = 5) {
  if (!values.length) {
    return { buckets: Array(bucketCount).fill(0), min: 0, max: 0 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const buckets = Array(bucketCount).fill(0);

  values.forEach((value) => {
    const normalized = Math.min(bucketCount - 1, Math.floor(((value - min) / range) * bucketCount));
    buckets[Math.max(0, normalized)] += 1;
  });

  return { buckets, min, max };
}

export default function App() {
  const [goalData, setGoalData] = useState(null);
  const [logData, setLogData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [customTagsByRun, setCustomTagsByRun] = useState({});
  const [expandedRunKey, setExpandedRunKey] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const [goalResp, logResp] = await Promise.all([
          fetch(`${baseURL}data/CurrentGoal.json`),
          fetch(`${baseURL}data/Milestone_Log.json`),
        ]);

        if (goalResp.ok) {
          const rawGoal = await goalResp.json();
          if (mounted) setGoalData(normalizeGoal(rawGoal));
        } else {
          console.warn('⚠️ Could not load CurrentGoal.json');
        }

        if (logResp.ok) {
          const rawLog = await logResp.json();
          if (mounted) setLogData(normalizeLogEntries(rawLog));
        } else {
          console.warn('⚠️ Could not load Milestone_Log.json');
        }
      } catch (err) {
        console.error('❌ Failed to load dashboard data:', err);
      }
    }

    loadData();

    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const tagOptions = useMemo(() => {
    const tags = new Set();
    logData.forEach((entry) => entry.tags.forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort();
  }, [logData]);

  const filteredLogs = useMemo(() => {
    return logData.filter((entry) => {
      const matchesTag = activeTag ? entry.tags.includes(activeTag) : true;
      const lower = searchTerm.toLowerCase();
      const matchesSearch = !lower || [entry.message, entry.goal, entry.outcome, entry.runFolder]
        .some((value) => value?.toLowerCase().includes(lower));
      return matchesTag && matchesSearch;
    });
  }, [activeTag, logData, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTag, searchTerm]);

  const analytics = useMemo(() => {
    const values = logData.map((entry) => ({
      tokens: parseFloat(entry.tokens) || 0,
      cost: parseFloat(entry.cost) || 0,
      score: parseFloat(entry.score) || 0,
      outcome: entry.outcome ?? 'unknown',
      category: entry.tags.find((tag) => tag.startsWith('category-')) ?? 'category-unknown',
    }));

    if (!values.length) {
      const emptyHistogram = buildHistogram([]);
      return {
        avgTokens: 0,
        avgCost: 0,
        avgScore: 0,
        peakTokens: 0,
        peakCost: 0,
        peakScore: 0,
        tokensHistogram: emptyHistogram,
        costHistogram: emptyHistogram,
        scoreHistogram: emptyHistogram,
        outcomeCounts: {},
        categoryCounts: {},
      };
    }

    const avgTokens = values.reduce((sum, v) => sum + v.tokens, 0) / values.length;
    const avgCost = values.reduce((sum, v) => sum + v.cost, 0) / values.length;
    const avgScore = values.reduce((sum, v) => sum + v.score, 0) / values.length;
    const peakTokens = Math.max(...values.map((v) => v.tokens));
    const peakCost = Math.max(...values.map((v) => v.cost));
    const peakScore = Math.max(...values.map((v) => v.score));

    const tokensHistogram = buildHistogram(values.map((v) => v.tokens));
    const costHistogram = buildHistogram(values.map((v) => v.cost));
    const scoreHistogram = buildHistogram(values.map((v) => v.score));

    const outcomeCounts = values.reduce((acc, { outcome }) => {
      const key = outcome || 'unknown';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const categoryCounts = values.reduce((acc, { category }) => {
      acc[category] = (acc[category] ?? 0) + 1;
      return acc;
    }, {});

    return { avgTokens, avgCost, avgScore, peakTokens, peakCost, peakScore, tokensHistogram, costHistogram, scoreHistogram, outcomeCounts, categoryCounts };
  }, [logData]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const displayedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const handleAddCustomTag = (runKey, value) => {
    const normalized = value.trim().replace(/^#/, '');
    if (!normalized) return;
    setCustomTagsByRun((prev) => {
      const existing = prev[runKey] ?? [];
      if (existing.includes(normalized)) return prev;
      return { ...prev, [runKey]: [...existing, normalized] };
    });
  };

  const runHashtags = (entry, key) => {
    const baseTags = entry.tags;
    const custom = customTagsByRun[key] ?? [];
    return Array.from(new Set([...baseTags, ...custom]));
  };

  const latestRun = logData[0];
  const totalRuns = logData.length;

  if (!goalData) {
    return (
      <div style={{ color: '#a5b4fc', fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
        <h2>📊 Loading Milestone Dashboard...</h2>
        <p>Please wait while data initializes.</p>
      </div>
    );
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#020617', color: '#f8fafc', padding: '2rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline' }}>
          <div>
            <p style={{ fontSize: '0.9rem', color: '#a5b4fc' }}>AI-Orchestration Milestone Dashboard</p>
            <h1 style={{ margin: '0.25rem 0', color: '#22d3ee' }}>Live & Historical Orchestration Insights</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ padding: '0.5rem 1rem', borderRadius: '999px', background: '#1f2937', fontSize: '0.85rem' }}>Runs tracked: {totalRuns}</span>
            {latestRun?.score != null && (
              <span style={{ padding: '0.5rem 1rem', borderRadius: '999px', background: '#0f172a', fontSize: '0.85rem' }}>
                Latest Score: {latestRun.score} • Outcome: {latestRun.outcome || 'n/a'}
              </span>
            )}
          </div>
        </header>

        <section style={{ marginTop: '1.5rem', ...analyticsCardStyle }}>
          <p style={{ margin: 0, color: '#7dd3fc', fontSize: '0.9rem' }}>Metrics & Trends</p>
          <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {[
              { label: 'Average Tokens', value: analytics.avgTokens, peak: analytics.peakTokens, color: '#22d3ee' },
              { label: 'Average Cost', value: analytics.avgCost, peak: analytics.peakCost, color: '#34d399' },
              { label: 'Average Score', value: analytics.avgScore, peak: analytics.peakScore, color: '#f472b6' },
            ].map(({ label, value, peak, color }) => (
              <div key={label} style={{ padding: '0.75rem', borderRadius: '12px', background: '#0b1120' }}>
                <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.85rem', color: '#cbd5f5' }}>{label}</p>
                <div style={{ fontSize: '1.3rem', fontWeight: 600, color }}>{value.toFixed(2)}</div>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>Peak: {peak.toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
            {[
              { label: 'Token Usage', histogram: analytics.tokensHistogram, color: '#8b5cf6' },
              { label: 'Cost', histogram: analytics.costHistogram, color: '#f97316' },
              { label: 'Score', histogram: analytics.scoreHistogram, color: '#22d3ee' },
            ].map(({ label, histogram, color }) => (
              <div key={label}>
                <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.85rem', color: '#cbd5f5' }}>{label} distribution</p>
                <div style={histogramBarWrapperStyle}>
                  {histogram.buckets.map((count, idx) => (
                    <div
                      key={`${label}-${idx}`}
                      style={{
                        ...histogramSegmentStyle,
                        background: color,
                        flex: count || 0.25,
                      }}
                    />
                  ))}
                </div>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Range: {histogram.min.toFixed(1)} → {histogram.max.toFixed(1)} | Buckets: {histogram.buckets.map((c) => c).join(', ')}
                </p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {Object.entries(analytics.outcomeCounts).map(([key, count]) => (
              <span key={key} style={outcomeChipStyle}>{key}: {count}</span>
            ))}
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {Object.entries(analytics.categoryCounts).map(([key, count]) => (
              <span key={key} style={outcomeChipStyle}>{key.replace('category-', '')}: {count}</span>
            ))}
          </div>
        </section>

        <section style={{ marginTop: '2rem', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          <div style={cardStyle}>
            <p style={{ fontSize: '0.9rem', color: '#93c5fd' }}>Goal Snapshot</p>
            <h2 style={{ marginTop: 0, fontSize: '1.5rem', color: '#f8fafc' }}>{goalData.goal}</h2>
            <p style={{ color: '#e0e7ff' }}><strong>Objective:</strong> {goalData.objective}</p>
            <p style={{ color: '#e0e7ff', marginBottom: '0.25rem' }}><strong>Success Criteria:</strong></p>
            {goalData.successCriteria.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '1rem', color: '#cbd5f5' }}>
                {goalData.successCriteria.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            ) : (
              <p style={{ color: '#94a3b8', margin: 0 }}>No success criteria published yet.</p>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', color: '#38bdf8', fontSize: '0.9rem' }}>
              <span>Score: {goalData.score ?? 'unrated'}</span>
              <span>Trend: {goalData.trend}</span>
              <span>Momentum: {goalData.momentum}</span>
            </div>
          </div>
          <div style={cardStyle}>
            <p style={{ fontSize: '0.9rem', color: '#93c5fd' }}>Run Timeline</p>
            <p style={{ margin: '0.35rem 0', fontSize: '1.25rem', fontWeight: 600 }}><span role="img" aria-label="clock">⏱️</span> Latest entry</p>
            {latestRun ? (
              <>
                <p style={{ color: '#cbd5f5', margin: 0 }}>{latestRun.timestamp || 'Timestamp missing'}</p>
                <p style={{ margin: '0.35rem 0', color: '#e0e7ff' }}>{latestRun.goal || latestRun.message}</p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {latestRun.tags.map((tag) => (
                    <span key={tag} style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem', borderRadius: '999px', background: '#111827' }}>#{tag}</span>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ color: '#94a3b8' }}>No runs recorded yet.</p>
            )}
          </div>
        </section>

        <section style={{ marginTop: '2rem', background: '#111827', borderRadius: '16px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <div style={inputWrapperStyle}>
              <span role="img" aria-label="search">🔍</span>
              <input
                placeholder="Search logs, goals, outcomes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {['', ...tagOptions].map((tag) => (
                <button
                  key={tag || 'all'}
                  onClick={() => setActiveTag(tag)}
                  style={{
                    ...chipStyle,
                    background: activeTag === tag || (!tag && !activeTag) ? '#2563eb' : '#0f172a',
                  }}
                >
                  {tag ? `#${tag}` : 'All tags'}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section style={{ marginTop: '1rem' }}>
          {displayedLogs.length === 0 ? (
            <p style={{ color: '#94a3b8' }}>No log entries match the current filters.</p>
          ) : (
            displayedLogs.map((entry, index) => {
              const runKey = entry.runFolder || entry.timestamp || `run-${index}`;
              const tags = runHashtags(entry, runKey);
              return (
                <article key={`${runKey}-${index}`} style={logCardStyle}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{entry.timestamp || 'Timestamp unknown'}</span>
                    <span style={{ fontSize: '0.85rem', color: '#38bdf8' }}>Score: {entry.score ?? 'n/a'}</span>
                  </header>
                  <h3 style={{ margin: '0.5rem 0', color: '#f8fafc' }}>{entry.goal || 'Detailed log'}</h3>
                  <p style={{ margin: 0, color: '#cbd5f5', lineHeight: 1.5 }}>{entry.message}</p>
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={metricChipStyle}>Outcome: {entry.outcome || 'n/a'}</span>
                    {entry.tokens && <span style={metricChipStyle}>Tokens: {entry.tokens}</span>}
                    {entry.cost && <span style={metricChipStyle}>Cost: {entry.cost}</span>}
                    {entry.runFolder && <span style={metricChipStyle}>Run: {entry.runFolder.split('\\').pop()}</span>}
                  </div>
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {tags.map((tag) => (
                      <span key={tag} style={{ ...chipStyle, background: '#0f172a', cursor: 'pointer' }} onClick={() => setActiveTag(tag)}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      aria-label="Add custom tag"
                      placeholder="Add tag (press enter)"
                      style={tagInputStyle}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && event.currentTarget.value.trim()) {
                          handleAddCustomTag(runKey, event.currentTarget.value);
                          event.currentTarget.value = '';
                        }
                      }}
                    />
                    <button
                      onClick={() => setExpandedRunKey(expandedRunKey === runKey ? '' : runKey)}
                      style={{
                        ...chipStyle,
                        border: 'none',
                        background: '#2563eb',
                        fontWeight: '600',
                      }}
                    >
                      {expandedRunKey === runKey ? 'Hide details' : 'Show details'}
                    </button>
                  </div>
                  {expandedRunKey === runKey && (
                    <div style={{ marginTop: '0.75rem', color: '#cbd5f5', fontSize: '0.9rem' }}>
                      <p style={{ margin: '0.25rem 0' }}><strong>Run Path:</strong> {entry.runFolder || 'N/A'}</p>
                      <p style={{ margin: '0.25rem 0' }}><strong>Snippet:</strong> {entry.message.slice(0, 220)}…</p>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>

        <section style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setCurrentPage((cur) => Math.max(1, cur - 1))}
            disabled={currentPage === 1}
            style={{
              ...paginationButtonStyle,
              opacity: currentPage === 1 ? 0.4 : 1,
            }}
          >
            Previous
          </button>
          <span style={{ color: '#94a3b8' }}>Page {currentPage} of {totalPages}</span>
          <button
            onClick={() => setCurrentPage((cur) => Math.min(totalPages, cur + 1))}
            disabled={currentPage === totalPages}
            style={{
              ...paginationButtonStyle,
              opacity: currentPage === totalPages ? 0.4 : 1,
            }}
          >
            Next
          </button>
        </section>

        <section style={{ marginTop: '2rem', background: '#111827', borderRadius: '16px', padding: '1.25rem' }}>
          <p style={{ fontSize: '0.9rem', color: '#93c5fd' }}>Analytics</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            {[
              { label: 'Average Tokens', value: analytics.avgTokens, peak: analytics.peakTokens },
              { label: 'Average Cost', value: analytics.avgCost, peak: analytics.peakCost },
              { label: 'Average Score', value: analytics.avgScore, peak: analytics.peakScore },
            ].map(({ label, value, peak }) => (
              <div key={label} style={{ padding: '1rem', borderRadius: '12px', background: '#0f172a' }}>
                <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.85rem', color: '#cbd5f5' }}>{label}</p>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#22d3ee' }}>
                  {value.toFixed(2)}
                </div>
                <div style={{ marginTop: '0.5rem', height: '6px', borderRadius: '999px', background: '#1e293b', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, peak === 0 ? 0 : Math.min(100, (value / (peak || 1)) * 100))}%`,
                      height: '100%',
                      borderRadius: '999px',
                      background: '#38bdf8',
                    }}
                  />
                </div>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>Peak: {peak.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </section>

        <footer style={{ marginTop: '2rem', textAlign: 'center', color: '#94a3b8' }}>
          <p>Last updated: {new Date().toLocaleString()}</p>
        </footer>
      </div>
    </main>
  );
}

const cardStyle = {
  background: '#111827',
  borderRadius: '16px',
  padding: '1.25rem',
  boxShadow: '0 20px 35px rgba(15, 23, 42, 0.75)',
};

const inputWrapperStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 1rem',
  borderRadius: '999px',
  background: '#0f172a',
};

const inputStyle = {
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: '#f8fafc',
  minWidth: '220px',
};

const chipStyle = {
  borderRadius: '999px',
  padding: '0.35rem 0.85rem',
  border: '1px solid #1e293b',
  background: '#0f172a',
  color: '#e2e8f0',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const analyticsCardStyle = {
  background: '#0d1223',
  borderRadius: '16px',
  padding: '1.25rem',
  boxShadow: '0 20px 40px rgba(2, 6, 23, 0.75)',
};

const histogramBarWrapperStyle = {
  display: 'flex',
  height: '8px',
  borderRadius: '999px',
  overflow: 'hidden',
  background: '#1f2937',
};

const histogramSegmentStyle = {
  height: '100%',
};

const outcomeChipStyle = {
  borderRadius: '999px',
  padding: '0.35rem 0.85rem',
  background: '#111827',
  color: '#e0e7ff',
  border: '1px solid #1e293b',
  fontSize: '0.8rem',
};

const logCardStyle = {
  background: '#0f172a',
  borderRadius: '16px',
  padding: '1.25rem',
  marginBottom: '1rem',
  boxShadow: '0 10px 25px rgba(2, 6, 23, 0.65)',
};

const metricChipStyle = {
  padding: '0.2rem 0.65rem',
  borderRadius: '999px',
  fontSize: '0.8rem',
  background: '#1f2937',
  color: '#cbd5f5',
};

const tagInputStyle = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '999px',
  padding: '0.25rem 0.75rem',
  color: '#e2e8f0',
};

const paginationButtonStyle = {
  borderRadius: '999px',
  border: '1px solid #1e293b',
  background: '#0f172a',
  color: '#e2e8f0',
  padding: '0.5rem 1rem',
  cursor: 'pointer',
};
