import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { format, subDays, startOfWeek, startOfMonth, startOfDay, endOfDay } from 'date-fns'

// Helper: Get fiscal month boundaries based on salary day
function getFiscalMonthBounds(salaryDay: number) {
  const today = new Date()
  const currentDay = today.getDate()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  
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
}

// Helper: Calculate payday countdown
function getPaydayCountdown(salaryDay: number): number {
  const today = new Date()
  const currentDay = today.getDate()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  
  let daysUntilPayday: number
  
  if (currentDay < salaryDay) {
    daysUntilPayday = salaryDay - currentDay
  } else if (currentDay === salaryDay) {
    const hourOfDay = today.getHours()
    if (hourOfDay < 12) {
      daysUntilPayday = 0
    } else {
      const nextPayday = new Date(currentYear, currentMonth + 1, salaryDay)
      const msPerDay = 1000 * 60 * 60 * 24
      daysUntilPayday = Math.ceil((nextPayday.getTime() - today.getTime()) / msPerDay)
    }
  } else {
    const nextPayday = new Date(currentYear, currentMonth + 1, salaryDay)
    const msPerDay = 1000 * 60 * 60 * 24
    daysUntilPayday = Math.ceil((nextPayday.getTime() - today.getTime()) / msPerDay)
  }
  
  return Math.max(0, Math.min(31, daysUntilPayday))
}

// Get current month's budget from monthly_salaries table
async function getCurrentBudget(profile: any): Promise<number> {
  const today = new Date()
  const currentDay = today.getDate()
  const salaryDay = profile.salary_day || 7
  
  // Determine fiscal month
  let fiscalMonth: Date
  if (currentDay >= salaryDay) {
    fiscalMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  } else {
    fiscalMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  }
  
  // Try to get from monthly_salaries
  const { data: monthlySalary } = await supabase
    .from('monthly_salaries')
    .select('personal_budget')
    .eq('profile_id', profile.id)
    .eq('month', format(fiscalMonth, 'yyyy-MM') + '-01')
    .single()
  
  return monthlySalary?.personal_budget || profile.personal_budget || 35000
}

// Get total spent in fiscal month
async function getMonthlySpent(profile: any): Promise<number> {
  const { fiscalStart, fiscalEnd } = getFiscalMonthBounds(profile.salary_day || 7)
  
  const { data } = await supabase
    .from('expenses')
    .select('amount')
    .eq('profile_id', profile.id)
    .gte('expense_date', fiscalStart.toISOString())
    .lte('expense_date', fiscalEnd.toISOString())
  
  return data?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
}

// Send message to Telegram
async function sendMessage(chatId: number, text: string, useKeyboard: boolean = false) {
  const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN
  if (!token) return
  
  try {
    const body: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    }
    
    if (useKeyboard) {
      body.reply_markup = {
        keyboard: [
          ['Balance', 'Today', 'Week'],
          ['Month', 'Report', 'Help']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    }
    
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    
    if (!response.ok) {
      const error = await response.text()
      console.error('Telegram API error:', error)
    }
  } catch (error) {
    console.error('Send message error:', error)
  }
}

// Send message with inline keyboard
async function sendMessageWithInline(chatId: number, text: string) {
  const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN
  if (!token) return
  
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Coffee ₹50', callback_data: 'add_50_coffee' },
              { text: 'Lunch ₹200', callback_data: 'add_200_lunch' }
            ],
            [
              { text: 'Uber ₹150', callback_data: 'add_150_uber' },
              { text: 'Drinks ₹500', callback_data: 'add_500_drinks' }
            ]
          ]
        }
      })
    })
  } catch (error) {
    console.error('Send inline error:', error)
  }
}

function formatMoney(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

function detectCategory(text: string): string {
  const lower = text.toLowerCase()
  
  if (lower.includes('food') || lower.includes('lunch') || lower.includes('dinner') || 
      lower.includes('breakfast') || lower.includes('coffee') || lower.includes('tea') ||
      lower.includes('snack') || lower.includes('meal')) {
    return 'Food'
  }
  
  if (lower.includes('uber') || lower.includes('ola') || lower.includes('cab') || 
      lower.includes('taxi') || lower.includes('auto') || lower.includes('travel')) {
    return 'Travel'
  }
  
  if (lower.includes('drink') || lower.includes('beer') || lower.includes('wine') || 
      lower.includes('alcohol') || lower.includes('bar')) {
    return 'Alcohol'
  }
  
  if (lower.includes('misc')) {
    return 'Miscellaneous'
  }
  
  return 'Other'
}

function parseExpense(text: string): { amount: number; description: string } | null {
  const commands = ['balance', 'today', 'yesterday', 'week', 'month', 'report', 'help', 'food', 'travel', 'drinks', 'misc', 'other', 'morning', 'evening', 'weekend']
  if (commands.includes(text.toLowerCase())) return null
  
  const patterns = [
    /^(\d+)\s+(.+)$/,
    /^(.+)\s+(\d+)$/,
    /^spent?\s+(\d+)\s+(?:on\s+)?(.+)$/i,
    /^paid?\s+(\d+)\s+(?:for\s+)?(.+)$/i,
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      let amount = parseInt(match[1])
      let description = match[2]
      
      if (isNaN(amount)) {
        amount = parseInt(match[2])
        description = match[1]
      }
      
      if (!isNaN(amount) && amount > 0 && amount < 1000000 && description) {
        return { amount, description: description.trim() }
      }
    }
  }
  
  return null
}

async function addExpense(profile: any, amount: number, description: string, categoryName: string) {
  try {
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('name', categoryName)
      .eq('profile_id', profile.id)
      .single()
    
    await supabase
      .from('expenses')
      .insert({
        profile_id: profile.id,
        category_id: category?.id,
        amount,
        description,
        expense_date: new Date().toISOString(),
        payment_method: 'cash'
      })
    
    return true
  } catch (error) {
    console.error('Add expense error:', error)
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('Received:', JSON.stringify(body, null, 2))
    
    const message = body.message
    const callbackQuery = body.callback_query
    
    if (!message && !callbackQuery) {
      return NextResponse.json({ ok: true })
    }
    
    const chatId = message?.chat?.id || callbackQuery?.message?.chat?.id
    
    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .single()
    
    if (!profile) {
      await sendMessage(chatId, '❌ Profile not found')
      return NextResponse.json({ ok: true })
    }
    
    // Handle callback queries (inline keyboard buttons)
    if (callbackQuery) {
      const data = callbackQuery.data
      console.log('Callback data:', data)
      
      if (data.startsWith('add_')) {
        const parts = data.split('_')
        const amount = parseInt(parts[1])
        const description = parts.slice(2).join(' ')
        
        const success = await addExpense(profile, amount, description, detectCategory(description))
        if (success) {
          const spent = await getMonthlySpent(profile)
          const budget = await getCurrentBudget(profile)
          const remaining = budget - spent
          await sendMessage(chatId, `✅ Added: ${description} - ${formatMoney(amount)}\n💰 Remaining: ${formatMoney(remaining)}`)
        } else {
          await sendMessage(chatId, '❌ Failed to add expense')
        }
      }
      
      await fetch(`https://api.telegram.org/bot${process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQuery.id })
      })
      
      return NextResponse.json({ ok: true })
    }
    
    // Handle text messages
    const text = message.text?.trim() || ''
    const command = text.toLowerCase()
    console.log('Command:', command)
    
    let response = ''
    let useKeyboard = false
    let useInline = false
    
    // Balance command - UPDATED
    if (command === 'balance' || command === 'bal') {
      const spent = await getMonthlySpent(profile)
      const budget = await getCurrentBudget(profile)
      const remaining = budget - spent
      
      const { fiscalStart, fiscalEnd } = getFiscalMonthBounds(profile.salary_day || 7)
      const daysPassed = Math.round((new Date().getTime() - fiscalStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const daysUntilPayday = getPaydayCountdown(profile.salary_day || 7)
      
      const daysInFiscalMonth = Math.round((fiscalEnd.getTime() - fiscalStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const originalDailyBudget = Math.floor(budget / daysInFiscalMonth)
      
      const adjustedDailyBudget = remaining <= 0 
        ? 0 
        : daysUntilPayday > 0 
          ? Math.floor(remaining / daysUntilPayday)
          : remaining
      
      const expectedSpending = originalDailyBudget * daysPassed
      const overspending = spent - expectedSpending
      
      response = `💰 <b>Balance Report</b>\n\n`
      response += `<b>Fiscal Period:</b> ${format(fiscalStart, 'MMM d')} - ${format(fiscalEnd, 'MMM d')}\n`
      response += `<b>Monthly Budget:</b> ${formatMoney(budget)}\n`
      response += `<b>Spent:</b> ${formatMoney(spent)}\n`
      response += `<b>Remaining:</b> ${formatMoney(remaining)}\n\n`
      
      response += `<b>Progress (Day ${daysPassed}/${daysInFiscalMonth}):</b>\n`
      response += `${daysUntilPayday === 0 ? '🎉 Payday!' : `${daysUntilPayday} days to payday`}\n`
      response += `Original daily: ${formatMoney(originalDailyBudget)}\n`
      response += `Can spend daily: ${formatMoney(adjustedDailyBudget)}\n\n`
      
      if (remaining <= 0) {
        response += `🔴 Over budget by ${formatMoney(Math.abs(remaining))}!\n`
        response += `Stop spending until payday!`
      } else if (overspending > 1000) {
        response += `⚠️ Overspending by ${formatMoney(overspending)}\n`
        response += `Reduce to ${formatMoney(adjustedDailyBudget)}/day`
      } else {
        response += `✅ On track! Can spend ${formatMoney(adjustedDailyBudget)}/day`
      }
    }
    // Today command - UPDATED
    else if (command === 'today') {
      const todayStart = startOfDay(new Date())
      const todayEnd = endOfDay(new Date())
      
      const { data: expenses } = await supabase
        .from('expenses')
        .select('*, categories(name)')
        .eq('profile_id', profile.id)
        .gte('expense_date', todayStart.toISOString())
        .lte('expense_date', todayEnd.toISOString())
      
      const total = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
      
      // Calculate today's budget based on remaining
      const spent = await getMonthlySpent(profile)
      const budget = await getCurrentBudget(profile)
      const remaining = budget - spent
      const daysUntilPayday = getPaydayCountdown(profile.salary_day || 7)
      const adjustedDailyBudget = remaining <= 0 ? 0 : Math.floor(remaining / Math.max(daysUntilPayday, 1))
      
      response = `📊 <b>Today's Report</b>\n\n`
      
      if (!expenses || expenses.length === 0) {
        response += 'No expenses yet today!\n\n'
        response += `Today's budget: ${formatMoney(adjustedDailyBudget)}`
      } else {
        expenses.forEach(e => {
          response += `• ${e.description}: ${formatMoney(Number(e.amount))}\n`
        })
        response += `\n<b>Total:</b> ${formatMoney(total)} / ${formatMoney(adjustedDailyBudget)}\n`
        
        if (total > adjustedDailyBudget) {
          response += `⚠️ <b>Over by:</b> ${formatMoney(total - adjustedDailyBudget)}\n`
          response += `💡 Try a no-spend day tomorrow`
        } else {
          response += `✅ <b>Can still spend:</b> ${formatMoney(adjustedDailyBudget - total)}`
        }
      }
    }
    // Week command - UPDATED for Monday-Sunday
    else if (command === 'week' || command === 'weekly') {
      const today = new Date()
      const currentWeekDay = today.getDay()
      const daysToMonday = currentWeekDay === 0 ? 6 : currentWeekDay - 1
      
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - daysToMonday)
      weekStart.setHours(0, 0, 0, 0)
      
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
      
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount, expense_date')
        .eq('profile_id', profile.id)
        .gte('expense_date', weekStart.toISOString())
        .lte('expense_date', weekEnd.toISOString())
      
      const total = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
      
      // Get budget info
      const budget = await getCurrentBudget(profile)
      const { fiscalStart, fiscalEnd } = getFiscalMonthBounds(profile.salary_day || 7)
      const daysInFiscalMonth = Math.round((fiscalEnd.getTime() - fiscalStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const dailyBudget = Math.floor(budget / daysInFiscalMonth)
      
      // Calculate daily totals for the week
      const dailyTotals: Record<string, number> = {}
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      days.forEach(day => dailyTotals[day] = 0)
      
      expenses?.forEach(e => {
        const expenseDate = new Date(e.expense_date)
        const dayIndex = expenseDate.getDay()
        const dayName = days[dayIndex === 0 ? 6 : dayIndex - 1] // Sunday is 0, but it's the 7th day
        dailyTotals[dayName] = (dailyTotals[dayName] || 0) + Number(e.amount)
      })
      
      // Days passed in week
      const daysPassedInWeek = Math.min(7, Math.floor((today.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)
      const weekBudgetSoFar = dailyBudget * daysPassedInWeek
      
      response = `📈 <b>Weekly Report</b>\n`
      response += `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}\n\n`
      
      response += `<b>Daily Breakdown:</b>\n`
      days.forEach((day, index) => {
        const amount = dailyTotals[day]
        if (index < daysPassedInWeek) {
          const dayStatus = amount > dailyBudget ? '⚠️' : amount > 0 ? '✅' : '⭕'
          response += `${day}: ${formatMoney(amount)} ${dayStatus}\n`
        } else {
          response += `${day}: -\n`
        }
      })
      
      response += `\n<b>Week Summary:</b>\n`
      response += `Spent: ${formatMoney(total)}\n`
      response += `Budget (${daysPassedInWeek} days): ${formatMoney(weekBudgetSoFar)}\n`
      response += `Daily average: ${formatMoney(Math.floor(total / Math.max(daysPassedInWeek, 1)))}\n\n`
      
      if (total > weekBudgetSoFar) {
        response += `⚠️ Over by ${formatMoney(total - weekBudgetSoFar)}`
      } else {
        response += `✅ Under by ${formatMoney(weekBudgetSoFar - total)}`
      }
    }
    // Month command - UPDATED
    else if (command === 'month' || command === 'monthly') {
      const spent = await getMonthlySpent(profile)
      const budget = await getCurrentBudget(profile)
      const remaining = budget - spent
      
      const { fiscalStart, fiscalEnd } = getFiscalMonthBounds(profile.salary_day || 7)
      const daysPassed = Math.round((new Date().getTime() - fiscalStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const daysUntilPayday = getPaydayCountdown(profile.salary_day || 7)
      const daysInFiscalMonth = Math.round((fiscalEnd.getTime() - fiscalStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      
      const dailyAverage = daysPassed > 0 ? Math.floor(spent / daysPassed) : 0
      const dailyBudget = Math.floor(budget / daysInFiscalMonth)
      const projectedTotal = dailyAverage * daysInFiscalMonth
      
      response = `📊 <b>Monthly Report</b>\n\n`
      response += `<b>Period:</b> ${format(fiscalStart, 'MMM d')} - ${format(fiscalEnd, 'MMM d')}\n`
      response += `<b>Day ${daysPassed} of ${daysInFiscalMonth}</b>\n\n`
      response += `<b>Budget:</b> ${formatMoney(budget)}\n`
      response += `<b>Spent:</b> ${formatMoney(spent)}\n`
      response += `<b>Remaining:</b> ${formatMoney(remaining)}\n\n`
      
      response += `<b>Analysis:</b>\n`
      response += `Daily average: ${formatMoney(dailyAverage)}\n`
      response += `Target daily: ${formatMoney(dailyBudget)}\n`
      response += `Days to payday: ${daysUntilPayday}\n\n`
      
      if (remaining <= 0) {
        response += `🔴 Budget exhausted!`
      } else if (dailyAverage > dailyBudget) {
        const adjustedDaily = Math.floor(remaining / Math.max(daysUntilPayday, 1))
        response += `⚠️ Overspending! Reduce to ${formatMoney(adjustedDaily)}/day`
      } else {
        response += `✅ On track! Keep it up!`
      }
    }
    // Report command - UPDATED
    else if (command === 'report') {
      const spent = await getMonthlySpent(profile)
      const budget = await getCurrentBudget(profile)
      const remaining = budget - spent
      
      const { fiscalStart, fiscalEnd } = getFiscalMonthBounds(profile.salary_day || 7)
      const daysPassed = Math.round((new Date().getTime() - fiscalStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const daysUntilPayday = getPaydayCountdown(profile.salary_day || 7)
      
      // Get week data (Monday-Sunday)
      const today = new Date()
      const currentWeekDay = today.getDay()
      const daysToMonday = currentWeekDay === 0 ? 6 : currentWeekDay - 1
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - daysToMonday)
      weekStart.setHours(0, 0, 0, 0)
      
      const { data: weekExpenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('profile_id', profile.id)
        .gte('expense_date', weekStart.toISOString())
      
      const weekTotal = weekExpenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
      
      // Get today data
      const todayStart = startOfDay(new Date())
      const todayEnd = endOfDay(new Date())
      const { data: todayExpenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('profile_id', profile.id)
        .gte('expense_date', todayStart.toISOString())
        .lte('expense_date', todayEnd.toISOString())
      
      const todayTotal = todayExpenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
      
      const adjustedDailyBudget = remaining <= 0 ? 0 : Math.floor(remaining / Math.max(daysUntilPayday, 1))
      
      response = `📋 <b>Detailed Report</b>\n\n`
      
      response += `<b>Today:</b>\n`
      response += `• Spent: ${formatMoney(todayTotal)}\n`
      response += `• Can spend: ${formatMoney(Math.max(0, adjustedDailyBudget - todayTotal))}\n\n`
      
      response += `<b>This Week:</b>\n`
      response += `• Total: ${formatMoney(weekTotal)}\n\n`
      
      response += `<b>Fiscal Month:</b>\n`
      response += `• Period: ${format(fiscalStart, 'MMM d')} - ${format(fiscalEnd, 'MMM d')}\n`
      response += `• Day ${daysPassed} | ${daysUntilPayday} to payday\n`
      response += `• Spent: ${formatMoney(spent)} / ${formatMoney(budget)}\n`
      response += `• Remaining: ${formatMoney(remaining)}\n`
      response += `• Daily limit: ${formatMoney(adjustedDailyBudget)}\n\n`
      
      if (remaining <= 0) {
        response += `🔴 Over budget by ${formatMoney(Math.abs(remaining))}`
      } else if (remaining < 5000) {
        response += `⚠️ Low balance - be careful!`
      } else {
        response += `✅ Budget healthy`
      }
    }
    // Help command
    else if (command === 'help' || command === '/help' || command === '/start') {
      response = `👋 <b>Expense Tracker Bot</b>\n\n`
      response += `<b>Commands:</b>\n`
      response += `• balance - Check remaining\n`
      response += `• today - Today's expenses\n`
      response += `• week - Weekly report (Mon-Sun)\n`
      response += `• month - Fiscal month report\n`
      response += `• report - Detailed overview\n\n`
      response += `<b>Add expense:</b>\n`
      response += `Type: "200 lunch" or "coffee 50"\n\n`
      response += `<b>Info:</b>\n`
      response += `Fiscal month: Day ${profile.salary_day || 7} to Day ${(profile.salary_day || 7) - 1}`
      useKeyboard = true
    }
    // Try to parse as expense
    else {
      const expense = parseExpense(text)
      if (expense) {
        const success = await addExpense(profile, expense.amount, expense.description, detectCategory(expense.description))
        if (success) {
          const spent = await getMonthlySpent(profile)
          const budget = await getCurrentBudget(profile)
          const remaining = budget - spent
          const daysUntilPayday = getPaydayCountdown(profile.salary_day || 7)
          const adjustedDaily = remaining <= 0 ? 0 : Math.floor(remaining / Math.max(daysUntilPayday, 1))
          
          response = `✅ Added: ${expense.description} - ${formatMoney(expense.amount)}\n`
          response += `💰 Remaining: ${formatMoney(remaining)}\n`
          response += `📅 Can spend: ${formatMoney(adjustedDaily)}/day for ${daysUntilPayday} days`
        } else {
          response = '❌ Failed to add expense'
        }
      } else if (command === 'add') {
        response = '💰 <b>Quick Add</b>\n\nChoose below or type:\n"200 lunch" or "coffee 50"'
        useInline = true
      } else {
        response = `Unknown command: "${text}"\n\nType "help" for commands`
      }
    }
    
    // Send response
    if (response) {
      if (useInline) {
        await sendMessageWithInline(chatId, response)
      } else {
        await sendMessage(chatId, response, useKeyboard)
      }
    }
    
    return NextResponse.json({ ok: true })
    
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}

async function getCategoryReport(profile: any, categoryName: string): Promise<string> {
  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('name', categoryName)
    .eq('profile_id', profile.id)
    .single()
  
  if (!category) {
    return `Category "${categoryName}" not found`
  }
  
  const { fiscalStart } = getFiscalMonthBounds(profile.salary_day || 7)
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('profile_id', profile.id)
    .eq('category_id', category.id)
    .gte('expense_date', fiscalStart.toISOString())
    .limit(10)
  
  const total = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
  
  let response = `<b>${categoryName} Report</b>\n\n`
  response += `This month: ${formatMoney(total)}\n\n`
  
  if (expenses && expenses.length > 0) {
    response += `Recent:\n`
    expenses.slice(0, 5).forEach(e => {
      response += `• ${e.description}: ${formatMoney(Number(e.amount))}\n`
    })
  } else {
    response += 'No expenses in this category'
  }
  
  return response
}

export async function GET() {
  return NextResponse.json({ 
    status: 'Active',
    version: '5.0 - Fiscal month & proper week support'
  })
}