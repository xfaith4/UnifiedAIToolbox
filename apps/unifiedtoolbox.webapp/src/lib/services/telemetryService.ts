import { type ModelName, calculateCost, calculateCO2e, calculateEnergy, calculateWater } from '../config/modelPricing'
import { scanPromptLibrary, scanAgentLibrary, scanOrchestrationRuns, calculatePromptQuality, type PromptData, type AgentData, type OrchestrationRun } from './dataCollector'

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
    avgAgentsPerRun: number
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
     * Scans actual prompt files from data/prompts/
     */
    async getPromptLibraryHealth(): Promise<PromptLibraryHealth> {
        const prompts = await scanPromptLibrary()
        
        // Aggregate by category
        const byCategory: Record<string, number> = {}
        prompts.forEach(p => {
            const cat = p.category || 'Other'
            byCategory[cat] = (byCategory[cat] || 0) + 1
        })

        // Aggregate by quality
        const byQuality = {
            experimental: 0,
            validated: 0,
            production: 0,
        }
        prompts.forEach(p => {
            const quality = calculatePromptQuality(p)
            byQuality[quality]++
        })

        // Calculate coverage
        const withTests = prompts.filter(p => p.hasTests).length
        const withDocs = prompts.filter(p => p.hasDocs).length

        return {
            totalPrompts: prompts.length,
            byCategory,
            byQuality,
            coverage: {
                withTests,
                withDocs,
                percentWithTests: prompts.length > 0 ? Math.round((withTests / prompts.length) * 100) : 0,
                percentWithDocs: prompts.length > 0 ? Math.round((withDocs / prompts.length) * 100) : 0,
            },
            lastUpdated: new Date().toISOString(),
        }
    }

    /**
     * Get Agent Library health metrics
     * Scans actual agent files from data/agents/
     */
    async getAgentLibraryHealth(): Promise<AgentLibraryHealth> {
        const agents = await scanAgentLibrary()
        const runs = await scanOrchestrationRuns()
        
        // Aggregate by role
        const byRole: Record<string, number> = {}
        agents.forEach(a => {
            const role = a.role || 'Unknown'
            byRole[role] = (byRole[role] || 0) + 1
        })

        // For usage data, we'll use mock data for now since we need run history
        // In a production system, this would come from a database of agent invocations
        const mockUsage: AgentUsage[] = agents.slice(0, 4).map((agent, idx) => ({
            agentId: agent.id,
            name: agent.name,
            role: agent.role || 'Unknown',
            calls7d: Math.floor(30 + Math.random() * 30),
            avgTokens: Math.floor(1000 + Math.random() * 2500),
            avgScore: 7.5 + Math.random() * 1.5,
            lastUsed: new Date(Date.now() - idx * 60 * 60 * 1000).toISOString(),
        }))

        // Calculate average agents per run
        const avgAgentsPerRun = runs.length > 0
            ? runs.reduce((sum, run) => sum + (run.agents?.length || 1), 0) / runs.length
            : 0

        return {
            totalAgents: agents.length,
            byRole,
            usage: mockUsage,
            activeAgents7d: Math.min(agents.length, mockUsage.length),
            avgTokensPerCall: mockUsage.length > 0 
                ? Math.round(mockUsage.reduce((sum, u) => sum + u.avgTokens, 0) / mockUsage.length)
                : 0,
            avgQualityScore: mockUsage.length > 0
                ? Math.round(mockUsage.reduce((sum, u) => sum + u.avgScore, 0) / mockUsage.length * 10) / 10
                : 0,
            avgAgentsPerRun: Math.round(avgAgentsPerRun * 10) / 10,
        }
    }

    /**
     * Get Orchestration cost and impact metrics
     * Scans actual run logs from logs/
     */
    async getOrchestrationCost(timeWindow: string = '7d'): Promise<OrchestrationCost> {
        const runs = await scanOrchestrationRuns()
        
        // Filter runs based on time window
        const cutoffDate = new Date()
        if (timeWindow === '7d') {
            cutoffDate.setDate(cutoffDate.getDate() - 7)
        } else if (timeWindow === '30d') {
            cutoffDate.setDate(cutoffDate.getDate() - 30)
        }

        const recentRuns = runs.filter(r => {
            if (!r.startTime) return false
            return new Date(r.startTime) >= cutoffDate
        })

        // Aggregate by model
        const mockByModel: Record<string, ModelBreakdown> = {}
        
        // Use actual run data if available, otherwise estimate
        if (recentRuns.length > 0) {
            recentRuns.forEach(run => {
                const model = run.model || 'gpt-4o-mini'
                if (!mockByModel[model]) {
                    mockByModel[model] = {
                        tokens: 0,
                        inputTokens: 0,
                        outputTokens: 0,
                        cost: 0,
                        runs: 0,
                    }
                }
                
                // Estimate tokens if not provided (rough estimate based on duration)
                const estimatedTokens = run.tokenUsage?.total || Math.floor((run.durationSeconds || 30) * 100)
                const estimatedInput = run.tokenUsage?.input || Math.floor(estimatedTokens * 0.4)
                const estimatedOutput = run.tokenUsage?.output || Math.floor(estimatedTokens * 0.6)
                
                mockByModel[model].tokens += estimatedTokens
                mockByModel[model].inputTokens += estimatedInput
                mockByModel[model].outputTokens += estimatedOutput
                mockByModel[model].cost += calculateCost(model as ModelName, estimatedInput, estimatedOutput)
                mockByModel[model].runs++
            })
        } else {
            // Fallback to sample data if no runs found
            mockByModel['gpt-4o-mini'] = {
                tokens: 125000,
                inputTokens: 45000,
                outputTokens: 80000,
                cost: calculateCost('gpt-4o-mini', 45000, 80000),
                runs: 28,
            }
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

        const energyKWh = calculateEnergy(totalTokens)
        const waterLiters = calculateWater(totalTokens)

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
            avgCostPerRun: totalRuns > 0 ? totalCost / totalRuns : 0,
            totalRuns,
            sustainability: {
                gCO2e: Math.round(gCO2e * 10) / 10,
                energyKWh: Math.round(energyKWh * 1000) / 1000,
                waterLiters: Math.round(waterLiters * 10) / 10,
            },
            trend,
        }
    }

    /**
     * Get Refinement & Effectiveness metrics
     * Uses actual run data from logs
     */
    async getRefinementMetrics(): Promise<RefinementMetrics> {
        const runs = await scanOrchestrationRuns()
        
        if (runs.length === 0) {
            // Return default metrics if no data
            return {
                avgIterations: 0,
                avgScoreImprovement: 0,
                successRate: 0,
                avgTimeToCompletion: 0,
                totalRuns: 0,
                successfulRuns: 0,
                failedRuns: 0,
                distributionPercentiles: {
                    p50Iterations: 0,
                    p90Iterations: 0,
                    p50TimeSeconds: 0,
                    p90TimeSeconds: 0,
                },
            }
        }

        const successfulRuns = runs.filter(r => r.status === 'completed' || r.status === 'success').length
        const failedRuns = runs.filter(r => r.status === 'failed' || r.status === 'error').length
        
        // Calculate average iterations (using milestones as proxy)
        const iterationCounts = runs.map(r => r.milestonesCount || 1).filter(x => x > 0)
        const avgIterations = iterationCounts.length > 0
            ? iterationCounts.reduce((sum, x) => sum + x, 0) / iterationCounts.length
            : 0

        // Calculate average time
        const durations = runs.map(r => r.durationSeconds || 0).filter(x => x > 0)
        const avgTimeToCompletion = durations.length > 0
            ? Math.round(durations.reduce((sum, x) => sum + x, 0) / durations.length)
            : 0

        // Calculate percentiles
        const sortedIterations = [...iterationCounts].sort((a, b) => a - b)
        const sortedDurations = [...durations].sort((a, b) => a - b)
        
        const p50Idx = Math.floor(sortedIterations.length * 0.5)
        const p90Idx = Math.floor(sortedIterations.length * 0.9)

        return {
            avgIterations: Math.round(avgIterations * 10) / 10,
            avgScoreImprovement: 2.4, // Mock for now - would need score tracking
            successRate: runs.length > 0 ? Math.round((successfulRuns / runs.length) * 1000) / 10 : 0,
            avgTimeToCompletion,
            totalRuns: runs.length,
            successfulRuns,
            failedRuns,
            distributionPercentiles: {
                p50Iterations: sortedIterations[p50Idx] || 0,
                p90Iterations: sortedIterations[p90Idx] || 0,
                p50TimeSeconds: Math.round(sortedDurations[p50Idx] || 0),
                p90TimeSeconds: Math.round(sortedDurations[p90Idx] || 0),
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
