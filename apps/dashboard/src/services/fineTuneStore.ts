/**
 * Fine-tuning service for custom model management (Sprint 4)
 */
import type {
  FineTunedModel,
  FineTuneDataset,
  FineTuneCreateRequest,
  FineTuneStatus,
  ModelRegistry,
  BaseModelInfo,
} from '../types/fineTuning'

const API_BASE_RAW = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
const API_BASE = API_BASE_RAW ? API_BASE_RAW.replace(/\/$/, '') : ''

// Local storage key
const FINETUNE_STORAGE_KEY = 'fineTunedModels.v1'
const DATASETS_STORAGE_KEY = 'fineTuneDatasets.v1'

// In-memory stores
let fineTunedModels: FineTunedModel[] = []
let datasets: FineTuneDataset[] = []

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function nowIso(): string {
  return new Date().toISOString()
}

function loadFromStorage(): void {
  try {
    const modelsRaw = localStorage.getItem(FINETUNE_STORAGE_KEY)
    if (modelsRaw) {
      fineTunedModels = JSON.parse(modelsRaw) as FineTunedModel[]
    }
    const datasetsRaw = localStorage.getItem(DATASETS_STORAGE_KEY)
    if (datasetsRaw) {
      datasets = JSON.parse(datasetsRaw) as FineTuneDataset[]
    }
  } catch {
    fineTunedModels = []
    datasets = []
  }
}

function saveToStorage(): void {
  localStorage.setItem(FINETUNE_STORAGE_KEY, JSON.stringify(fineTunedModels))
  localStorage.setItem(DATASETS_STORAGE_KEY, JSON.stringify(datasets))
}

// Initialize from storage
loadFromStorage()

/**
 * Get available base models that support fine-tuning
 */
export function getBaseModels(): BaseModelInfo[] {
  return [
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'openai',
      description: 'Fast and affordable for fine-tuning. Good for most use cases.',
      maxTokens: 128000,
      supportsFineTuning: true,
      costPer1kPromptTokens: 0.00015,
      costPer1kCompletionTokens: 0.0006,
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      description: 'High capability model. Best for complex tasks.',
      maxTokens: 128000,
      supportsFineTuning: true,
      costPer1kPromptTokens: 0.005,
      costPer1kCompletionTokens: 0.015,
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      provider: 'openai',
      description: 'Cost-effective option for simpler tasks.',
      maxTokens: 16385,
      supportsFineTuning: true,
      costPer1kPromptTokens: 0.0005,
      costPer1kCompletionTokens: 0.0015,
    },
    {
      id: 'claude-3-haiku',
      name: 'Claude 3 Haiku',
      provider: 'anthropic',
      description: 'Fast and lightweight Claude model.',
      maxTokens: 200000,
      supportsFineTuning: false, // Anthropic doesn't support fine-tuning yet
      costPer1kPromptTokens: 0.00025,
      costPer1kCompletionTokens: 0.00125,
    },
    {
      id: 'claude-3-sonnet',
      name: 'Claude 3 Sonnet',
      provider: 'anthropic',
      description: 'Balanced performance and cost.',
      maxTokens: 200000,
      supportsFineTuning: false,
      costPer1kPromptTokens: 0.003,
      costPer1kCompletionTokens: 0.015,
    },
  ]
}

/**
 * Get the model registry with base and fine-tuned models
 */
export function getModelRegistry(): ModelRegistry {
  return {
    baseModels: getBaseModels(),
    fineTunedModels: [...fineTunedModels],
  }
}

/**
 * Get all fine-tuned models
 */
export function getFineTunedModels(): FineTunedModel[] {
  return [...fineTunedModels]
}

/**
 * Get a specific fine-tuned model
 */
export function getFineTunedModel(modelId: string): FineTunedModel | undefined {
  return fineTunedModels.find((m) => m.id === modelId)
}

/**
 * Create a new fine-tuning job
 */
export function createFineTuneJob(request: FineTuneCreateRequest): FineTunedModel {
  const now = nowIso()
  
  const model: FineTunedModel = {
    id: uid(),
    name: request.name,
    description: request.description,
    baseModel: request.baseModel,
    provider: request.provider,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    trainingFile: request.trainingDatasetId,
    validationFile: request.validationDatasetId,
    hyperparameters: request.hyperparameters,
    tags: request.tags || [],
  }
  
  fineTunedModels.push(model)
  saveToStorage()
  
  // Simulate async training process
  simulateTraining(model.id)
  
  return model
}

/**
 * Simulate the training process (for demo purposes)
 */
function simulateTraining(modelId: string): void {
  const updateStatus = (status: FineTuneStatus, delay: number) => {
    setTimeout(() => {
      const model = fineTunedModels.find((m) => m.id === modelId)
      if (model && model.status !== 'cancelled') {
        model.status = status
        model.updatedAt = nowIso()
        
        if (status === 'succeeded') {
          model.fineTunedModelId = `ft:${model.baseModel}:${modelId.slice(0, 8)}`
          model.trainingMetrics = {
            trainingLoss: 0.01 + Math.random() * 0.05,
            validationLoss: 0.02 + Math.random() * 0.06,
            trainingTokens: Math.floor(10000 + Math.random() * 90000),
            epochs: model.hyperparameters?.epochs || 3,
            steps: Math.floor(100 + Math.random() * 900),
          }
          model.costEstimate = Math.round((model.trainingMetrics.trainingTokens / 1000) * 0.008 * 100) / 100
        }
        
        saveToStorage()
      }
    }, delay)
  }
  
  // Progress through states
  updateStatus('validating', 1000)
  updateStatus('training', 3000)
  updateStatus('succeeded', 8000)
}

/**
 * Update fine-tuned model status
 */
export function updateFineTuneStatus(
  modelId: string,
  status: FineTuneStatus
): FineTunedModel | null {
  const model = fineTunedModels.find((m) => m.id === modelId)
  if (!model) return null
  
  model.status = status
  model.updatedAt = nowIso()
  saveToStorage()
  
  return model
}

/**
 * Delete a fine-tuned model
 */
export function deleteFineTunedModel(modelId: string): boolean {
  const index = fineTunedModels.findIndex((m) => m.id === modelId)
  if (index === -1) return false
  
  fineTunedModels.splice(index, 1)
  saveToStorage()
  return true
}

/**
 * Get all datasets
 */
export function getDatasets(): FineTuneDataset[] {
  return [...datasets]
}

/**
 * Create a new dataset
 */
export function createDataset(
  name: string,
  description: string,
  format: 'jsonl' | 'csv' | 'json',
  sampleCount: number
): FineTuneDataset {
  const now = nowIso()
  
  const dataset: FineTuneDataset = {
    id: uid(),
    name,
    description,
    format,
    sampleCount,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
  }
  
  datasets.push(dataset)
  saveToStorage()
  
  // Simulate validation
  setTimeout(() => {
    const d = datasets.find((ds) => ds.id === dataset.id)
    if (d) {
      d.status = 'validated'
      d.updatedAt = nowIso()
      saveToStorage()
    }
  }, 2000)
  
  return dataset
}

/**
 * Delete a dataset
 */
export function deleteDataset(datasetId: string): boolean {
  const index = datasets.findIndex((d) => d.id === datasetId)
  if (index === -1) return false
  
  datasets.splice(index, 1)
  saveToStorage()
  return true
}

/**
 * Fetch fine-tuned models from API (if available)
 */
export async function fetchFineTunedModelsFromApi(): Promise<FineTunedModel[] | null> {
  if (!API_BASE) return null
  
  try {
    const response = await fetch(`${API_BASE}/fine-tune/models`)
    if (!response.ok) return null
    const data = await response.json()
    return Array.isArray(data) ? data : data.models
  } catch {
    return null
  }
}

/**
 * Clear all fine-tuning data
 */
export function clearFineTuneData(): void {
  fineTunedModels = []
  datasets = []
  localStorage.removeItem(FINETUNE_STORAGE_KEY)
  localStorage.removeItem(DATASETS_STORAGE_KEY)
}
