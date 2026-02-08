/**
 * cleanupArtifactContent.ts
 * 
 * Post-processing utilities to clean up common AI-generated artifact issues,
 * such as markdown code fencing markers that appear in actual source files.
 */

/**
 * Removes markdown code fencing from the start and end of content.
 * 
 * Handles patterns like:
 * - ```html\n ... \n```
 * - ```css\n ... \n```
 * - ```javascript\n ... \n```
 * - ```typescript\n ... \n```
 * - etc.
 * 
 * @param content The raw artifact content
 * @returns Cleaned content with code fencing markers removed
 */
export function stripMarkdownCodeFencing(content: string): string {
  if (!content || typeof content !== 'string') {
    return content
  }

  let cleaned = content

  // Remove opening code fence (```language or just ```)
  // Must be at the start of the content (possibly with leading whitespace)
  cleaned = cleaned.replace(/^\s*```[a-zA-Z]*\s*\n/, '')

  // Remove closing code fence (```)
  // Must be at the end of the content (possibly with trailing whitespace)
  cleaned = cleaned.replace(/\n\s*```\s*$/, '')

  return cleaned
}

/**
 * Applies all cleanup operations to artifact content.
 * 
 * @param content The raw artifact content
 * @param fileName Optional file name for context-aware cleaning
 * @returns Cleaned content
 */
export function cleanupArtifactContent(content: string, fileName?: string): string {
  if (!content || typeof content !== 'string') {
    return content
  }

  // Apply markdown code fencing cleanup
  let cleaned = stripMarkdownCodeFencing(content)

  // Additional cleanup rules can be added here in the future
  // For example:
  // - Remove trailing whitespace
  // - Normalize line endings
  // - Fix common syntax errors

  return cleaned
}
