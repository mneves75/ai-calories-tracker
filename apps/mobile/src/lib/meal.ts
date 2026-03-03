import type { Confidence, MealRecord, MealType, NutritionTotals } from '../types/domain'

export const mealTypeLabels: Record<MealType, string> = {
  breakfast: 'Café da manhã',
  lunch: 'Almoço',
  dinner: 'Jantar',
  snack: 'Lanche',
}

export function groupMealsByType(meals: MealRecord[]) {
  return meals.reduce<Record<MealType, MealRecord[]>>(
    (acc, meal) => {
      acc[meal.mealType].push(meal)
      return acc
    },
    {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    }
  )
}

export function scaleTotalsByCalories(totals: NutritionTotals, targetCalories: number) {
  const safeCalories = Math.max(0, targetCalories)
  if (totals.calories <= 0) {
    return {
      calories: safeCalories,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
    }
  }

  const ratio = safeCalories / totals.calories
  return {
    calories: safeCalories,
    protein: Number((totals.protein * ratio).toFixed(1)),
    carbs: Number((totals.carbs * ratio).toFixed(1)),
    fat: Number((totals.fat * ratio).toFixed(1)),
  }
}

export function confidenceLabel(confidence: Confidence) {
  switch (confidence) {
    case 'high':
      return 'Alta'
    case 'medium':
      return 'Média'
    case 'low':
      return 'Baixa'
    default:
      return 'Desconhecida'
  }
}

export function confidenceClassName(confidence: Confidence) {
  switch (confidence) {
    case 'high':
      return 'bg-emerald-500/20 text-emerald-300'
    case 'medium':
      return 'bg-amber-500/20 text-amber-300'
    case 'low':
      return 'bg-red-500/20 text-red-300'
    default:
      return 'bg-zinc-500/20 text-zinc-200'
  }
}
