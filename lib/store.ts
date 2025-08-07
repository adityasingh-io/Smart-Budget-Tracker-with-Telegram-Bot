import { create } from 'zustand'
import { 
  startOfMonth, 
  endOfMonth, 
  differenceInDays, 
  format,
  startOfDay,
  endOfDay,
  isWeekend,
  subDays
} from 'date-fns'
import { supabase } from './supabase'
import { telegram } from './telegram'

interface Expense {
  id: string
  amount: number
  category: string
  subcategory: string
  description: string
  tags: string[]
  date: string
  isFake?: boolean
}

interface Category {
  id: string
  name: string
  subcategories: string[]
  budget: number
}

interface Settings {
  currency: string
  totalSalary: number
  personalBudget: number
  salaryDay: number
  dailyFoodBudget: number
  categoryBudgets: Record<string, number>
  privacyMode: boolean
  darkMode: boolean
}

interface Store {
  expenses: Expense[]
  categories: Category[]
  settings: Settings
  savingsGoals: any[]
  initialized: boolean
  loading: boolean
  profileId: string | null
  
  initialize: () => Promise<void>
  addExpense: (expense: Omit<Expense, 'id'>) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  updateExpense: (id: string, expense: Partial<Expense>) => Promise<void>
  updateSettings: (settings: Partial<Settings>) => Promise<void>
  refreshData: () => Promise<void>
  
  getTotalSpent: () => number
  getRemainingBudget: () => number
  getCategorySpending: (category: string) => number
  getTodaySpending: () => number
  getPaydayCountdown: () => number
  getInsights: () => any
  getDailyBudget: () => number
  getProjectedMonthEnd: () => number
  
  getFiscalMonthBounds: () => { fiscalStart: Date; fiscalEnd: Date }
  getDaysInFiscalMonth: () => number
  getDaysPassedInFiscalMonth: () => number
  getDaysLeftInFiscalMonth: () => number
}

export const useStore = create<Store>((set, get) => ({
  expenses: [],
  categories: [],
  settings: {
    currency: '₹',
    totalSalary: 100000,
    personalBudget: 35000,
    salaryDay: 7,
    dailyFoodBudget: 400,
    categoryBudgets: {
      'Food': 12000,
      'Travel': 1600,
      'Miscellaneous': 5000,
      'Alcohol': 5000,
      'Other': 11400,
    },
    privacyMode: true,
    darkMode: false,
  },
  savingsGoals: [],
  initialized: false,
  loading: false,
  profileId: null,

  initialize: async () => {
    set({ loading: true })
    
    try {
      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .single()
  
      if (profileError || !profile) {
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            currency: '₹',
            total_salary: 100000,
            personal_budget: 35000,
            salary_day: 7,
            daily_food_budget: 400,
            privacy_mode: true,
            dark_mode: false
          })
          .select()
          .single()
  
        if (createError) throw createError
        profile = newProfile
      }
  
      // Calculate which month's salary we need (based on fiscal month)
      const today = new Date()
      const currentDay = today.getDate()
      const salaryDay = profile.salary_day || 7
      
      let fiscalStart: Date
      let fiscalMonth: Date // The month we need salary data for
      
      if (currentDay >= salaryDay) {
        fiscalStart = new Date(today.getFullYear(), today.getMonth(), salaryDay, 0, 0, 0)
        fiscalMonth = new Date(today.getFullYear(), today.getMonth(), 1) // Current month
      } else {
        fiscalStart = new Date(today.getFullYear(), today.getMonth() - 1, salaryDay, 0, 0, 0)
        fiscalMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1) // Previous month
      }
      
      // IMPORTANT: Fetch from monthly_salaries table!
      console.log('🔍 FETCHING MONTHLY SALARY FOR:', format(fiscalMonth, 'yyyy-MM'))
      
      let actualSalary = profile.total_salary || 100000 // fallback
      let actualBudget = profile.personal_budget || 35000 // fallback
      
      try {
        const { data: monthlySalary, error: salaryError } = await supabase
          .from('monthly_salaries')
          .select('*')
          .eq('profile_id', profile.id)
          .eq('month', format(fiscalMonth, 'yyyy-MM') + '-01') // Format: YYYY-MM-01
          .single()
        
        if (monthlySalary && !salaryError) {
          actualSalary = monthlySalary.total_salary
          actualBudget = monthlySalary.personal_budget
          console.log('✅ Found monthly salary:', monthlySalary)
          console.log('Using salary:', actualSalary, 'budget:', actualBudget)
        } else {
          console.log('⚠️ No monthly salary found for', format(fiscalMonth, 'yyyy-MM'))
          console.log('Creating monthly salary entry with defaults...')
          
          // Create monthly_salaries entry if it doesn't exist
          const { data: newMonthlySalary, error: createSalaryError } = await supabase
            .from('monthly_salaries')
            .insert({
              profile_id: profile.id,
              month: format(fiscalMonth, 'yyyy-MM') + '-01',
              total_salary: profile.total_salary || 100000,
              personal_budget: profile.personal_budget || 35000,
              notes: 'Auto-created from profile defaults'
            })
            .select()
            .single()
          
          if (newMonthlySalary && !createSalaryError) {
            actualSalary = newMonthlySalary.total_salary
            actualBudget = newMonthlySalary.personal_budget
            console.log('Created monthly salary entry:', newMonthlySalary)
          } else {
            console.log('Could not create monthly salary, using profile defaults')
          }
        }
      } catch (salaryFetchError) {
        console.error('Error fetching/creating monthly salary:', salaryFetchError)
        console.log('Using profile defaults as fallback')
      }
  
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('*')
        .eq('profile_id', profile.id)
        .order('name')
  
      if (catError) throw catError
  
      const { data: expenses, error: expError } = await supabase
        .from('expenses')
        .select(`
          *,
          categories (
            name,
            color,
            icon
          )
        `)
        .eq('profile_id', profile.id)
        .gte('expense_date', fiscalStart.toISOString())
        .order('expense_date', { ascending: false })
  
      if (expError) throw expError
  
      const mappedCategories = categories.map((c: any) => ({
        id: c.id,
        name: c.name,
        subcategories: c.subcategories || [],
        budget: c.budget_amount || 0,
      }))
  
      const mappedExpenses = expenses.map((e: any) => ({
        id: e.id,
        amount: parseFloat(e.amount),
        category: e.categories?.name || 'Other',
        subcategory: e.subcategory || '',
        description: e.description,
        tags: e.tags || [],
        date: e.expense_date,
        isFake: e.is_fake || false,
      }))
  
      const categoryBudgets = mappedCategories.reduce((acc: any, cat: any) => {
        acc[cat.name] = cat.budget
        return acc
      }, {})
  
      set({
        profileId: profile.id,
        settings: {
          currency: profile.currency || '₹',
          totalSalary: actualSalary, // FROM MONTHLY_SALARIES!
          personalBudget: actualBudget, // FROM MONTHLY_SALARIES!
          salaryDay: profile.salary_day || 7,
          dailyFoodBudget: profile.daily_food_budget || 400,
          categoryBudgets,
          privacyMode: profile.privacy_mode !== false,
          darkMode: profile.dark_mode || false,
        },
        expenses: mappedExpenses,
        categories: mappedCategories,
        initialized: true,
        loading: false,
      })
  
      console.log('🔍 SALARY DEBUG:')
      console.log('Fiscal month for salary:', format(fiscalMonth, 'yyyy-MM'))
      console.log('Fiscal start date:', format(fiscalStart, 'yyyy-MM-dd'))
      console.log('Monthly salary from DB:', actualSalary)
      console.log('Monthly budget from DB:', actualBudget)
      console.log('Profile fallback values:', {
        profileSalary: profile.total_salary,
        profileBudget: profile.personal_budget
      })
      console.log('✅ Store initialized with monthly_salaries data')
      
    } catch (error) {
      console.error('❌ Failed to initialize store:', error)
      set({ loading: false, initialized: false })
      throw error
    }
  },

  addExpense: async (expense) => {
    const { profileId, categories } = get()
    if (!profileId) throw new Error('No profile found')

    set({ loading: true })

    try {
      const category = categories.find(c => c.name === expense.category)
      
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          profile_id: profileId,
          category_id: category?.id || null,
          amount: expense.amount,
          description: expense.description,
          expense_date: expense.date || new Date().toISOString(),
          subcategory: expense.subcategory || null,
          tags: expense.tags || [],
          is_fake: expense.isFake || false,
          display_description: expense.isFake ? expense.description : null,
          payment_method: 'cash',
        })
        .select(`
          *,
          categories (
            name,
            color,
            icon
          )
        `)
        .single()

      if (error) throw error

      const newExpense: Expense = {
        id: data.id,
        amount: parseFloat(data.amount),
        category: data.categories?.name || expense.category,
        subcategory: data.subcategory || '',
        description: data.description,
        tags: data.tags || [],
        date: data.expense_date,
        isFake: data.is_fake || false,
      }

      set((state) => ({
        expenses: [newExpense, ...state.expenses],
        loading: false,
      }))

      console.log('✅ Expense added to Supabase')
      sendTelegramNotification(expense, get)

    } catch (error) {
      console.error('❌ Failed to add expense:', error)
      set({ loading: false })
      throw error
    }
  },

  deleteExpense: async (id) => {
    set({ loading: true })

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)

      if (error) throw error

      set((state) => ({
        expenses: state.expenses.filter(e => e.id !== id),
        loading: false,
      }))

      console.log('✅ Expense deleted from Supabase')
    } catch (error) {
      console.error('❌ Failed to delete expense:', error)
      set({ loading: false })
      throw error
    }
  },

  updateExpense: async (id, updates) => {
    const { categories } = get()
    set({ loading: true })

    try {
      const updateData: any = {}
      if (updates.amount !== undefined) updateData.amount = updates.amount
      if (updates.description !== undefined) updateData.description = updates.description
      if (updates.subcategory !== undefined) updateData.subcategory = updates.subcategory
      if (updates.tags !== undefined) updateData.tags = updates.tags
      if (updates.date !== undefined) updateData.expense_date = updates.date
      if (updates.isFake !== undefined) updateData.is_fake = updates.isFake
      
      if (updates.category !== undefined) {
        const category = categories.find(c => c.name === updates.category)
        if (category) updateData.category_id = category.id
      }

      const { data, error } = await supabase
        .from('expenses')
        .update(updateData)
        .eq('id', id)
        .select(`
          *,
          categories (
            name,
            color,
            icon
          )
        `)
        .single()

      if (error) throw error

      set((state) => ({
        expenses: state.expenses.map(e => 
          e.id === id 
            ? {
                id: data.id,
                amount: parseFloat(data.amount),
                category: data.categories?.name || 'Other',
                subcategory: data.subcategory || '',
                description: data.description,
                tags: data.tags || [],
                date: data.expense_date,
                isFake: data.is_fake || false,
              }
            : e
        ),
        loading: false,
      }))

      console.log('✅ Expense updated in Supabase')
    } catch (error) {
      console.error('❌ Failed to update expense:', error)
      set({ loading: false })
      throw error
    }
  },

  updateSettings: async (updates) => {
    const { profileId } = get()
    if (!profileId) throw new Error('No profile found')

    set({ loading: true })

    try {
      const updateData: any = {}
      if (updates.currency !== undefined) updateData.currency = updates.currency
      if (updates.totalSalary !== undefined) updateData.total_salary = updates.totalSalary
      if (updates.personalBudget !== undefined) updateData.personal_budget = updates.personalBudget
      if (updates.salaryDay !== undefined) updateData.salary_day = updates.salaryDay
      if (updates.dailyFoodBudget !== undefined) updateData.daily_food_budget = updates.dailyFoodBudget
      if (updates.privacyMode !== undefined) updateData.privacy_mode = updates.privacyMode
      if (updates.darkMode !== undefined) updateData.dark_mode = updates.darkMode

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', profileId)

      if (error) throw error

      set((state) => ({
        settings: { ...state.settings, ...updates },
        loading: false,
      }))

      console.log('✅ Settings updated in Supabase')
    } catch (error) {
      console.error('❌ Failed to update settings:', error)
      set({ loading: false })
      throw error
    }
  },

  refreshData: async () => {
    await get().initialize()
  },

  getFiscalMonthBounds: () => {
    const { settings } = get()
    const today = new Date()
    const currentDay = today.getDate()
    const currentMonth = today.getMonth()
    const currentYear = today.getFullYear()
    const salaryDay = settings.salaryDay || 7
    
    let fiscalStart: Date
    let fiscalEnd: Date
    
    if (currentDay >= salaryDay) {
      fiscalStart = new Date(currentYear, currentMonth, salaryDay, 0, 0, 0)
      fiscalEnd = new Date(currentYear, currentMonth + 1, salaryDay - 1, 23, 59, 59)
    } else {
      fiscalStart = new Date(currentYear, currentMonth - 1, salaryDay, 0, 0, 0)
      fiscalEnd = new Date(currentYear, currentMonth, salaryDay - 1, 23, 59, 59)
    }
    
    return { fiscalStart, fiscalEnd }
  },

  getDaysInFiscalMonth: () => {
    const { fiscalStart, fiscalEnd } = get().getFiscalMonthBounds()
    return Math.round((fiscalEnd.getTime() - fiscalStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
  },

  getDaysPassedInFiscalMonth: () => {
    const { fiscalStart } = get().getFiscalMonthBounds()
    const today = new Date()
    const daysPassed = Math.round((today.getTime() - fiscalStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
    return Math.max(1, daysPassed)
  },

  getTotalSpent: () => {
    const { expenses } = get()
    const { fiscalStart, fiscalEnd } = get().getFiscalMonthBounds()
    
    return expenses
      .filter(e => {
        const expenseDate = new Date(e.date)
        return expenseDate >= fiscalStart && expenseDate <= fiscalEnd
      })
      .reduce((sum, e) => sum + e.amount, 0)
  },

  getRemainingBudget: () => {
    const { settings } = get()
    return settings.personalBudget - get().getTotalSpent()
  },

  getCategorySpending: (category) => {
    const { expenses } = get()
    const { fiscalStart, fiscalEnd } = get().getFiscalMonthBounds()
    
    return expenses
      .filter(e => {
        const expenseDate = new Date(e.date)
        return expenseDate >= fiscalStart && expenseDate <= fiscalEnd && e.category === category
      })
      .reduce((sum, e) => sum + e.amount, 0)
  },

  getTodaySpending: () => {
    const { expenses } = get()
    const todayStart = startOfDay(new Date())
    const todayEnd = endOfDay(new Date())
    
    return expenses
      .filter(e => {
        const expenseDate = new Date(e.date)
        return expenseDate >= todayStart && expenseDate <= todayEnd
      })
      .reduce((sum, e) => sum + e.amount, 0)
  },

  getDailyBudget: () => {
    const { settings } = get()
    const daysInFiscalMonth = get().getDaysInFiscalMonth()
    // Original daily budget = total budget ÷ days in fiscal month
    return Math.floor(settings.personalBudget / daysInFiscalMonth)
  },

  getPaydayCountdown: () => {
    const { settings } = get()
    const today = new Date()
    const currentDay = today.getDate()
    const currentMonth = today.getMonth()
    const currentYear = today.getFullYear()
    const salaryDay = settings.salaryDay || 7
    
    let daysUntilPayday: number
    
    if (currentDay < salaryDay) {
      // Payday is later this month
      daysUntilPayday = salaryDay - currentDay
    } else if (currentDay === salaryDay) {
      // Today is payday - after noon calculate next month
      const hourOfDay = today.getHours()
      if (hourOfDay < 12) {
        daysUntilPayday = 0
      } else {
        const nextPayday = new Date(currentYear, currentMonth + 1, salaryDay)
        const msPerDay = 1000 * 60 * 60 * 24
        daysUntilPayday = Math.ceil((nextPayday.getTime() - today.getTime()) / msPerDay)
      }
    } else {
      // Payday passed - calculate to next month
      const nextPayday = new Date(currentYear, currentMonth + 1, salaryDay)
      const msPerDay = 1000 * 60 * 60 * 24
      daysUntilPayday = Math.ceil((nextPayday.getTime() - today.getTime()) / msPerDay)
    }
    
    return Math.max(0, Math.min(31, daysUntilPayday))
  },

  getDaysLeftInFiscalMonth: () => {
    // Days left in fiscal month = days until payday
    return get().getPaydayCountdown()
  },

  getProjectedMonthEnd: () => {
    const totalSpent = get().getTotalSpent()
    const remaining = get().getRemainingBudget()
    const { settings } = get()
    const daysPassed = get().getDaysPassedInFiscalMonth()
    const daysUntilPayday = get().getPaydayCountdown()
    
    // If over budget, can't spend more
    if (remaining <= 0) {
      return totalSpent
    }
    
    // If first day of month
    if (daysPassed === 0 || totalSpent === 0) {
      return 0
    }
    
    // Calculate daily average spending so far
    const dailyAverage = totalSpent / daysPassed
    
    // If continuing at current pace
    const projectedAdditionalSpending = dailyAverage * daysUntilPayday
    const projectedTotal = totalSpent + projectedAdditionalSpending
    
    // Cap at budget (can't project more than budget allows)
    return Math.min(Math.round(projectedTotal), settings.personalBudget)
  },

  getInsights: () => {
    const { expenses, settings } = get()
    const today = new Date()
    const { fiscalStart, fiscalEnd } = get().getFiscalMonthBounds()
    
    const monthExpenses = expenses.filter(e => {
      const expenseDate = new Date(e.date)
      return expenseDate >= fiscalStart && expenseDate <= fiscalEnd
    })
    
    // Core calculations
    const totalSpent = get().getTotalSpent()
    const remaining = get().getRemainingBudget()
    const daysInFiscalMonth = get().getDaysInFiscalMonth()
    const daysPassed = get().getDaysPassedInFiscalMonth()
    const daysUntilPayday = get().getPaydayCountdown()
    const todaySpent = get().getTodaySpending()
    
    // Original daily budget (budget ÷ total days in month)
    const originalDailyBudget = Math.floor(settings.personalBudget / daysInFiscalMonth)
    
    // Adjusted daily budget (remaining ÷ days left)
    // If over budget, you can't spend anymore
    const adjustedDailyBudget = remaining <= 0 
      ? 0 
      : daysUntilPayday > 0 
        ? Math.floor(remaining / daysUntilPayday)
        : remaining // If payday is today, can spend all remaining
    
    // Calculate spending pace
    const dailyAverage = daysPassed > 0 ? Math.round(totalSpent / daysPassed) : 0
    const expectedSpending = originalDailyBudget * daysPassed
    const overspending = totalSpent - expectedSpending
    
    // Projected month end
    const projectedMonthEnd = get().getProjectedMonthEnd()
    const projectedSavings = settings.personalBudget - projectedMonthEnd
    
    // Determine status and message
    let spendingStatus: string
    let spendingMessage: string
    
    if (remaining <= 0) {
      spendingStatus = 'danger'
      spendingMessage = `🔴 Over budget by ₹${Math.abs(remaining)}. Stop spending!`
    } else if (remaining < 2000) {
      spendingStatus = 'critical'
      spendingMessage = `🔴 Critical! Only ₹${remaining} left for ${daysUntilPayday} days (₹${adjustedDailyBudget}/day)`
    } else if (remaining < 5000) {
      spendingStatus = 'warning'
      spendingMessage = `⚠️ Low balance! ₹${remaining} for ${daysUntilPayday} days (₹${adjustedDailyBudget}/day)`
    } else if (overspending > 2000) {
      spendingStatus = 'caution'
      spendingMessage = `🟡 Overspending by ₹${Math.round(overspending)}. Reduce to ₹${adjustedDailyBudget}/day`
    } else if (overspending > 500) {
      spendingStatus = 'mild-caution'
      spendingMessage = `🟡 Slightly over by ₹${Math.round(overspending)}. Aim for ₹${adjustedDailyBudget}/day`
    } else {
      spendingStatus = 'success'
      spendingMessage = `✅ On track! Can spend ₹${adjustedDailyBudget}/day for ${daysUntilPayday} days`
    }
    
    // Weekly analysis (Monday to Sunday)
    // Get start of current week (Monday)
    const currentWeekDay = today.getDay()
    const daysToMonday = currentWeekDay === 0 ? 6 : currentWeekDay - 1
    const currentWeekStart = new Date(today)
    currentWeekStart.setDate(today.getDate() - daysToMonday)
    currentWeekStart.setHours(0, 0, 0, 0)
    
    const currentWeekEnd = new Date(currentWeekStart)
    currentWeekEnd.setDate(currentWeekStart.getDate() + 6)
    currentWeekEnd.setHours(23, 59, 59, 999)
    
    // Get previous week
    const previousWeekStart = new Date(currentWeekStart)
    previousWeekStart.setDate(currentWeekStart.getDate() - 7)
    const previousWeekEnd = new Date(previousWeekStart)
    previousWeekEnd.setDate(previousWeekStart.getDate() + 6)
    previousWeekEnd.setHours(23, 59, 59, 999)
    
    // Calculate current week spending
    const currentWeekExpenses = monthExpenses.filter(e => {
      const expenseDate = new Date(e.date)
      return expenseDate >= currentWeekStart && expenseDate <= currentWeekEnd
    })
    const currentWeekTotal = currentWeekExpenses.reduce((sum, e) => sum + e.amount, 0)
    
    // Calculate previous week spending
    const previousWeekExpenses = monthExpenses.filter(e => {
      const expenseDate = new Date(e.date)
      return expenseDate >= previousWeekStart && expenseDate <= previousWeekEnd
    })
    const previousWeekTotal = previousWeekExpenses.reduce((sum, e) => sum + e.amount, 0)
    
    // Weekend vs Weekday analysis - WHOLE MONTH (keep original)
    const weekdayExpenses = monthExpenses.filter(e => !isWeekend(new Date(e.date)))
    const weekendExpenses = monthExpenses.filter(e => isWeekend(new Date(e.date)))
    
    const weekdayTotal = weekdayExpenses.reduce((sum, e) => sum + e.amount, 0)
    const weekendTotal = weekendExpenses.reduce((sum, e) => sum + e.amount, 0)
    
    const weekdayDates = [...new Set(weekdayExpenses.map(e => format(new Date(e.date), 'yyyy-MM-dd')))]
    const weekendDates = [...new Set(weekendExpenses.map(e => format(new Date(e.date), 'yyyy-MM-dd')))]
    
    const weekdayCount = Math.max(1, weekdayDates.length)
    const weekendCount = Math.max(1, weekendDates.length)
    
    const weekdayAverage = Math.round(weekdayTotal / weekdayCount)
    const weekendAverage = Math.round(weekendTotal / weekendCount)
    const weekendVsWeekdayRatio = weekdayAverage > 0 
      ? ((weekendAverage - weekdayAverage) / weekdayAverage * 100) 
      : 0
    
    // Food spending analysis
    const foodExpenses = monthExpenses.filter(e => e.category === 'Food')
    const foodTotal = foodExpenses.reduce((sum, e) => sum + e.amount, 0)
    const foodDates = [...new Set(foodExpenses.map(e => format(new Date(e.date), 'yyyy-MM-dd')))]
    const foodDays = foodDates.length
    const avgFoodSpending = foodDays > 0 ? Math.round(foodTotal / foodDays) : 0
    
    // Calculate food budget streak
    let streak = 0
    for (let i = 0; i < daysPassed; i++) {
      const checkDate = subDays(today, i)
      if (checkDate < fiscalStart) break
      
      const dateStr = format(checkDate, 'yyyy-MM-dd')
      const dayFoodTotal = foodExpenses
        .filter(e => format(new Date(e.date), 'yyyy-MM-dd') === dateStr)
        .reduce((sum, e) => sum + e.amount, 0)
      
      if (dayFoodTotal <= settings.dailyFoodBudget) {
        streak++
      } else {
        break
      }
    }
    
    // Top spending categories
    const categoryTotals = monthExpenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount
      return acc
    }, {} as Record<string, number>)
    
    const topCategory = Object.entries(categoryTotals)
      .sort(([,a], [,b]) => b - a)[0]
    
    // Current week analysis for weekly breakdown
    const currentWeekWeekdayExpenses = currentWeekExpenses.filter(e => !isWeekend(new Date(e.date)))
    const currentWeekWeekendExpenses = currentWeekExpenses.filter(e => isWeekend(new Date(e.date)))
    
    const currentWeekWeekdayTotal = currentWeekWeekdayExpenses.reduce((sum, e) => sum + e.amount, 0)
    const currentWeekWeekendTotal = currentWeekWeekendExpenses.reduce((sum, e) => sum + e.amount, 0)
    
    const currentWeekWeekdayDates = [...new Set(currentWeekWeekdayExpenses.map(e => format(new Date(e.date), 'yyyy-MM-dd')))]
    const currentWeekWeekendDates = [...new Set(currentWeekWeekendExpenses.map(e => format(new Date(e.date), 'yyyy-MM-dd')))]
    
    const currentWeekWeekdayCount = Math.max(1, currentWeekWeekdayDates.length)
    const currentWeekWeekendCount = Math.max(1, currentWeekWeekendDates.length)
    
    const currentWeekWeekdayAverage = currentWeekWeekdayCount > 0 ? Math.round(currentWeekWeekdayTotal / currentWeekWeekdayCount) : 0
    const currentWeekWeekendAverage = currentWeekWeekendCount > 0 ? Math.round(currentWeekWeekendTotal / currentWeekWeekendCount) : 0
    const currentWeekRatio = currentWeekWeekdayAverage > 0 
      ? ((currentWeekWeekendAverage - currentWeekWeekdayAverage) / currentWeekWeekdayAverage * 100) 
      : 0
    
    return {
      fiscalMonth: {
        start: format(fiscalStart, 'MMM d'),
        end: format(fiscalEnd, 'MMM d'),
        daysTotal: daysInFiscalMonth,
        daysPassed,
        daysUntilPayday,
        daysLeft: daysUntilPayday, // Same as days until payday
        percentComplete: Math.round((daysPassed / daysInFiscalMonth) * 100),
        label: daysUntilPayday === 0 
          ? `🎉 Payday!` 
          : daysUntilPayday === 1
          ? `1 day to payday`
          : `${daysUntilPayday} days to payday`
      },
      
      spendingPace: {
        status: spendingStatus,
        message: spendingMessage,
        details: {
          totalSpent: Math.round(totalSpent),
          remaining: Math.round(remaining),
          dailyAverage,
          originalDailyBudget,
          adjustedDailyBudget,
          daysUntilPayday,
          overspending: Math.round(overspending),
          projectedSavings: Math.round(projectedSavings),
          projectedMonthEnd: Math.round(projectedMonthEnd)
        }
      },
      
      budgetHealth: {
        totalBudget: settings.personalBudget,
        spent: Math.round(totalSpent),
        remaining: Math.round(remaining),
        percentUsed: Math.round((totalSpent / settings.personalBudget) * 100),
        daysUntilPayday,
        dailyBudgetRemaining: adjustedDailyBudget,
        message: remaining <= 0 
          ? '🔴 Budget exhausted!' 
          : remaining < 2000 
          ? '🔴 Critical - emergency only!' 
          : remaining < 5000 
          ? '⚠️ Low balance - be careful!' 
          : remaining < 10000 
          ? '🟡 Watch your spending' 
          : '🟢 Healthy budget'
      },
      
      weeklyAnalysis: {
        currentWeek: {
          start: format(currentWeekStart, 'MMM d'),
          end: format(currentWeekEnd, 'MMM d'),
          total: Math.round(currentWeekTotal),
          weekdayTotal: Math.round(currentWeekWeekdayTotal),
          weekendTotal: Math.round(currentWeekWeekendTotal),
          weekdayAverage: currentWeekWeekdayAverage,
          weekendAverage: currentWeekWeekendAverage,
          weekdayDays: currentWeekWeekdayCount,
          weekendDays: currentWeekWeekendCount
        },
        previousWeek: {
          start: format(previousWeekStart, 'MMM d'),
          end: format(previousWeekEnd, 'MMM d'),
          total: Math.round(previousWeekTotal)
        },
        comparison: currentWeekTotal > previousWeekTotal 
          ? `📈 Up ₹${Math.round(currentWeekTotal - previousWeekTotal)} from last week`
          : currentWeekTotal < previousWeekTotal
          ? `📉 Down ₹${Math.round(previousWeekTotal - currentWeekTotal)} from last week`
          : `➡️ Same as last week`,
        weekendMessage: currentWeekWeekendCount === 0 
          ? 'No weekend spending yet this week'
          : currentWeekWeekendAverage > currentWeekWeekdayAverage
          ? `Weekend spending ${Math.abs(Math.round(currentWeekRatio))}% higher (₹${currentWeekWeekendAverage}/day vs ₹${currentWeekWeekdayAverage}/day)`
          : `Weekend spending controlled (₹${currentWeekWeekendAverage}/day)`
      },
      
      // Keep original weekendSpending for backward compatibility (whole month)
      weekendSpending: {
        status: weekendAverage > weekdayAverage * 1.5 ? 'warning' : 'success',
        message: weekendCount === 0 
          ? 'No weekend spending yet'
          : weekendAverage > weekdayAverage
          ? `You spend ${Math.abs(Math.round(weekendVsWeekdayRatio))}% more on weekends (₹${weekendAverage}/day vs ₹${weekdayAverage}/day)`
          : `Great! Weekend spending controlled (₹${weekendAverage}/day)`,
        details: {
          weekdayAverage,
          weekendAverage,
          weekdayTotal: Math.round(weekdayTotal),
          weekendTotal: Math.round(weekendTotal),
          weekdayDays: weekdayCount,
          weekendDays: weekendCount,
          ratio: Math.round(weekendVsWeekdayRatio)
        }
      },
      
      foodHabits: {
        status: avgFoodSpending > settings.dailyFoodBudget * 1.2 ? 'danger' : avgFoodSpending > settings.dailyFoodBudget ? 'warning' : 'success',
        message: foodDays > 0 
          ? `Daily food average: ₹${avgFoodSpending} (Target: ₹${settings.dailyFoodBudget})`
          : 'No food expenses yet',
        details: {
          totalDays: foodDays,
          totalSpent: Math.round(foodTotal),
          dailyAverage: avgFoodSpending,
          budget: settings.dailyFoodBudget,
          overBy: avgFoodSpending - settings.dailyFoodBudget
        }
      },
      
      topCategory: topCategory ? {
        name: topCategory[0],
        amount: Math.round(topCategory[1]),
        percentage: totalSpent > 0 ? Math.round((topCategory[1] / totalSpent) * 100) : 0
      } : {
        name: 'None',
        amount: 0,
        percentage: 0
      },
      
      streak,
      
      summary: {
        daysUntilPayday,
        daysLeft: daysUntilPayday,
        adjustedDailyBudget,
        canSpendToday: Math.max(0, adjustedDailyBudget - todaySpent),
        lowBalance: remaining < 5000,
        criticalBalance: remaining < 2000,
        lowBalanceWarning: remaining < 5000,
        criticalWarning: remaining < 2000,
        onTrack: dailyAverage <= adjustedDailyBudget,
        needToSlowDown: dailyAverage > adjustedDailyBudget,
        paydayCountdown: daysUntilPayday
      }
    }
  },
}))

async function sendTelegramNotification(expense: any, get: any) {
  try {
    if (!process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || !process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID) {
      console.log('⚠️ Telegram not configured')
      return
    }

    const { settings } = get()
    const todaySpent = get().getTodaySpending()
    const remaining = get().getRemainingBudget()
    const insights = get().getInsights()
    const originalDailyBudget = get().getDailyBudget()
    
    // Main expense notification
    let message = `💰 <b>New Expense</b>\n\n`
    message += `Amount: ${settings.currency}${expense.amount}\n`
    message += `Category: ${expense.category}\n`
    if (expense.description) message += `Description: ${expense.description}\n`
    message += `\n📊 <b>Today's Status</b>\n`
    message += `Spent today: ${settings.currency}${Math.round(todaySpent)}\n`
    message += `Can still spend: ${settings.currency}${Math.round(insights.summary.canSpendToday)}\n`
    message += `\n💼 <b>Month Status</b>\n`
    message += `Remaining: ${settings.currency}${Math.round(remaining)}\n`
    message += `Daily limit: ${settings.currency}${insights.summary.adjustedDailyBudget}/day\n`
    message += `\n📅 ${insights.fiscalMonth.label}`
    
    await telegram.sendMessage(message)
    
    // Send alerts based on situation
    if (remaining <= 0) {
      await telegram.sendMessage(
        `🔴 <b>BUDGET EXHAUSTED!</b>\n\n` +
        `You're over budget by ${settings.currency}${Math.abs(remaining)}\n` +
        `No more spending until next payday!\n` +
        `${insights.summary.daysUntilPayday} days to survive`
      )
    } else if (insights.summary.criticalWarning) {
      await telegram.sendMessage(
        `🔴 <b>CRITICAL WARNING!</b>\n\n` +
        `Only ${settings.currency}${Math.round(remaining)} left!\n` +
        `${insights.summary.daysUntilPayday} days remaining\n` +
        `Daily limit: ${settings.currency}${insights.summary.adjustedDailyBudget}\n` +
        `⚠️ Emergency expenses only!`
      )
    } else if (todaySpent > originalDailyBudget && todaySpent > insights.summary.adjustedDailyBudget) {
      await telegram.sendMessage(
        `⚠️ <b>Daily Budget Exceeded!</b>\n\n` +
        `Today's spending: ${settings.currency}${Math.round(todaySpent)}\n` +
        `Daily limit was: ${settings.currency}${insights.summary.adjustedDailyBudget}\n` +
        `Over by: ${settings.currency}${Math.round(todaySpent - insights.summary.adjustedDailyBudget)}\n\n` +
        `💡 Consider a no-spend day tomorrow`
      )
    }
    
    console.log('✅ Telegram sent')
  } catch (error) {
    console.error('❌ Telegram error:', error)
  }
}

// Debug helper for development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).debugStore = () => {
    const state = useStore.getState()
    const insights = state.getInsights()
    console.log('=== STORE DEBUG ===')
    console.log('Budget:', state.settings.personalBudget)
    console.log('Total Spent:', state.getTotalSpent())
    console.log('Remaining:', state.getRemainingBudget())
    console.log('Days until payday:', state.getPaydayCountdown())
    console.log('Days passed:', state.getDaysPassedInFiscalMonth())
    console.log('Original daily budget:', state.getDailyBudget())
    console.log('Adjusted daily budget:', insights.summary.adjustedDailyBudget)
    console.log('Can spend today:', insights.summary.canSpendToday)
    console.log('Spending pace:', insights.spendingPace.message)
    console.log('Full insights:', insights)
    return insights
  }
}

// Debug helper for development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).debugStore = () => {
    const state = useStore.getState()
    const insights = state.getInsights()
    console.log('=== STORE DEBUG ===')
    console.log('Budget:', state.settings.personalBudget)
    console.log('Total Spent:', state.getTotalSpent())
    console.log('Remaining:', state.getRemainingBudget())
    console.log('Days until payday:', state.getPaydayCountdown())
    console.log('Days passed:', state.getDaysPassedInFiscalMonth())
    console.log('Original daily budget:', state.getDailyBudget())
    console.log('Adjusted daily budget:', insights.summary.adjustedDailyBudget)
    console.log('Can spend today:', insights.summary.canSpendToday)
    console.log('Spending pace:', insights.spendingPace.message)
    console.log('Full insights:', insights)
    return insights
  }
}