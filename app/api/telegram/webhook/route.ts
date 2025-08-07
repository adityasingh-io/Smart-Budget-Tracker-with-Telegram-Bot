import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { format, subDays, startOfWeek, startOfMonth, startOfDay, endOfDay, getDay } from 'date-fns'

const EXPENSE_PATTERNS = [
  /^(\d+)\s+(.+)$/,
  /^spent?\s+(\d+)\s+(?:on\s+)?(.+)$/i,
  /^(.+)\s+(\d+)$/,
  /^paid?\s+(\d+)\s+(?:for\s+)?(.+)$/i,
  /^bought?\s+(.+)\s+(?:for\s+)?(\d+)$/i,
]

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food': ['food', 'lunch', 'dinner', 'breakfast', 'coffee', 'chai', 'tea', 'snacks', 'meal', 'eat', 'restaurant', 'cafe', 'pizza', 'burger', 'biryani', 'dosa', 'idli', 'swiggy', 'zomato'],
  'Travel': ['uber', 'ola', 'cab', 'taxi', 'auto', 'rickshaw', 'travel', 'metro', 'bus', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'flight', 'train'],
  'Alcohol': ['drinks', 'beer', 'wine', 'whiskey', 'vodka', 'bar', 'pub', 'club', 'party', 'booze', 'alcohol', 'cocktail'],
  'Miscellaneous': ['misc', 'miscellaneous', 'personal', 'smoke', 'other', 'general', 'stuff', 'things'],
  'Other': ['shopping', 'clothes', 'shoes', 'gadget', 'electronics', 'movie', 'entertainment', 'gift', 'netflix', 'spotify', 'gym', 'subscription']
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

function getCategoryEmoji(category: string): string {
  const emojis: Record<string, string> = {
    'Food': '🍽️',
    'Travel': '🚗',
    'Alcohol': '🍺',
    'Miscellaneous': '📦',
    'Other': '💳'
  }
  return emojis[category] || '💰'
}

function getMainMenuKeyboard() {
  return {
    keyboard: [
      ['💰 Balance', '📊 Today', '📈 This Week'],
      ['➕ Add Expense', '🍽️ Food', '🚗 Travel'],
      ['📋 Report', '⚙️ Settings', '💡 Help']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
}

function getQuickAddKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '☕ Coffee ₹50', callback_data: 'quick_50_coffee' },
        { text: '🍕 Lunch ₹200', callback_data: 'quick_200_lunch' }
      ],
      [
        { text: '🚗 Uber ₹150', callback_data: 'quick_150_uber' },
        { text: '🍺 Drinks ₹500', callback_data: 'quick_500_drinks' }
      ]
    ]
  }
}

async function sendMessage(chatId: number, text: string, replyMarkup?: any) {
  const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('Telegram bot token not configured')
    return
  }
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      })
    })
    
    if (!response.ok) {
      const error = await response.text()
      console.error('Telegram API error:', error)
    }
  } catch (error) {
    console.error('Failed to send message:', error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('Webhook received:', JSON.stringify(body, null, 2))
    
    const message = body.message || body.edited_message || body.callback_query?.message
    const callbackQuery = body.callback_query
    
    if (!message && !callbackQuery) {
      return NextResponse.json({ ok: true })
    }
    
    const chatId = message?.chat?.id || callbackQuery?.message?.chat?.id
    const text = message?.text?.trim() || ''
    
    console.log(`Processing: "${text}" from chat ${chatId}`)
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .single()
    
    if (profileError || !profile) {
      console.error('Profile error:', profileError)
      await sendMessage(chatId, '❌ Profile not found. Please set up your account first.')
      return NextResponse.json({ ok: true })
    }
    
    if (callbackQuery) {
      await handleCallbackQuery(callbackQuery, profile)
      return NextResponse.json({ ok: true })
    }
    
    let responseText = ''
    let replyMarkup = null
    
    const commandResult = await handleCommand(text, profile)
    
    if (commandResult.handled) {
      responseText = commandResult.message || 'Command processed'
      replyMarkup = commandResult.keyboard || null
    }
    else if (text.toLowerCase().startsWith('add ')) {
      const expenseText = text.substring(4).trim()
      const expense = parseExpenseText(expenseText)
      if (expense) {
        const result = await addExpenseFromText(expense, profile)
        responseText = result.message
        replyMarkup = result.keyboard
      } else {
        responseText = '💰 <b>Quick Add Expense</b>\n\nChoose an option or type your own:'
        replyMarkup = getQuickAddKeyboard()
      }
    }
    else if (text.toLowerCase() === 'add' || text === '➕ Add Expense') {
      responseText = '💰 <b>Quick Add Expense</b>\n\nChoose an option or type your own:'
      replyMarkup = getQuickAddKeyboard()
    }
    else if (parseExpenseText(text)) {
      const expense = parseExpenseText(text)
      if (expense) {
        const result = await addExpenseFromText(expense, profile)
        responseText = result.message
        replyMarkup = result.keyboard
      }
    }
    else {
      responseText = getHelpMessage()
      replyMarkup = getMainMenuKeyboard()
    }
    
    if (responseText) {
      console.log('Sending response:', responseText.substring(0, 100) + '...')
      await sendMessage(chatId, responseText, replyMarkup)
    }
    
    return NextResponse.json({ ok: true })
    
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}

async function handleCommand(text: string, profile: any): Promise<{ handled: boolean; message?: string; keyboard?: any }> {
  const lowerText = text.toLowerCase()
  const cleanText = lowerText.replace(/[💰📊📈🍽️🚗📋⚙️💡➕]/g, '').trim()
  
  console.log(`Command check: "${cleanText}"`)
  
  try {
    if (cleanText === 'balance' || cleanText === 'bal' || lowerText === '💰 balance') {
      const message = await getBalanceReport(profile)
      return { handled: true, message }
    }
    
    if (cleanText === 'today' || lowerText === '📊 today') {
      const message = await getTodayReport(profile)
      return { handled: true, message }
    }
    
    if (cleanText === 'week' || cleanText === 'weekly' || cleanText === 'this week' || lowerText === '📈 this week') {
      const message = await getWeekReport(profile)
      return { handled: true, message }
    }
    
    if (cleanText === 'yesterday') {
      const message = await getYesterdayReport(profile)
      return { handled: true, message }
    }
    
    if (cleanText === 'month' || cleanText === 'monthly') {
      const message = await getMonthReport(profile)
      return { handled: true, message }
    }
    
    if (cleanText === 'weekend') {
      const message = await getWeekendAnalysis(profile)
      return { handled: true, message }
    }
    
    if (cleanText === 'morning' || cleanText === 'brief') {
      const message = await getMorningBrief(profile)
      return { handled: true, message }
    }
    
    if (cleanText === 'evening' || cleanText === 'summary') {
      const message = await getEveningReport(profile)
      return { handled: true, message }
    }
    
    if (cleanText === 'food' || lowerText === '🍽️ food') {
      const message = await getCategoryReport(profile, 'Food')
      return { handled: true, message }
    }
    
    if (cleanText === 'travel' || lowerText === '🚗 travel') {
      const message = await getCategoryReport(profile, 'Travel')
      return { handled: true, message }
    }
    
    if (cleanText === 'alcohol' || cleanText === 'drinks') {
      const message = await getCategoryReport(profile, 'Alcohol')
      return { handled: true, message }
    }
    
    if (cleanText === 'misc' || cleanText === 'miscellaneous') {
      const message = await getCategoryReport(profile, 'Miscellaneous')
      return { handled: true, message }
    }
    
    if (cleanText === 'other') {
      const message = await getCategoryReport(profile, 'Other')
      return { handled: true, message }
    }
    
    if (cleanText === 'report' || lowerText === '📋 report') {
      const message = await getDetailedReport(profile)
      return { handled: true, message }
    }
    
    if (cleanText === 'settings' || lowerText === '⚙️ settings') {
      return { 
        handled: true, 
        message: '⚙️ <b>Settings</b>\n\nComing soon!',
        keyboard: getMainMenuKeyboard()
      }
    }
    
    if (cleanText === 'help' || cleanText === '/help' || cleanText === '/start' || lowerText === '💡 help') {
      return { 
        handled: true, 
        message: getHelpMessage(),
        keyboard: getMainMenuKeyboard()
      }
    }
  } catch (error) {
    console.error('Error in handleCommand:', error)
    return { 
      handled: true, 
      message: '❌ Error processing command. Please try again.'
    }
  }
  
  return { handled: false }
}

async function getTodayReport(profile: any): Promise<string> {
  try {
    const todayStart = startOfDay(new Date())
    const todayEnd = endOfDay(new Date())
    
    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('*, categories(name)')
      .eq('profile_id', profile.id)
      .gte('expense_date', todayStart.toISOString())
      .lte('expense_date', todayEnd.toISOString())
      .order('expense_date', { ascending: false })
    
    if (error) throw error
    
    const total = expenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const dailyBudget = Math.floor(profile.personal_budget / 30)
    
    if (!expenses || expenses.length === 0) {
      return `📊 <b>Today's Report</b>\n\n✨ No expenses yet today!\n\n💰 Daily Budget: ${formatCurrency(dailyBudget)}`
    }
    
    let response = `📊 <b>Today's Report</b>\n\n`
    response += `<b>Expenses:</b>\n`
    expenses.forEach(e => {
      const catName = e.categories?.name || 'Other'
      response += `• ${getCategoryEmoji(catName)} ${e.description}: ${formatCurrency(parseFloat(e.amount.toString()))}\n`
    })
    response += `\n<b>Total:</b> ${formatCurrency(total)} / ${formatCurrency(dailyBudget)}\n`
    response += `<b>Status:</b> ${total > dailyBudget ? '⚠️ Over budget' : '✅ Within budget'}`
    
    return response
  } catch (error) {
    console.error('Error in getTodayReport:', error)
    return '❌ Error generating today\'s report'
  }
}

async function getYesterdayReport(profile: any): Promise<string> {
  try {
    const yesterday = subDays(new Date(), 1)
    const startOfYesterday = startOfDay(yesterday)
    const endOfYesterday = endOfDay(yesterday)
    
    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('*, categories(name)')
      .eq('profile_id', profile.id)
      .gte('expense_date', startOfYesterday.toISOString())
      .lte('expense_date', endOfYesterday.toISOString())
    
    if (error) throw error
    
    const total = expenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const dailyBudget = Math.floor(profile.personal_budget / 30)
    
    if (!expenses || expenses.length === 0) {
      return `📊 <b>Yesterday's Report</b>\n\n✨ No expenses recorded yesterday!`
    }
    
    const categoryTotals: Record<string, number> = {}
    expenses.forEach(e => {
      const cat = e.categories?.name || 'Other'
      categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(e.amount.toString())
    })
    
    let response = `📊 <b>Yesterday's Report</b>\n\n`
    response += `<b>Categories:</b>\n`
    Object.entries(categoryTotals).forEach(([cat, amount]) => {
      response += `${getCategoryEmoji(cat)} ${cat}: ${formatCurrency(amount)}\n`
    })
    response += `\n<b>Total:</b> ${formatCurrency(total)}\n`
    response += `<b>Budget:</b> ${formatCurrency(dailyBudget)}\n`
    response += `<b>Status:</b> ${total <= dailyBudget ? '✅ Under budget' : `⚠️ Over by ${formatCurrency(total - dailyBudget)}`}`
    
    return response
  } catch (error) {
    console.error('Error in getYesterdayReport:', error)
    return '❌ Error generating yesterday\'s report'
  }
}

async function getWeekReport(profile: any): Promise<string> {
  try {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    
    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('*, categories(name)')
      .eq('profile_id', profile.id)
      .gte('expense_date', weekStart.toISOString())
    
    if (error) throw error
    
    const total = expenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const weekBudget = Math.floor(profile.personal_budget / 30) * 7
    
    const dailyTotals: Record<string, number> = {}
    expenses?.forEach(e => {
      const day = format(new Date(e.expense_date), 'EEE')
      dailyTotals[day] = (dailyTotals[day] || 0) + parseFloat(e.amount.toString())
    })
    
    let response = `📈 <b>Weekly Report</b>\n\n`
    response += `<b>Daily Breakdown:</b>\n`
    
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    days.forEach(day => {
      const amount = dailyTotals[day] || 0
      response += `${day}: ${formatCurrency(amount)}\n`
    })
    
    response += `\n<b>Week Total:</b> ${formatCurrency(total)} / ${formatCurrency(weekBudget)}\n`
    response += `<b>Daily Average:</b> ${formatCurrency(Math.floor(total / 7))}\n`
    response += `<b>Status:</b> ${total <= weekBudget ? '✅ On track!' : '⚠️ Over budget!'}`
    
    return response
  } catch (error) {
    console.error('Error in getWeekReport:', error)
    return '❌ Error generating weekly report'
  }
}

async function getMonthReport(profile: any): Promise<string> {
  try {
    const monthStart = startOfMonth(new Date())
    
    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('*, categories(name)')
      .eq('profile_id', profile.id)
      .gte('expense_date', monthStart.toISOString())
    
    if (error) throw error
    
    const total = expenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const remaining = profile.personal_budget - total
    const daysInMonth = 30
    const daysPassed = new Date().getDate()
    const daysLeft = daysInMonth - daysPassed
    
    const categoryTotals: Record<string, number> = {}
    expenses?.forEach(e => {
      const cat = e.categories?.name || 'Other'
      categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(e.amount.toString())
    })
    
    const topCategories = Object.entries(categoryTotals)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
    
    let response = `📊 <b>Monthly Report</b>\n\n`
    response += `<b>Progress:</b> Day ${daysPassed} of ${daysInMonth}\n\n`
    response += `<b>Budget Status:</b>\n`
    response += `${formatCurrency(total)} / ${formatCurrency(profile.personal_budget)} (${((total/profile.personal_budget)*100).toFixed(0)}%)\n\n`
    
    if (topCategories.length > 0) {
      response += `<b>Top Categories:</b>\n`
      topCategories.forEach(([cat, amount]) => {
        response += `${getCategoryEmoji(cat)} ${cat}: ${formatCurrency(amount)}\n`
      })
      response += '\n'
    }
    
    response += `💰 <b>Remaining:</b> ${formatCurrency(remaining)}\n`
    response += `📅 <b>Days Left:</b> ${daysLeft}\n`
    response += `📊 <b>Suggested Daily:</b> ${formatCurrency(Math.floor(remaining / Math.max(daysLeft, 1)))}\n\n`
    response += remaining < 5000 ? '⚠️ Low balance - spend carefully!' : '✅ Good progress - keep it up!'
    
    return response
  } catch (error) {
    console.error('Error in getMonthReport:', error)
    return '❌ Error generating monthly report'
  }
}

async function getWeekendAnalysis(profile: any): Promise<string> {
  try {
    const today = new Date()
    const dayOfWeek = getDay(today)
    const daysToLastSaturday = dayOfWeek === 0 ? 1 : (dayOfWeek + 1)
    const lastSaturday = subDays(today, daysToLastSaturday)
    const lastSunday = subDays(today, daysToLastSaturday - 1)
    
    const { data: saturdayExpenses } = await supabase
      .from('expenses')
      .select('amount')
      .eq('profile_id', profile.id)
      .gte('expense_date', startOfDay(lastSaturday).toISOString())
      .lte('expense_date', endOfDay(lastSaturday).toISOString())
    
    const { data: sundayExpenses } = await supabase
      .from('expenses')
      .select('amount')
      .eq('profile_id', profile.id)
      .gte('expense_date', startOfDay(lastSunday).toISOString())
      .lte('expense_date', endOfDay(lastSunday).toISOString())
    
    const satTotal = saturdayExpenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const sunTotal = sundayExpenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const weekendTotal = satTotal + sunTotal
    
    let response = `📅 <b>Weekend Analysis</b>\n\n`
    response += `<b>Last Weekend:</b>\n`
    response += `• Saturday: ${formatCurrency(satTotal)}\n`
    response += `• Sunday: ${formatCurrency(sunTotal)}\n`
    response += `• Total: ${formatCurrency(weekendTotal)}\n\n`
    response += `💡 <b>Tips for this weekend:</b>\n`
    response += `• Set limit: ${formatCurrency(Math.min(2500, profile.personal_budget * 0.1))}\n`
    response += `• Avoid impulse purchases\n`
    response += `• Plan activities in advance`
    
    return response
  } catch (error) {
    console.error('Error in getWeekendAnalysis:', error)
    return '❌ Error generating weekend analysis'
  }
}

async function getMorningBrief(profile: any): Promise<string> {
  try {
    const yesterdayReport = await getYesterdayReport(profile)
    const monthStart = startOfMonth(new Date())
    
    const { data: monthExpenses } = await supabase
      .from('expenses')
      .select('amount')
      .eq('profile_id', profile.id)
      .gte('expense_date', monthStart.toISOString())
    
    const monthSpent = monthExpenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const remaining = profile.personal_budget - monthSpent
    const daysLeft = 30 - new Date().getDate()
    const suggestedDaily = daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0
    
    let response = `🌅 <b>Good Morning!</b>\n\n`
    response += yesterdayReport + '\n\n'
    response += `💰 <b>Today's Budget:</b> ${formatCurrency(suggestedDaily)}\n`
    response += `📅 <b>Days Left:</b> ${daysLeft}\n`
    response += `💳 <b>Month Remaining:</b> ${formatCurrency(remaining)}\n\n`
    response += `<i>Have a great day!</i>`
    
    return response
  } catch (error) {
    console.error('Error in getMorningBrief:', error)
    return '❌ Error generating morning brief'
  }
}

async function getEveningReport(profile: any): Promise<string> {
  try {
    const todayReport = await getTodayReport(profile)
    const monthStart = startOfMonth(new Date())
    
    const { data: monthExpenses } = await supabase
      .from('expenses')
      .select('amount')
      .eq('profile_id', profile.id)
      .gte('expense_date', monthStart.toISOString())
    
    const monthSpent = monthExpenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const remaining = profile.personal_budget - monthSpent
    
    let response = `🌙 <b>Evening Summary</b>\n\n`
    response += todayReport + '\n\n'
    response += `💰 <b>Month Remaining:</b> ${formatCurrency(remaining)}\n\n`
    response += `<i>Great job tracking today!</i>`
    
    return response
  } catch (error) {
    console.error('Error in getEveningReport:', error)
    return '❌ Error generating evening report'
  }
}

async function getCategoryReport(profile: any, categoryName: string): Promise<string> {
  try {
    const { data: category } = await supabase
      .from('categories')
      .select('*')
      .eq('name', categoryName)
      .eq('profile_id', profile.id)
      .single()
    
    if (!category) {
      return `❌ Category "${categoryName}" not found`
    }
    
    const monthStart = startOfMonth(new Date())
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('profile_id', profile.id)
      .eq('category_id', category.id)
      .gte('expense_date', monthStart.toISOString())
      .order('expense_date', { ascending: false })
      .limit(10)
    
    const total = expenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const budget = category.budget_amount || (profile.personal_budget * 0.2)
    
    let response = `${getCategoryEmoji(categoryName)} <b>${categoryName} Report</b>\n\n`
    response += `<b>This Month:</b>\n`
    response += `${formatCurrency(total)} / ${formatCurrency(budget)} (${((total/budget)*100).toFixed(0)}%)\n\n`
    
    if (expenses && expenses.length > 0) {
      response += `<b>Recent Expenses:</b>\n`
      expenses.slice(0, 5).forEach(e => {
        response += `• ${format(new Date(e.expense_date), 'MMM d')}: ${formatCurrency(parseFloat(e.amount.toString()))} - ${e.description}\n`
      })
    } else {
      response += `No expenses yet this month\n`
    }
    
    response += `\n<b>Remaining:</b> ${formatCurrency(budget - total)}\n`
    response += `<b>Status:</b> ${total > budget ? '⚠️ Over budget!' : '✅ Within budget'}`
    
    return response
  } catch (error) {
    console.error('Error in getCategoryReport:', error)
    return '❌ Error generating category report'
  }
}

async function getDetailedReport(profile: any): Promise<string> {
  try {
    const monthStart = startOfMonth(new Date())
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    const todayStart = startOfDay(new Date())
    const todayEnd = endOfDay(new Date())
    
    const { data: monthExpenses } = await supabase
      .from('expenses')
      .select('amount')
      .eq('profile_id', profile.id)
      .gte('expense_date', monthStart.toISOString())
    
    const { data: weekExpenses } = await supabase
      .from('expenses')
      .select('amount')
      .eq('profile_id', profile.id)
      .gte('expense_date', weekStart.toISOString())
    
    const { data: todayExpenses } = await supabase
      .from('expenses')
      .select('amount')
      .eq('profile_id', profile.id)
      .gte('expense_date', todayStart.toISOString())
      .lte('expense_date', todayEnd.toISOString())
    
    const monthSpent = monthExpenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const weekSpent = weekExpenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const todaySpent = todayExpenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const remaining = profile.personal_budget - monthSpent
    
    let response = `📋 <b>Detailed Financial Report</b>\n\n`
    response += `<b>📊 Overview:</b>\n`
    response += `• Today: ${formatCurrency(todaySpent)}\n`
    response += `• This Week: ${formatCurrency(weekSpent)}\n`
    response += `• This Month: ${formatCurrency(monthSpent)}\n`
    response += `• Remaining: ${formatCurrency(remaining)}\n\n`
    
    response += `<b>💡 Insights:</b>\n`
    response += `• Daily Average: ${formatCurrency(Math.floor(monthSpent / Math.max(new Date().getDate(), 1)))}\n`
    response += `• Projected Month: ${formatCurrency(Math.floor(monthSpent / Math.max(new Date().getDate(), 1) * 30))}\n`
    response += `• Status: ${remaining > 10000 ? '✅ Healthy' : remaining > 5000 ? '🟡 Caution' : '🔴 Critical'}\n\n`
    response += `<i>Use category commands (food, travel, etc.) for detailed breakdowns</i>`
    
    return response
  } catch (error) {
    console.error('Error in getDetailedReport:', error)
    return '❌ Error generating detailed report'
  }
}

async function getBalanceReport(profile: any): Promise<string> {
  try {
    const monthStart = startOfMonth(new Date())
    
    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount')
      .eq('profile_id', profile.id)
      .gte('expense_date', monthStart.toISOString())
    
    const monthSpent = expenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const remaining = profile.personal_budget - monthSpent
    const daysInMonth = 30
    const daysPassed = new Date().getDate()
    const daysLeft = daysInMonth - daysPassed
    const suggestedDaily = daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0
    
    let statusEmoji = '💚'
    let statusText = 'Excellent!'
    
    if (remaining < 3000) {
      statusEmoji = '🔴'
      statusText = 'Critical!'
    } else if (remaining < 7000) {
      statusEmoji = '🟡'
      statusText = 'Caution'
    } else if (remaining < 15000) {
      statusEmoji = '🟢'
      statusText = 'Good'
    }
    
    const percentUsed = ((monthSpent / profile.personal_budget) * 100).toFixed(1)
    const percentRemaining = ((remaining / profile.personal_budget) * 100).toFixed(1)
    
    let response = `💰 <b>Balance Report</b>\n\n`
    response += `<b>Month Status:</b> ${statusEmoji} ${statusText}\n\n`
    response += `<b>Budget:</b> ${formatCurrency(profile.personal_budget)}\n`
    response += `<b>Spent:</b> ${formatCurrency(monthSpent)} (${percentUsed}%)\n`
    response += `<b>Remaining:</b> ${formatCurrency(remaining)} (${percentRemaining}%)\n\n`
    response += `📅 <b>Time Analysis:</b>\n`
    response += `• Days Passed: ${daysPassed}/${daysInMonth}\n`
    response += `• Days Left: ${daysLeft}\n`
    response += `• Suggested Daily: ${formatCurrency(suggestedDaily)}\n\n`
    
    if (remaining < 5000) {
      response += '🔔 <b>Alert:</b> Consider postponing non-essential purchases'
    }
    
    return response
  } catch (error) {
    console.error('Error in getBalanceReport:', error)
    return '❌ Error generating balance report'
  }
}

function parseExpenseText(text: string): { amount: number; description: string; category: string } | null {
  const commandWords = ['balance', 'bal', 'today', 'week', 'weekly', 'month', 'monthly', 
                       'yesterday', 'weekend', 'food', 'travel', 'drinks', 'alcohol',
                       'misc', 'miscellaneous', 'other', 'report', 'settings', 'help',
                       'morning', 'evening', 'brief', 'summary', 'add', 'this week']
  
  if (commandWords.includes(text.toLowerCase())) {
    return null
  }
  
  for (const pattern of EXPENSE_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      let amount = parseInt(match[1])
      let description = match[2]
      
      if (isNaN(amount)) {
        amount = parseInt(match[2])
        description = match[1]
      }
      
      if (!isNaN(amount) && description && amount > 0 && amount < 1000000) {
        const category = detectCategory(description)
        return { amount, description: description.trim(), category }
      }
    }
  }
  
  return null
}

function detectCategory(text: string): string {
  const lowerText = text.toLowerCase()
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return category
    }
  }
  
  return 'Other'
}

async function addExpenseFromText(data: { amount: number; description: string; category: string }, profile: any) {
  try {
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('name', data.category)
      .eq('profile_id', profile.id)
      .single()
    
    const { error } = await supabase
      .from('expenses')
      .insert({
        profile_id: profile.id,
        category_id: category?.id,
        amount: data.amount,
        description: data.description,
        expense_date: new Date().toISOString(),
        tags: ['telegram'],
        payment_method: 'cash'
      })
    
    if (error) {
      console.error('Error adding expense:', error)
      return {
        message: '❌ Failed to add expense. Please try again.',
        keyboard: null
      }
    }
    
    const monthStart = startOfMonth(new Date())
    const { data: monthExpenses } = await supabase
      .from('expenses')
      .select('amount')
      .eq('profile_id', profile.id)
      .gte('expense_date', monthStart.toISOString())
    
    const monthSpent = monthExpenses?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
    const remaining = profile.personal_budget - monthSpent
    
    let message = `✅ <b>Expense Added!</b>\n\n`
    message += `${getCategoryEmoji(data.category)} <b>Category:</b> ${data.category}\n`
    message += `💰 <b>Amount:</b> ${formatCurrency(data.amount)}\n`
    message += `📝 <b>Description:</b> ${data.description}\n\n`
    message += `💳 <b>Month Remaining:</b> ${formatCurrency(remaining)}`
    
    if (remaining < 5000) {
      message += `\n\n🔴 <b>Low balance alert!</b>\nOnly ${formatCurrency(remaining)} left!`
    }
    
    return { message, keyboard: null }
  } catch (error) {
    console.error('Error in addExpenseFromText:', error)
    return {
      message: '❌ Error adding expense',
      keyboard: null
    }
  }
}

async function handleCallbackQuery(query: any, profile: any) {
  const chatId = query.message.chat.id
  const data = query.data
  
  let responseText = ''
  
  try {
    if (data.startsWith('quick_')) {
      const [_, amount, description] = data.split('_')
      const expense = {
        amount: parseInt(amount),
        description,
        category: detectCategory(description)
      }
      const result = await addExpenseFromText(expense, profile)
      responseText = result.message
    }
    else if (data === 'today_total') {
      responseText = await getTodayReport(profile)
    }
    else if (data === 'balance') {
      responseText = await getBalanceReport(profile)
    }
    else if (data === 'week_summary') {
      responseText = await getWeekReport(profile)
    }
    else if (data === 'full_report') {
      responseText = await getDetailedReport(profile)
    }
    else if (data === 'add_expense') {
      responseText = '💰 <b>Add New Expense</b>\n\nJust type the amount and description:\n\nExamples:\n• 200 lunch\n• coffee 50'
    }
  } catch (error) {
    console.error('Error in callback query:', error)
    responseText = '❌ Error processing your request'
  }
  
  await fetch(`https://api.telegram.org/bot${process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: query.id,
      text: 'Processing...'
    })
  })
  
  if (responseText) {
    await sendMessage(chatId, responseText)
  }
}

function getHelpMessage(): string {
  return `👋 <b>Expense Tracker Bot</b>\n\n<b>Natural Language:</b>\n• "200 lunch" - Add lunch expense\n• "coffee 50" - Quick coffee entry\n\n<b>Commands:</b>\n• <b>balance</b> - Check remaining budget\n• <b>today</b> - Today's summary\n• <b>yesterday</b> - Yesterday's report\n• <b>week</b> - Weekly analysis\n• <b>month</b> - Monthly overview\n• <b>weekend</b> - Weekend spending\n• <b>morning</b> - Morning brief\n• <b>evening</b> - Evening report\n• <b>report</b> - Detailed report\n\n<b>Categories:</b>\n• <b>food</b> - Food expenses\n• <b>travel</b> - Travel expenses\n• <b>drinks</b> - Drinks report\n• <b>misc</b> - Miscellaneous\n• <b>other</b> - Other expenses\n\n<i>Just start typing an amount to begin!</i>`
}

export async function GET() {
  return NextResponse.json({ 
    status: 'Webhook is active',
    version: '3.0',
    fixes: [
      'Simplified all report functions',
      'Removed complex visual elements that could fail',
      'Fixed amount parsing with toString()',
      'Better error handling',
      'Consistent response format'
    ]
  })
}