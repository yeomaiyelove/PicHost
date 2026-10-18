import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSiteSyncJson, retrySiteSyncOperation } from './runner'
import {
  beginJobCancellationScope,
  endJobCancellationScope,
  getJobAbortSignal,
  requestJobCancellation
} from '../backup/cancel-state'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchSiteSyncJson', () => {
  it('retries a broken connection up to three attempts', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSiteSyncJson('http://target/api', 'token')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries client errors because every sync failure gets three attempts', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      new Response('{"message":"invalid"}', {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    ))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSiteSyncJson('http://target/api', 'token')).rejects.toThrow('invalid')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('fails after three server errors', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      new Response('{"message":"unavailable"}', {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      })
    ))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSiteSyncJson('http://target/api', 'token')).rejects.toThrow('unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries local sync failures and stops after the third attempt', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('database is busy'))

    await expect(retrySiteSyncOperation(operation)).rejects.toThrow('database is busy')
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('stops retrying immediately when the job is cancelled', async () => {
    const jobId = 'cancel-test'
    beginJobCancellationScope(jobId)
    const operation = vi.fn().mockImplementation(() => (
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('connection reset')), 1000)
      })
    ))
    const result = retrySiteSyncOperation(operation, getJobAbortSignal(jobId))

    setTimeout(() => requestJobCancellation(jobId), 25)

    await expect(result).rejects.toThrow('任务已取消')
    expect(operation).toHaveBeenCalledTimes(1)
    endJobCancellationScope(jobId)
  })

  it('reports every retry attempt and backoff to the job status', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
      .mockResolvedValueOnce(new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
    vi.stubGlobal('fetch', fetchMock)
    const statuses: Array<{
      attempt: number
      phase: string
      delayMs?: number
    }> = []

    await expect(fetchSiteSyncJson(
      'http://target/api',
      'token',
      undefined,
      undefined,
      status => statuses.push(status)
    )).resolves.toEqual({ ok: true })

    expect(
      statuses
        .filter(status => status.phase !== 'countdown')
        .map(status => `${status.phase}:${status.attempt}`)
    ).toEqual([
      'attempt:1',
      'retry:1',
      'attempt:2'
    ])
    expect(
      statuses.find(status => status.phase === 'retry')?.delayMs
    ).toBe(0)
  })
})
