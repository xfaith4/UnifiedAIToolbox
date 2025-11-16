import { Route, Routes, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import HomePage from './pages/HomePage'
import { Settings } from './pages/Settings'
import { GitHubPage } from './pages/GitHub'
import GenesysPage from './pages/Genesys'
import PromptLibraryPage from './pages/PromptLibraryPage'
import AgentLibraryPage from './pages/AgentLibraryPage'
import OrchestratorPage from './pages/OrchestratorPage'
import DatasetsPage from './pages/DatasetsPage'
import SensorsPage from './pages/SensorsPage'

export default function App() {
  return (
    <Layout>
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
    </Layout>
  )
}
