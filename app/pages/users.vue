<script setup lang="ts">
interface AdminUser {
  id: number
  username: string
  role: 'admin' | 'user'
  created_at: string
  password_reset: number
}

const { isChecking, isAuthenticated, isAdmin, checkSession, fetchStatus, handleAuthError } = useAuth()
const toast = useToast()
const { t } = useI18n()

const users = ref<AdminUser[]>([])
const loading = ref(false)

async function loadUsers() {
  if (!isAdmin.value) return
  loading.value = true
  try {
    const data = await $fetch<{ users: AdminUser[] }>('/api/admin/users', {
      credentials: 'include'
    })
    users.value = data.users
  } catch (error: unknown) {
    handleAuthError(error)
    if (isAuthenticated.value) {
      toast.add({ title: t('users.loadFailed'), color: 'error' })
    }
  } finally {
    loading.value = false
  }
}

async function clearPassword(user: AdminUser) {
  try {
    await $fetch(`/api/admin/users/${user.id}/clear-password`, {
      method: 'POST',
      credentials: 'include'
    })
    toast.add({ title: t('users.passwordCleared', { name: user.username }), color: 'success' })
    await loadUsers()
  } catch (error: unknown) {
    handleAuthError(error)
    toast.add({ title: t('users.clearFailed'), color: 'error' })
  }
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

onMounted(async () => {
  const status = await fetchStatus()
  if (!status.initialized && !status.legacyMode) {
    await navigateTo('/setup')
    return
  }
  await checkSession()
  if (isAuthenticated.value && isAdmin.value) {
    await loadUsers()
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
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold tracking-tight">
            {{ t('users.title') }}
          </h1>
          <p class="text-sm text-muted">
            {{ t('users.subtitle') }}
          </p>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-label="t('common.refresh')"
          :loading="loading"
          @click="loadUsers"
        />
      </div>

      <UAlert
        v-if="!isAdmin"
        color="warning"
        variant="subtle"
        :title="t('users.adminOnly')"
      />

      <ul
        v-else
        class="rounded-xl border border-default"
      >
        <li
          v-for="user in users"
          :key="user.id"
          class="flex flex-wrap items-center gap-3 border-b border-default px-4 py-3 last:border-0"
        >
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 text-sm font-medium text-highlighted">
              <span class="truncate">{{ user.username }}</span>
              <UBadge
                :color="user.role === 'admin' ? 'primary' : 'neutral'"
                variant="subtle"
                size="xs"
              >
                {{ user.role === 'admin' ? t('users.roleAdmin') : t('users.roleUser') }}
              </UBadge>
            </p>
            <p class="mt-0.5 text-xs text-muted">
              {{ formatDate(user.created_at) }}
            </p>
          </div>

          <UBadge
            v-if="user.password_reset === 1"
            color="warning"
            variant="subtle"
            size="sm"
          >
            {{ t('users.resetPending') }}
          </UBadge>
          <UButton
            v-else
            variant="outline"
            color="warning"
            size="sm"
            :label="t('users.clearPassword')"
            @click="clearPassword(user)"
          />
        </li>
      </ul>
    </AppShell>
  </div>
</template>
