// lib/store.ts - Supabase as single source of truth
import { create } from 'zustand'
import { startOfMonth, endOfMonth, differenceInDays, format } from 'date-fns'
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
  // State
  expenses: Expense[]
  categories: Category[]
  settings: Settings
  savingsGoals: any[]
  initialized: boolean
  loading: boolean
  profileId: string | null
  
  // Actions
  initialize: () => Promise<void>
  addExpense: (expense: Omit<Expense, 'id'>) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  updateExpense: (id: string, expense: Partial<Expense>) => Promise<void>
  updateSettings: (settings: Partial<Settings>) => Promise<void>
  refreshData: () => Promise<void>
  
  // Getters
  getTotalSpent: () => number
  getRemainingBudget: () => number
  getCategorySpending: (category: string) => number
  getTodaySpending: () => number
  getPaydayCountdown: () => number
  getInsights: () => any
}

export const useStore = create<Store>((set, get) => ({
  // Initial state
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

  // Initialize - Load everything from Supabase
  initialize: async () => {
    set({ loading: true })
    
    try {
      // Get or create profile
      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .single()

      if (profileError || !profile) {
        // Create default profile if none exists
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

      // Load categories
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('*')
        .eq('profile_id', profile.id)
        .order('name')

      if (catError) throw catError

      // Load current month expenses
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

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
        .gte('expense_date', startOfMonth.toISOString())
        .order('expense_date', { ascending: false })

      if (expError) throw expError

      // Map data to our format
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

      // Build category budgets
      const categoryBudgets = mappedCategories.reduce((acc: any, cat: any) => {
        acc[cat.name] = cat.budget
        return acc
      }, {})

      // Update store
      set({
        profileId: profile.id,
        settings: {
          currency: profile.currency || '₹',
          totalSalary: profile.total_salary || 100000,
          personalBudget: profile.personal_budget || 35000,
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

      console.log('✅ Store initialized with Supabase data')
    } catch (error) {
      console.error('❌ Failed to initialize store:', error)
      set({ loading: false, initialized: false })
      throw error
    }
  },

  // Add expense - Save directly to Supabase
  addExpense: async (expense) => {
    const { profileId, categories } = get()
    if (!profileId) throw new Error('No profile found')

    set({ loading: true })

    try {
      // Find category ID
      const category = categories.find(c => c.name === expense.category)
      
      // Insert into Supabase
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
          payment_method: 'cash', // default
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

      // Add to local state
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

      // ============= TELEGRAM NOTIFICATION =============
    try {
        // Check if Telegram is configured
        if (!process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || !process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID) {
          console.log('⚠️ Telegram not configured - skipping notification')
          return
        }
  
        const { settings } = get()
        const todaySpent = get().getTodaySpending()
        const remaining = get().getRemainingBudget()
        
        console.log('📱 Sending Telegram notification...')
        
        // Send basic notification
        await telegram.sendMessage(
          `💰 <b>New Expense Added</b>\n\n` +
          `Amount: ₹${expense.amount}\n` +
          `Category: ${expense.category}\n` +
          `Description: ${expense.description || 'N/A'}\n\n` +
          `Today's Total: ₹${todaySpent}\n` +
          `Remaining Budget: ₹${remaining}`
        )
        
        // Check if over daily budget
        const dailyBudget = Math.floor(settings.personalBudget / 30)
        if (todaySpent > dailyBudget) {
          await telegram.sendMessage(
            `⚠️ <b>Over Daily Budget!</b>\n\n` +
            `Today's spending: ₹${todaySpent}\n` +
            `Daily budget: ₹${dailyBudget}\n` +
            `Over by: ₹${todaySpent - dailyBudget}`
          )
        }
        
        // Low balance alert
        if (remaining < 5000) {
          await telegram.sendMessage(
            `🔴 <b>Low Balance Alert!</b>\n\n` +
            `Only ₹${remaining} left for the month!\n` +
            `Be careful with spending.`
          )
        }
        
        console.log('✅ Telegram notification sent')
      } catch (telegramError) {
        console.error('❌ Telegram error:', telegramError)
        // Don't throw - we don't want Telegram failures to break the app
      }
      // ============= END TELEGRAM NOTIFICATION =============

    } catch (error) {
      console.error('❌ Failed to add expense:', error)
      set({ loading: false })
      throw error
    }
  },

  // Delete expense - Remove from Supabase
  deleteExpense: async (id) => {
    set({ loading: true })

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)

      if (error) throw error

      // Remove from local state
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

  // Update expense - Update in Supabase
  updateExpense: async (id, updates) => {
    const { categories } = get()
    set({ loading: true })

    try {
      // Prepare update data
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

      // Update local state
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

  // Update settings - Save to Supabase
  updateSettings: async (updates) => {
    const { profileId } = get()
    if (!profileId) throw new Error('No profile found')

    set({ loading: true })

    try {
      // Prepare update data
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

      // Update local state
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

  // Refresh all data from Supabase
  refreshData: async () => {
    await get().initialize()
  },

  // Getters (same as before, work with local state)
  getTotalSpent: () => {
    const { expenses } = get()
    const currentMonth = format(new Date(), 'yyyy-MM')
    return expenses
      .filter(e => e.date.startsWith(currentMonth))
      .reduce((sum, e) => sum + e.amount, 0)
  },

  getRemainingBudget: () => {
    const { settings } = get()
    return settings.personalBudget - get().getTotalSpent()
  },

  getCategorySpending: (category) => {
    const { expenses } = get()
    const currentMonth = format(new Date(), 'yyyy-MM')
    return expenses
      .filter(e => e.date.startsWith(currentMonth) && e.category === category)
      .reduce((sum, e) => sum + e.amount, 0)
  },

  getTodaySpending: () => {
    const { expenses } = get()
    const today = format(new Date(), 'yyyy-MM-dd')
    return expenses
      .filter(e => e.date.startsWith(today))
      .reduce((sum, e) => sum + e.amount, 0)
  },

  getPaydayCountdown: () => {
    const { settings } = get()
    const today = new Date()
    const currentDay = today.getDate()
    
    if (currentDay <= settings.salaryDay) {
      return settings.salaryDay - currentDay
    } else {
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, settings.salaryDay)
      return differenceInDays(nextMonth, today)
    }
  },

  getInsights: () => {
    const { expenses, settings } = get()
    const currentMonth = format(new Date(), 'yyyy-MM')
    const monthExpenses = expenses.filter(e => e.date.startsWith(currentMonth))
    
    const totalSpent = get().getTotalSpent()
    const daysInMonth = 30
    const daysPassed = new Date().getDate()
    const expectedSpending = (settings.personalBudget / daysInMonth) * daysPassed
    
    const weekdaySpending = monthExpenses
      .filter(e => {
        const day = new Date(e.date).getDay()
        return day > 0 && day < 6
      })
      .reduce((sum, e) => sum + e.amount, 0)
    
    const weekendSpending = monthExpenses
      .filter(e => {
        const day = new Date(e.date).getDay()
        return day === 0 || day === 6
      })
      .reduce((sum, e) => sum + e.amount, 0)

    const foodExpenses = monthExpenses.filter(e => e.category === 'Food')
    const foodDays = [...new Set(foodExpenses.map(e => e.date.split('T')[0]))].length
    const avgFoodSpending = foodDays > 0 ? Math.round(get().getCategorySpending('Food') / foodDays) : 0

    let streak = 0
    const today = new Date()
    for (let i = 0; i < 30; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = format(date, 'yyyy-MM-dd')
      const dayFood = foodExpenses
        .filter(e => e.date.startsWith(dateStr))
        .reduce((sum, e) => sum + e.amount, 0)
      
      if (dayFood <= settings.dailyFoodBudget) {
        streak++
      } else {
        break
      }
    }

    return {
      spendingPace: {
        status: totalSpent > expectedSpending * 1.2 ? 'danger' : totalSpent > expectedSpending ? 'warning' : 'success',
        message: totalSpent > expectedSpending 
          ? `You're overspending by ₹${Math.round(totalSpent - expectedSpending)}. At this pace, you'll exceed budget by ₹${Math.round((totalSpent / daysPassed * daysInMonth) - settings.personalBudget)}`
          : `Great! You're under budget by ₹${Math.round(expectedSpending - totalSpent)}`,
      },
      weekendSpending: {
        status: weekendSpending > weekdaySpending * 0.4 ? 'warning' : 'success',
        message: `You spend ${Math.round((weekendSpending / (weekendSpending + weekdaySpending)) * 100)}% more on weekends`,
      },
      foodHabits: {
        status: avgFoodSpending > settings.dailyFoodBudget ? 'warning' : 'success',
        message: `Daily food average: ₹${avgFoodSpending} (Target: ₹${settings.dailyFoodBudget})`,
      },
      streak,
    }
  },
}))