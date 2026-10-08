export const IMAGE_STATE_HEADING = '# MyMarkText Image State'

const headingPattern = /^[ \t]*# MyMarkText Image State[ \t]*(?:\r?\n)?/gm
const recordPattern = /^[ \t]*<!--[ \t]*mymarktext-image-state:[ \t]*(\{[^\r\n]*\})[ \t]*-->[ \t]*(?:\r?\n)?/gm

export interface StoredImageState {
  markdown: string
  images?: string[]
}

const normaliseImages = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((image): image is string => typeof image === 'string' && image.length > 0))]
  : []

/** Removes the private image record before a document is rendered. */
export const extractImageState = (markdown: string): StoredImageState => {
  let visibleMarkdown = markdown
  let images: string[] | undefined

  // Remove the marker and record independently. If an older broken render
  // preserved the H1 but lost the adjacent HTML comment, the reserved H1 is
  // still removed instead of being duplicated again on the next save.
  visibleMarkdown = visibleMarkdown.replace(recordPattern, (_whole, json: string) => {
    images = []
    try {
      const state = JSON.parse(json) as { version?: unknown, images?: unknown }
      if (state.version === 1) images = normaliseImages(state.images)
    } catch {
      // A malformed private record is safely replaced on the next save.
    }
    return ''
  })
  const hadHeading = headingPattern.test(visibleMarkdown)
  headingPattern.lastIndex = 0
  visibleMarkdown = visibleMarkdown.replace(headingPattern, '')

  if (images !== undefined || hadHeading) visibleMarkdown = visibleMarkdown.replace(/(?:\r?\n)+$/, '')
  return images === undefined ? { markdown } : { markdown: visibleMarkdown, images }
}

/** Writes exactly one portable record of the document's managed image paths. */
export const appendImageState = (markdown: string, images: string[]): string => {
  const visibleMarkdown = extractImageState(markdown).markdown
  const state = JSON.stringify({ version: 1, images: normaliseImages(images) })
  return `${visibleMarkdown.replace(/(?:\r?\n)+$/, '')}\n\n${IMAGE_STATE_HEADING}\n<!-- mymarktext-image-state: ${state} -->\n`
}
