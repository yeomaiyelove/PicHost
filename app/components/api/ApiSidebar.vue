<script setup lang="ts">
import type { ApiDocCategory, ApiDocEndpoint } from '~/composables/useApiDocs'

const props = defineProps<{
  endpoints: ApiDocEndpoint[]
  activeId: string
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const { t, locale } = useI18n()
const search = ref('')
const docsUrl = computed(() =>
  locale.value === 'en'
    ? 'https://o96u.github.io/PicHost/en/guide/api.html'
    : 'https://o96u.github.io/PicHost/guide/api.html'
)

const categories: { key: ApiDocCategory, labelKey: string }[] = [
  { key: 'image', labelKey: 'api.categories.image' },
  { key: 'video', labelKey: 'api.categories.video' },
  { key: 'file', labelKey: 'api.categories.file' },
  { key: 'extension', labelKey: 'api.categories.extension' },
  { key: 'system', labelKey: 'api.categories.system' }
]
const openCategories = ref<Set<ApiDocCategory>>(
  new Set(
    categories
      .filter(category => category.key !== 'video' && category.key !== 'file')
      .map(category => category.key)
  )
)

const filteredEndpoints = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.endpoints
  return props.endpoints.filter((endpoint) => {
    const title = t(endpoint.titleKey).toLowerCase()
    const path = endpoint.path.toLowerCase()
    return title.includes(q) || path.includes(q) || endpoint.method.toLowerCase().includes(q)
  })
})

function endpointsForCategory(category: ApiDocCategory) {
  return filteredEndpoints.value.filter(endpoint => endpoint.category === category)
}

function isCategoryOpen(category: ApiDocCategory) {
  return openCategories.value.has(category)
}

function toggleCategory(category: ApiDocCategory) {
  const next = new Set(openCategories.value)
  if (next.has(category)) next.delete(category)
  else next.add(category)
  openCategories.value = next
}

function onSelect(id: string) {
  emit('select', id)
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    search.value = ''
    event.preventDefault()
  }
}

onMounted(() => {
  const onGlobalKeydown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      document.getElementById('api-endpoint-search')?.focus()
    }
  }
  window.addEventListener('keydown', onGlobalKeydown)
  onUnmounted(() => window.removeEventListener('keydown', onGlobalKeydown))
})

watch(search, (value) => {
  if (!value.trim()) return
  const next = new Set(openCategories.value)
  for (const category of categories) {
    if (endpointsForCategory(category.key).length) next.add(category.key)
  }
  openCategories.value = next
})
</script>

<template>
  <aside class="flex w-full shrink-0 flex-col border-b border-default bg-default lg:w-52 lg:border-b-0 lg:border-r lg:bg-neutral-50 dark:lg:bg-neutral-900/30 xl:w-56">
    <div class="border-b border-default p-3 sm:p-4">
      <UInput
        id="api-endpoint-search"
        v-model="search"
        :placeholder="t('api.searchPlaceholder')"
        icon="i-lucide-search"
        size="sm"
        @keydown="onSearchKeydown"
      >
        <template #trailing>
          <UKbd
            size="sm"
            class="hidden sm:inline-flex"
          >
            ⌘K
          </UKbd>
        </template>
      </UInput>
    </div>

    <nav class="flex-1 overflow-y-auto p-2 sm:p-3">
      <div
        v-for="category in categories"
        :key="category.key"
        class="mb-4"
      >
        <button
          v-if="endpointsForCategory(category.key).length"
          type="button"
          class="mb-1.5 flex w-full items-center justify-between rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-muted/40 hover:text-highlighted"
          :aria-expanded="isCategoryOpen(category.key)"
          @click="toggleCategory(category.key)"
        >
          <span>{{ t(category.labelKey) }}</span>
          <UIcon
            name="i-lucide-chevron-down"
            class="size-3.5 transition-transform"
            :class="isCategoryOpen(category.key) ? '' : '-rotate-90'"
          />
        </button>
        <ul
          v-show="isCategoryOpen(category.key)"
          class="space-y-0.5"
        >
          <li
            v-for="endpoint in endpointsForCategory(category.key)"
            :key="endpoint.id"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors"
              :class="activeId === endpoint.id
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-muted hover:bg-muted/40 hover:text-highlighted'"
              @click="onSelect(endpoint.id)"
            >
              <ApiMethodBadge :method="endpoint.method" />
              <span class="min-w-0 truncate">{{ t(endpoint.titleKey) }}</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>

    <div class="hidden border-t border-default p-3 sm:p-4 lg:block">
      <div class="rounded-xl border border-primary/15 bg-primary/5 p-3">
        <div class="flex items-start gap-2.5">
          <UIcon
            name="i-lucide-book-open"
            class="mt-0.5 size-4 shrink-0 text-primary"
          />
          <div class="min-w-0 space-y-2">
            <p class="text-xs font-medium text-highlighted">
              {{ t('api.helpTitle') }}
            </p>
            <p class="text-xs leading-relaxed text-muted">
              {{ t('api.helpSubtitle') }}
            </p>
            <UButton
              :label="t('api.viewDocs')"
              icon="i-lucide-external-link"
              size="xs"
              variant="outline"
              color="neutral"
              :to="docsUrl"
              target="_blank"
              rel="noopener noreferrer"
            />
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>
