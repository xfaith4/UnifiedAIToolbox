/**
 * Model resolver: maps internal aliases and agent routing hints to a concrete
 * provider model id before any call reaches a provider SDK.
 *
 * Internal aliases (e.g. `openai_balanced`) are an orchestration-level concept.
 * Provider SDKs do not understand them, so they MUST be resolved to a concrete
 * model id (e.g. `gpt-5.4`) before a request is sent. Routing all runtime model
 * selection through `resolveProviderModel` gives a single seam where agent
 * `routing_hints.preferred_models` can drive model choice without scattering
 * hardcoded model ids across the runtime.
 *
 * The alias table mirrors the canonical `aliases` map in
 * services/prompt-api/config/model_costs.json.
 */
import { MODEL_PRICING } from './modelPricing'

/** Internal alias -> concrete provider model id. */
const MODEL_ALIASES: Record<string, string> = {
    openai_high_reasoning: 'gpt-5.5',
    openai_balanced: 'gpt-5.4',
    openai_fast: 'gpt-5.4-mini',
    openai_cheapest: 'gpt-5.4-nano',
    openai_coding: 'gpt-5.3-codex',
    anthropic_high_reasoning: 'claude-opus-4-8',
    anthropic_balanced: 'claude-sonnet-4-6',
    anthropic_fast: 'claude-haiku-4-5',
}

/** Concrete model used when no usable routing hint is available. */
export const DEFAULT_RUNTIME_MODEL = 'gpt-5.4'

export type RoutingHints = {
    preferred_models?: string[]
    fallback_models?: string[]
}

/** True when `model` is a concrete, priced model id (not an alias). */
export function isKnownModel(model: string): boolean {
    return Object.prototype.hasOwnProperty.call(MODEL_PRICING, model)
}

/**
 * Resolve a single name (alias or concrete) to a concrete model id.
 * Returns the input unchanged when it is neither a known alias nor a known
 * model, so callers can decide how to handle unknowns.
 */
export function resolveModelName(model: string): string {
    return MODEL_ALIASES[model] ?? model
}

/**
 * Pick a concrete provider model id from optional routing preferences.
 *
 * Candidates are tried in order; the first that resolves to a known concrete
 * model wins. Aliases are expanded along the way, so an alias can never be
 * returned to a provider. Falls back to `fallback` (then DEFAULT_RUNTIME_MODEL)
 * when no candidate is usable.
 */
export function resolveProviderModel(
    preferred?: string | string[] | RoutingHints | null,
    fallback: string = DEFAULT_RUNTIME_MODEL,
): string {
    const candidates: string[] = []
    if (typeof preferred === 'string') {
        candidates.push(preferred)
    } else if (Array.isArray(preferred)) {
        candidates.push(...preferred)
    } else if (preferred && typeof preferred === 'object') {
        candidates.push(...(preferred.preferred_models ?? []), ...(preferred.fallback_models ?? []))
    }

    for (const candidate of candidates) {
        const resolved = resolveModelName(candidate)
        if (isKnownModel(resolved)) return resolved
    }

    const resolvedFallback = resolveModelName(fallback)
    return isKnownModel(resolvedFallback) ? resolvedFallback : DEFAULT_RUNTIME_MODEL
}
