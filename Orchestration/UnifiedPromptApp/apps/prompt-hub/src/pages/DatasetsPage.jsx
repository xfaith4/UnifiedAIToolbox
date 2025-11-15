// Datasets Page - Upload and analyze datasets
import React, { useState } from 'react';
import { Upload, Database, FileText, TrendingUp } from 'lucide-react';

export default function DatasetsPage() {
  const [datasets] = useState([
    { id: '1', name: 'customer_feedback_2024.csv', size: '2.3 MB', uploaded: '2025-11-10', status: 'analyzed' },
    { id: '2', name: 'call_logs_november.json', size: '15.7 MB', uploaded: '2025-11-12', status: 'processing' },
    { id: '3', name: 'agent_metrics.xlsx', size: '856 KB', uploaded: '2025-11-13', status: 'ready' }
  ]);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '0.5rem' }}>
          Dataset Explorer
        </h1>
        <p style={{ color: '#94a3b8' }}>
          Upload and analyze data for use in prompts and agents
        </p>
      </div>

      {/* Upload Area */}
      <div style={{
        background: '#1e293b',
        border: '2px dashed #334155',
        borderRadius: '0.75rem',
        padding: '3rem',
        textAlign: 'center',
        marginBottom: '2rem',
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#3b82f6';
        e.currentTarget.style.background = '#334155';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#334155';
        e.currentTarget.style.background = '#1e293b';
      }}
      onClick={() => alert('File upload dialog would open here')}
      >
        <Upload size={48} style={{ color: '#3b82f6', margin: '0 auto 1rem' }} />
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#f1f5f9', marginBottom: '0.5rem' }}>
          Upload Dataset
        </h3>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
          Click to browse or drag and drop files here
        </p>
        <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.5rem' }}>
          Supports CSV, JSON, Excel, and text files
        </p>
      </div>

      {/* Datasets List */}
      <div>
        <h2 style={{ 
          fontSize: '1.25rem', 
          fontWeight: '600', 
          color: '#e2e8f0', 
          marginBottom: '1rem' 
        }}>
          Recent Datasets
        </h2>
        <div style={{ display: 'grid', gap: '1rem' }}>
          {datasets.map(dataset => (
            <div
              key={dataset.id}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <FileText size={24} color="#3b82f6" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', color: '#f1f5f9', marginBottom: '0.25rem' }}>
                    {dataset.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {dataset.size} • Uploaded {dataset.uploaded}
                  </div>
                </div>
                <div>
                  <span style={{
                    fontSize: '0.75rem',
                    background: dataset.status === 'analyzed' ? '#10b98120' : 
                               dataset.status === 'processing' ? '#f59e0b20' : '#3b82f620',
                    color: dataset.status === 'analyzed' ? '#10b981' : 
                           dataset.status === 'processing' ? '#f59e0b' : '#3b82f6',
                    padding: '0.375rem 0.75rem',
                    borderRadius: '9999px',
                    border: `1px solid ${dataset.status === 'analyzed' ? '#10b981' : 
                            dataset.status === 'processing' ? '#f59e0b' : '#3b82f6'}`,
                    textTransform: 'capitalize'
                  }}>
                    {dataset.status}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
                <button
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
                >
                  <TrendingUp size={14} />
                  Analyze
                </button>
                <button
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '0.375rem',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
