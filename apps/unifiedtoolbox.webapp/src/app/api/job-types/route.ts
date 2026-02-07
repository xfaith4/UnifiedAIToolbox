import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]
type JsonObject = Record<string, JsonValue>

function readJson(filePath: string): JsonObject {
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

function resolveRepoPath(repoRoot: string, input?: string): string | null {
  if (!input) return null
  if (path.isAbsolute(input)) return input
  return path.join(repoRoot, input)
}

function mergeSchema(base: JsonObject, add: JsonObject): JsonObject {
  const merged: JsonObject = {
    type: add.type ?? base.type,
    properties: { ...(base.properties || {}), ...(add.properties || {}) },
    required: Array.from(new Set([...(base.required || []), ...(add.required || [])])),
  }
  if (add.items || base.items) merged.items = add.items ?? base.items
  if (add.enum || base.enum) merged.enum = add.enum ?? base.enum
  return merged
}

function resolveSchema(schema: JsonObject, schemaPath: string, seen: Set<string> = new Set()): JsonObject {
  if (!schema || typeof schema !== 'object') return schema
  if (schema.allOf && Array.isArray(schema.allOf)) {
    let base: JsonObject = { type: 'object', properties: {}, required: [] }
    for (const entry of schema.allOf) {
      if (entry?.$ref) {
        const refPath = path.isAbsolute(entry.$ref) ? entry.$ref : path.join(path.dirname(schemaPath), entry.$ref)
        if (seen.has(refPath)) continue
        seen.add(refPath)
        const refSchema = readJson(refPath)
        base = mergeSchema(base, resolveSchema(refSchema, refPath, seen))
      } else {
        base = mergeSchema(base, resolveSchema(entry, schemaPath, seen))
      }
    }
    if (schema.properties || schema.required) {
      base = mergeSchema(base, schema)
    }
    return base
  }
  return schema
}

function labelFromPath(pathStr: string): string {
  return pathStr
    .split('.')
    .slice(-1)[0]
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function extractRequiredFields(schema: JsonObject, prefix = ''): Array<{ path: string; type?: string; enum?: string[]; label: string }> {
  if (!schema || typeof schema !== 'object') return []
  const type = schema.type || (schema.properties ? 'object' : undefined)
  if (type === 'object') {
    const required: string[] = Array.isArray(schema.required) ? schema.required : []
    const props: JsonObject = schema.properties || {}
    const fields: Array<{ path: string; type?: string; enum?: string[]; label: string }> = []
    for (const key of required) {
      const propSchema = props[key]
      if (!propSchema) continue
      const nextPrefix = prefix ? `${prefix}.${key}` : key
      const propType = propSchema.type || (propSchema.properties ? 'object' : undefined)
      if (propType === 'object') {
        fields.push(...extractRequiredFields(propSchema, nextPrefix))
      } else {
        fields.push({
          path: nextPrefix,
          type: propType,
          enum: Array.isArray(propSchema.enum) ? propSchema.enum : undefined,
          label: propSchema.title || labelFromPath(nextPrefix),
        })
      }
    }
    return fields
  }
  if (prefix) {
    return [{ path: prefix, type, enum: Array.isArray(schema.enum) ? schema.enum : undefined, label: schema.title || labelFromPath(prefix) }]
  }
  return []
}

export async function GET() {
  try {
    const repoRoot = path.join(process.cwd(), '..', '..')
    const jobTypesPath = path.join(repoRoot, 'job_types.json')
    const jobTypes = readJson(jobTypesPath)
    const entries = jobTypes.job_types || {}

    const response: JsonObject = { schema_version: jobTypes.schema_version || 'unknown', job_types: {} }

    for (const [id, entry] of Object.entries(entries)) {
      const requestSchemaPath = resolveRepoPath(repoRoot, (entry as JsonObject).request_schema)
      const pipelinePath = resolveRepoPath(repoRoot, (entry as JsonObject).pipeline_template)
      const requestSchema = requestSchemaPath && fs.existsSync(requestSchemaPath) ? resolveSchema(readJson(requestSchemaPath), requestSchemaPath) : null
      const requestFields = requestSchema ? extractRequiredFields(requestSchema) : []
      const pipeline = pipelinePath && fs.existsSync(pipelinePath) ? readJson(pipelinePath) : null
      const stages = Array.isArray(pipeline?.stages)
        ? (pipeline.stages as JsonObject[]).map((s) => ({ id: s.id, name: s.name, description: s.description }))
        : []

      const defaultAgents = (entry as JsonObject).default_agents || (entry as JsonObject).default_agent_roster || []

      response.job_types[id] = {
        id,
        label: (entry as JsonObject).label || id,
        request_schema: (entry as JsonObject).request_schema,
        contract_schema: (entry as JsonObject).contract_schema || (entry as JsonObject).schema,
        request_fields: requestFields,
        pipeline: { stages },
        default_agents: defaultAgents,
        gate_policy: (entry as JsonObject).gate_policy || null,
        artifact_policy: (entry as JsonObject).artifact_policy || null,
        command_policy: (entry as JsonObject).command_policy || null,
        supervisor_policy: (entry as JsonObject).supervisor_policy || null,
      }
    }

    return NextResponse.json(response)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load job types.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
