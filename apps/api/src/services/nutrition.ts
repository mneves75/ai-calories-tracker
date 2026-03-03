type GoalType = 'lose' | 'maintain' | 'gain'
type Sex = 'male' | 'female'
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

const GOAL_ADJUSTMENTS: Record<GoalType, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
}

export function calculateDailyGoals(params: {
  sex: Sex
  weightKg: number
  heightCm: number
  ageYears: number
  activityLevel: ActivityLevel
  goalType: GoalType
}) {
  const { sex, weightKg, heightCm, ageYears, activityLevel, goalType } = params

  // Mifflin-St Jeor equation
  let bmr: number
  if (sex === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161
  }

  const tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel]
  const dailyCalories = Math.round(tdee + GOAL_ADJUSTMENTS[goalType])

  // Macro distribution: 30% protein, 40% carbs, 30% fat
  const proteinCals = dailyCalories * 0.3
  const carbsCals = dailyCalories * 0.4
  const fatCals = dailyCalories * 0.3

  return {
    dailyCalorieGoal: Math.max(1200, dailyCalories), // Floor at 1200 for safety
    dailyProteinGoal: Math.round(proteinCals / 4), // 4 cal/g protein
    dailyCarbsGoal: Math.round(carbsCals / 4), // 4 cal/g carbs
    dailyFatGoal: Math.round(fatCals / 9), // 9 cal/g fat
  }
}
