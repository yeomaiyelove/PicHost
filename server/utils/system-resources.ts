import { readFileSync } from 'node:fs'
import { totalmem } from 'node:os'

export const LOW_MEMORY_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024

export function isLowMemory(bytes: number): boolean {
  return bytes > 0 && bytes < LOW_MEMORY_THRESHOLD_BYTES
}

function readCgroupMemoryLimit(): number | null {
  for (const path of [
    '/sys/fs/cgroup/memory.max',
    '/sys/fs/cgroup/memory/memory.limit_in_bytes'
  ]) {
    try {
      const raw = readFileSync(path, 'utf8').trim()
      if (!raw || raw === 'max') continue
      const value = Number(raw)
      if (Number.isFinite(value) && value > 0) return value
    } catch {
      // The current platform may not use cgroup memory limits.
    }
  }
  return null
}

export function detectSystemMemory(): {
  totalBytes: number
  lowMemory: boolean
  thresholdBytes: number
} {
  const hostMemory = totalmem()
  const cgroupLimit = readCgroupMemoryLimit()
  const totalBytes = cgroupLimit
    ? Math.min(hostMemory, cgroupLimit)
    : hostMemory
  return {
    totalBytes,
    lowMemory: isLowMemory(totalBytes),
    thresholdBytes: LOW_MEMORY_THRESHOLD_BYTES
  }
}
