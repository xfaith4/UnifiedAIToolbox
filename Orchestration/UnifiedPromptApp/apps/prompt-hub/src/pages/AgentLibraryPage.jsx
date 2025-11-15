// Agent Library Page - Browse and manage AI agents
import React, { useEffect, useState } from 'react';
import { Search, Users, Plus, Edit, ExternalLink } from 'lucide-react';
import api from '../utils/api';
import SkeletonLoader from '../components/SkeletonLoader';

export default function AgentLibraryPage() {
  const [agents, setAgents] = useState([]);
  const [filteredAgents, setFilteredAgents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadAgents();
  }, []);

  useEffect(() => {
    filterAgents();
  }, [searchTerm, agents]);

  const loadAgents = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getAgents();
      setAgents(Array.isArray(data) ? data : data.agents || []);
    } catch (err) {
      console.error('Failed to load agents:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filterAgents = () => {
    let filtered = agents;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(a =>
        a.name?.toLowerCase().includes(term) ||
        a.role?.toLowerCase().includes(term) ||
        a.description?.toLowerCase().includes(term)
      );
    }
    setFilteredAgents(filtered);
  };

  if (isLoading) {
    return (
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '2rem' }}>
          Agent Library
        </h1>
        <SkeletonLoader count={5} height="100px" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>Error Loading Agents</h2>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>{error}</p>
        <button
          onClick={loadAgents}
          style={{
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '0.5rem' }}>
            Agent Library
          </h1>
          <p style={{ color: '#94a3b8' }}>
            {filteredAgents.length} agent{filteredAgents.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => window.location.href = '/agents/new'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            padding: '0.75rem 1.25rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem'
          }}
        >
          <Plus size={18} />
          New Agent
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
        <Search
          size={18}
          style={{
            position: 'absolute',
            left: '1rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#64748b'
          }}
        />
        <input
          type="text"
          placeholder="Search agents by name, role, or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem 1rem 0.75rem 3rem',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '0.5rem',
            color: '#e2e8f0',
            fontSize: '0.875rem'
          }}
        />
      </div>

      {/* Agent Cards */}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {filteredAgents.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            background: '#1e293b',
            borderRadius: '0.75rem',
            border: '1px solid #334155'
          }}>
            <Users size={48} style={{ color: '#64748b', margin: '0 auto 1rem' }} />
            <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
              {searchTerm ? 'No agents match your search' : 'No agents available'}
            </p>
          </div>
        ) : (
          filteredAgents.map((agent, idx) => (
            <div
              key={agent.id || idx}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>
                      {agent.name || agent.id}
                    </h3>
                    {agent.role && (
                      <span style={{
                        fontSize: '0.75rem',
                        background: '#1e40af',
                        color: '#93c5fd',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        border: '1px solid #1e3a8a'
                      }}>
                        {agent.role}
                      </span>
                    )}
                  </div>

                  {agent.description && (
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1rem' }}>
                      {agent.description}
                    </p>
                  )}

                  {/* Agent Instructions Preview */}
                  {agent.instructions && (
                    <div style={{
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                      marginTop: '0.75rem'
                    }}>
                      <div style={{
                        fontSize: '0.7rem',
                        color: '#64748b',
                        marginBottom: '0.5rem',
                        fontWeight: '600'
                      }}>
                        INSTRUCTIONS
                      </div>
                      <pre style={{
                        fontSize: '0.75rem',
                        color: '#cbd5e1',
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'ui-monospace, monospace'
                      }}>
                        {typeof agent.instructions === 'string'
                          ? agent.instructions.substring(0, 200) + (agent.instructions.length > 200 ? '...' : '')
                          : JSON.stringify(agent.instructions, null, 2).substring(0, 200) + '...'}
                      </pre>
                    </div>
                  )}

                  {/* Linked Prompts */}
                  {agent.prompt_ids && agent.prompt_ids.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#64748b',
                        marginBottom: '0.5rem',
                        fontWeight: '600'
                      }}>
                        LINKED PROMPTS ({agent.prompt_ids.length})
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {agent.prompt_ids.map((pid, i) => (
                          <a
                            key={i}
                            href={`/prompts?id=${pid}`}
                            style={{
                              fontSize: '0.75rem',
                              background: '#334155',
                              color: '#60a5fa',
                              padding: '0.25rem 0.625rem',
                              borderRadius: '0.25rem',
                              textDecoration: 'none',
                              border: '1px solid #1e3a8a',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            {pid}
                            <ExternalLink size={10} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => window.location.href = `/agents/${agent.id}/edit`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.5rem 0.75rem',
                    background: '#334155',
                    border: 'none',
                    borderRadius: '0.375rem',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}
                  title="Edit agent"
                >
                  <Edit size={14} />
                  Edit
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
