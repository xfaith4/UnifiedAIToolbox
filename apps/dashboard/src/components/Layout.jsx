// Layout component with navigation for AI Toolbox
import React from 'react';
import { 
  Home, BookOpen, Users, GitBranch, Settings, 
  Database, Activity, Workflow 
} from 'lucide-react';

const navItems = [
  { section: 'Overview', items: [
    { name: 'Dashboard', path: '/', icon: Home }
  ]},
  { section: 'Libraries', items: [
    { name: 'Prompt Library', path: '/prompts', icon: BookOpen },
    { name: 'Agent Library', path: '/agents', icon: Users }
  ]},
  { section: 'Integration Tools', items: [
    { name: 'Orchestrator', path: '/orchestrator', icon: Workflow },
    { name: 'Datasets', path: '/datasets', icon: Database },
    { name: 'Sensors', path: '/sensors', icon: Activity },
    { name: 'GitHub', path: '/github', icon: GitBranch }
  ]},
  { section: 'Settings', items: [
    { name: 'Configuration', path: '/settings', icon: Settings }
  ]}
];

export default function Layout({ children, currentPath = '/' }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f172a' }}>
      {/* Sidebar */}
      <aside style={{ 
        width: '260px', 
        background: '#1e293b', 
        borderRight: '1px solid #334155',
        padding: '1.5rem 1rem',
        overflowY: 'auto'
      }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ 
            fontSize: '1.25rem', 
            fontWeight: '700', 
            color: '#60a5fa',
            margin: 0 
          }}>
            AI Toolbox
          </h1>
          <p style={{ 
            fontSize: '0.75rem', 
            color: '#94a3b8', 
            margin: '0.25rem 0 0 0' 
          }}>
            Unified Prompt Hub
          </p>
        </div>

        {navItems.map((section, idx) => (
          <div key={idx} style={{ marginBottom: '1.5rem' }}>
            <div style={{ 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              color: '#64748b', 
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.5rem'
            }}>
              {section.section}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath === item.path;
              return (
                <a
                  key={item.path}
                  href={item.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.625rem 0.75rem',
                    borderRadius: '0.5rem',
                    color: isActive ? '#fff' : '#cbd5e1',
                    background: isActive ? '#3b82f6' : 'transparent',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: isActive ? '600' : '400',
                    marginBottom: '0.25rem',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.target.style.background = '#334155';
                      e.target.style.color = '#fff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.target.style.background = 'transparent';
                      e.target.style.color = '#cbd5e1';
                    }
                  }}
                >
                  <Icon size={18} />
                  <span>{item.name}</span>
                </a>
              );
            })}
          </div>
        ))}
      </aside>

      {/* Main content */}
      <main style={{ 
        flex: 1, 
        padding: '2rem',
        overflowY: 'auto',
        color: '#e2e8f0'
      }}>
        {children}
      </main>
    </div>
  );
}
