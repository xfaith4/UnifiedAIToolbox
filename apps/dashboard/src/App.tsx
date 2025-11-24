import { Route, Routes, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import HomePage from './pages/HomePage'
import CostsPage from './pages/CostsPage'
import PromptLibraryPage from './pages/PromptLibraryPage'
import GitHubPage from './pages/GitHub'
import GenesysPage from './pages/Genesys'
import AgentLibraryPage from './pages/AgentLibraryPage'
import OrchestratorPage from './pages/OrchestratorPage'
import DatasetsPage from './pages/DatasetsPage'
import SensorsPage from './pages/SensorsPage'
import SettingsPage from './pages/Settings'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<HomePage />} />
        <Route path="/costs" element={<CostsPage />} />
        <Route path="/github" element={<GitHubPage />} />
        <Route path="/genesys" element={<GenesysPage />} />
        <Route path="/orchestrator" element={<OrchestratorPage />} />
        <Route path="/prompts" element={<PromptLibraryPage />} />
        <Route path="/agents" element={<AgentLibraryPage />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/sensors" element={<SensorsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<div className="p-6">Not found</div>} />
      </Routes>
    </Layout>
  )
}
