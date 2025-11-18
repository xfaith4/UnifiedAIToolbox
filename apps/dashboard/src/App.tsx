import { lazy, Suspense } from 'react'
import { Route, Routes, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'

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
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      
      {/* Protected routes */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <HomePage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/github"
        element={
          <ProtectedRoute>
            <Layout>
              <Suspense fallback={<PageLoader />}>
                <GitHubPage />
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/genesys"
        element={
          <ProtectedRoute>
            <Layout>
              <Suspense fallback={<PageLoader />}>
                <GenesysPage />
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/orchestrator"
        element={
          <ProtectedRoute>
            <Layout>
              <Suspense fallback={<PageLoader />}>
                <OrchestratorPage />
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/prompts"
        element={
          <ProtectedRoute>
            <Layout>
              <Suspense fallback={<PageLoader />}>
                <PromptLibraryPage />
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/agents"
        element={
          <ProtectedRoute>
            <Layout>
              <Suspense fallback={<PageLoader />}>
                <AgentLibraryPage />
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/datasets"
        element={
          <ProtectedRoute>
            <Layout>
              <Suspense fallback={<PageLoader />}>
                <DatasetsPage />
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sensors"
        element={
          <ProtectedRoute>
            <Layout>
              <Suspense fallback={<PageLoader />}>
                <SensorsPage />
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute requiredRole="admin">
            <Layout>
              <Suspense fallback={<PageLoader />}>
                <Settings />
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<div className="p-6">Not found</div>} />
    </Routes>
  )
}
