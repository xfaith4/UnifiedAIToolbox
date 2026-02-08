# Artifact Cleanup

## Overview

The artifact cleanup system ensures that AI-generated code files are free from markdown formatting artifacts and other non-standard code that might interfere with compilation, linting, or runtime execution.

## Problem

When AI models generate code, they sometimes include markdown code fencing markers in the output:

```html
<!doctype html>
<html>
  <body>Hello World</body>
</html>
```

These markers (````html` at the start and ```` at the end) are valid in markdown files but invalid in actual HTML files. The same issue occurs with CSS, JavaScript, TypeScript, and other code files.

## Solution

The cleanup system automatically strips these markers during the artifact ingestion phase, before files are written to disk.

### Implementation

The cleanup is implemented in two parts:

1. **`cleanupArtifactContent.ts`** - Core cleanup utilities
   - `stripMarkdownCodeFencing()` - Removes code fencing from start/end of content
   - `cleanupArtifactContent()` - Main entry point for all cleanup operations

2. **`ingestArtifacts.ts`** - Integration point
   - Applies cleanup to all non-image artifacts before writing to disk
   - Preserves binary files (images) without modification

### Supported Patterns

The cleanup system handles:

- Opening fences with language tags: ````html`, ````css`, ````javascript`, ````typescript`, etc.
- Generic opening fences: `````
- Closing fences: `````
- Leading/trailing whitespace around fences
- Multi-line content between fences

### What It Does NOT Do

The cleanup is designed to be conservative:

- Only removes fencing at the **start** and **end** of files
- Does NOT modify code fencing in the middle of content (e.g., in documentation)
- Does NOT modify markdown files themselves (where fencing is valid)
- Does NOT modify binary files (images)

## Examples

### Before Cleanup

**index.html:**
```
```html
<!doctype html>
<html>
  <body>Test</body>
</html>
```
```

**styles.css:**
```
```css
body {
  margin: 0;
}
```
```

### After Cleanup

**index.html:**
```
<!doctype html>
<html>
  <body>Test</body>
</html>
```

**styles.css:**
```
body {
  margin: 0;
}
```

## Testing

The cleanup system includes comprehensive test coverage:

- `cleanupArtifactContent.test.ts` - 20 unit tests for cleanup functions
- `ingestArtifacts.test.ts` - Integration tests including cleanup verification

Run tests with:
```bash
npx vitest run cleanupArtifactContent.test.ts
npx vitest run ingestArtifacts.test.ts
```

## Configuration

The cleanup runs automatically during artifact ingestion. No configuration is required.

To disable cleanup (not recommended), you would need to modify the `ingestArtifacts.ts` code directly.

## Future Enhancements

Potential improvements for the cleanup system:

1. **Additional cleanup rules** - Handle other common AI artifacts
2. **File-type specific cleanup** - Apply different rules based on file extension
3. **Configurable cleanup** - Allow users to enable/disable specific cleanup rules
4. **Cleanup reporting** - Track which files were cleaned and what was removed

## Related Files

- `cleanupArtifactContent.ts` - Core cleanup implementation
- `ingestArtifacts.ts` - Artifact ingestion with cleanup integration
- `hardenRepo.ts` - Orchestration pipeline that uses artifact ingestion
- `__tests__/cleanupArtifactContent.test.ts` - Cleanup tests
- `__tests__/ingestArtifacts.test.ts` - Integration tests
