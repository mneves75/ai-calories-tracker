import { sqliteTable, text, real, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

// better-auth managed tables
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id),
})

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

// Application tables
export const userProfiles = sqliteTable('user_profiles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id).unique(),
  userTimezone: text('user_timezone').notNull().default('UTC'), // IANA timezone
  sex: text('sex', { enum: ['male', 'female'] }).notNull(),
  birthDate: text('birth_date').notNull(), // YYYY-MM-DD
  heightCm: real('height_cm').notNull(),
  weightKg: real('weight_kg').notNull(),
  activityLevel: text('activity_level', {
    enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
  }).notNull().default('moderate'),
  goalType: text('goal_type', { enum: ['lose', 'maintain', 'gain'] }).notNull(),
  dailyCalorieGoal: real('daily_calorie_goal').notNull(),
  dailyProteinGoal: real('daily_protein_goal'),
  dailyCarbsGoal: real('daily_carbs_goal'),
  dailyFatGoal: real('daily_fat_goal'),
  timezoneUpdatedAt: integer('timezone_updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
})

export const meals = sqliteTable('meals', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  imageKey: text('image_key'), // R2 object key
  mealType: text('meal_type', { enum: ['breakfast', 'lunch', 'dinner', 'snack'] }).notNull(),
  name: text('name').notNull(), // User-facing meal name
  calories: real('calories').notNull(),
  protein: real('protein').notNull(),
  carbs: real('carbs').notNull(),
  fat: real('fat').notNull(),
  foodsDetected: text('foods_detected'), // JSON array of identified foods
  aiConfidence: text('ai_confidence', { enum: ['high', 'medium', 'low'] }),
  isManualEntry: integer('is_manual_entry', { mode: 'boolean' }).notNull().default(false),
  localDate: text('local_date').notNull(), // YYYY-MM-DD from client timezone
  loggedAt: text('logged_at').notNull(), // ISO string
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }), // soft delete
}, (table) => [
  index('meals_user_date_deleted_logged_idx').on(table.userId, table.localDate, table.deletedAt, table.loggedAt),
])

export const mealIdempotencyKeys = sqliteTable('meal_idempotency_keys', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  idempotencyKey: text('idempotency_key').notNull(),
  requestHash: text('request_hash').notNull(),
  state: text('state', { enum: ['in_progress', 'completed'] }).notNull().default('in_progress'),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  mealId: text('meal_id').references(() => meals.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date(Date.now() + 24 * 60 * 60 * 1000)),
}, (table) => [
  uniqueIndex('meal_idempotency_user_key_idx').on(table.userId, table.idempotencyKey),
  index('meal_idempotency_created_at_idx').on(table.createdAt),
  index('meal_idempotency_expires_at_idx').on(table.expiresAt),
  index('meal_idempotency_state_updated_idx').on(table.state, table.updatedAt),
])

export const dailySummaries = sqliteTable('daily_summaries', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  date: text('date').notNull(), // YYYY-MM-DD
  totalCalories: real('total_calories').notNull().default(0),
  totalProtein: real('total_protein').notNull().default(0),
  totalCarbs: real('total_carbs').notNull().default(0),
  totalFat: real('total_fat').notNull().default(0),
  mealsCount: integer('meals_count').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('daily_summaries_user_date_idx').on(table.userId, table.date),
])

export const analysisEvents = sqliteTable('analysis_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  localDate: text('local_date').notNull(), // YYYY-MM-DD from client timezone
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('analysis_events_user_date_idx').on(table.userId, table.localDate),
])

export const mediaObjects = sqliteTable('media_objects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  imageKey: text('image_key').notNull(),
  mealId: text('meal_id').references(() => meals.id),
  status: text('status', {
    enum: ['uploaded', 'attached', 'pending_delete', 'delete_failed', 'deleted'],
  }).notNull().default('uploaded'),
  uploadedAt: integer('uploaded_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  attachedAt: integer('attached_at', { mode: 'timestamp_ms' }),
  deleteAfter: integer('delete_after', { mode: 'timestamp_ms' }),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastError: text('last_error'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('media_objects_image_key_idx').on(table.imageKey),
  index('media_objects_status_delete_after_idx').on(table.status, table.deleteAfter),
  index('media_objects_user_status_idx').on(table.userId, table.status),
])

export const authRateLimits = sqliteTable('auth_rate_limits', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text('key').notNull(),
  windowStart: integer('window_start').notNull(), // unix ms minute bucket
  attempts: integer('attempts').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('auth_rate_limits_key_window_idx').on(table.key, table.windowStart),
  index('auth_rate_limits_window_idx').on(table.windowStart),
])
