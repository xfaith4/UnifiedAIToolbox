/**
 * GitHub Repository Selector Component
 * 
 * Allows users to search for and clone GitHub repositories for Codex analysis.
 */

import React, { useState } from 'react';
import {
  searchRepositories,
  cloneRepository,
  getFileTree,
  listBranches,
  deleteClone,
  type RepositorySearchResult,
  type FileTreeNode,
} from '../services/githubApi';

interface GitHubRepoSelectorProps {
  onRepoCloned?: (cloneId: string, clonePath: string) => void;
  darkMode?: boolean;
}

export function GitHubRepoSelector({ onRepoCloned, darkMode = false }: GitHubRepoSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RepositorySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<RepositorySearchResult | null>(null);
  const [cloning, setCloning] = useState(false);
  const [clonedRepos, setClonedRepos] = useState<{
    id: string;
    path: string;
    repo: string;
    branches?: string[];
    tree?: FileTreeNode;
  }[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    setError(null);
    
    try {
      const results = await searchRepositories(searchQuery, 20);
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectRepo = (repo: RepositorySearchResult) => {
    setSelectedRepo(repo);
    setSelectedBranch('');
  };

  const handleClone = async () => {
    if (!selectedRepo) return;
    
    setCloning(true);
    setError(null);
    
    try {
      const response = await cloneRepository({
        repo_url: selectedRepo.full_name,
        branch: selectedBranch || undefined,
      });
      
      // Fetch branches and file tree
      const [branches, tree] = await Promise.all([
        listBranches(response.clone_id).catch(() => []),
        getFileTree(response.clone_id, 2).catch(() => null),
      ]);
      
      const clonedRepo = {
        id: response.clone_id,
        path: response.clone_path,
        repo: selectedRepo.full_name,
        branches,
        tree: tree || undefined,
      };
      
      setClonedRepos(prev => [...prev, clonedRepo]);
      setSelectedRepo(null);
      
      if (onRepoCloned) {
        onRepoCloned(response.clone_id, response.clone_path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clone failed');
    } finally {
      setCloning(false);
    }
  };

  const handleDeleteClone = async (cloneId: string) => {
    try {
      await deleteClone(cloneId);
      setClonedRepos(prev => prev.filter(repo => repo.id !== cloneId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete clone');
    }
  };

  const renderFileTree = (node: FileTreeNode, depth = 0) => {
    const indent = depth * 20;
    const icon = node.type === 'directory' ? '📁' : '📄';
    
    return (
      <div key={`${node.name}-${depth}`}>
        <div style={{ paddingLeft: `${indent}px`, padding: '4px' }}>
          <span>{icon}</span>
          <span style={{ marginLeft: '8px' }}>{node.name}</span>
          {node.size && (
            <span style={{ marginLeft: '8px', opacity: 0.6, fontSize: '0.9em' }}>
              ({(node.size / 1024).toFixed(1)}KB)
            </span>
          )}
        </div>
        {node.children && node.children.map(child => renderFileTree(child, depth + 1))}
        {node.truncated && (
          <div style={{ paddingLeft: `${indent + 20}px`, opacity: 0.5, fontStyle: 'italic' }}>
            ... (truncated)
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      padding: '20px',
      backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
      color: darkMode ? '#e0e0e0' : '#333333',
      borderRadius: '8px',
    }}>
      <h2>GitHub Repository Selector</h2>
      
      {/* Search Section */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search repositories (e.g., 'machine learning python')"
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: darkMode ? '#2d2d2d' : '#f5f5f5',
              color: darkMode ? '#e0e0e0' : '#333333',
              border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
              borderRadius: '4px',
            }}
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            style={{
              padding: '10px 20px',
              backgroundColor: searching ? '#666' : '#007bff',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: searching ? 'not-allowed' : 'pointer',
            }}
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

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

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3>Search Results</h3>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {searchResults.map((repo) => (
              <div
                key={repo.full_name}
                onClick={() => handleSelectRepo(repo)}
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  backgroundColor: selectedRepo?.full_name === repo.full_name
                    ? (darkMode ? '#3a3a3a' : '#e3f2fd')
                    : (darkMode ? '#2d2d2d' : '#f9f9f9'),
                  border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  {repo.full_name}
                </div>
                <div style={{ fontSize: '0.9em', opacity: 0.8, marginBottom: '4px' }}>
                  {repo.description || 'No description'}
                </div>
                <div style={{ fontSize: '0.85em', opacity: 0.7, display: 'flex', gap: '15px' }}>
                  <span>⭐ {repo.stars}</span>
                  <span>💻 {repo.language || 'N/A'}</span>
                  <span>📦 {(repo.size / 1024).toFixed(1)} MB</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clone Section */}
      {selectedRepo && (
        <div style={{
          padding: '15px',
          marginBottom: '20px',
          backgroundColor: darkMode ? '#2d2d2d' : '#f5f5f5',
          border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
          borderRadius: '4px',
        }}>
          <h3>Clone Repository</h3>
          <p><strong>Repository:</strong> {selectedRepo.full_name}</p>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>
              Branch (optional, leave empty for default):
            </label>
            <input
              type="text"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              placeholder="main, master, develop, etc."
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
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleClone}
              disabled={cloning}
              style={{
                padding: '10px 20px',
                backgroundColor: cloning ? '#666' : '#28a745',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: cloning ? 'not-allowed' : 'pointer',
              }}
            >
              {cloning ? 'Cloning...' : 'Clone Repository'}
            </button>
            <button
              onClick={() => setSelectedRepo(null)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6c757d',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Cloned Repositories */}
      {clonedRepos.length > 0 && (
        <div>
          <h3>Cloned Repositories</h3>
          {clonedRepos.map((repo) => (
            <div
              key={repo.id}
              style={{
                padding: '15px',
                marginBottom: '15px',
                backgroundColor: darkMode ? '#2d2d2d' : '#f9f9f9',
                border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                borderRadius: '4px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div>
                  <strong>{repo.repo}</strong>
                  <div style={{ fontSize: '0.9em', opacity: 0.7 }}>
                    Clone ID: {repo.id}
                  </div>
                  <div style={{ fontSize: '0.9em', opacity: 0.7 }}>
                    Path: {repo.path}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteClone(repo.id)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#dc3545',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
              
              {repo.branches && repo.branches.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <strong>Branches:</strong> {repo.branches.join(', ')}
                </div>
              )}
              
              {repo.tree && (
                <details>
                  <summary style={{ cursor: 'pointer', marginBottom: '10px' }}>
                    File Tree
                  </summary>
                  <div style={{
                    maxHeight: '300px',
                    overflowY: 'auto',
                    fontSize: '0.9em',
                    fontFamily: 'monospace',
                  }}>
                    {renderFileTree(repo.tree)}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default GitHubRepoSelector;
