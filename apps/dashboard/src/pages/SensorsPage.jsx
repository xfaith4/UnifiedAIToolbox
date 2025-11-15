// Sensors Page - Monitor sensor rewards and telemetry
import React, { useState } from 'react';
import { Activity, TrendingUp, TrendingDown, AlertCircle, CheckCircle } from 'lucide-react';

export default function SensorsPage() {
  const [sensors] = useState([
    { 
      id: 'call-quality', 
      name: 'Call Quality Monitor', 
      reward: 8.5, 
      trend: 'up', 
      status: 'healthy',
      lastUpdate: '2025-11-14 01:20'
    },
    { 
      id: 'agent-sentiment', 
      name: 'Agent Sentiment Tracker', 
      reward: 7.2, 
      trend: 'down', 
      status: 'warning',
      lastUpdate: '2025-11-14 01:15'
    },
    { 
      id: 'escalation-rate', 
      name: 'Escalation Rate', 
      reward: 6.8, 
      trend: 'up', 
      status: 'healthy',
      lastUpdate: '2025-11-14 01:10'
    },
    { 
      id: 'response-time', 
      name: 'Response Time Monitor', 
      reward: 9.1, 
      trend: 'stable', 
      status: 'healthy',
      lastUpdate: '2025-11-14 01:25'
    }
  ]);

  const getTrendIcon = (trend) => {
    if (trend === 'up') return <TrendingUp size={18} color="#10b981" />;
    if (trend === 'down') return <TrendingDown size={18} color="#ef4444" />;
    return <Activity size={18} color="#6b7280" />;
  };

  const getStatusIcon = (status) => {
    if (status === 'healthy') return <CheckCircle size={18} color="#10b981" />;
    return <AlertCircle size={18} color="#f59e0b" />;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '0.5rem' }}>
          Sensor Monitor
        </h1>
        <p style={{ color: '#94a3b8' }}>
          Track sensor rewards and telemetry data
        </p>
      </div>

      {/* Sensor Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: '1rem' 
      }}>
        {sensors.map(sensor => (
          <div
            key={sensor.id}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              transition: 'all 0.2s'
            }}
          >
            {/* Header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'start',
              marginBottom: '1rem' 
            }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ 
                  fontSize: '1rem', 
                  fontWeight: '600', 
                  color: '#f1f5f9', 
                  marginBottom: '0.5rem' 
                }}>
                  {sensor.name}
                </h3>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#64748b' 
                }}>
                  {sensor.lastUpdate}
                </div>
              </div>
              {getStatusIcon(sensor.status)}
            </div>

            {/* Reward Score */}
            <div style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1rem'
            }}>
              <div style={{ 
                fontSize: '0.75rem', 
                color: '#64748b', 
                marginBottom: '0.5rem',
                fontWeight: '600'
              }}>
                REWARD SCORE
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ 
                  fontSize: '2rem', 
                  fontWeight: '700', 
                  color: sensor.reward >= 8 ? '#10b981' : 
                         sensor.reward >= 7 ? '#f59e0b' : '#ef4444'
                }}>
                  {sensor.reward.toFixed(1)}
                </div>
                {getTrendIcon(sensor.trend)}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => alert(`Acknowledging sensor: ${sensor.name}`)}
                style={{
                  flex: 1,
                  padding: '0.625rem',
                  background: '#334155',
                  border: 'none',
                  borderRadius: '0.375rem',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '600'
                }}
              >
                Acknowledge
              </button>
              <button
                onClick={() => alert(`Triggering follow-up for: ${sensor.name}`)}
                style={{
                  flex: 1,
                  padding: '0.625rem',
                  background: '#3b82f6',
                  border: 'none',
                  borderRadius: '0.375rem',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '600'
                }}
              >
                Follow-up
              </button>
            </div>

            {/* Runbook Link */}
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <a
                href={`/sensors/${sensor.id}/runbook`}
                style={{
                  fontSize: '0.75rem',
                  color: '#60a5fa',
                  textDecoration: 'none'
                }}
              >
                View Runbook →
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div style={{ 
        marginTop: '2rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem'
      }}>
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem', fontWeight: '600' }}>
            AVERAGE REWARD
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#10b981' }}>
            {(sensors.reduce((sum, s) => sum + s.reward, 0) / sensors.length).toFixed(1)}
          </div>
        </div>
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem', fontWeight: '600' }}>
            ACTIVE SENSORS
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#3b82f6' }}>
            {sensors.length}
          </div>
        </div>
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem', fontWeight: '600' }}>
            WARNINGS
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f59e0b' }}>
            {sensors.filter(s => s.status === 'warning').length}
          </div>
        </div>
      </div>
    </div>
  );
}
