<script setup lang="ts">
import type { ImageTag } from '~/types/image'

const props = withDefaults(defineProps<{
  tags?: ImageTag[]
  max?: number
  compact?: boolean
  emptyLabel?: string
}>(), {
  tags: () => [],
  max: 3,
  compact: false,
  emptyLabel: ''
})

const emit = defineEmits<{
  'tag-click': [tagId: number]
}>()

const { t } = useI18n()

const visibleTags = computed(() => props.tags.slice(0, props.max))
const hiddenTags = computed(() => props.tags.slice(props.max))
</script>

<template>
  <div
    v-if="tags.length"
    class="flex flex-wrap items-center"
    :class="compact ? 'gap-1' : 'gap-1.5'"
  >
    <TagBadge
      v-for="tag in visibleTags"
      :key="tag.id"
      :tag="tag"
      @click="emit('tag-click', tag.id)"
    />
    <UPopover
      v-if="hiddenTags.length"
      :content="{ side: 'bottom', align: 'start' }"
    >
      <button
        type="button"
        class="inline-flex rounded-md border border-default text-muted transition-colors hover:border-primary/40 hover:text-primary"
        :class="compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'"
        :aria-label="t('tags.moreTags', { n: hiddenTags.length })"
      >
        +{{ hiddenTags.length }}
      </button>
      <template #content>
        <div
          class="flex max-w-56 flex-wrap gap-1.5 p-2"
        >
          <TagBadge
            v-for="tag in hiddenTags"
            :key="tag.id"
            :tag="tag"
            @click="emit('tag-click', tag.id)"
          />
        </div>
      </template>
    </UPopover>
  </div>
  <span
    v-else-if="emptyLabel"
    class="text-muted"
  >
    {{ emptyLabel }}
  </span>
</template>
