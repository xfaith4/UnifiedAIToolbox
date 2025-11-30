/**
 * Model Fine-Tuning Manager Component (Sprint 4)
 * Manage custom fine-tuned models and training jobs
 */
import React, { useEffect, useState } from 'react'
import {
  getFineTunedModels,
  getBaseModels,
  createFineTuneJob,
  deleteFineTunedModel,
  getDatasets,
  createDataset,
} from '../services/fineTuneStore'
import type { FineTunedModel, BaseModelInfo, FineTuneDataset, FineTuneStatus } from '../types/fineTuning'

interface ModelCardProps {
  model: FineTunedModel
  onSelect: (model: FineTunedModel) => void
  onDelete: (id: string) => void
}

function ModelCard({ model, onSelect, onDelete }: ModelCardProps) {
  const statusColors: Record<FineTuneStatus, string> = {
    pending: 'bg-neutral-600',
    validating: 'bg-yellow-600',
    training: 'bg-blue-600',
    succeeded: 'bg-emerald-600',
    failed: 'bg-rose-600',
    cancelled: 'bg-neutral-800',
  }

  const statusIcons: Record<FineTuneStatus, string> = {
    pending: '⏳',
    validating: '🔍',
    training: '⚙️',
    succeeded: '✅',
    failed: '❌',
    cancelled: '🚫',
  }

  return (
    <div
      className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 hover:border-neutral-700 transition-colors cursor-pointer"
      onClick={() => onSelect(model)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{model.name}</h3>
            <span
              className={`px-2 py-0.5 rounded text-xs ${statusColors[model.status]}`}
            >
              {statusIcons[model.status]} {model.status}
            </span>
          </div>
          <p className="text-sm text-neutral-400 mt-1">{model.description}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-neutral-400">
        <span>Base: {model.baseModel}</span>
        <span className="capitalize">{model.provider}</span>
        {model.fineTunedModelId && (
          <span className="font-mono text-[10px]">{model.fineTunedModelId}</span>
        )}
      </div>

      {model.trainingMetrics && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div className="p-2 rounded bg-neutral-900">
            <div className="text-neutral-400">Training Loss</div>
            <div className="font-medium">{model.trainingMetrics.trainingLoss?.toFixed(4)}</div>
          </div>
          <div className="p-2 rounded bg-neutral-900">
            <div className="text-neutral-400">Tokens</div>
            <div className="font-medium">{model.trainingMetrics.trainingTokens?.toLocaleString()}</div>
          </div>
          <div className="p-2 rounded bg-neutral-900">
            <div className="text-neutral-400">Cost</div>
            <div className="font-medium">${model.costEstimate?.toFixed(2)}</div>
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        {model.status === 'succeeded' && (
          <button
            className="px-2 py-1 rounded text-xs bg-emerald-600 hover:bg-emerald-500"
            onClick={() => {
              navigator.clipboard.writeText(model.fineTunedModelId || model.id)
            }}
          >
            Copy Model ID
          </button>
        )}
        {(model.status === 'pending' || model.status === 'failed' || model.status === 'cancelled') && (
          <button
            className="px-2 py-1 rounded text-xs bg-rose-700 hover:bg-rose-600"
            onClick={() => onDelete(model.id)}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

interface CreateFineTuneModalProps {
  onClose: () => void
  onCreate: (data: {
    name: string
    description: string
    baseModel: string
    provider: string
    trainingDatasetId: string
  }) => void
  baseModels: BaseModelInfo[]
  datasets: FineTuneDataset[]
}

function CreateFineTuneModal({ onClose, onCreate, baseModels, datasets }: CreateFineTuneModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [baseModel, setBaseModel] = useState('')
  const [datasetId, setDatasetId] = useState('')

  const supportedModels = baseModels.filter((m) => m.supportsFineTuning)
  const selectedBaseModel = supportedModels.find((m) => m.id === baseModel)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !baseModel || !datasetId) return

    onCreate({
      name,
      description,
      baseModel,
      provider: selectedBaseModel?.provider || 'openai',
      trainingDatasetId: datasetId,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl max-w-lg w-full">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="text-lg font-bold">Create Fine-Tuned Model</h2>
          <button
            className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Model Name</label>
            <input
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., customer-support-specialist"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">Description</label>
            <textarea
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 h-20"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this model trained to do?"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">Base Model</label>
            <select
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800"
              value={baseModel}
              onChange={(e) => setBaseModel(e.target.value)}
              required
            >
              <option value="">Select base model...</option>
              {supportedModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider})
                </option>
              ))}
            </select>
            {selectedBaseModel && (
              <p className="text-xs text-neutral-500 mt-1">
                {selectedBaseModel.description}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">Training Dataset</label>
            <select
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800"
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              required
            >
              <option value="">Select dataset...</option>
              {datasets
                .filter((d) => d.status === 'validated')
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.sampleCount} samples)
                  </option>
                ))}
            </select>
            {datasets.filter((d) => d.status === 'validated').length === 0 && (
              <p className="text-xs text-yellow-500 mt-1">
                No validated datasets available. Create a dataset first.
              </p>
            )}
          </div>

          <div className="bg-blue-950/30 border border-blue-900/50 rounded p-3 text-xs">
            <div className="font-medium text-blue-300 mb-1">💡 Fine-tuning Tips</div>
            <ul className="text-neutral-400 space-y-1">
              <li>• Use at least 50-100 high-quality examples</li>
              <li>• Ensure examples match your desired output format</li>
              <li>• Training typically takes 5-30 minutes</li>
            </ul>
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
              disabled={!name || !baseModel || !datasetId}
            >
              Start Training
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface CreateDatasetModalProps {
  onClose: () => void
  onCreate: (data: { name: string; description: string; sampleCount: number }) => void
}

function CreateDatasetModal({ onClose, onCreate }: CreateDatasetModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sampleCount, setSampleCount] = useState(100)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return

    onCreate({ name, description, sampleCount })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl max-w-lg w-full">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="text-lg font-bold">Create Dataset</h2>
          <button
            className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Dataset Name</label>
            <input
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., customer-support-examples"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">Description</label>
            <textarea
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 h-20"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this dataset contain?"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">Sample Count</label>
            <input
              type="number"
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800"
              value={sampleCount}
              onChange={(e) => setSampleCount(Number(e.target.value))}
              min={10}
              max={10000}
            />
            <p className="text-xs text-neutral-500 mt-1">
              Number of training examples (in a real implementation, you would upload a file)
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
              Create Dataset
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function FineTuneManager() {
  const [models, setModels] = useState<FineTunedModel[]>([])
  const [baseModels, setBaseModels] = useState<BaseModelInfo[]>([])
  const [datasets, setDatasets] = useState<FineTuneDataset[]>([])
  const [, setSelectedModel] = useState<FineTunedModel | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDatasetModal, setShowDatasetModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'models' | 'datasets'>('models')

  useEffect(() => {
    loadData()
    // Refresh periodically to show training progress
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadData = () => {
    setModels(getFineTunedModels())
    setBaseModels(getBaseModels())
    setDatasets(getDatasets())
  }

  const handleCreateModel = (data: {
    name: string
    description: string
    baseModel: string
    provider: string
    trainingDatasetId: string
  }) => {
    createFineTuneJob({
      name: data.name,
      description: data.description,
      baseModel: data.baseModel,
      provider: data.provider as 'openai' | 'anthropic' | 'google' | 'azure' | 'custom',
      trainingDatasetId: data.trainingDatasetId,
    })
    loadData()
  }

  const handleCreateDataset = (data: {
    name: string
    description: string
    sampleCount: number
  }) => {
    createDataset(data.name, data.description, 'jsonl', data.sampleCount)
    loadData()
  }

  const handleDeleteModel = (id: string) => {
    if (confirm('Are you sure you want to delete this model?')) {
      deleteFineTunedModel(id)
      loadData()
    }
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>🎯</span> Model Fine-Tuning
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Create and manage custom fine-tuned models
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 flex items-center gap-2"
            onClick={() => setShowDatasetModal(true)}
          >
            <span>📁</span> New Dataset
          </button>
          <button
            className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 flex items-center gap-2"
            onClick={() => setShowCreateModal(true)}
          >
            <span>+</span> Fine-Tune Model
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-neutral-800 pb-2">
        <button
          className={`px-4 py-2 rounded-t text-sm ${
            activeTab === 'models'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('models')}
        >
          Fine-Tuned Models ({models.length})
        </button>
        <button
          className={`px-4 py-2 rounded-t text-sm ${
            activeTab === 'datasets'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('datasets')}
        >
          Datasets ({datasets.length})
        </button>
      </div>

      {/* Models Tab */}
      {activeTab === 'models' && (
        <>
          {models.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl block mb-4">🎯</span>
              <p className="text-neutral-400">No fine-tuned models yet</p>
              <p className="text-sm text-neutral-500 mt-1">
                Create a dataset and start fine-tuning a model
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {models.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  onSelect={setSelectedModel}
                  onDelete={handleDeleteModel}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Datasets Tab */}
      {activeTab === 'datasets' && (
        <>
          {datasets.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl block mb-4">📁</span>
              <p className="text-neutral-400">No datasets yet</p>
              <p className="text-sm text-neutral-500 mt-1">
                Create a dataset to start fine-tuning models
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {datasets.map((dataset) => (
                <div
                  key={dataset.id}
                  className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{dataset.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          dataset.status === 'validated'
                            ? 'bg-emerald-600'
                            : dataset.status === 'invalid'
                              ? 'bg-rose-600'
                              : 'bg-yellow-600'
                        }`}
                      >
                        {dataset.status}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-400 mt-1">{dataset.description}</p>
                    <div className="flex items-center gap-4 text-xs text-neutral-500 mt-2">
                      <span>{dataset.sampleCount} samples</span>
                      <span>{dataset.format.toUpperCase()}</span>
                      <span>Created {new Date(dataset.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Base Models Reference */}
      <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <span>📚</span> Available Base Models
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-400 border-b border-neutral-800">
                <th className="pb-2">Model</th>
                <th className="pb-2">Provider</th>
                <th className="pb-2">Max Tokens</th>
                <th className="pb-2">Fine-Tuning</th>
                <th className="pb-2 text-right">Cost (per 1K)</th>
              </tr>
            </thead>
            <tbody>
              {baseModels.map((model) => (
                <tr key={model.id} className="border-b border-neutral-800/50">
                  <td className="py-2 font-medium">{model.name}</td>
                  <td className="py-2 text-neutral-400 capitalize">{model.provider}</td>
                  <td className="py-2">{model.maxTokens.toLocaleString()}</td>
                  <td className="py-2">
                    {model.supportsFineTuning ? (
                      <span className="text-emerald-400">✓ Supported</span>
                    ) : (
                      <span className="text-neutral-500">—</span>
                    )}
                  </td>
                  <td className="py-2 text-right text-neutral-400">
                    ${model.costPer1kPromptTokens} / ${model.costPer1kCompletionTokens}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateFineTuneModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateModel}
          baseModels={baseModels}
          datasets={datasets}
        />
      )}

      {showDatasetModal && (
        <CreateDatasetModal
          onClose={() => setShowDatasetModal(false)}
          onCreate={handleCreateDataset}
        />
      )}
    </div>
  )
}
