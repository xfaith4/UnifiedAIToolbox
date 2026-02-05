export type RepoContractStackId = string

export type ForbiddenPattern = {
  id: string
  description: string
  pattern: string
  flags?: string
}

export type HealthCheck = {
  name: string
  url: string
  expectedStatus: number
  timeoutSeconds?: number
}

export type BootCommand = {
  name: string
  command: string
  cwd?: string
  env?: Record<string, string>
}

export type RepoContract = {
  stackId: RepoContractStackId
  description?: string

  requiredFilesAll: string[]
  requiredFilesAny?: string[][]

  codeFileExtensions: string[]
  forbiddenPatternsByExtension: Record<string, ForbiddenPattern[]>

  envVarsRequired?: string[]

  installCommand: string
  typecheckCommand?: string
  lintCommand?: string
  buildCommand: string
  testCommand?: string

  bootCommands?: BootCommand[]
  healthChecks?: HealthCheck[]
}

