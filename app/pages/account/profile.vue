<script setup lang="ts">
const { isChecking, isAuthenticated, user, checkSession, fetchStatus, handleAuthError } = useAuth()
const toast = useToast()
const { t } = useI18n()

const username = ref('')
const saving = ref(false)

watch(user, (value) => {
  if (value) username.value = value.username
}, { immediate: true })

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    const data = await $fetch<{ user: { username: string } }>('/api/user/profile', {
      method: 'PATCH',
      credentials: 'include',
      body: { username: username.value.trim() }
    })
    await checkSession()
    toast.add({ title: t('profile.saved'), color: 'success' })
    username.value = data.user.username
  } catch (error: unknown) {
    handleAuthError(error)
    const message = (error as { data?: { message?: string } })?.data?.message
    toast.add({ title: message ?? t('profile.saveFailed'), color: 'error' })
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  const status = await fetchStatus()
  if (!status.initialized && !status.legacyMode) {
    await navigateTo('/setup')
    return
  }
  await checkSession()
})
</script>

<template>
  <div class="min-h-screen">
    <div
      v-if="isChecking"
      class="flex min-h-screen items-center justify-center"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-8 animate-spin text-muted"
      />
    </div>

    <AdminLoginGate v-else-if="!isAuthenticated" />

    <AppShell v-else>
      <div class="mx-auto max-w-md space-y-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">
            {{ t('profile.title') }}
          </h1>
          <p class="text-sm text-muted">
            {{ t('profile.subtitle') }}
          </p>
        </div>

        <form
          class="space-y-3 rounded-xl border border-default bg-elevated p-5"
          @submit.prevent="save"
        >
          <label class="block text-sm font-medium">
            {{ t('profile.username') }}
          </label>
          <UInput
            v-model="username"
            class="w-full"
            :placeholder="t('profile.username')"
          />
          <p class="text-xs text-muted">
            {{ t('profile.usernameHint') }}
          </p>
          <UButton
            type="submit"
            :loading="saving"
            :label="t('common.save')"
          />
        </form>
      </div>
    </AppShell>
  </div>
</template>
