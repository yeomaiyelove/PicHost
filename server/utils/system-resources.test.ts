import { describe, expect, it } from 'vitest'
import {
  detectSystemMemory,
  isLowMemory,
  LOW_MEMORY_THRESHOLD_BYTES
} from './system-resources'

describe('system resource detection', () => {
  it('treats machines below 2 GB as low memory', () => {
    expect(isLowMemory(1024 * 1024 * 1024)).toBe(true)
    expect(isLowMemory(LOW_MEMORY_THRESHOLD_BYTES - 1)).toBe(true)
  })

  it('does not flag machines at or above 2 GB', () => {
    expect(isLowMemory(LOW_MEMORY_THRESHOLD_BYTES)).toBe(false)
    expect(isLowMemory(4 * 1024 * 1024 * 1024)).toBe(false)
  })

  it('returns usable current memory information', () => {
    const memory = detectSystemMemory()
    expect(memory.totalBytes).toBeGreaterThan(0)
    expect(memory.thresholdBytes).toBe(LOW_MEMORY_THRESHOLD_BYTES)
  })
})
