import { describe, expect, it } from 'bun:test'
import { getIdempotencyHealthStatus, purgeExpiredMealIdempotencyKeys } from './idempotency-gc'

describe('idempotency GC', () => {
  it('remove chaves idempotentes expiradas e retorna total removido', async () => {
    let executedSql = ''
    let executedParam: unknown = null

    const db = {
      prepare(sql: string) {
        executedSql = sql
        return {
          bind(param: unknown) {
            executedParam = param
            return {
              async run() {
                return { meta: { changes: 3 } }
              },
            }
          },
        }
      },
    } as unknown as D1Database

    const now = Date.now()
    const removed = await purgeExpiredMealIdempotencyKeys(db, now)

    expect(removed).toBe(3)
    expect(executedSql.toLowerCase()).toContain('delete from meal_idempotency_keys')
    expect(executedParam).toBe(now)
  })

  it('retorna zero quando meta.changes não existe', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return {
              async run() {
                return {}
              },
            }
          },
        }
      },
    } as unknown as D1Database

    const removed = await purgeExpiredMealIdempotencyKeys(db, Date.now())
    expect(removed).toBe(0)
  })

  it('retorna métricas de saúde de idempotência', async () => {
    const db = {
      prepare(sql: string) {
        expect(sql.toLowerCase()).toContain('from meal_idempotency_keys')
        return {
          bind(...params: unknown[]) {
            expect(params.length).toBe(5)
            return {
              async first() {
                return {
                  inProgress: 3,
                  staleInProgress: 1,
                  completedNotExpired: 10,
                  expired: 2,
                }
              },
            }
          },
        }
      },
    } as unknown as D1Database

    const status = await getIdempotencyHealthStatus(db, 1_700_000_000_000, 120_000)

    expect(status).toEqual({
      inProgress: 3,
      staleInProgress: 1,
      completedNotExpired: 10,
      expired: 2,
    })
  })

  it('normaliza staleInProgressMs inválido para fallback seguro', async () => {
    let capturedParams: unknown[] = []
    const now = 1_700_000_000_000

    const db = {
      prepare() {
        return {
          bind(...params: unknown[]) {
            capturedParams = params
            return {
              async first() {
                return {
                  inProgress: 0,
                  staleInProgress: 0,
                  completedNotExpired: 0,
                  expired: 0,
                }
              },
            }
          },
        }
      },
    } as unknown as D1Database

    await getIdempotencyHealthStatus(db, now, Number.NaN)
    expect(capturedParams).toEqual([now, now, now - 120_000, now, now])
  })

  it('coage valores inválidos/nulos para zero', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                return {
                  inProgress: null,
                  staleInProgress: 'x',
                  completedNotExpired: undefined,
                  expired: -1,
                }
              },
            }
          },
        }
      },
    } as unknown as D1Database

    const status = await getIdempotencyHealthStatus(db, 1_700_000_000_000, 120_000)
    expect(status).toEqual({
      inProgress: 0,
      staleInProgress: 0,
      completedNotExpired: 0,
      expired: 0,
    })
  })
})
