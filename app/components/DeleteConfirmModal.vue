<script setup lang="ts">
import type { MediaType } from '~/types/media'

const props = defineProps<{
  open: boolean
  count: number
  loading?: boolean
  /** 删除对象的类型，决定确认文案 */
  kind?: MediaType
}>()

const kind = computed<MediaType>(() => props.kind ?? 'image')

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm': []
}>()

const { t } = useI18n()

const description = computed(() => {
  switch (kind.value) {
    case 'video':
      return t('delete.confirmDescVideo', { count: props.count })
    case 'file':
      return t('delete.confirmDescFile', { count: props.count })
    default:
      return t('delete.confirmDesc', { count: props.count })
  }
})

function close() {
  emit('update:open', false)
}

function confirm() {
  emit('confirm')
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('delete.confirmTitle')"
    :description="description"
    @update:open="emit('update:open', $event)"
  >
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="outline"
          @click="close"
        />
        <UButton
          :label="t('delete.confirm')"
          color="error"
          :loading="loading"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
