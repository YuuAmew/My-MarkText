<template>
  <div
    class="side-bar-toc"
    :class="[{ 'side-bar-toc-overflow': !wordWrapInToc, 'side-bar-toc-wordwrap': wordWrapInToc }]"
  >
    <div class="title">
      {{ t('sideBar.toc.title') }}
    </div>
    <el-tree
      v-if="toc.length"
      ref="tree"
      :data="toc"
      node-key="slug"
      :props="defaultProps"
      :expand-on-click-node="false"
      :indent="10"
      :icon="ArrowRight"
      @node-click="handleClick"
      @node-expand="handleExpand"
      @node-collapse="handleCollapse"
      @node-contextmenu="handleContextMenu"
    >
      <template #default="{ data }">
        <span :style="{ color: `var(--h${Math.min(6, Math.max(1, data.lvl || 6))}Color)` }">{{ data.label }}</span>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import bus from '../../bus'
import { storeToRefs } from 'pinia'
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from '@element-plus/icons-vue'

const { t } = useI18n()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const defaultProps = {
  children: 'children',
  label: 'label'
}

const { toc, currentFile } = storeToRefs(editorStore)
const { wordWrapInToc } = storeToRefs(preferencesStore)
interface TreeNodeControl {
  expanded: boolean
  expand: (callback?: (() => void) | null, expandParent?: boolean) => void
  collapse: () => void
}
const tree = ref<{ getNode?: (key: string) => TreeNodeControl | null } | null>(null)

const getSlugs = (): string[] => {
  const result: string[] = []
  const visit = (nodes: typeof toc.value): void => {
    for (const node of nodes) {
      if (typeof node.slug === 'string' && node.slug.length) result.push(node.slug)
      visit(node.children)
    }
  }
  visit(toc.value)
  return result
}

const restoreExpandedState = async (): Promise<void> => {
  const file = currentFile.value
  if (!file || !toc.value.length) return
  await nextTick()
  const allSlugs = getSlugs()
  const expanded = new Set((file.tocExpandedSlugs ?? allSlugs).filter((slug) => allSlugs.includes(slug)))
  for (const slug of allSlugs) {
    const node = tree.value?.getNode?.(slug)
    if (!node) continue
    if (expanded.has(slug)) node.expand(null, false)
    else node.collapse()
  }
  if (file.tocExpandedSlugs === undefined) editorStore.SET_TOC_EXPANDED_SLUGS(allSlugs)
}

watch([toc, currentFile], () => {
  void restoreExpandedState()
}, { deep: false, immediate: true })

const handleClick = (data: { slug?: unknown }): void => {
  // editor.vue builds a CSS selector with `#${slug}` — bail out if the
  // node has no slug (e.g. unsluggable headings) to avoid emitting
  // `undefined` / non-string payloads and producing `#undefined` selectors.
  if (typeof data.slug !== 'string' || data.slug.length === 0) return
  bus.emit('scroll-to-header', data.slug)
}

const updateExpandedState = (data: { slug?: unknown }, expanded: boolean): void => {
  if (typeof data.slug !== 'string' || !data.slug) return
  const current = new Set(currentFile.value?.tocExpandedSlugs ?? getSlugs())
  if (expanded) current.add(data.slug)
  else current.delete(data.slug)
  editorStore.SET_TOC_EXPANDED_SLUGS([...current])
}

const handleExpand = (data: { slug?: unknown }): void => updateExpandedState(data, true)
const handleCollapse = (data: { slug?: unknown }): void => updateExpandedState(data, false)

const syncExpandedStateFromTree = (): void => {
  const expanded = getSlugs().filter((slug) => tree.value?.getNode?.(slug)?.expanded === true)
  editorStore.SET_TOC_EXPANDED_SLUGS(expanded)
}

bus.on('mt::sync-toc-expanded-state', syncExpandedStateFromTree)

const handleContextMenu = (event: MouseEvent, data: { slug?: unknown }): void => {
  event.preventDefault()
  if (typeof data.slug !== 'string' || !data.slug) return
  const node = tree.value?.getNode?.(data.slug)
  if (!node) return
  if (node.expanded) node.collapse()
  else node.expand(null, false)
}
</script>

<style>
.side-bar-toc {
  height: calc(100% - 35px);
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.side-bar-toc .title {
  color: var(--sideBarTitleColor);
  font-weight: 600;
  font-size: 16px;
  margin: 37px 0 10px 0;
  padding-left: 25px;
}

.side-bar-toc .el-tree-node {
  margin-top: 8px;
}

.side-bar-toc .el-tree {
  background: transparent;
  color: var(--sideBarColor);
}

.side-bar-toc .el-tree-node:focus > .el-tree-node__content {
  background-color: var(--sideBarItemHoverBgColor);
}

.side-bar-toc .el-tree-node__content:hover {
  background: var(--sideBarItemHoverBgColor);
}

.side-bar-toc > li {
  font-size: 14px;
  margin-bottom: 15px;
  cursor: pointer;
}
.side-bar-toc-overflow {
  overflow: auto;
}
.side-bar-toc-wordwrap {
  overflow-x: hidden;
  overflow-y: auto;
}

.side-bar-toc-wordwrap .el-tree-node__content {
  white-space: normal;
  height: auto;
  min-height: 26px;
}
</style>
