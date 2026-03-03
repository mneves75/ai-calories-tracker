import { isSessionInvalidApiError } from '../lib/api'

export async function clearSessionWhenInvalidError(
  error: unknown,
  clearSession: () => Promise<void>
) {
  if (!isSessionInvalidApiError(error)) {
    return false
  }

  await clearSession()
  return true
}
