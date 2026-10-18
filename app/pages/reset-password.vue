<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const { checkSession } = useAuth()

const username = ref(String(route.query.username ?? ''))
const password = ref('')
const confirm = ref('')
const loading = ref(false)

async function submit() {
  if (loading.value) return
  if (password.value.length < 6) {
    toast.add({ title: t('reset.tooShort'), color: 'warning' })
    return
  }
  if (password.value !== confirm.value) {
    toast.add({ title: t('reset.mismatch'), color: 'warning' })
    return
  }

  loading.value = true
  try {
    await $fetch('/api/auth/reset-password', {
      method: 'POST',
      credentials: 'include',
      body: { username: username.value.trim(), password: password.value }
    })
    await checkSession()
    toast.add({ title: t('reset.success'), color: 'success' })
    await router.replace('/')
  } catch (error: unknown) {
    toast.add({
      title: error instanceof Error ? error.message : t('reset.failed'),
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-4">
    <form
      class="w-full max-w-sm space-y-4 rounded-xl border border-default bg-elevated p-6"
      @submit.prevent="submit"
    >
      <div>
        <h1 class="text-xl font-semibold tracking-tight">
          {{ t('reset.title') }}
        </h1>
        <p class="mt-1 text-sm text-muted">
          {{ t('reset.subtitle') }}
        </p>
      </div>

      <UInput
        v-model="username"
        :placeholder="t('auth.username')"
        class="w-full"
      />
      <UInput
        v-model="password"
        type="password"
        :placeholder="t('reset.newPassword')"
        class="w-full"
      />
      <UInput
        v-model="confirm"
        type="password"
        :placeholder="t('reset.confirmPassword')"
        class="w-full"
      />

      <UButton
        type="submit"
        block
        :loading="loading"
        :label="t('reset.submit')"
      />
    </form>
  </div>
</template>
