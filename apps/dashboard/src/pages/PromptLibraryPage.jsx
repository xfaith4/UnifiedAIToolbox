// Prompt Library Page - Browse, search, and manage prompts
import React, { useEffect, useState } from 'react';
import { 
  Search, Filter, Copy, CheckCircle, Sparkles, 
  Edit, Trash2, Plus, RefreshCw 
} from 'lucide-react';
import api from '../utils/api';
import SkeletonLoader from '../components/SkeletonLoader';

export default function PromptLibraryPage() {
  const [prompts, setPrompts] = useState([]);
  const [filteredPrompts, setFilteredPrompts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedPrompts, setSelectedPrompts] = useState(new Set());
  const [copiedId, setCopiedId] = useState(null);
  const [showRefineModal, setShowRefineModal] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  useEffect(() => {
    loadPrompts();
  }, []);

  useEffect(() => {
    filterPrompts();
  }, [searchTerm, categoryFilter, prompts]);

  const loadPrompts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getPrompts();
      setPrompts(Array.isArray(data) ? data : data.prompts || []);
    } catch (err) {
      console.error('Failed to load prompts:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filterPrompts = () => {
    let filtered = prompts;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.title?.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term) ||
        p.category?.toLowerCase().includes(term) ||
        p.tags?.some(tag => tag.toLowerCase().includes(term)) ||
        p.owners?.some(owner => owner.toLowerCase().includes(term))
      );
    }

    // Category filter
    if (categoryFilter && categoryFilter !== 'all') {
      filtered = filtered.filter(p => p.category === categoryFilter);
    }

    setFilteredPrompts(filtered);
  };

  const categories = ['all', ...new Set(prompts.map(p => p.category).filter(Boolean))];

  const copyToClipboard = (text, id, type = 'content') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(`${id}-${type}`);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleRefineSelected = async () => {
    if (selectedPrompts.size === 0) return;
    
    setIsRefining(true);
    try {
      const ids = Array.from(selectedPrompts);
      if (ids.length === 1) {
        await api.refinePrompt(ids[0]);
      } else {
        await api.refineBulk(ids);
      }
      alert(`Refinement started for ${ids.length} prompt(s). Check back soon for results.`);
      setSelectedPrompts(new Set());
      loadPrompts();
    } catch (err) {
      alert(`Failed to refine prompts: ${err.message}`);
    } finally {
      setIsRefining(false);
      setShowRefineModal(false);
    }
  };

  const toggleSelectPrompt = (id) => {
    const newSelected = new Set(selectedPrompts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedPrompts(newSelected);
  };

  if (isLoading) {
    return (
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '2rem' }}>
          Prompt Library
        </h1>
        <SkeletonLoader count={5} height="100px" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>Error Loading Prompts</h2>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>{error}</p>
        <button
          onClick={loadPrompts}
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
            Prompt Library
          </h1>
          <p style={{ color: '#94a3b8' }}>
            {filteredPrompts.length} prompt{filteredPrompts.length !== 1 ? 's' : ''} 
            {selectedPrompts.size > 0 && ` • ${selectedPrompts.size} selected`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {selectedPrompts.size > 0 && (
            <button
              onClick={() => setShowRefineModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: '#8b5cf6',
                color: '#fff',
                border: 'none',
                padding: '0.75rem 1.25rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem'
              }}
            >
              <Sparkles size={18} />
              Refine Selected ({selectedPrompts.size})
            </button>
          )}
          <button
            onClick={() => window.location.href = '/prompts/new'}
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
            New Prompt
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '1.5rem',
        flexWrap: 'wrap' 
      }}>
        <div style={{ flex: '1 1 300px', position: 'relative' }}>
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
            placeholder="Search by title, category, tags, or owners..."
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
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            padding: '0.75rem 1rem',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '0.5rem',
            color: '#e2e8f0',
            fontSize: '0.875rem',
            cursor: 'pointer'
          }}
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat === 'all' ? 'All Categories' : cat}
            </option>
          ))}
        </select>
        <button
          onClick={loadPrompts}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '0.5rem',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Prompt Cards */}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {filteredPrompts.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem', 
            background: '#1e293b',
            borderRadius: '0.75rem',
            border: '1px solid #334155'
          }}>
            <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
              {searchTerm || categoryFilter !== 'all' 
                ? 'No prompts match your filters' 
                : 'No prompts available'}
            </p>
          </div>
        ) : (
          filteredPrompts.map((prompt) => (
            <div
              key={prompt.id}
              style={{
                background: '#1e293b',
                border: selectedPrompts.has(prompt.id) ? '2px solid #3b82f6' : '1px solid #334155',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={selectedPrompts.has(prompt.id)}
                      onChange={() => toggleSelectPrompt(prompt.id)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>
                      {prompt.title || prompt.id}
                    </h3>
                    {prompt.category && (
                      <span style={{
                        fontSize: '0.75rem',
                        background: '#334155',
                        color: '#94a3b8',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px'
                      }}>
                        {prompt.category}
                      </span>
                    )}
                  </div>
                  {prompt.description && (
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '0.5rem 0' }}>
                      {prompt.description}
                    </p>
                  )}
                  {prompt.tags && prompt.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                      {prompt.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: '0.75rem',
                            background: '#0f172a',
                            color: '#60a5fa',
                            padding: '0.25rem 0.625rem',
                            borderRadius: '0.25rem',
                            border: '1px solid #1e3a8a'
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <button
                    onClick={() => copyToClipboard(prompt.instructions || prompt.content || '', prompt.id, 'instructions')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      padding: '0.5rem 0.75rem',
                      background: copiedId === `${prompt.id}-instructions` ? '#10b981' : '#334155',
                      border: 'none',
                      borderRadius: '0.375rem',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}
                    title="Copy instructions"
                  >
                    {copiedId === `${prompt.id}-instructions` ? <CheckCircle size={14} /> : <Copy size={14} />}
                    {copiedId === `${prompt.id}-instructions` ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(prompt, null, 2), prompt.id, 'json')}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: copiedId === `${prompt.id}-json` ? '#10b981' : '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '0.375rem',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '0.75rem'
                    }}
                    title="Copy as JSON"
                  >
                    {copiedId === `${prompt.id}-json` ? '✓ JSON' : 'JSON'}
                  </button>
                </div>
              </div>

              {/* Show instructions preview */}
              {prompt.instructions && (
                <div style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  marginTop: '1rem'
                }}>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#64748b', 
                    marginBottom: '0.5rem',
                    fontWeight: '600'
                  }}>
                    INSTRUCTIONS
                  </div>
                  <pre style={{
                    fontSize: '0.8125rem',
                    color: '#cbd5e1',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'ui-monospace, monospace'
                  }}>
                    {prompt.instructions.length > 300 
                      ? prompt.instructions.substring(0, 300) + '...' 
                      : prompt.instructions}
                  </pre>
                </div>
              )}

              {/* Owners and metadata */}
              {(prompt.owners || prompt.review_policy) && (
                <div style={{ 
                  display: 'flex', 
                  gap: '1rem', 
                  marginTop: '1rem',
                  fontSize: '0.75rem',
                  color: '#64748b'
                }}>
                  {prompt.owners && (
                    <div>
                      <strong>Owners:</strong> {prompt.owners.join(', ')}
                    </div>
                  )}
                  {prompt.review_policy && (
                    <div>
                      <strong>Review Policy:</strong> {prompt.review_policy}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Refine Modal */}
      {showRefineModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowRefineModal(false)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '0.75rem',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: '#f1f5f9', marginBottom: '1rem', fontSize: '1.25rem' }}>
              Refine Selected Prompts
            </h3>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
              This will send {selectedPrompts.size} prompt{selectedPrompts.size !== 1 ? 's' : ''} to 
              AIRefiner for improvement suggestions. The process may take a few minutes.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowRefineModal(false)}
                disabled={isRefining}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#334155',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#e2e8f0',
                  cursor: isRefining ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  opacity: isRefining ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRefineSelected}
                disabled={isRefining}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#8b5cf6',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#fff',
                  cursor: isRefining ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  opacity: isRefining ? 0.5 : 1
                }}
              >
                {isRefining ? 'Refining...' : 'Start Refinement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
