<script setup lang="ts">
import type { FileItem } from '~/types/file'
import { formatFileSize as formatSize } from '~/composables/useFileSize'

const props = defineProps<{
  item: FileItem
  link: string
  downloadLink: string
  selected?: boolean
  selectable?: boolean
}>()

const emit = defineEmits<{
  'delete': []
  'update:selected': [value: boolean]
}>()

const { t, locale } = useI18n()

const uploadedLabel = computed(() => {
  try {
    return new Date(props.item.uploadedAt).toLocaleString(locale.value, { hour12: false })
  } catch {
    return props.item.uploadedAt
  }
})

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
</script>

<template>
  <div class="flex flex-col overflow-hidden rounded-xl border border-default bg-elevated">
    <div class="relative flex aspect-[4/3] shrink-0 items-center justify-center bg-muted">
      <UIcon
        :name="fileIcon(item)"
        class="size-12 text-dimmed"
      />

      <div
        v-if="selectable"
        class="absolute top-2 left-2 z-10"
        @click.stop
      >
        <UCheckbox
          :model-value="selected"
          @update:model-value="emit('update:selected', $event === true)"
        />
      </div>
    </div>

    <div class="flex flex-1 flex-col gap-1.5 p-3">
      <p
        class="truncate text-sm font-semibold"
        :title="item.originalName"
      >
        {{ item.originalName }}
      </p>
      <p class="truncate text-xs text-muted">
        {{ uploadedLabel }} · {{ formatSize(item.size) }}
      </p>
      <TagBadgeList :tags="item.tags" />
    </div>

    <div class="flex items-center justify-around border-t border-default px-2 py-2">
      <CopyButton
        icon-only
        icon="i-lucide-link"
        :label="t('files.copyLink')"
        :value="link"
      />
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-download"
        :to="downloadLink"
        target="_blank"
        rel="noopener"
        :aria-label="t('files.download')"
      />
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-trash-2"
        :aria-label="t('common.delete')"
        @click="emit('delete')"
      />
    </div>
  </div>
</template>
