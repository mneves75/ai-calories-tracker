export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type Confidence = 'high' | 'medium' | 'low'

export type AuthUser = {
  id: string
  name: string
  email: string
  image?: string | null
  createdAt?: string
  updatedAt?: string
}

export type UserProfile = {
  id: string
  userId: string
  userTimezone: string
  sex: 'male' | 'female'
  birthDate: string
  heightCm: number
  weightKg: number
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
  goalType: 'lose' | 'maintain' | 'gain'
  dailyCalorieGoal: number
  dailyProteinGoal: number
  dailyCarbsGoal: number
  dailyFatGoal: number
  timezoneUpdatedAt?: string | number
}

export type FoodItem = {
  name: string
  portion: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type NutritionTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type AnalysisResponse = {
  analysis: {
    imageKey: string | null
    analysisToken: string
    mealType: MealType
    localDate: string
    mealName: string
    foods: FoodItem[]
    totals: NutritionTotals
    confidence: Confidence
  }
}

export type MealRecord = {
  id: string
  userId: string
  imageKey: string | null
  mealType: MealType
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  foodsDetected: string | null
  aiConfidence: Confidence | null
  isManualEntry: boolean
  localDate: string
  loggedAt: string
  deletedAt: string | null
}

export type DailySummary = {
  id: string
  userId: string
  date: string
  totalCalories: number
  totalProtein: number
  totalCarbs: number
  totalFat: number
  mealsCount: number
}

export type DashboardResponse = {
  date: string
  profile: UserProfile | null
  summary: DailySummary
  meals: MealRecord[]
  goals: {
    calories: number
    protein: number
    carbs: number
    fat: number
  } | null
}

export type MeResponse = {
  user: AuthUser
  profile: UserProfile | null
  hasCompletedOnboarding: boolean
}

export type HistoryResponse = {
  history: DailySummary[]
}
