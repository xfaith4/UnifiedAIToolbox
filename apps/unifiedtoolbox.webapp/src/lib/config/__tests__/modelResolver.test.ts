import { describe, it, expect } from 'vitest'
import {
    resolveModelName,
    resolveProviderModel,
    isKnownModel,
    DEFAULT_RUNTIME_MODEL,
} from '../modelResolver'

describe('resolveModelName', () => {
    it('expands internal aliases to concrete provider model ids', () => {
        expect(resolveModelName('openai_balanced')).toBe('gpt-5.4')
        expect(resolveModelName('openai_high_reasoning')).toBe('gpt-5.5')
        expect(resolveModelName('anthropic_balanced')).toBe('claude-sonnet-4-6')
    })

    it('returns concrete model ids unchanged', () => {
        expect(resolveModelName('gpt-5.4')).toBe('gpt-5.4')
    })

    it('returns unknown names unchanged for the caller to handle', () => {
        expect(resolveModelName('mystery-model')).toBe('mystery-model')
    })
})

describe('resolveProviderModel', () => {
    it('never returns an internal alias to a provider', () => {
        expect(resolveProviderModel('openai_balanced')).toBe('gpt-5.4')
        expect(isKnownModel(resolveProviderModel('openai_balanced'))).toBe(true)
    })

    it('honors routing_hints.preferred_models order, resolving aliases', () => {
        expect(
            resolveProviderModel({ preferred_models: ['openai_high_reasoning', 'gpt-5.4'] })
        ).toBe('gpt-5.5')
    })

    it('skips unknown candidates and uses the first known one', () => {
        expect(
            resolveProviderModel({ preferred_models: ['not-a-model', 'gpt-5.4-mini'] })
        ).toBe('gpt-5.4-mini')
    })

    it('falls back to preferred_models then fallback_models', () => {
        expect(
            resolveProviderModel({ preferred_models: ['nope'], fallback_models: ['claude-haiku-4-5'] })
        ).toBe('claude-haiku-4-5')
    })

    it('defaults to DEFAULT_RUNTIME_MODEL when no hint is usable', () => {
        expect(resolveProviderModel(null)).toBe(DEFAULT_RUNTIME_MODEL)
        expect(resolveProviderModel({ preferred_models: ['x'], fallback_models: ['y'] })).toBe(
            DEFAULT_RUNTIME_MODEL
        )
        expect(isKnownModel(DEFAULT_RUNTIME_MODEL)).toBe(true)
    })
})
