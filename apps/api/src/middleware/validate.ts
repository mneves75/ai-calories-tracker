import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

type AnySchema = z.ZodTypeAny
type ValidationTarget = 'json' | 'query' | 'param'

function formatPath(path: PropertyKey[]) {
  return path.map((segment) => (typeof segment === 'symbol' ? segment.toString() : String(segment))).join('.')
}

function translateIssueMessage(message: string) {
  const normalized = message.trim()

  if (normalized.startsWith('Too small: expected number to be >=')) {
    const min = normalized.split('>=')[1]?.trim()
    return min ? `Valor deve ser maior ou igual a ${min}` : 'Valor abaixo do mínimo permitido'
  }

  if (normalized.startsWith('Too big: expected number to be <=')) {
    const max = normalized.split('<=')[1]?.trim()
    return max ? `Valor deve ser menor ou igual a ${max}` : 'Valor acima do máximo permitido'
  }

  if (normalized.startsWith('Too small: expected string to have >=')) {
    return 'Texto menor que o mínimo permitido'
  }

  if (normalized.startsWith('Too big: expected string to have <=')) {
    return 'Texto maior que o máximo permitido'
  }

  if (normalized.startsWith('Invalid string: must match pattern')) {
    return 'Formato inválido'
  }

  if (normalized === 'Invalid input') {
    return 'Valor inválido'
  }

  return normalized
}

function createValidator<T extends AnySchema>(target: ValidationTarget, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'Dados inválidos',
          details: result.error.issues.map((issue) => ({
            campo: formatPath(issue.path),
            mensagem: translateIssueMessage(issue.message),
          })),
        },
        422
      )
    }
  })
}

export function jsonValidator<T extends AnySchema>(schema: T) {
  return createValidator('json', schema)
}

export function queryValidator<T extends AnySchema>(schema: T) {
  return createValidator('query', schema)
}

export function paramValidator<T extends AnySchema>(schema: T) {
  return createValidator('param', schema)
}
