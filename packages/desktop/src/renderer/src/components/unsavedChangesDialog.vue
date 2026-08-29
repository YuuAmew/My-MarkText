<template>
  <el-dialog
    v-model="visible"
    class="unsaved-changes-dialog"
    width="430px"
    :close-on-click-modal="false"
    @closed="cancel"
  >
    <template #title>Save changes?</template>
    <p>The following file{{ filenames.length === 1 ? '' : 's' }} has unsaved changes:</p>
    <ul><li v-for="name in filenames" :key="name">{{ name }}</li></ul>
    <p>Changes will be lost if you don't save them.</p>
    <template #footer>
      <el-button @click="respond('cancel')">Cancel</el-button>
      <el-button @click="respond('dontSave')">Don't Save</el-button>
      <el-button type="primary" @click="respond('save')">Save</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const visible = ref(false)
const filenames = ref<string[]>([])
let requestId: string | null = null

const respond = (response: 'save' | 'dontSave' | 'cancel'): void => {
  if (!requestId) return
  const id = requestId
  requestId = null
  visible.value = false
  window.electron.ipcRenderer.send('mt::unsaved-files-confirm-response', id, response)
}

const cancel = (): void => respond('cancel')
const unsubscribe = window.electron.ipcRenderer.on('mt::show-unsaved-files-confirm', (_event, payload) => {
  requestId = payload.requestId
  filenames.value = payload.filenames
  visible.value = true
})

onBeforeUnmount(unsubscribe)
</script>

<style>
.unsaved-changes-dialog ul {
  max-height: 160px;
  overflow: auto;
  padding-left: 24px;
}
</style>
