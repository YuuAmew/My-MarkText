export const TOC_STATE_HEADING = '# MyMarkText TOC State'

const statePattern = /^[ \t]*# MyMarkText TOC State[ \t]*\r?\n<!--[ \t]*mymarktext-toc-state:[ \t]*(\{[^\r\n]*\})[ \t]*-->[ \t]*(?:\r?\n)?/gm

export interface StoredTocState {
  markdown: string
  expandedSlugs?: string[]
}

const normaliseSlugs = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((slug): slug is string => typeof slug === 'string' && slug.length > 0))]
  : []

/** Removes private TOC metadata before the document is rendered. */
export const extractTocState = (markdown: string): StoredTocState => {
  let visibleMarkdown = markdown
  let expandedSlugs: string[] | undefined

  visibleMarkdown = visibleMarkdown.replace(statePattern, (_whole, json: string) => {
    expandedSlugs = []
    try {
      const state = JSON.parse(json) as { version?: unknown, expanded?: unknown }
      if (state.version === 1) expandedSlugs = normaliseSlugs(state.expanded)
    } catch {
      // A malformed private record is safely ignored and replaced on save.
    }
    return ''
  })

  if (expandedSlugs !== undefined) visibleMarkdown = visibleMarkdown.replace(/(?:\r?\n)+$/, '')
  return expandedSlugs === undefined ? { markdown } : { markdown: visibleMarkdown, expandedSlugs }
}

/** Writes exactly one current record and filters headings no longer present. */
export const appendTocState = (markdown: string, expandedSlugs: string[], currentSlugs: string[]): string => {
  const visibleMarkdown = extractTocState(markdown).markdown
  const validSlugs = new Set(currentSlugs)
  const expanded = normaliseSlugs(expandedSlugs).filter((slug) => validSlugs.has(slug))
  const state = JSON.stringify({ version: 1, expanded })
  return `${visibleMarkdown.replace(/(?:\r?\n)+$/, '')}\n\n${TOC_STATE_HEADING}\n<!-- mymarktext-toc-state: ${state} -->\n`
}
