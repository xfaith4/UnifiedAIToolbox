/**
 * A/B Testing Manager Component (Sprint 4)
 * Manage and monitor prompt A/B tests
 */
import React, { useEffect, useState } from 'react'
import {
  getABTests,
  createABTest,
  updateABTestStatus,
  deleteABTest,
  getABTestResults,
} from '../services/abTestingStore'
import type { ABTest, ABTestResult, ABTestConfig, ABTestStatus } from '../types/abTesting'

interface ABTestCardProps {
  test: ABTest
  onSelect: (test: ABTest) => void
  onStatusChange: (testId: string, status: ABTestStatus) => void
  onDelete: (testId: string) => void
}

function ABTestCard({ test, onSelect, onStatusChange, onDelete }: ABTestCardProps) {
  const statusColors: Record<ABTestStatus, string> = {
    draft: 'bg-neutral-600',
    running: 'bg-emerald-600',
    paused: 'bg-yellow-600',
    completed: 'bg-blue-600',
    archived: 'bg-neutral-800',
  }

  const statusIcons: Record<ABTestStatus, string> = {
    draft: '📝',
    running: '▶️',
    paused: '⏸️',
    completed: '✅',
    archived: '📦',
  }

  return (
    <div
      className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 hover:border-neutral-700 transition-colors cursor-pointer"
      onClick={() => onSelect(test)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{test.name}</h3>
            <span
              className={`px-2 py-0.5 rounded text-xs ${statusColors[test.status]}`}
            >
              {statusIcons[test.status]} {test.status}
            </span>
          </div>
          <p className="text-sm text-neutral-400 mt-1 line-clamp-2">
            {test.description || 'No description'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-neutral-400">
        <span>
          {1 + test.treatmentVariants.length} variants
        </span>
        <span>
          {test.currentSampleSize.toLocaleString()} samples
        </span>
        {test.startDate && (
          <span>
            Started {new Date(test.startDate).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        {test.status === 'draft' && (
          <button
            className="px-2 py-1 rounded text-xs bg-emerald-600 hover:bg-emerald-500"
            onClick={() => onStatusChange(test.id, 'running')}
          >
            Start
          </button>
        )}
        {test.status === 'running' && (
          <button
            className="px-2 py-1 rounded text-xs bg-yellow-600 hover:bg-yellow-500"
            onClick={() => onStatusChange(test.id, 'paused')}
          >
            Pause
          </button>
        )}
        {test.status === 'paused' && (
          <>
            <button
              className="px-2 py-1 rounded text-xs bg-emerald-600 hover:bg-emerald-500"
              onClick={() => onStatusChange(test.id, 'running')}
            >
              Resume
            </button>
            <button
              className="px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-500"
              onClick={() => onStatusChange(test.id, 'completed')}
            >
              Complete
            </button>
          </>
        )}
        {(test.status === 'draft' || test.status === 'archived') && (
          <button
            className="px-2 py-1 rounded text-xs bg-rose-700 hover:bg-rose-600"
            onClick={() => onDelete(test.id)}
          >
            Delete
          </button>
        )}
        {test.status === 'completed' && (
          <button
            className="px-2 py-1 rounded text-xs bg-neutral-700 hover:bg-neutral-600"
            onClick={() => onStatusChange(test.id, 'archived')}
          >
            Archive
          </button>
        )}
      </div>
    </div>
  )
}

interface ABTestDetailProps {
  test: ABTest
  result: ABTestResult | null
  onClose: () => void
}

function ABTestDetail({ test, result, onClose }: ABTestDetailProps) {
  const allVariants = [test.controlVariant, ...test.treatmentVariants]
  const maxImpressions = Math.max(...allVariants.map((v) => v.metrics.impressions), 1)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{test.name}</h2>
            <p className="text-sm text-neutral-400">{test.description}</p>
          </div>
          <button
            className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Variants Performance */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <span>📊</span> Variant Performance
            </h3>
            <div className="space-y-3">
              {allVariants.map((variant, index) => (
                <div
                  key={variant.id}
                  className="p-3 rounded-lg border border-neutral-800 bg-neutral-900"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{variant.name}</span>
                      {index === 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-600">
                          Control
                        </span>
                      )}
                      {result?.winner?.variantId === variant.id && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-600">
                          🏆 Winner
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-neutral-400">
                      {variant.trafficWeight.toFixed(0)}% traffic
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-neutral-800 rounded overflow-hidden mb-2">
                    <div
                      className={`h-full ${index === 0 ? 'bg-blue-500' : 'bg-emerald-500'}`}
                      style={{
                        width: `${(variant.metrics.impressions / maxImpressions) * 100}%`,
                      }}
                    />
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <div className="text-neutral-400">Impressions</div>
                      <div className="font-medium">
                        {variant.metrics.impressions.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-neutral-400">Conversions</div>
                      <div className="font-medium">
                        {variant.metrics.conversions.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-neutral-400">Conv. Rate</div>
                      <div className="font-medium">
                        {(variant.metrics.conversionRate * 100).toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-neutral-400">Avg Response</div>
                      <div className="font-medium">
                        {variant.metrics.avgResponseTime.toFixed(0)}ms
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Statistical Results */}
          {result && (
            <div className="p-4 rounded-lg border border-blue-900/50 bg-blue-950/20">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <span>📈</span> Statistical Analysis
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-neutral-400">Confidence Level</div>
                  <div className="font-medium text-lg">
                    {(result.confidenceLevel * 100).toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="text-neutral-400">Statistical Significance</div>
                  <div className="font-medium text-lg">
                    {result.statisticalSignificance >= 0.95 ? (
                      <span className="text-emerald-400">Significant</span>
                    ) : (
                      <span className="text-yellow-400">Not yet significant</span>
                    )}
                  </div>
                </div>
              </div>

              {result.winner && (
                <div className="mt-3 p-3 rounded bg-emerald-900/30 border border-emerald-800/50">
                  <div className="font-medium text-emerald-400">
                    🏆 Winner: {allVariants.find((v) => v.id === result.winner?.variantId)?.name}
                  </div>
                  <div className="text-sm text-neutral-300 mt-1">
                    {result.winner.improvement.toFixed(1)}% improvement in {result.winner.metric}
                  </div>
                </div>
              )}

              <div className="mt-3 text-sm text-neutral-300">
                <strong>Recommendation:</strong> {result.recommendation}
              </div>
            </div>
          )}

          {/* Test Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-neutral-400">Created</div>
              <div>{new Date(test.createdAt).toLocaleString()}</div>
            </div>
            {test.startDate && (
              <div>
                <div className="text-neutral-400">Started</div>
                <div>{new Date(test.startDate).toLocaleString()}</div>
              </div>
            )}
            {test.endDate && (
              <div>
                <div className="text-neutral-400">Ended</div>
                <div>{new Date(test.endDate).toLocaleString()}</div>
              </div>
            )}
            <div>
              <div className="text-neutral-400">Total Samples</div>
              <div>{test.currentSampleSize.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface CreateTestModalProps {
  onClose: () => void
  onCreate: (config: ABTestConfig) => void
  promptIds: string[]
}

function CreateTestModal({ onClose, onCreate, promptIds }: CreateTestModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [controlPromptId, setControlPromptId] = useState(promptIds[0] || '')
  const [treatmentPromptId, setTreatmentPromptId] = useState(promptIds[1] || '')
  const [targetSampleSize, setTargetSampleSize] = useState(1000)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !controlPromptId || !treatmentPromptId) return

    onCreate({
      name,
      description,
      controlPromptId,
      treatmentPromptIds: [treatmentPromptId],
      trafficSplit: [50, 50],
      targetSampleSize,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl max-w-lg w-full">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="text-lg font-bold">Create A/B Test</h2>
          <button
            className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Test Name</label>
            <input
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Improved Customer Support Prompt"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">Description</label>
            <textarea
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 h-20"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you testing?"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                Control Prompt (A)
              </label>
              <select
                className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800"
                value={controlPromptId}
                onChange={(e) => setControlPromptId(e.target.value)}
                required
              >
                <option value="">Select prompt...</option>
                {promptIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                Treatment Prompt (B)
              </label>
              <select
                className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800"
                value={treatmentPromptId}
                onChange={(e) => setTreatmentPromptId(e.target.value)}
                required
              >
                <option value="">Select prompt...</option>
                {promptIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Target Sample Size
            </label>
            <input
              type="number"
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800"
              value={targetSampleSize}
              onChange={(e) => setTargetSampleSize(Number(e.target.value))}
              min={100}
              max={100000}
            />
            <p className="text-xs text-neutral-500 mt-1">
              Minimum samples needed for statistical significance
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500"
            >
              Create Test
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface ABTestingManagerProps {
  promptIds?: string[]
}

export default function ABTestingManager({ promptIds = [] }: ABTestingManagerProps) {
  const [tests, setTests] = useState<ABTest[]>([])
  const [selectedTest, setSelectedTest] = useState<ABTest | null>(null)
  const [selectedResult, setSelectedResult] = useState<ABTestResult | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState<ABTestStatus | 'all'>('all')

  useEffect(() => {
    loadTests()
  }, [])

  useEffect(() => {
    if (selectedTest) {
      const result = getABTestResults(selectedTest.id)
      setSelectedResult(result)
    }
  }, [selectedTest])

  const loadTests = () => {
    const allTests = getABTests()
    setTests(allTests)
  }

  const handleStatusChange = (testId: string, status: ABTestStatus) => {
    updateABTestStatus(testId, status)
    loadTests()
  }

  const handleDelete = (testId: string) => {
    if (confirm('Are you sure you want to delete this test?')) {
      deleteABTest(testId)
      loadTests()
    }
  }

  const handleCreate = (config: ABTestConfig) => {
    createABTest(config)
    loadTests()
  }

  const filteredTests =
    statusFilter === 'all' ? tests : tests.filter((t) => t.status === statusFilter)

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>🧪</span> A/B Testing
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Compare prompt variants and find the best performers
          </p>
        </div>
        <button
          className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 flex items-center gap-2"
          onClick={() => setShowCreateModal(true)}
        >
          <span>+</span> New Test
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-neutral-400">Filter:</span>
        {(['all', 'running', 'paused', 'completed', 'draft'] as const).map((status) => (
          <button
            key={status}
            className={`px-3 py-1 rounded text-sm ${
              statusFilter === status
                ? 'bg-emerald-600'
                : 'bg-neutral-800 hover:bg-neutral-700'
            }`}
            onClick={() => setStatusFilter(status)}
          >
            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Tests Grid */}
      {filteredTests.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-4xl block mb-4">🧪</span>
          <p className="text-neutral-400">No A/B tests found</p>
          <p className="text-sm text-neutral-500 mt-1">
            Create a test to start comparing prompt variations
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTests.map((test) => (
            <ABTestCard
              key={test.id}
              test={test}
              onSelect={setSelectedTest}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {selectedTest && (
        <ABTestDetail
          test={selectedTest}
          result={selectedResult}
          onClose={() => {
            setSelectedTest(null)
            setSelectedResult(null)
          }}
        />
      )}

      {showCreateModal && (
        <CreateTestModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
          promptIds={promptIds}
        />
      )}
    </div>
  )
}
