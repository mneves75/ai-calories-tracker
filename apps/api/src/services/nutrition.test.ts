import { describe, expect, it } from 'bun:test'
import { calculateDailyGoals } from './nutrition'

describe('calculateDailyGoals', () => {
  it('calcula metas coerentes para perfil masculino moderado', () => {
    const goals = calculateDailyGoals({
      sex: 'male',
      weightKg: 80,
      heightCm: 180,
      ageYears: 30,
      activityLevel: 'moderate',
      goalType: 'maintain',
    })

    expect(goals.dailyCalorieGoal).toBeGreaterThan(2000)
    expect(goals.dailyProteinGoal).toBeGreaterThan(0)
    expect(goals.dailyCarbsGoal).toBeGreaterThan(0)
    expect(goals.dailyFatGoal).toBeGreaterThan(0)
  })

  it('aplica piso de 1200 kcal para cenários extremos', () => {
    const goals = calculateDailyGoals({
      sex: 'female',
      weightKg: 35,
      heightCm: 140,
      ageYears: 70,
      activityLevel: 'sedentary',
      goalType: 'lose',
    })

    expect(goals.dailyCalorieGoal).toBe(1200)
  })
})
