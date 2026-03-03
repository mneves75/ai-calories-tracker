import { Hono } from 'hono'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { authMiddleware } from '../middleware/auth'
import { jsonValidator, queryValidator } from '../middleware/validate'
import { calculateDailyGoals } from '../services/nutrition'
import { getDateForTimezone, normalizeIanaTimezone } from '../lib/timezone'
import * as schema from '../db/schema'
import type { Env } from '../types'

type UserEnv = {
  Bindings: Env
  Variables: {
    user: { id: string; email: string; name: string }
  }
}

const userRoutes = new Hono<UserEnv>()
userRoutes.use('/*', authMiddleware)

// GET /users/me -- Get user profile
userRoutes.get('/me', async (c) => {
  const userId = c.var.user.id
  const db = drizzle(c.env.DB, { schema })

  const [profile] = await db.select()
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, userId))

  return c.json({
    user: c.var.user,
    profile: profile ?? null,
    hasCompletedOnboarding: !!profile,
  })
})

// POST /users/onboarding -- Complete onboarding
const onboardingSchema = z.object({
  sex: z.enum(['male', 'female']),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(300),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
  goalType: z.enum(['lose', 'maintain', 'gain']),
  timezone: z.string().min(1).max(100),
})

userRoutes.post('/onboarding', jsonValidator(onboardingSchema), async (c) => {
  const data = c.req.valid('json')
  const userId = c.var.user.id
  const db = drizzle(c.env.DB, { schema })

  // Calculate age
  const birthDate = new Date(data.birthDate)
  const today = new Date()
  let ageYears = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    ageYears--
  }

  // Calculate goals using Mifflin-St Jeor
  const goals = calculateDailyGoals({
    sex: data.sex,
    weightKg: data.weightKg,
    heightCm: data.heightCm,
    ageYears,
    activityLevel: data.activityLevel,
    goalType: data.goalType,
  })

  const normalizedTimezone = normalizeIanaTimezone(data.timezone)
  if (!normalizedTimezone) {
    return c.json({
      error: 'Timezone inválido',
      code: 'TIMEZONE_INVALID',
    }, 400)
  }

  const [profile] = await db.insert(schema.userProfiles).values({
    userId,
    userTimezone: normalizedTimezone,
    sex: data.sex,
    birthDate: data.birthDate,
    heightCm: data.heightCm,
    weightKg: data.weightKg,
    activityLevel: data.activityLevel,
    goalType: data.goalType,
    ...goals,
  }).onConflictDoUpdate({
    target: schema.userProfiles.userId,
    set: {
      sex: data.sex,
      birthDate: data.birthDate,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      activityLevel: data.activityLevel,
      goalType: data.goalType,
      userTimezone: normalizedTimezone,
      timezoneUpdatedAt: new Date(),
      ...goals,
      updatedAt: new Date(),
    },
  }).returning()

  return c.json({ profile, goals })
})

// GET /users/dashboard?date=YYYY-MM-DD -- Dashboard data
const dashboardQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

userRoutes.get('/dashboard', queryValidator(dashboardQuerySchema), async (c) => {
  const userId = c.var.user.id
  const { date } = c.req.valid('query')
  const db = drizzle(c.env.DB, { schema })

  const [profile] = await db.select()
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, userId))

  let selectedDate = date
  if (!selectedDate) {
    const timezone = profile?.userTimezone
    if (!timezone) {
      return c.json({
        error: 'Timezone do usuário não configurado',
        code: 'TIMEZONE_REQUIRED',
      }, 428)
    }
    selectedDate = getDateForTimezone(timezone)
  }
  const resolvedDate = selectedDate

  const [summary] = await db.select()
    .from(schema.dailySummaries)
    .where(
      and(
        eq(schema.dailySummaries.userId, userId),
        eq(schema.dailySummaries.date, resolvedDate)
      )
    )

  const meals = await db.select()
    .from(schema.meals)
    .where(
      and(
        eq(schema.meals.userId, userId),
        eq(schema.meals.localDate, resolvedDate),
        isNull(schema.meals.deletedAt)
      )
    )

  return c.json({
    date: resolvedDate,
    profile: profile ?? null,
    summary: summary ?? { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, mealsCount: 0 },
    meals,
    goals: profile ? {
      calories: profile.dailyCalorieGoal,
      protein: profile.dailyProteinGoal,
      carbs: profile.dailyCarbsGoal,
      fat: profile.dailyFatGoal,
    } : null,
  })
})

const timezoneSchema = z.object({
  timezone: z.string().min(1).max(100),
})

userRoutes.patch('/timezone', jsonValidator(timezoneSchema), async (c) => {
  const userId = c.var.user.id
  const { timezone } = c.req.valid('json')
  const normalizedTimezone = normalizeIanaTimezone(timezone)
  if (!normalizedTimezone) {
    return c.json({
      error: 'Timezone inválido',
      code: 'TIMEZONE_INVALID',
    }, 400)
  }

  const db = drizzle(c.env.DB, { schema })
  const [profile] = await db.update(schema.userProfiles)
    .set({
      userTimezone: normalizedTimezone,
      timezoneUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.userProfiles.userId, userId))
    .returning()

  if (!profile) {
    return c.json({
      error: 'Finalize o onboarding antes de atualizar timezone',
      code: 'ONBOARDING_REQUIRED',
    }, 409)
  }

  return c.json({ profile })
})

export { userRoutes }
