import { supabase } from '@/lib/supabase'
import { format, subDays } from 'date-fns'

export async function generateMorningBrief(profile: any): Promise<string> {
  const today = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  
  // Get yesterday's expenses
  const { data: yesterdayExpenses } = await supabase
    .from('expenses')
    .select('amount, description')
    .eq('profile_id', profile.id)
    .gte('expense_date', `${yesterday}T00:00:00`)
    .lte('expense_date', `${yesterday}T23:59:59`)
  
  const yesterdayTotal = yesterdayExpenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
  const monthSpent = await getMonthlySpent(profile)
  const remaining = profile.personal_budget - monthSpent
  
  return `🌅 <b>Good Morning!</b>

💰 <b>Yesterday:</b> ₹${yesterdayTotal.toLocaleString('en-IN')}
📊 <b>Month Spent:</b> ₹${monthSpent.toLocaleString('en-IN')}
🎯 <b>Remaining:</b> ₹${remaining.toLocaleString('en-IN')}
📅 <b>Daily Budget:</b> ₹${Math.floor(profile.personal_budget / 30)}

Have a great day! 🌟`
}

export async function generateEveningReport(profile: any): Promise<string> {
  const today = format(new Date(), 'yyyy-MM-dd')
  
  // Get today's expenses
  const { data: todayExpenses } = await supabase
    .from('expenses')
    .select('amount, description')
    .eq('profile_id', profile.id)
    .gte('expense_date', `${today}T00:00:00`)
    .lte('expense_date', `${today}T23:59:59`)
  
  const todayTotal = todayExpenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
  const monthSpent = await getMonthlySpent(profile)
  const remaining = profile.personal_budget - monthSpent
  
  return `🌙 <b>Evening Report</b>

💰 <b>Today's Spending:</b> ₹${todayTotal.toLocaleString('en-IN')}
📊 <b>Month Total:</b> ₹${monthSpent.toLocaleString('en-IN')}
🎯 <b>Remaining:</b> ₹${remaining.toLocaleString('en-IN')}

${todayTotal > profile.personal_budget / 30 ? '⚠️ <b>Over daily budget!</b>' : '✅ <b>Within daily budget</b>'}
`
}

async function getMonthlySpent(profile: any): Promise<number> {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  
  const { data } = await supabase
    .from('expenses')
    .select('amount')
    .eq('profile_id', profile.id)
    .gte('expense_date', startOfMonth.toISOString())
  
  return data?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
} 