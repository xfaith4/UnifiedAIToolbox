import { type ModelName, calculateCost, calculateCO2e, calculateEnergy, calculateWater } from '../config/modelPricing'

/**
 * Prompt Library Health Metrics
 */
export interface PromptLibraryHealth {
    totalPrompts: number
    byCategory: Record<string, number>
    byQuality: {
        experimental: number
        validated: number
        production: number
    }
    coverage: {
        withTests: number
        withDocs: number
        percentWithTests: number
        percentWithDocs: number
    }
    lastUpdated: string
}

/**
 * Agent Library Health Metrics
 */
export interface AgentUsage {
    agentId: string
    name: string
    role: string
    calls7d: number
    avgTokens: number
    avgScore: number
    lastUsed: string
}

export interface AgentLibraryHealth {
    totalAgents: number
    byRole: Record<string, number>
    usage: AgentUsage[]
    activeAgents7d: number
    avgTokensPerCall: number
    avgQualityScore: number
}

/**
 * Orchestration Cost & Impact Metrics
 */
export interface ModelBreakdown {
    tokens: number
    inputTokens: number
    outputTokens: number
    cost: number
    runs: number
}

export interface OrchestrationCost {
    timeWindow: string
    totalTokens: number
    totalInputTokens: number
    totalOutputTokens: number
    totalCostUSD: number
    byModel: Record<string, ModelBreakdown>
    avgCostPerRun: number
    totalRuns: number
    sustainability: {
        gCO2e: number
        energyKWh: number
        waterLiters: number
    }
    trend: Array<{
        date: string
        tokens: number
        cost: number
    }>
}

/**
 * Refinement & Effectiveness Metrics
 */
export interface RefinementMetrics {
    avgIterations: number
    avgScoreImprovement: number
    successRate: number
    avgTimeToCompletion: number // in seconds
    totalRuns: number
    successfulRuns: number
    failedRuns: number
    distributionPercentiles: {
        p50Iterations: number
        p90Iterations: number
        p50TimeSeconds: number
        p90TimeSeconds: number
    }
}

/**
 * Combined dashboard data
 */
export interface DashboardTelemetry {
    promptLibrary: PromptLibraryHealth
    agentLibrary: AgentLibraryHealth
    orchestrationCost: OrchestrationCost
    refinementMetrics: RefinementMetrics
    lastRefreshed: string
}

/**
 * Telemetry Service - Aggregates AI orchestration metrics
 * 
 * TODO: Wire to real data sources:
 * - Prompt Library: Scan data/prompts/ YAML files
 * - Agent Library: Scan data/agents/ for agent definitions
 * - Orchestration Runs: Parse logs/ or run history
 * - Costs: Use model pricing + token counts from logs
 */
class TelemetryService {
    /**
     * Get Prompt Library health metrics
     * TODO: Implement real data aggregation from data/prompts/
     */
    async getPromptLibraryHealth(): Promise<PromptLibraryHealth> {
        // Mock data for now
        return {
            totalPrompts: 42,
            byCategory: {
                'Supervisor': 6,
                'Researcher': 8,
                'Engineer': 12,
                'Critic': 7,
                'Synthesizer': 5,
                'Commissioner': 4,
            },
            byQuality: {
                experimental: 15,
                validated: 20,
                production: 7,
            },
            coverage: {
                withTests: 28,
                withDocs: 35,
                percentWithTests: 67,
                percentWithDocs: 83,
            },
            lastUpdated: new Date().toISOString(),
        }
    }

    /**
     * Get Agent Library health metrics
     * TODO: Implement real data aggregation from data/agents/
     */
    async getAgentLibraryHealth(): Promise<AgentLibraryHealth> {
        // Mock data for now
        const mockUsage: AgentUsage[] = [
            {
                agentId: 'ag_supervisor_001',
                name: 'Supervisor Agent',
                role: 'Supervisor',
                calls7d: 45,
                avgTokens: 1250,
                avgScore: 8.5,
                lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            },
            {
                agentId: 'ag_researcher_001',
                name: 'Research Agent',
                role: 'Researcher',
                calls7d: 38,
                avgTokens: 2100,
                avgScore: 8.2,
                lastUsed: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
            },
            {
                agentId: 'ag_engineer_001',
                name: 'Code Engineer',
                role: 'Engineer',
                calls7d: 52,
                avgTokens: 3200,
                avgScore: 7.9,
                lastUsed: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
            },
            {
                agentId: 'ag_critic_001',
                name: 'Quality Critic',
                role: 'Critic',
                calls7d: 41,
                avgTokens: 1800,
                avgScore: 8.7,
                lastUsed: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            },
        ]

        return {
            totalAgents: 12,
            byRole: {
                'Supervisor': 2,
                'Researcher': 3,
                'Engineer': 3,
                'Critic': 2,
                'Synthesizer': 1,
                'Commissioner': 1,
            },
            usage: mockUsage,
            activeAgents7d: 8,
            avgTokensPerCall: 2087,
            avgQualityScore: 8.3,
        }
    }

    /**
     * Get Orchestration cost and impact metrics
     * TODO: Implement real data aggregation from logs/
     */
    async getOrchestrationCost(timeWindow: string = '7d'): Promise<OrchestrationCost> {
        // Mock data for now
        const mockByModel: Record<string, ModelBreakdown> = {
            'gpt-4o-mini': {
                tokens: 125000,
                inputTokens: 45000,
                outputTokens: 80000,
                cost: calculateCost('gpt-4o-mini', 45000, 80000),
                runs: 28,
            },
            'gpt-4': {
                tokens: 45000,
                inputTokens: 18000,
                outputTokens: 27000,
                cost: calculateCost('gpt-4', 18000, 27000),
                runs: 8,
            },
            'claude-3.5-sonnet': {
                tokens: 32000,
                inputTokens: 12000,
                outputTokens: 20000,
                cost: calculateCost('claude-3.5-sonnet', 12000, 20000),
                runs: 6,
            },
        }

        const totalTokens = Object.values(mockByModel).reduce((sum, m) => sum + m.tokens, 0)
        const totalInputTokens = Object.values(mockByModel).reduce((sum, m) => sum + m.inputTokens, 0)
        const totalOutputTokens = Object.values(mockByModel).reduce((sum, m) => sum + m.outputTokens, 0)
        const totalCost = Object.values(mockByModel).reduce((sum, m) => sum + m.cost, 0)
        const totalRuns = Object.values(mockByModel).reduce((sum, m) => sum + m.runs, 0)

        // Calculate sustainability metrics
        const gCO2e = Object.entries(mockByModel).reduce((sum, [model, data]) => {
            return sum + calculateCO2e(model as ModelName, data.tokens)
        }, 0)

        // Mock trend data (last 7 days)
        const trend = Array.from({ length: 7 }, (_, i) => {
            const date = new Date()
            date.setDate(date.getDate() - (6 - i))
            return {
                date: date.toISOString().split('T')[0],
                tokens: Math.floor(totalTokens / 7 * (0.8 + Math.random() * 0.4)),
                cost: Math.floor(totalCost / 7 * (0.8 + Math.random() * 0.4) * 100) / 100,
            }
        })

        return {
            timeWindow,
            totalTokens,
            totalInputTokens,
            totalOutputTokens,
            totalCostUSD: totalCost,
            byModel: mockByModel,
            avgCostPerRun: totalCost / totalRuns,
            totalRuns,
            sustainability: {
                gCO2e: Math.round(gCO2e * 10) / 10,
                energyKWh: Math.round(calculateEnergy(totalTokens) * 1000) / 1000,
                waterLiters: Math.round(calculateWater(totalTokens) * 10) / 10,
            },
            trend,
        }
    }

    /**
     * Get Refinement & Effectiveness metrics
     * TODO: Implement real data aggregation from run logs
     */
    async getRefinementMetrics(): Promise<RefinementMetrics> {
        // Mock data for now
        return {
            avgIterations: 3.2,
            avgScoreImprovement: 2.4,
            successRate: 87.5,
            avgTimeToCompletion: 145, // seconds
            totalRuns: 42,
            successfulRuns: 37,
            failedRuns: 5,
            distributionPercentiles: {
                p50Iterations: 3,
                p90Iterations: 5,
                p50TimeSeconds: 120,
                p90TimeSeconds: 240,
            },
        }
    }

    /**
     * Get all dashboard telemetry data
     */
    async getDashboardTelemetry(timeWindow: string = '7d'): Promise<DashboardTelemetry> {
        const [promptLibrary, agentLibrary, orchestrationCost, refinementMetrics] = await Promise.all([
            this.getPromptLibraryHealth(),
            this.getAgentLibraryHealth(),
            this.getOrchestrationCost(timeWindow),
            this.getRefinementMetrics(),
        ])

        return {
            promptLibrary,
            agentLibrary,
            orchestrationCost,
            refinementMetrics,
            lastRefreshed: new Date().toISOString(),
        }
    }
}

// Export singleton instance
export const telemetryService = new TelemetryService()
