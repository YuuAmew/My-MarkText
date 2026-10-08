import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { app, shell } from 'electron'
import log from 'electron-log'

type ManagedImageIndex = Record<string, string[]>

export interface TemporaryImagePromotion {
  markdown: string
  destinationPaths: string[]
  /** Run only after the rewritten Markdown was saved successfully. */
  finalize: () => Promise<void>
}

let indexPromise: Promise<ManagedImageIndex> | undefined

const getIndexPath = (): string => path.join(app.getPath('userData'), 'managed-images.json')

const normalizePath = (pathname: string): string => {
  const resolved = path.resolve(pathname)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

const loadIndex = async(): Promise<ManagedImageIndex> => {
  if (!indexPromise) {
    indexPromise = fs.readFile(getIndexPath(), 'utf8')
      .then((content) => {
        const parsed = JSON.parse(content) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
        const index: ManagedImageIndex = {}
        for (const [documentPath, paths] of Object.entries(parsed as Record<string, unknown>)) {
          if (!Array.isArray(paths)) continue
          index[documentPath] = [...new Set(paths.filter((item): item is string => typeof item === 'string'))]
        }
        return index
      })
      .catch(() => ({}))
  }
  return indexPromise!
}

const saveIndex = async(index: ManagedImageIndex): Promise<void> => {
  await fs.mkdir(path.dirname(getIndexPath()), { recursive: true })
  await fs.writeFile(getIndexPath(), JSON.stringify(index), 'utf8')
}

/** Register a file created or copied into an image folder by MyMarkText. */
export const registerManagedImage = async(documentPath: string, imagePath: string): Promise<void> => {
  if (!documentPath || !imagePath || !path.isAbsolute(imagePath)) return
  const index = await loadIndex()
  const documentKey = normalizePath(documentPath)
  const imageKey = normalizePath(imagePath)
  const images = new Set(index[documentKey] ?? [])
  images.add(imageKey)
  index[documentKey] = [...images]
  await saveIndex(index)
}

const getReferencedLocalImages = (markdown: string, documentPath: string): Set<string> => {
  const references = new Set<string>()
  const addReference = (rawPath: string | undefined): void => {
    if (!rawPath || /^data:|^https?:\/\//i.test(rawPath)) return
    try {
      const pathname = /^file:/i.test(rawPath)
        ? fileURLToPath(rawPath)
        : path.isAbsolute(rawPath)
        ? decodeURIComponent(rawPath)
        : path.resolve(path.dirname(documentPath), decodeURIComponent(rawPath))
      references.add(normalizePath(pathname))
    } catch {
      // Keep parsing other image links when one URL contains invalid escaping.
    }
  }

  // Covers standard Markdown images and MarkText's resized <img> form.
  const markdownImagePattern = /!\[[^\]]*]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\s*\)/g
  for (const match of markdown.matchAll(markdownImagePattern)) addReference(match[1] ?? match[2])
  const htmlImagePattern = /<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi
  for (const match of markdown.matchAll(htmlImagePattern)) addReference(match[1] ?? match[2] ?? match[3])

  return references
}

const getTemporaryImagePath = (rawPath: string): string | undefined => {
  try {
    const pathname = /^file:/i.test(rawPath)
      ? fileURLToPath(rawPath)
      : path.isAbsolute(rawPath)
      // Muya may serialize an absolute Windows path with URL escapes (for
      // example `MarkText%20Images`) even when it does not keep `file:///`.
      // Decode it before accessing the real filesystem path.
      ? decodeURIComponent(rawPath)
      : undefined
    if (!pathname || path.basename(path.dirname(pathname)).toLowerCase() !== 'temp') return undefined
    return path.resolve(pathname)
  } catch {
    return undefined
  }
}

const uniqueDestinationPath = async(sourcePath: string): Promise<string> => {
  const outputDir = path.dirname(path.dirname(sourcePath))
  const extension = path.extname(sourcePath)
  const basename = path.basename(sourcePath, extension)
  let index = 0
  while (true) {
    const suffix = index === 0 ? '' : `-${index}`
    const candidate = path.join(outputDir, `${basename}${suffix}${extension}`)
    try {
      await fs.access(candidate)
      index++
    } catch {
      return candidate
    }
  }
}

const replaceImageReferences = (
  markdown: string,
  replacements: Map<string, string>
): string => {
  const replacePath = (rawPath: string): string => replacements.get(rawPath) ?? rawPath
  const markdownImagePattern = /(!\[[^\]]*])\(\s*(?:<([^>]+)>|([^\s)]+))(\s+[^)]*)?\s*\)/g
  const withMarkdownImages = markdown.replace(markdownImagePattern, (whole, imagePrefix, anglePath, plainPath, suffix = '') => {
    const rawPath = anglePath ?? plainPath
    const replacement = replacePath(rawPath)
    if (replacement === rawPath) return whole
    return `${imagePrefix}(${anglePath ? `<${replacement}>` : replacement}${suffix})`
  })
  const htmlImagePattern = /<img\b[^>]*\bsrc=("([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi
  return withMarkdownImages.replace(htmlImagePattern, (whole, quoted, doubleQuoted, singleQuoted, barePath) => {
    const rawPath = doubleQuoted ?? singleQuoted ?? barePath
    const replacement = replacePath(rawPath)
    if (replacement === rawPath) return whole
    const quote = doubleQuoted != null ? '"' : singleQuoted != null ? "'" : ''
    return whole.replace(quoted, `${quote}${replacement}${quote}`)
  })
}

/**
 * Promote images from `<image folder>/temp` when an Untitled tab gains a real
 * document path. Files are copied first and their temp originals stay in
 * place until `finalize()` is called after the Markdown write succeeds.
 */
export const promoteTemporaryImages = async(markdown: string): Promise<TemporaryImagePromotion> => {
  const rawPaths = new Set<string>()
  const markdownImagePattern = /!\[[^\]]*]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\s*\)/g
  for (const match of markdown.matchAll(markdownImagePattern)) rawPaths.add(match[1] ?? match[2])
  const htmlImagePattern = /<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi
  for (const match of markdown.matchAll(htmlImagePattern)) rawPaths.add(match[1] ?? match[2] ?? match[3])

  const replacements = new Map<string, string>()
  const sourceToDestination = new Map<string, string>()
  for (const rawPath of rawPaths) {
    const sourcePath = getTemporaryImagePath(rawPath)
    if (!sourcePath) continue
    const sourceKey = normalizePath(sourcePath)
    let destinationPath = sourceToDestination.get(sourceKey)
    if (!destinationPath) {
      destinationPath = await uniqueDestinationPath(sourcePath)
      await fs.copyFile(sourcePath, destinationPath)
      sourceToDestination.set(sourceKey, destinationPath)
    }
    // Always write a file URL. A bare Windows path containing spaces is not a
    // valid Markdown image destination and would later be misread by cleanup.
    replacements.set(rawPath, pathToFileURL(destinationPath).toString())
  }

  return {
    markdown: replaceImageReferences(markdown, replacements),
    destinationPaths: [...sourceToDestination.values()],
    finalize: async() => {
      await Promise.all(
        [...sourceToDestination.keys()].map(async(sourcePath) => {
          try {
            await fs.unlink(sourcePath)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          }
        })
      )
    }
  }
}

const isInDirectory = (pathname: string, directory: string): boolean => {
  const relative = path.relative(normalizePath(directory), normalizePath(pathname))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * Migrates an already-existing document into the managed image index. Only
 * local images inside its configured image folder are adopted, so a normal
 * external image link never becomes eligible for automatic cleanup.
 */
export const registerDocumentImages = async(
  documentPath: string,
  markdown: string,
  imageFolderPath: string,
  storedImages: string[] = []
): Promise<void> => {
  if (!documentPath || !imageFolderPath) return
  const index = await loadIndex()
  const documentKey = normalizePath(documentPath)
  const images = new Set(index[documentKey] ?? [])
  for (const imagePath of getReferencedLocalImages(markdown, documentPath)) {
    if (isInDirectory(imagePath, imageFolderPath)) images.add(imagePath)
  }
  for (const storedImage of storedImages) {
    const imagePath = path.resolve(path.dirname(documentPath), storedImage)
    if (isInDirectory(imagePath, imageFolderPath)) images.add(normalizePath(imagePath))
  }
  index[documentKey] = [...images]
  await saveIndex(index)
}

/**
 * Move assets no longer referenced by a saved document to the recycle bin.
 * Only paths previously registered by MyMarkText are considered; user-owned
 * files and arbitrary paths named in Markdown are never scanned or removed.
 */
export const cleanupManagedImages = async(documentPath: string, markdown: string): Promise<void> => {
  const index = await loadIndex()
  const documentKey = normalizePath(documentPath)
  const tracked = index[documentKey] ?? []
  if (!tracked.length) return

  const referenced = getReferencedLocalImages(markdown, documentPath)
  const retained: string[] = []

  for (const imagePath of tracked) {
    if (referenced.has(imagePath)) {
      retained.push(imagePath)
      continue
    }

    // Do not remove a shared asset that is still owned by another document.
    const usedByAnotherDocument = Object.entries(index).some(([otherDocument, images]) =>
      otherDocument !== documentKey && images.includes(imagePath)
    )
    if (usedByAnotherDocument) {
      retained.push(imagePath)
      continue
    }

    try {
      await fs.access(imagePath)
      await shell.trashItem(imagePath)
    } catch (error) {
      // Keep failed removals for a later save instead of silently losing them.
      retained.push(imagePath)
      log.warn(`Unable to move unused managed image to recycle bin: ${imagePath}`, error)
    }
  }

  if (retained.length) index[documentKey] = retained
  else delete index[documentKey]
  await saveIndex(index)
}

/** Preserve image ownership when a document is saved under a new name. */
export const moveManagedImageOwnership = async(oldDocumentPath: string, newDocumentPath: string): Promise<void> => {
  if (!oldDocumentPath || !newDocumentPath) return
  const oldKey = normalizePath(oldDocumentPath)
  const newKey = normalizePath(newDocumentPath)
  if (oldKey === newKey) return
  const index = await loadIndex()
  const oldImages = index[oldKey]
  if (!oldImages?.length) return
  index[newKey] = [...new Set([...(index[newKey] ?? []), ...oldImages])]
  delete index[oldKey]
  await saveIndex(index)
}
