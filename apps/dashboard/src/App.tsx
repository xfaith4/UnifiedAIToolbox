import { lazy, Suspense } from 'react'
import { Route, Routes, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import HomePage from './pages/HomePage'

// Lazy load heavy pages that contain complex components
const GitHubPage = lazy(() => import('./pages/GitHub').then(m => ({ default: m.GitHubPage })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const GenesysPage = lazy(() => import('./pages/Genesys'))
const PromptLibraryPage = lazy(() => import('./pages/PromptLibraryPage'))
const AgentLibraryPage = lazy(() => import('./pages/AgentLibraryPage'))
const OrchestratorPage = lazy(() => import('./pages/OrchestratorPage'))
const DatasetsPage = lazy(() => import('./pages/DatasetsPage'))
const SensorsPage = lazy(() => import('./pages/SensorsPage'))

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="text-gray-600 dark:text-gray-400">Loading...</div>
  </div>
)

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<HomePage />} />
          <Route path="/github" element={<GitHubPage />} />
          <Route path="/genesys" element={<GenesysPage />} />
          <Route path="/orchestrator" element={<OrchestratorPage />} />
          <Route path="/prompts" element={<PromptLibraryPage />} />
          <Route path="/agents" element={<AgentLibraryPage />} />
          <Route path="/datasets" element={<DatasetsPage />} />
          <Route path="/sensors" element={<SensorsPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<div className="p-6">Not found</div>} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
