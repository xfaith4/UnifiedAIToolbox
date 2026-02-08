import { describe, expect, it } from 'vitest'
import { stripMarkdownCodeFencing, cleanupArtifactContent } from '../cleanupArtifactContent'

describe('stripMarkdownCodeFencing', () => {
  it('removes html code fencing from start and end', () => {
    const input = '```html\n<!doctype html>\n<html>\n  <body>test</body>\n</html>\n```'
    const expected = '<!doctype html>\n<html>\n  <body>test</body>\n</html>'
    expect(stripMarkdownCodeFencing(input)).toBe(expected)
  })

  it('removes css code fencing from start and end', () => {
    const input = '```css\nbody { margin: 0; }\n```'
    const expected = 'body { margin: 0; }'
    expect(stripMarkdownCodeFencing(input)).toBe(expected)
  })

  it('removes javascript code fencing from start and end', () => {
    const input = '```javascript\nconst x = 1;\n```'
    const expected = 'const x = 1;'
    expect(stripMarkdownCodeFencing(input)).toBe(expected)
  })

  it('removes typescript code fencing from start and end', () => {
    const input = '```typescript\nconst x: number = 1;\n```'
    const expected = 'const x: number = 1;'
    expect(stripMarkdownCodeFencing(input)).toBe(expected)
  })

  it('removes generic code fencing without language', () => {
    const input = '```\nsome code\n```'
    const expected = 'some code'
    expect(stripMarkdownCodeFencing(input)).toBe(expected)
  })

  it('handles content with no code fencing', () => {
    const input = '<!doctype html>\n<html>\n  <body>test</body>\n</html>'
    expect(stripMarkdownCodeFencing(input)).toBe(input)
  })

  it('handles empty string', () => {
    expect(stripMarkdownCodeFencing('')).toBe('')
  })

  it('handles null and undefined gracefully', () => {
    expect(stripMarkdownCodeFencing(null as any)).toBe(null)
    expect(stripMarkdownCodeFencing(undefined as any)).toBe(undefined)
  })

  it('handles content with only opening fence', () => {
    const input = '```html\n<!doctype html>\n<html></html>'
    const expected = '<!doctype html>\n<html></html>'
    expect(stripMarkdownCodeFencing(input)).toBe(expected)
  })

  it('handles content with only closing fence', () => {
    const input = '<!doctype html>\n<html></html>\n```'
    const expected = '<!doctype html>\n<html></html>'
    expect(stripMarkdownCodeFencing(input)).toBe(expected)
  })

  it('preserves code fencing in the middle of content', () => {
    const input = 'line 1\n```html\nline 2\n```\nline 3'
    const expected = 'line 1\n```html\nline 2\n```\nline 3'
    expect(stripMarkdownCodeFencing(input)).toBe(expected)
  })

  it('handles leading whitespace before opening fence', () => {
    const input = '  ```html\n<!doctype html>\n```'
    const expected = '<!doctype html>'
    expect(stripMarkdownCodeFencing(input)).toBe(expected)
  })

  it('handles trailing whitespace after closing fence', () => {
    const input = '```html\n<!doctype html>\n```  '
    const expected = '<!doctype html>'
    expect(stripMarkdownCodeFencing(input)).toBe(expected)
  })

  it('handles real-world HTML example from artifacts', () => {
    const input = `\`\`\`html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Test</title>
  </head>
  <body>
    <h1>Hello World</h1>
  </body>
</html>
\`\`\``
    const expected = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Test</title>
  </head>
  <body>
    <h1>Hello World</h1>
  </body>
</html>`
    expect(stripMarkdownCodeFencing(input)).toBe(expected)
  })

  it('handles real-world CSS example from artifacts', () => {
    const input = `\`\`\`css
/* styles.css */
body {
  margin: 0;
  padding: 0;
}
\`\`\``
    const expected = `/* styles.css */
body {
  margin: 0;
  padding: 0;
}`
    expect(stripMarkdownCodeFencing(input)).toBe(expected)
  })
})

describe('cleanupArtifactContent', () => {
  it('applies all cleanup operations including code fencing removal', () => {
    const input = '```html\n<!doctype html>\n<html></html>\n```'
    const expected = '<!doctype html>\n<html></html>'
    expect(cleanupArtifactContent(input)).toBe(expected)
  })

  it('accepts optional fileName parameter', () => {
    const input = '```html\n<!doctype html>\n```'
    const expected = '<!doctype html>'
    expect(cleanupArtifactContent(input, 'index.html')).toBe(expected)
  })

  it('handles empty string', () => {
    expect(cleanupArtifactContent('')).toBe('')
  })

  it('handles null and undefined gracefully', () => {
    expect(cleanupArtifactContent(null as any)).toBe(null)
    expect(cleanupArtifactContent(undefined as any)).toBe(undefined)
  })

  it('preserves content that does not need cleanup', () => {
    const input = '<!doctype html>\n<html></html>'
    expect(cleanupArtifactContent(input)).toBe(input)
  })
})
