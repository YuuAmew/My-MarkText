<script setup lang="ts">
import UnsavedChangesDialog from './components/unsavedChangesDialog.vue'
</script>

<template>
  <div id="app">
    <!-- This router-view will render either App component (/editor) or Preference component (/preference) -->
    <router-view />
    <unsaved-changes-dialog />
  </div>
</template>
