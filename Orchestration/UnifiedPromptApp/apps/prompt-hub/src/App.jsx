// AI Toolbox - Unified Prompt Hub Application
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import PromptLibraryPage from './pages/PromptLibraryPage';
import AgentLibraryPage from './pages/AgentLibraryPage';
import OrchestratorPage from './pages/OrchestratorPage';
import DatasetsPage from './pages/DatasetsPage';
import SensorsPage from './pages/SensorsPage';

// Simple client-side router
function Router() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    // Handle browser back/forward
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    // Intercept navigation clicks
    const handleClick = (e) => {
      if (e.target.tagName === 'A' && e.target.href.startsWith(window.location.origin)) {
        e.preventDefault();
        const path = new URL(e.target.href).pathname;
        window.history.pushState({}, '', path);
        setCurrentPath(path);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Route matching
  let PageComponent;
  if (currentPath === '/') {
    PageComponent = HomePage;
  } else if (currentPath === '/prompts') {
    PageComponent = PromptLibraryPage;
  } else if (currentPath === '/agents') {
    PageComponent = AgentLibraryPage;
  } else if (currentPath === '/orchestrator') {
    PageComponent = OrchestratorPage;
  } else if (currentPath === '/datasets') {
    PageComponent = DatasetsPage;
  } else if (currentPath === '/sensors') {
    PageComponent = SensorsPage;
  } else {
    // Placeholder for other pages
    PageComponent = () => (
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '1rem' }}>
          {currentPath.replace('/', '').replace('-', ' ').toUpperCase()}
        </h1>
        <div style={{ 
          background: '#1e293b', 
          border: '1px solid #334155',
          borderRadius: '0.75rem',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
            This page is under construction.
          </p>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Path: {currentPath}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Layout currentPath={currentPath}>
      <PageComponent />
    </Layout>
  );
}

export default function App() {
  return <Router />;
}
