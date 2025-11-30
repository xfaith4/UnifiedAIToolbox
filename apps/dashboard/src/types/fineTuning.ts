/**
 * Types for custom model fine-tuning support (Sprint 4)
 */

export type FineTuneStatus = 
  | 'pending' 
  | 'validating' 
  | 'training' 
  | 'succeeded' 
  | 'failed' 
  | 'cancelled'

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'azure' | 'custom'

export interface FineTunedModel {
  id: string
  name: string
  description: string
  baseModel: string
  provider: ModelProvider
  status: FineTuneStatus
  createdAt: string
  updatedAt: string
  fineTunedModelId?: string // The actual model ID from the provider
  trainingFile?: string
  validationFile?: string
  hyperparameters?: FineTuneHyperparameters
  trainingMetrics?: TrainingMetrics
  costEstimate?: number
  tags: string[]
  createdBy?: string
}

export interface FineTuneHyperparameters {
  epochs?: number
  batchSize?: number
  learningRateMultiplier?: number
  promptLossWeight?: number
}

export interface TrainingMetrics {
  trainingLoss?: number
  validationLoss?: number
  trainingTokens?: number
  epochs?: number
  steps?: number
}

export interface FineTuneDataset {
  id: string
  name: string
  description: string
  format: 'jsonl' | 'csv' | 'json'
  sampleCount: number
  validationSplit?: number
  createdAt: string
  updatedAt: string
  fileSize?: number
  status: 'pending' | 'validated' | 'invalid'
  validationErrors?: string[]
}

export interface FineTuneCreateRequest {
  name: string
  description: string
  baseModel: string
  provider: ModelProvider
  trainingDatasetId: string
  validationDatasetId?: string
  hyperparameters?: FineTuneHyperparameters
  tags?: string[]
}

export interface ModelRegistry {
  baseModels: BaseModelInfo[]
  fineTunedModels: FineTunedModel[]
}

export interface BaseModelInfo {
  id: string
  name: string
  provider: ModelProvider
  description: string
  maxTokens: number
  supportsFineTuning: boolean
  costPer1kPromptTokens: number
  costPer1kCompletionTokens: number
}
