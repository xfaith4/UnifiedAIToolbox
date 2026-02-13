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
 * Prepare markdown content for rendering
 * Note: This is a pass-through function that returns the content unchanged.
 * Actual markdown rendering is handled by the UI component.
 */
export function renderMarkdown(content: string): string {
  return content
}
