/**
 * GitHub Topic Service
 * 
 * Provides optional integration with GitHub API to set repository topics.
 * This service is used by the provenance module to update topic tags on
 * GitHub repositories when credentials are available.
 * 
 * Design:
 * - Optional by default: gracefully degrades when no credentials provided
 * - Uses native fetch API to avoid additional dependencies
 * - Follows GitHub REST API v3 conventions
 * - Logs warnings but never throws to ensure provenance writing always succeeds
 */

export type GitHubTopicConfig = {
  /** GitHub Personal Access Token with repo scope */
  token: string
  /** Repository owner (username or organization) */
  owner: string
  /** Repository name */
  repo: string
}

export type SetTopicsResult = {
  /** Whether the operation succeeded */
  success: boolean
  /** Topics that were set (may differ from input due to validation) */
  topics?: string[]
  /** Error message if operation failed */
  error?: string
  /** Whether credentials were missing (not an error) */
  skipped?: boolean
}

/**
 * Validates and normalizes topic strings according to GitHub rules:
 * - Max 50 topics per repo
 * - Max 50 characters per topic
 * - Lowercase alphanumeric plus hyphens
 * - No spaces or special characters
 */
function normalizeTopics(topics: string[]): string[] {
  return topics
    .map((t) => 
      t
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, '-')  // Replace invalid chars with hyphens
        .replace(/^-+|-+$/g, '')        // Remove leading/trailing hyphens
        .slice(0, 50)                   // Max 50 chars per topic
    )
    .filter((t) => t.length > 0)        // Remove empty topics
    .slice(0, 50)                       // Max 50 topics per repo
}

/**
 * Sets topics on a GitHub repository using the REST API.
 * 
 * This function replaces all existing topics with the provided list.
 * GitHub API endpoint: PUT /repos/{owner}/{repo}/topics
 * 
 * @param config - GitHub configuration including token, owner, and repo
 * @param topics - Array of topic strings to set on the repository
 * @returns Result object with success status and details
 * 
 * @example
 * ```typescript
 * const result = await setRepositoryTopics(
 *   { token: 'ghp_...', owner: 'myorg', repo: 'myrepo' },
 *   ['appfactory', 'appfactory-managed', 'nodejs']
 * );
 * if (result.success) {
 *   console.log('Topics set:', result.topics);
 * } else {
 *   console.warn('Failed to set topics:', result.error);
 * }
 * ```
 */
export async function setRepositoryTopics(
  config: GitHubTopicConfig | null | undefined,
  topics: string[]
): Promise<SetTopicsResult> {
  // Graceful fallback when no config provided
  if (!config || !config.token || !config.owner || !config.repo) {
    return {
      success: false,
      skipped: true,
      error: 'GitHub configuration not provided',
    }
  }

  const normalized = normalizeTopics(topics)
  
  if (normalized.length === 0) {
    return {
      success: false,
      error: 'No valid topics after normalization',
    }
  }

  try {
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/topics`
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github.mercy-preview+json',  // Required for topics API
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'UnifiedAIToolbox-AppFactory/1.0',
      },
      body: JSON.stringify({ names: normalized }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorDetail = errorText
      try {
        const errorJson = JSON.parse(errorText)
        errorDetail = errorJson.message || errorJson.error || errorText
      } catch {
        // Use raw text if not JSON
      }

      return {
        success: false,
        error: `GitHub API error (${response.status}): ${errorDetail}`,
      }
    }

    const result = await response.json()
    const setTopics = result.names || normalized

    return {
      success: true,
      topics: setTopics,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Extracts GitHub configuration from environment variables.
 * 
 * Environment variables checked:
 * - GITHUB_TOKEN or GITHUB_PAT: Personal access token
 * - GITHUB_REPO_OWNER or APP_FACTORY_REPO_OWNER: Repository owner
 * - GITHUB_REPO_NAME or APP_FACTORY_REPO_NAME: Repository name
 * 
 * @returns GitHub config object or null if required variables are missing
 */
export function getGitHubConfigFromEnv(): GitHubTopicConfig | null {
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT
  const owner = process.env.GITHUB_REPO_OWNER || process.env.APP_FACTORY_REPO_OWNER
  const repo = process.env.GITHUB_REPO_NAME || process.env.APP_FACTORY_REPO_NAME

  if (!token || !owner || !repo) {
    return null
  }

  return { token, owner, repo }
}
