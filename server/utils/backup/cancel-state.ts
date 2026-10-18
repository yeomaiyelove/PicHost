interface JobCancellationState {
  requested: Set<string>
  controllers: Map<string, AbortController>
}

const CANCELLED_CODE = 'JOB_CANCELLED'

const state = (globalThis as typeof globalThis & {
  __pichostJobCancellationState?: JobCancellationState
}).__pichostJobCancellationState ?? {
  requested: new Set<string>(),
  controllers: new Map<string, AbortController>()
}
;(globalThis as typeof globalThis & {
  __pichostJobCancellationState?: JobCancellationState
}).__pichostJobCancellationState = state

export function createJobCancelledError(): Error {
  const error = new Error('任务已取消')
  error.name = CANCELLED_CODE
  return error
}

export function isJobCancelledError(error: unknown): boolean {
  return error instanceof Error && error.name === CANCELLED_CODE
}

export function beginJobCancellationScope(jobId: string): void {
  state.requested.delete(jobId)
  state.controllers.get(jobId)?.abort()
  state.controllers.set(jobId, new AbortController())
}

export function endJobCancellationScope(jobId: string): void {
  state.controllers.delete(jobId)
  state.requested.delete(jobId)
}

export function requestJobCancellation(jobId: string): void {
  state.requested.add(jobId)
  state.controllers.get(jobId)?.abort(createJobCancelledError())
}

export function isJobCancellationRequested(jobId: string): boolean {
  return state.requested.has(jobId)
}

export function getJobAbortSignal(jobId: string): AbortSignal {
  return state.controllers.get(jobId)?.signal ?? new AbortController().signal
}

export function getJobOperationSignal(
  jobId: string,
  timeoutMs: number
): AbortSignal {
  return AbortSignal.any([
    getJobAbortSignal(jobId),
    AbortSignal.timeout(timeoutMs)
  ])
}

export function throwIfJobCancellationRequested(jobId: string): void {
  if (isJobCancellationRequested(jobId)) throw createJobCancelledError()
}
