// Toolbox Home Page - Shows health status and quick actions
import React, { useEffect, useState } from 'react';
import { 
  CheckCircle, XCircle, AlertCircle, 
  BookOpen, Sparkles, Upload, GitBranch 
} from 'lucide-react';
import api from '../utils/api';

export default function HomePage() {
  const [services, setServices] = useState({
    api: { status: 'checking', name: 'Prompt API' },
    frontend: { status: 'online', name: 'Prompt Hub' },
    bridge: { status: 'unknown', name: 'Orchestration Bridge' },
    codex: { status: 'unknown', name: 'Codex Swarm' },
    sensors: { status: 'unknown', name: 'Sensor Monitor' },
    datasets: { status: 'unknown', name: 'Dataset Explorer' }
  });

  useEffect(() => {
    checkAPIHealth();
  }, []);

  const checkAPIHealth = async () => {
    try {
      await api.getHealth();
      setServices(prev => ({
        ...prev,
        api: { ...prev.api, status: 'online' }
      }));
    } catch (error) {
      setServices(prev => ({
        ...prev,
        api: { ...prev.api, status: 'offline' }
      }));
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'online':
        return <CheckCircle size={20} color="#10b981" />;
      case 'offline':
        return <XCircle size={20} color="#ef4444" />;
      case 'checking':
        return <AlertCircle size={20} color="#f59e0b" />;
      default:
        return <AlertCircle size={20} color="#6b7280" />;
    }
  };

  const quickActions = [
    { 
      title: 'Create Prompt', 
      desc: 'Add a new prompt to the library', 
      icon: BookOpen, 
      path: '/prompts/new',
      color: '#3b82f6'
    },
    { 
      title: 'Run AIRefiner', 
      desc: 'Improve prompts with AI suggestions', 
      icon: Sparkles, 
      path: '/prompts?action=refine',
      color: '#8b5cf6'
    },
    { 
      title: 'Upload Dataset', 
      desc: 'Upload data for analysis', 
      icon: Upload, 
      path: '/datasets',
      color: '#10b981'
    },
    { 
      title: 'Run Codex', 
      desc: 'Execute code review swarm', 
      icon: GitBranch, 
      path: '/orchestrator?tab=codex',
      color: '#f59e0b'
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '0.5rem' }}>
          Unified AI Toolbox
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
          Single-pane-of-glass for prompts, agents, refinements, and code reviews
        </p>
      </div>

      {/* Service Health Status */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ 
          fontSize: '1.25rem', 
          fontWeight: '600', 
          color: '#e2e8f0', 
          marginBottom: '1rem' 
        }}>
          Service Health
        </h2>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '1rem' 
        }}>
          {Object.entries(services).map(([key, service]) => (
            <div
              key={key}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}
            >
              {getStatusIcon(service.status)}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', color: '#f1f5f9', marginBottom: '0.25rem' }}>
                  {service.name}
                </div>
                <div style={{ 
                  fontSize: '0.875rem', 
                  color: '#94a3b8',
                  textTransform: 'capitalize' 
                }}>
                  {service.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <h2 style={{ 
          fontSize: '1.25rem', 
          fontWeight: '600', 
          color: '#e2e8f0', 
          marginBottom: '1rem' 
        }}>
          Quick Actions
        </h2>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '1rem' 
        }}>
          {quickActions.map((action, idx) => {
            const Icon = action.icon;
            return (
              <a
                key={idx}
                href={action.path}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '0.75rem',
                  padding: '1.5rem',
                  textDecoration: 'none',
                  display: 'block',
                  transition: 'all 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = action.color;
                  e.currentTarget.style.background = '#334155';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#334155';
                  e.currentTarget.style.background = '#1e293b';
                }}
              >
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  borderRadius: '0.5rem',
                  background: `${action.color}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1rem'
                }}>
                  <Icon size={24} color={action.color} />
                </div>
                <div style={{ fontWeight: '600', color: '#f1f5f9', marginBottom: '0.5rem' }}>
                  {action.title}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                  {action.desc}
                </div>
              </a>
            );
          })}
        </div>
      </section>
    </div>
  );
}
