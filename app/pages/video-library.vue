<script setup lang="ts">
import VideoLibraryPanel from '~/components/VideoLibraryPanel.vue'

const { isChecking, isAuthenticated, checkSession, fetchStatus } = useAuth()
const { t } = useI18n()

const panelRef = ref<{ refresh: () => Promise<void> } | null>(null)

async function loadPanel() {
  if (isAuthenticated.value) {
    await panelRef.value?.refresh()
  }
}

onMounted(async () => {
  const status = await fetchStatus()
  if (!status.initialized && !status.legacyMode) {
    await navigateTo('/setup')
    return
  }
  await checkSession()
  await loadPanel()
})

watch(isAuthenticated, async (authed, prev) => {
  if (authed && prev === false) {
    await nextTick()
    await loadPanel()
  }
})
</script>

<template>
  <div class="min-h-screen">
    <div
      v-if="isChecking"
      class="flex min-h-screen items-center justify-center"
    >
      <div class="flex flex-col items-center gap-3 text-muted">
        <UIcon
          name="i-lucide-loader-circle"
          class="size-8 animate-spin"
        />
        <p class="text-sm">
          {{ t('common.loadingSession') }}
        </p>
      </div>
    </div>

    <AdminLoginGate v-else-if="!isAuthenticated" />

    <AppShell v-else>
      <VideoLibraryPanel ref="panelRef" />
    </AppShell>
  </div>
</template>
