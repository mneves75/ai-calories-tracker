export type Env = {
  DB: D1Database
  R2?: R2Bucket
  GEMINI_API_KEY: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  ENVIRONMENT: 'local' | 'development' | 'test' | 'staging' | 'production'
  MAINTENANCE_TOKEN?: string
  MEDIA_GC_ALERT_THRESHOLD?: string
  IDEMPOTENCY_IN_PROGRESS_ALERT_THRESHOLD?: string
  IDEMPOTENCY_IN_PROGRESS_STALE_MS?: string
}
