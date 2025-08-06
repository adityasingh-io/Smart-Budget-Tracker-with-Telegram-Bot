// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database helper functions
export const dbHelpers = {
  // Get or create profile
  async getProfile() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .single()
    
    if (error) {
      console.error('Error fetching profile:', error)
      // Return default profile if none exists
      return {
        currency: '₹',
        total_salary: 100000,
        personal_budget: 35000,
        salary_day: 7,
        daily_food_budget: 400,
        privacy_mode: true,
        dark_mode: false
      }
    }
    return data
  },

  // Get all expenses for current month
  async getExpenses() {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    
    const { data, error } = await supabase
      .from('expenses')
      .select(`
        *,
        categories (
          name,
          color,
          icon
        )
      `)
      .gte('expense_date', startOfMonth.toISOString())
      .order('expense_date', { ascending: false })
    
    if (error) {
      console.error('Error fetching expenses:', error)
      return []
    }
    return data || []
  },

  // Add new expense
  async addExpense(expense: any) {
    const profile = await this.getProfile()
    
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        profile_id: profile.id,
        amount: expense.amount,
        description: expense.description,
        expense_date: expense.date,
        subcategory: expense.subcategory,
        tags: expense.tags,
        is_fake: expense.isFake || false,
        display_description: expense.isFake ? expense.description : null,
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error adding expense:', error)
      throw error
    }
    return data
  },

  // Delete expense
  async deleteExpense(id: string) {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('Error deleting expense:', error)
      throw error
    }
  },

  // Get categories
  async getCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name')
    
    if (error) {
      console.error('Error fetching categories:', error)
      return []
    }
    return data || []
  },

  // Update settings
  async updateSettings(settings: any) {
    const profile = await this.getProfile()
    
    const { error } = await supabase
      .from('profiles')
      .update(settings)
      .eq('id', profile.id)
    
    if (error) {
      console.error('Error updating settings:', error)
      throw error
    }
  },

  // Get insights
  async getInsights() {
    const profile = await this.getProfile()
    
    const { data, error } = await supabase
      .rpc('get_spending_insights', { profile_uuid: profile.id })
    
    if (error) {
      console.error('Error fetching insights:', error)
      return null
    }
    return data
  }
}