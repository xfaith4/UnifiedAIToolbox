'use client'

/**
 * This file proxies to the shared services implementation under src/lib/services.
 * The alias keeps older imports working while centralizing the logic.
 */
export {
  fetchAgentLibrary,
  normalizeAgent,
  persistAgentLibrary,
} from '@/lib/services/agentStore'
