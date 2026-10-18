<script setup lang="ts">
const props = defineProps<{
  src?: string
  alt: string
}>()

const failed = ref(false)

watch(() => props.src, () => {
  failed.value = false
})
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    :alt="alt"
    loading="lazy"
    class="size-full object-cover object-center"
    @error="failed = true"
  >
  <img
    v-else
    src="/video-placeholder.svg"
    :alt="alt"
    loading="lazy"
    class="size-full object-cover object-center"
  >
</template>
