<script setup lang="ts">
import type { FileItem, FileListResponse } from '~/types/file'
import type { LibraryStatsData } from '~/types/media'
import { formatFileSize } from '~/composables/useFileSize'
import SiteSyncSelectedDialog from '~/components/storage/SiteSyncSelectedDialog.vue'

const props = withDefaults(defineProps<{
  /** 文件库（file）与视频库结构一致，保留参数以便复用 */
  kind?: 'file' | 'video'
}>(), {
  kind: 'file'
})

const { isAuthenticated, handleAuthError } = useAuth()
const toast = useToast()
const { t, locale } = useI18n()
const { items: tagItems, fetchTags, batchUpdateTags } = useTags()

const items = ref<FileItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const totalPages = ref(1)
const loading = ref(false)
const stats = ref<LibraryStatsData | null>(null)
const searchQuery = ref('')
const activeSearch = ref('')
const accessMode = ref<'public' | 'token'>('public')
const apiToken = ref('')

const selectedKeys = ref<Set<string>>(new Set())
const deleteModalOpen = ref(false)
const deleteTargetKeys = ref<string[]>([])
const deleting = ref(false)
const batchTagOpen = ref(false)
const syncOpen = ref(false)

const currentBackend = ref('all')
const currentSource = ref('all')
const backendOptions = ref<Array<{ id: string, name: string }>>([])
const activeTagIds = ref<number[]>([])
const activeTagMode = ref<'or' | 'and'>('or')
const activeUntaggedOnly = ref(false)
const { viewMode } = useLibraryView(props.kind)

const selectedCount = computed(() => selectedKeys.value.size)
const syncKeys = computed(() => [...selectedKeys.value])

const pageText = computed(() => props.kind === 'video'
  ? {
      title: t('library.video.title'),
      subtitle: t('library.video.subtitle'),
      empty: t('library.video.empty')
    }
  : {
      title: t('library.file.title'),
      subtitle: t('library.file.subtitle'),
      empty: t('library.file.empty')
    })

const allSelected = computed(() =>
  items.value.length > 0 && items.value.every(item => selectedKeys.value.has(item.key))
)

const backendItems = computed(() => [
  { label: t('stats.filterStorageAll'), value: 'all' },
  ...backendOptions.value.map(backend => ({ label: backend.name, value: backend.id }))
])

const sourceItems = computed(() => [
  { label: t('stats.filterSourceAll'), value: 'all' },
  { label: t('stats.sourceWeb'), value: 'web' },
  { label: t('stats.sourceApi'), value: 'api' }
])

function withToken(raw: string | undefined): string {
  if (!raw) return ''
  if (accessMode.value !== 'token' || !apiToken.value) return raw
  const separator = raw.includes('?') ? '&' : '?'
  return `${raw}${separator}token=${encodeURIComponent(apiToken.value)}`
}

function fileLink(item: FileItem): string {
  return withToken(item.url)
}

function displayName(item: FileItem): string {
  return item.originalName
}

function uploadedLabel(item: FileItem): string {
  try {
    return new Date(item.uploadedAt).toLocaleString(locale.value, { hour12: false })
  } catch {
    return item.uploadedAt
  }
}

function fileIcon(item: FileItem): string {
  const type = item.contentType.toLowerCase()
  if (type.startsWith('image/')) return 'i-lucide-image'
  if (type.startsWith('video/')) return 'i-lucide-film'
  if (type.startsWith('audio/')) return 'i-lucide-music'
  if (type.includes('pdf')) return 'i-lucide-file-text'
  if (
    type.includes('zip')
    || type.includes('rar')
    || type.includes('7z')
    || type.includes('tar')
    || type.includes('gzip')
  ) {
    return 'i-lucide-file-archive'
  }
  return 'i-lucide-file'
}

async function loadApiToken() {
  try {
    const data = await $fetch<{ apiUploadToken: string }>('/api/user/api-token', {
      credentials: 'include'
    })
    apiToken.value = data.apiUploadToken ?? ''
  } catch {
    apiToken.value = ''
  }
}

async function loadBackendOptions() {
  try {
    const data = await $fetch<{ backends: Array<{ id: string, name: string }> }>(
      '/api/storage-backends',
      { credentials: 'include' }
    )
    backendOptions.value = data.backends ?? []
  } catch (error: unknown) {
    handleAuthError(error)
  }
}

async function fetchStats() {
  if (!isAuthenticated.value) return
  try {
    stats.value = await $fetch<LibraryStatsData>('/api/library/stats', {
      credentials: 'include',
      query: { kind: props.kind }
    })
  } catch (error: unknown) {
    handleAuthError(error)
  }
}

async function fetchList(targetPage = page.value) {
  if (!isAuthenticated.value) return
  loading.value = true
  try {
    const response = await $fetch<FileListResponse>('/api/files', {
      credentials: 'include',
      query: {
        limit: pageSize.value,
        page: targetPage,
        kind: props.kind,
        ...(activeSearch.value ? { q: activeSearch.value } : {}),
        ...(currentBackend.value !== 'all' ? { backendId: currentBackend.value } : {}),
        ...(currentSource.value !== 'all' ? { uploadSource: currentSource.value } : {}),
        ...(activeTagIds.value.length ? { tagIds: activeTagIds.value.join(',') } : {}),
        ...(activeUntaggedOnly.value ? { untagged: '1' } : {}),
        ...(activeTagMode.value === 'and' ? { tagMode: 'and' } : {})
      }
    })

    items.value = response.items
    total.value = response.total
    page.value = response.page
    totalPages.value = response.totalPages
    accessMode.value = response.accessMode

    const visible = new Set(response.items.map(item => item.key))
    selectedKeys.value = new Set([...selectedKeys.value].filter(key => visible.has(key)))

    if (response.accessMode === 'token' && !apiToken.value) {
      await loadApiToken()
    }
  } catch (error: unknown) {
    handleAuthError(error)
    if (isAuthenticated.value) {
      toast.add({ title: t('files.loadFailed'), color: 'error' })
    }
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await Promise.all([fetchList(1), fetchStats(), fetchTags()])
}

async function submitSearch() {
  if (!isAuthenticated.value) return
  activeSearch.value = searchQuery.value.trim()
  await fetchList(1)
}

async function handleBackendChange(value: string) {
  currentBackend.value = value
  selectedKeys.value = new Set()
  await fetchList(1)
}

async function handleSourceChange(value: string) {
  currentSource.value = value
  selectedKeys.value = new Set()
  await fetchList(1)
}

async function handleTagIdsChange(tagIds: number[]) {
  activeTagIds.value = tagIds
  selectedKeys.value = new Set()
  await fetchList(1)
}

async function handleTagModeChange(tagMode: 'or' | 'and') {
  activeTagMode.value = tagMode
  await fetchList(1)
}

async function handleUntaggedChange(untaggedOnly: boolean) {
  activeUntaggedOnly.value = untaggedOnly
  selectedKeys.value = new Set()
  await fetchList(1)
}

async function resetFilters() {
  searchQuery.value = ''
  activeSearch.value = ''
  currentBackend.value = 'all'
  currentSource.value = 'all'
  activeTagIds.value = []
  activeTagMode.value = 'or'
  activeUntaggedOnly.value = false
  selectedKeys.value = new Set()
  await fetchList(1)
}

function toggleSelected(key: string, value: boolean) {
  const next = new Set(selectedKeys.value)
  if (value) next.add(key)
  else next.delete(key)
  selectedKeys.value = next
}

function toggleSelectAll() {
  selectedKeys.value = allSelected.value
    ? new Set()
    : new Set(items.value.map(item => item.key))
}

function clearSelection() {
  selectedKeys.value = new Set()
}

function setViewMode(mode: 'grid' | 'list') {
  viewMode.value = mode
}

function openBatchTags() {
  batchTagOpen.value = true
}

function openSync() {
  syncOpen.value = true
}

function requestDelete(item: FileItem) {
  if (!isAuthenticated.value) return
  deleteTargetKeys.value = [item.key]
  deleteModalOpen.value = true
}

function requestBatchDelete() {
  if (!isAuthenticated.value || !selectedCount.value) return
  deleteTargetKeys.value = [...selectedKeys.value]
  deleteModalOpen.value = true
}

async function confirmDelete() {
  const keys = [...deleteTargetKeys.value]
  if (!keys.length || !isAuthenticated.value) return

  deleting.value = true
  try {
    if (keys.length === 1) {
      await $fetch('/api/files', {
        method: 'DELETE',
        credentials: 'include',
        query: { key: keys[0] }
      })
    } else {
      const response = await $fetch<{ deleted: string[], failed: unknown[] }>(
        '/api/files/batch-delete',
        { method: 'POST', credentials: 'include', body: { keys } }
      )
      if (response.failed.length) {
        toast.add({
          title: t('library.deletePartialFail', { n: response.failed.length }),
          color: 'warning'
        })
      }
    }

    toast.add({ title: t('library.fileDeleted', { n: keys.length }), color: 'success' })
    deleteModalOpen.value = false
    deleteTargetKeys.value = []
    selectedKeys.value = new Set()
    await refresh()
  } catch (error: unknown) {
    handleAuthError(error)
    if (isAuthenticated.value) {
      toast.add({ title: t('files.deleteFailed'), color: 'error' })
    }
  } finally {
    deleting.value = false
  }
}

async function confirmBatchTags(tagIds: number[], action: 'add' | 'remove') {
  const keys = [...selectedKeys.value]
  if (!keys.length || !tagIds.length) return

  try {
    await batchUpdateTags(keys, tagIds, action)
    batchTagOpen.value = false
    selectedKeys.value = new Set()
    toast.add({ title: t('tags.batchSuccess'), color: 'success' })
    await Promise.all([fetchList(1), fetchStats(), fetchTags(true)])
  } catch (error: unknown) {
    handleAuthError(error)
    toast.add({ title: t('tags.batchFailed'), color: 'error' })
  }
}

async function handlePageChange(targetPage: number) {
  selectedKeys.value = new Set()
  await fetchList(targetPage)
}

async function handlePageSizeChange(size: number) {
  pageSize.value = size
  selectedKeys.value = new Set()
  await fetchList(1)
}

onMounted(() => {
  void loadBackendOptions()
})

defineExpose({ refresh })
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight">
          {{ pageText.title }}
        </h1>
        <p class="text-sm text-muted">
          {{ pageText.subtitle }}
        </p>
      </div>

      <UButton
        icon="i-lucide-refresh-cw"
        variant="ghost"
        color="neutral"
        size="sm"
        class="mt-0.5 shrink-0"
        :aria-label="t('common.refresh')"
        :loading="loading"
        @click="refresh"
      />
    </div>

    <LibraryStatsPanel
      :kind="props.kind"
      :stats="stats"
      :loading="loading"
    />

    <section class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div class="flex items-center gap-2 text-sm">
          <UCheckbox
            :model-value="allSelected"
            :disabled="!items.length"
            @update:model-value="toggleSelectAll"
          />
          <span class="text-muted">
            {{ t('library.selectedCount', { n: selectedCount }) }}
          </span>
          <UButton
            v-if="selectedCount > 0"
            variant="link"
            color="primary"
            size="xs"
            :label="t('library.clearSelection')"
            @click="clearSelection"
          />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            :placeholder="t('library.searchPlaceholder')"
            size="sm"
            class="w-44"
            @keydown.enter.prevent="submitSearch"
          />
          <USelect
            :model-value="currentBackend"
            :items="backendItems"
            value-key="value"
            size="sm"
            class="w-32"
            :aria-label="t('stats.filterStorageAll')"
            @update:model-value="handleBackendChange"
          />
          <USelect
            :model-value="currentSource"
            :items="sourceItems"
            value-key="value"
            size="sm"
            class="w-28"
            :aria-label="t('stats.filterSourceAll')"
            @update:model-value="handleSourceChange"
          />
          <TagFilterSelect
            :model-value="activeTagIds"
            :tag-mode="activeTagMode"
            :untagged-only="activeUntaggedOnly"
            :tags="tagItems"
            :disabled="loading"
            @update:model-value="handleTagIdsChange"
            @update:tag-mode="handleTagModeChange"
            @update:untagged-only="handleUntaggedChange"
          />
          <UButton
            icon="i-lucide-search"
            size="sm"
            :label="t('common.search')"
            :loading="loading"
            @click="submitSearch"
          />
          <UButton
            icon="i-lucide-rotate-ccw"
            variant="outline"
            color="neutral"
            size="sm"
            :label="t('library.reset')"
            @click="resetFilters"
          />
          <UButton
            v-if="selectedCount > 0"
            icon="i-lucide-tags"
            variant="outline"
            color="primary"
            size="sm"
            :disabled="!selectedCount || loading"
            :label="t('tags.batchAdd')"
            @click="openBatchTags"
          />
          <UButton
            icon="i-lucide-trash-2"
            variant="outline"
            color="error"
            size="sm"
            :disabled="!selectedCount || loading"
            :label="t('library.batchDelete')"
            @click="requestBatchDelete"
          />
          <UButton
            v-if="selectedCount > 0"
            icon="i-lucide-cloud-upload"
            variant="outline"
            color="neutral"
            size="sm"
            :disabled="!selectedCount || loading"
            :label="t('storage.backup.syncSelectedAction')"
            @click="openSync"
          />
          <div class="flex gap-0.5 rounded-lg border border-default p-0.5">
            <UButton
              icon="i-lucide-layout-grid"
              size="xs"
              :variant="viewMode === 'grid' ? 'solid' : 'ghost'"
              :color="viewMode === 'grid' ? 'primary' : 'neutral'"
              :aria-label="t('stats.viewGrid')"
              @click="setViewMode('grid')"
            />
            <UButton
              icon="i-lucide-list"
              size="xs"
              :variant="viewMode === 'list' ? 'solid' : 'ghost'"
              :color="viewMode === 'list' ? 'primary' : 'neutral'"
              :aria-label="t('stats.viewList')"
              @click="setViewMode('list')"
            />
          </div>
        </div>
      </div>

      <div
        v-if="loading && !items.length"
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <USkeleton
          v-for="n in 8"
          :key="n"
          class="aspect-[4/3] rounded-xl"
        />
      </div>

      <p
        v-else-if="!items.length"
        class="rounded-lg border border-default py-10 text-center text-sm text-muted"
      >
        {{ activeSearch ? t('library.searchEmpty') : pageText.empty }}
      </p>

      <div
        v-else-if="viewMode === 'grid'"
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <FileCard
          v-for="item in items"
          :key="item.key"
          :item="item"
          :link="fileLink(item)"
          :download-link="fileLink(item)"
          selectable
          :selected="selectedKeys.has(item.key)"
          @update:selected="toggleSelected(item.key, $event)"
          @delete="requestDelete(item)"
        />
      </div>

      <div
        v-else
        class="overflow-hidden rounded-xl border border-default bg-default"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full text-xs">
            <thead class="border-b border-default bg-elevated/40 text-muted">
              <tr>
                <th class="w-10 px-3 py-2.5 text-left font-medium">
                  <UCheckbox
                    :model-value="allSelected"
                    :aria-label="t('stats.selectAll')"
                    @update:model-value="toggleSelectAll"
                  />
                </th>
                <th class="min-w-[14rem] px-3 py-2.5 text-left font-medium">
                  {{ t('stats.colFilename') }}
                </th>
                <th class="hidden w-24 px-3 py-2.5 text-left font-medium sm:table-cell">
                  {{ t('stats.colSource') }}
                </th>
                <th class="w-20 px-3 py-2.5 text-left font-medium">
                  {{ t('stats.colSize') }}
                </th>
                <th class="hidden w-28 px-3 py-2.5 text-left font-medium md:table-cell">
                  {{ t('stats.colType') }}
                </th>
                <th class="hidden w-40 px-3 py-2.5 text-left font-medium lg:table-cell">
                  {{ t('stats.colUploadedAt') }}
                </th>
                <th class="hidden min-w-[9rem] px-3 py-2.5 text-left font-medium md:table-cell">
                  {{ t('tags.column') }}
                </th>
                <th class="w-24 px-3 py-2.5 text-right font-medium">
                  {{ t('stats.colActions') }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr
                v-for="item in items"
                :key="item.key"
                class="transition-colors hover:bg-elevated/50"
                :class="selectedKeys.has(item.key) ? 'bg-primary/5' : ''"
              >
                <td class="px-3 py-2">
                  <UCheckbox
                    :model-value="selectedKeys.has(item.key)"
                    @update:model-value="toggleSelected(item.key, $event === true)"
                  />
                </td>
                <td class="px-3 py-2.5">
                  <div class="flex min-w-0 items-center gap-3">
                    <span class="flex size-10 shrink-0 items-center justify-center rounded-md border border-default bg-muted">
                      <UIcon
                        :name="fileIcon(item)"
                        class="size-4 text-dimmed"
                      />
                    </span>
                    <p
                      class="min-w-0 flex-1 truncate text-highlighted"
                      :title="displayName(item)"
                    >
                      {{ displayName(item) }}
                    </p>
                  </div>
                </td>
                <td class="hidden px-3 py-2 sm:table-cell">
                  <span
                    v-if="item.uploadSource"
                    class="inline-flex items-center gap-1 rounded-md border border-default px-1.5 py-0.5 text-[11px] leading-4 text-muted"
                  >
                    <UIcon
                      :name="item.uploadSource === 'api' ? 'i-lucide-code-xml' : 'i-lucide-globe'"
                      class="size-3 shrink-0"
                    />
                    {{ item.uploadSource === 'api' ? t('stats.tagApi') : t('stats.tagWeb') }}
                  </span>
                  <span
                    v-else
                    class="text-muted"
                  >—</span>
                </td>
                <td class="px-3 py-2 tabular-nums text-muted">
                  {{ formatFileSize(item.size) }}
                </td>
                <td class="hidden px-3 py-2 md:table-cell">
                  <span
                    v-if="item.storage"
                    class="inline-flex items-center gap-1 rounded-md border border-default px-1.5 py-0.5 text-[11px] leading-4 text-muted"
                  >
                    <UIcon
                      :name="item.storage.type === 'local' ? 'i-lucide-hard-drive' : 'i-lucide-cloud'"
                      class="size-3 shrink-0"
                    />
                    {{ item.storage.name }}
                  </span>
                  <span
                    v-else
                    class="text-muted"
                  >—</span>
                </td>
                <td class="hidden px-3 py-2 text-muted lg:table-cell">
                  {{ uploadedLabel(item) }}
                </td>
                <td class="hidden px-3 py-2 md:table-cell">
                  <TagBadgeList
                    :tags="item.tags"
                    compact
                    :empty-label="t('tags.unlabeled')"
                  />
                </td>
                <td class="px-3 py-2">
                  <div class="flex items-center justify-end gap-1">
                    <CopyButton
                      icon-only
                      icon="i-lucide-link"
                      :label="t('files.copyLink')"
                      :value="fileLink(item)"
                    />
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      icon="i-lucide-download"
                      :to="fileLink(item)"
                      target="_blank"
                      rel="noopener"
                      :aria-label="t('files.download')"
                    />
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="error"
                      icon="i-lucide-trash-2"
                      :aria-label="t('common.delete')"
                      @click="requestDelete(item)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <PaginationBar
        v-if="!loading && total > 0"
        :page="page"
        :total-pages="totalPages"
        :total="total"
        :page-size="pageSize"
        unit=""
        :loading="loading"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </section>

    <DeleteConfirmModal
      v-model:open="deleteModalOpen"
      :count="deleteTargetKeys.length"
      :loading="deleting"
      :kind="props.kind"
      @confirm="confirmDelete"
    />

    <BatchTagModal
      v-model:open="batchTagOpen"
      :tags="tagItems"
      :selected-count="selectedCount"
      @confirm="confirmBatchTags"
    />

    <SiteSyncSelectedDialog
      v-model:open="syncOpen"
      :keys="syncKeys"
      scope="file"
    />
  </div>
</template>
