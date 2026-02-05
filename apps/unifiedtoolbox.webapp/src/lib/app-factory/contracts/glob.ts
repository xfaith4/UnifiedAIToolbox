export function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/')
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const withGlobStars = escaped
    .replace(/\\\*\\\*\\\//g, '(?:.*/)?')
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*')
    .replace(/\\\?/g, '[^/]')
  return new RegExp(`^${withGlobStars}$`)
}

