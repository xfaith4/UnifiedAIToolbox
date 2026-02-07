/**
 * Example: Using the GitHub API integration in app-factory provenance
 * 
 * This example demonstrates the three main usage patterns for the
 * GitHub topic integration feature added to writeAppFactoryMetadata.
 */

import { writeAppFactoryMetadata } from '../provenance/writeRepoProvenance'
import type { RepoContract } from '../contracts/RepoContract'

// Sample contract for a Next.js application
const exampleContract: RepoContract = {
  stackId: 'node-next-app-npm',
  installCommand: 'npm install',
  buildCommand: 'npm run build',
  typecheckCommand: 'npm run typecheck',
  lintCommand: 'npm run lint',
  testCommand: 'npm test',
}

/**
 * Pattern 1: Auto-detect GitHub configuration from environment variables
 * 
 * This is the RECOMMENDED approach for most use cases.
 * Set these environment variables in your .env file:
 * - GITHUB_TOKEN=ghp_your_token_here
 * - GITHUB_REPO_OWNER=your-username
 * - GITHUB_REPO_NAME=your-repo-name
 */
export async function example1_autoDetect() {
  console.log('Example 1: Auto-detect GitHub config from environment')
  console.log('=' .repeat(50))
  
  const result = await writeAppFactoryMetadata({
    repoDir: '/path/to/generated/repo',
    runId: 'example-run-001',
    contract: exampleContract,
    jobType: 'build_new_app',
    autoDetectGitHub: true,  // <-- Enable auto-detection
  })

  if (result.githubTopicsSet) {
    console.log('✓ GitHub topics were set successfully')
    console.log('  Topics:', result.metadata.classification.topics)
  } else {
    console.log('ℹ No GitHub config found - topics written to local metadata only')
  }
  
  console.log('✓ Metadata written to:', result.path)
  console.log()
}

/**
 * Pattern 2: Explicitly provide GitHub configuration
 * 
 * Use this pattern when you want full control over the GitHub
 * credentials, or when the environment variables are not available.
 */
export async function example2_explicitConfig() {
  console.log('Example 2: Explicit GitHub configuration')
  console.log('=' .repeat(50))
  
  const result = await writeAppFactoryMetadata({
    repoDir: '/path/to/generated/repo',
    runId: 'example-run-002',
    contract: exampleContract,
    jobType: 'build_new_app',
    githubConfig: {
      token: process.env.GITHUB_TOKEN || '',
      owner: 'myorganization',
      repo: 'my-generated-repo',
    },
  })

  if (result.githubTopicsSet) {
    console.log('✓ GitHub topics set on myorganization/my-generated-repo')
    console.log('  Topics:', result.metadata.classification.topics)
  } else {
    console.log('⚠ GitHub topics not set (check token permissions)')
  }
  
  console.log('✓ Metadata written to:', result.path)
  console.log()
}

/**
 * Pattern 3: No GitHub integration (backward compatible)
 * 
 * This is how the code worked before the GitHub integration was added.
 * It continues to work exactly the same way - writes local metadata only.
 */
export async function example3_noGitHub() {
  console.log('Example 3: Local metadata only (no GitHub)')
  console.log('=' .repeat(50))
  
  const result = await writeAppFactoryMetadata({
    repoDir: '/path/to/generated/repo',
    runId: 'example-run-003',
    contract: exampleContract,
    jobType: 'build_new_app',
    // No githubConfig, no autoDetectGitHub
    // Works exactly as before!
  })

  console.log('✓ Metadata written to:', result.path)
  console.log('ℹ Topics stored in local metadata only')
  console.log('  Topics:', result.metadata.classification.topics)
  console.log()
}

/**
 * Example 4: Error handling demonstration
 * 
 * Shows how the system gracefully handles GitHub API errors
 * without failing the metadata writing operation.
 */
export async function example4_errorHandling() {
  console.log('Example 4: Error handling (invalid credentials)')
  console.log('=' .repeat(50))
  
  const result = await writeAppFactoryMetadata({
    repoDir: '/path/to/generated/repo',
    runId: 'example-run-004',
    contract: exampleContract,
    githubConfig: {
      token: 'invalid-token',
      owner: 'someuser',
      repo: 'somerepo',
    },
  })

  // Even with invalid credentials, the metadata is still written!
  console.log('✓ Metadata written to:', result.path)
  console.log('ℹ GitHub API failed, but operation continued')
  console.log('ℹ Topics stored in local metadata:', result.metadata.classification.topics)
  console.log()
}

/**
 * Example 5: Using with different job types
 * 
 * Shows how topics adapt to different job types and pipelines.
 */
export async function example5_differentJobTypes() {
  console.log('Example 5: Different job types')
  console.log('=' .repeat(50))
  
  // Maintenance job type
  const maintenanceResult = await writeAppFactoryMetadata({
    repoDir: '/path/to/existing/repo',
    runId: 'maintenance-run-001',
    contract: exampleContract,
    jobType: 'maintain_existing_app',
    contractUniverse: 'maintenance',
    contractVersion: 'maintenance_contract.v1',
    pipelineId: 'pipeline_maintenance.v1',
    autoDetectGitHub: true,
  })

  console.log('Maintenance job topics:')
  maintenanceResult.metadata.classification.topics.forEach((t) => console.log('  -', t))
  console.log()

  // Build job type
  const buildResult = await writeAppFactoryMetadata({
    repoDir: '/path/to/new/repo',
    runId: 'build-run-001',
    contract: exampleContract,
    jobType: 'build_new_app',
    contractUniverse: 'build_app',
    contractVersion: 'build_app_contract.v1',
    pipelineId: 'pipeline_build_app.v1',
    autoDetectGitHub: true,
  })

  console.log('Build job topics:')
  buildResult.metadata.classification.topics.forEach((t) => console.log('  -', t))
  console.log()
}

/**
 * Main function to run all examples
 */
export async function runAllExamples() {
  console.log('\n')
  console.log('╔═══════════════════════════════════════════════════╗')
  console.log('║   App-Factory GitHub Integration Examples        ║')
  console.log('╚═══════════════════════════════════════════════════╝')
  console.log('\n')

  try {
    await example1_autoDetect()
    await example2_explicitConfig()
    await example3_noGitHub()
    await example4_errorHandling()
    await example5_differentJobTypes()

    console.log('✓ All examples completed successfully')
  } catch (error) {
    console.error('❌ Error running examples:', error)
  }
}

// Uncomment to run examples:
// runAllExamples()
