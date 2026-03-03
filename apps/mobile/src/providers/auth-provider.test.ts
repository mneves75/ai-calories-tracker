import { describe, expect, it } from 'bun:test'
import { ApiError } from '../lib/api'
import { clearSessionWhenInvalidError } from './session-guards'

describe('auth provider session recovery', () => {
  it('limpa sessão quando recebe erro 401', async () => {
    let clearCalls = 0

    const recovered = await clearSessionWhenInvalidError(
      new ApiError('Sua sessão expirou.', 401),
      async () => {
        clearCalls += 1
      }
    )

    expect(recovered).toBe(true)
    expect(clearCalls).toBe(1)
  })

  it('não limpa sessão para erro não relacionado à autenticação', async () => {
    let clearCalls = 0

    const recovered = await clearSessionWhenInvalidError(
      new ApiError('Dados inválidos.', 422),
      async () => {
        clearCalls += 1
      }
    )

    expect(recovered).toBe(false)
    expect(clearCalls).toBe(0)
  })

  it('limpa sessão quando recebe 403 com código de sessão inválida', async () => {
    let clearCalls = 0

    const recovered = await clearSessionWhenInvalidError(
      new ApiError('Sessão expirada', 403, { code: 'SESSION_EXPIRED' }),
      async () => {
        clearCalls += 1
      }
    )

    expect(recovered).toBe(true)
    expect(clearCalls).toBe(1)
  })
})
