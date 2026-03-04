import { describe, expect, it } from 'bun:test'
import { purgeExpiredMealIdempotencyKeys } from './idempotency-gc'

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
})
