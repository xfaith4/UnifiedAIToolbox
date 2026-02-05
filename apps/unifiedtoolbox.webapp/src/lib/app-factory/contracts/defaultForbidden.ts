import type { ForbiddenPattern } from './RepoContract'

export const DEFAULT_CODE_FILE_FORBIDDEN: ForbiddenPattern[] = [
  {
    id: 'md-fence',
    description: 'Markdown code fences are not allowed in code files',
    pattern: '^\\s*```',
    flags: 'm',
  },
  {
    id: 'file-header',
    description: "File wrappers like '## File:' are not allowed in code files",
    pattern: '^\\s*#{1,6}\\s*File\\s*:',
    flags: 'mi',
  },
  {
    id: 'slash-file-marker',
    description: "File wrappers like '//// FILE:' are not allowed in code files",
    pattern: '^\\s*\\/{2,}\\s*File\\s*:',
    flags: 'mi',
  },
  {
    id: 'frontmatter-marker',
    description: 'YAML frontmatter markers are not allowed in code files',
    pattern: '^(?:\\uFEFF)?\\s*---\\s*$',
    flags: 'm',
  },
  {
    id: 'ellipsis-placeholder',
    description: "Ellipsis placeholders like '...' are not allowed in generated code",
    pattern: '^\\s*(?:(?:\\/\\/|#|--|;)\\s*)?\\.{3,}\\s*$',
    flags: 'm',
  },
  {
    id: 'begin-wrapper',
    description: "Wrapper markers like '### BEGIN FILE:' are not allowed in code files",
    pattern: '^\\s*###\\s*BEGIN\\b',
    flags: 'mi',
  },
  {
    id: 'end-wrapper',
    description: "Wrapper markers like '### END FILE:' are not allowed in code files",
    pattern: '^\\s*###\\s*END\\b',
    flags: 'mi',
  },
]
