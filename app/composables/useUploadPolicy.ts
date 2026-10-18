interface UploadPolicy {
  allowedMimeTypes: string[]
  allowedVideoExtensions: string[]
  forbiddenFileExtensions: string[]
  imageMaxFileSizeMb: number
  videoMaxFileSizeMb: number
  fileMaxFileSizeMb: number
}

const policy = ref<UploadPolicy | null>(null)
const loading = ref(false)
let pending: Promise<UploadPolicy> | null = null

export function useUploadPolicy() {
  async function load(force = false): Promise<UploadPolicy> {
    if (policy.value && !force) return policy.value
    if (pending && !force) return pending

    loading.value = true
    pending = $fetch<UploadPolicy>('/api/upload-policy', {
      credentials: 'include'
    })
      .then((data) => {
        policy.value = {
          allowedMimeTypes: [...data.allowedMimeTypes],
          allowedVideoExtensions: [...data.allowedVideoExtensions],
          forbiddenFileExtensions: [...data.forbiddenFileExtensions],
          imageMaxFileSizeMb: data.imageMaxFileSizeMb,
          videoMaxFileSizeMb: data.videoMaxFileSizeMb,
          fileMaxFileSizeMb: data.fileMaxFileSizeMb
        }
        return policy.value
      })
      .finally(() => {
        loading.value = false
        pending = null
      })
    return pending
  }

  return {
    policy,
    loading,
    load
  }
}
