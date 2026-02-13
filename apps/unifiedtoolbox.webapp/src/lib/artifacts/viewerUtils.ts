/**
 * Utility functions for artifact viewing
 */

/**
 * Check if a node matches a filter
 */
export function nodeMatchesFilter(node: unknown, filter: string): boolean {
  if (!filter) return true
  const nodeStr = JSON.stringify(node).toLowerCase()
  return nodeStr.includes(filter.toLowerCase())
}

/**
 * Render markdown content
 */
export function renderMarkdown(content: string): string {
  // Basic markdown rendering - can be enhanced later
  return content
}
