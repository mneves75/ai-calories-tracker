import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

type ProblemPayload = {
  type?: string
  title: string
  status: ContentfulStatusCode
  detail?: string
  instance?: string
  code?: string
}

type ProblemExtensions = Record<string, unknown>

// RFC 9457-compatible error envelope with backward-compatible `error` field.
export function problem(
  c: Context,
  payload: ProblemPayload,
  extensions?: ProblemExtensions
) {
  const body = {
    type: payload.type ?? 'about:blank',
    title: payload.title,
    status: payload.status,
    detail: payload.detail,
    instance: payload.instance ?? c.req.path,
    code: payload.code,
    error: payload.detail ?? payload.title,
    ...extensions,
  }

  return c.json(body, payload.status, {
    'content-type': 'application/problem+json; charset=utf-8',
  })
}
