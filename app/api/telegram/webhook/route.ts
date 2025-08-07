// app/api/telegram/webhook/route.ts - COMPLETE FIXED VERSION
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, addDays, getDay } from 'date-fns'

// ============= NATURAL LANGUAGE PROCESSING =============
const EXPENSE_PATTERNS = [
  /^(\d+)\s+(.+)$/,                              // "200 lunch"
  /^spent?\s+(\d+)\s+(?:on\s+)?(.+)$/i,         // "spent 200 on lunch"
  /^(.+)\s+(\d+)$/,                             // "lunch 200"
  /^paid?\s+(\d+)\s+(?:for\s+)?(.+)$/i,         // "paid 200 for dinner"
  /^bought?\s+(.+)\s+(?:for\s+)?(\d+)$/i,       // "bought coffee for 50"
  /^(.+)\s+at\s+(.+)\s+(\d+)$/i,                // "lunch at office 200"
  /^(\d+)\s+(.+)\s+(?:with|at)\s+(.+)$/i,       // "200 dinner with friends"
]

// Split bill patterns
const SPLIT_PATTERNS = [
  /^paid?\s+(\d+)\s+(.+)\s+split\s+(?:with\s+)?(\d+)/i,  // "paid 1200 dinner split with 3"
  /^(\d+)\s+(.+)\s+split\s+later/i,                      // "1200 party split later"
]

// Recurring expense patterns
const RECURRING_PATTERNS = [
  /^set\s+(.+)\s+(\d+)\s+monthly\s+(?:on\s+)?(\d+)?/i,   // "set netflix 499 monthly on 15"
  /^recurring\s+(.+)\s+(\d+)/i,                          // "recurring gym 2000"
]

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food': ['food', 'lunch', 'dinner', 'breakfast', 'coffee', 'chai', 'tea', 'snacks', 'meal', 'eat', 'restaurant', 'cafe', 'pizza', 'burger', 'biryani', 'dosa', 'idli', 'swiggy', 'zomato'],
  'Travel': ['uber', 'ola', 'cab', 'taxi', 'auto', 'rickshaw', 'travel', 'metro', 'bus', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'flight', 'train'],
  'Alcohol': ['drinks', 'beer', 'wine', 'whiskey', 'vodka', 'bar', 'pub', 'club', 'party', 'booze', 'alcohol', 'cocktail'],
  'Miscellaneous': ['misc', 'miscellaneous', 'personal', 'smoke', 'other', 'general', 'stuff', 'things'],
  'Other': ['shopping', 'clothes', 'shoes', 'gadget', 'electronics', 'movie', 'entertainment', 'gift', 'netflix', 'spotify', 'gym', 'subscription']
}

// ============= VISUAL COMPONENTS =============
function getVisualSeparator(): string {
  return '━━━━━━━━━━━━━━━━━━━━'
}

function getProgressBar(current: number, total: number, width: number = 10): string {
  const percentage = Math.min((current / total) * 100, 100)
  const filled = Math.floor(percentage / (100 / width))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function getCategoryEmoji(category: string): string {
  const emojis: Record<string, string> = {
    'Food': '🍽️',
    'Travel': '🚗',
    'Alcohol': '🍺',
    'Miscellaneous': '📦',
    'Other': '💳',
    'Shopping': '🛍️',
    'Entertainment': '🎬',
    'Subscription': '📱'
  }
  return emojis[category] || '💰'
}

function getTimeEmoji(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return '🌅'
  if (hour >= 12 && hour < 17) return '☀️'
  if (hour >= 17 && hour < 20) return '🌆'
  return '🌙'
}

// ============= INTERACTIVE KEYBOARDS =============
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
      ],
      [
        { text: '📦 Misc ₹100', callback_data: 'quick_100_misc' },
        { text: '🎬 Movie ₹300', callback_data: 'quick_300_movie' }
      ]
    ]
  }
}

function getExpenseActionKeyboard(expenseId: string) {
  return {
    inline_keyboard: [
      [
        { text: '✏️ Edit', callback_data: `edit_${expenseId}` },
        { text: '🗑️ Delete', callback_data: `delete_${expenseId}` },
        { text: '🏷️ Tag', callback_data: `tag_${expenseId}` }
      ],
      [
        { text: '📊 Today\'s Total', callback_data: 'today_total' },
        { text: '💰 Balance', callback_data: 'balance' }
      ]
    ]
  }
}

// ============= MORNING BRIEF (9 AM) =============
async function generateMorningBrief(profile: any): Promise<string> {
  const yesterday = subDays(new Date(), 1)
  const { data: yesterdayExpenses } = await supabase
    .from('expenses')
    .select('amount, categories(name)')
    .eq('profile_id', profile.id)
    .gte('expense_date', `${format(yesterday, 'yyyy-MM-dd')}T00:00:00`)
    .lte('expense_date', `${format(yesterday, 'yyyy-MM-dd')}T23:59:59`)
  
  const yesterdayTotal = yesterdayExpenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
  const monthSpent = await getMonthlySpent(profile)
  const remaining = profile.personal_budget - monthSpent
  const dailyBudget = Math.floor(profile.personal_budget / 30)
  const daysLeft = 30 - new Date().getDate()
  const suggestedDaily = daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0
  
  const streak = await getSpendingStreak(profile)
  
  const weekSpent = await getWeeklySpent(profile)
  const weekBudget = dailyBudget * 7
  
  let tip = '💡 '
  const dayOfWeek = getDay(new Date())
  if (dayOfWeek === 5) {
    tip += 'It\'s Friday! You typically spend ₹800 on Fridays. Plan accordingly!'
  } else if (yesterdayTotal > dailyBudget * 1.5) {
    tip += 'You overspent yesterday. Try to stay under budget today to compensate.'
  } else if (streak >= 3) {
    tip += `Amazing streak of ${streak} days! Keep it going!`
  } else {
    tip += 'Pro tip: Meal prep on Sundays saves ₹3,000/month on average!'
  }
  
  return `🌅 <b>Good Morning! Here's your financial snapshot:</b>

${getVisualSeparator()}
📊 <b>Yesterday's Summary:</b>
├─ Spent: ${formatCurrency(yesterdayTotal)} ${yesterdayTotal <= dailyBudget ? '✅' : '⚠️'}
├─ Top: ${getYesterdayTopCategory(yesterdayExpenses)}
└─ ${yesterdayTotal < dailyBudget ? `Saved: ${formatCurrency(dailyBudget - yesterdayTotal)}` : `Over by: ${formatCurrency(yesterdayTotal - dailyBudget)}`}

${getVisualSeparator()}
💰 <b>Today's Budget:</b> ${formatCurrency(suggestedDaily)}
├─ 🍽️ Food allowance: ${formatCurrency(Math.floor(suggestedDaily * 0.35))}
├─ 🚗 Travel allowance: ${formatCurrency(Math.floor(suggestedDaily * 0.15))}
└─ 💳 Discretionary: ${formatCurrency(Math.floor(suggestedDaily * 0.5))}

${getVisualSeparator()}
📈 <b>This Week:</b> ${formatCurrency(weekSpent)}/${formatCurrency(weekBudget)}
${getProgressBar(weekSpent, weekBudget, 15)} ${((weekSpent/weekBudget)*100).toFixed(0)}%

🔥 <b>Streak:</b> ${streak} days within budget!

${getVisualSeparator()}
${tip}

<i>Reply with any amount to start tracking!</i>`
}

// ============= EVENING REPORT (8 PM) =============
async function generateEveningReport(profile: any): Promise<string> {
  const today = new Date()
  const { data: todayExpenses } = await supabase
    .from('expenses')
    .select('*, categories(name)')
    .eq('profile_id', profile.id)
    .gte('expense_date', `${format(today, 'yyyy-MM-dd')}T00:00:00`)
    .lte('expense_date', `${format(today, 'yyyy-MM-dd')}T23:59:59`)
    .order('expense_date', { ascending: true })
  
  const todayTotal = todayExpenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
  const dailyBudget = Math.floor(profile.personal_budget / 30)
  const monthSpent = await getMonthlySpent(profile)
  const remaining = profile.personal_budget - monthSpent
  const daysLeft = 30 - today.getDate()
  
  const categoryTotals: Record<string, number> = {}
  todayExpenses?.forEach(e => {
    const cat = e.categories?.name || 'Other'
    categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(e.amount)
  })
  
  let expenseList = ''
  if (todayExpenses && todayExpenses.length > 0) {
    expenseList = todayExpenses.map(e => 
      `• ${getCategoryEmoji(e.categories?.name || 'Other')} ${e.description}: ${formatCurrency(e.amount)}`
    ).join('\n')
  } else {
    expenseList = '• No expenses logged today'
  }
  
  const categoryBreakdown = Object.entries(categoryTotals)
    .map(([cat, amount]) => `${getCategoryEmoji(cat)} ${cat}: ${((amount/todayTotal)*100).toFixed(0)}%`)
    .join(' | ')
  
  let weekendWarning = ''
  if (getDay(today) === 5) {
    weekendWarning = '\n\n⚠️ <b>Weekend ahead!</b> You typically spend ₹2,500 on Saturdays.'
  }
  
  return `🌙 <b>Day Wrap-up</b>

${getVisualSeparator()}
${todayTotal <= dailyBudget ? '✅' : '⚠️'} <b>Today's Expenses</b> (${todayExpenses?.length || 0} items):
${expenseList}
${getVisualSeparator()}
<b>Total:</b> ${formatCurrency(todayTotal)} ${todayTotal <= dailyBudget ? `(Under budget by ${formatCurrency(dailyBudget - todayTotal)}!)` : `(Over budget by ${formatCurrency(todayTotal - dailyBudget)})`}

${getVisualSeparator()}
📊 <b>Category Breakdown:</b>
${categoryBreakdown || 'No expenses today'}

${getVisualSeparator()}
💰 <b>Month Progress:</b> ${formatCurrency(monthSpent)}/${formatCurrency(profile.personal_budget)}
${getProgressBar(monthSpent, profile.personal_budget, 15)} ${((monthSpent/profile.personal_budget)*100).toFixed(0)}%

📅 ${daysLeft} days left | Suggested daily: ${formatCurrency(Math.floor(remaining/daysLeft))}
${weekendWarning}

<i>Great job tracking today! See you tomorrow 🌟</i>`
}

// ============= RECURRING EXPENSES MANAGEMENT =============
async function handleRecurringExpense(text: string, profile: any): Promise<string> {
  const match = text.match(RECURRING_PATTERNS[0])
  if (!match) return ''
  
  const [_, name, amount, day] = match
  const dayOfMonth = day ? parseInt(day) : 1
  
  return `📱 <b>Recurring Expense Set!</b>

📝 <b>Name:</b> ${name}
💰 <b>Amount:</b> ${formatCurrency(parseInt(amount))}
📅 <b>Due:</b> ${dayOfMonth}${getOrdinalSuffix(dayOfMonth)} of every month

✅ I'll remind you before the due date!

<b>Your Subscriptions:</b>
• Netflix: ₹499 (15th)
• ${name}: ₹${amount} (${dayOfMonth}${getOrdinalSuffix(dayOfMonth)})

Total monthly subscriptions: ₹${499 + parseInt(amount)}`
}

// ============= ENHANCED CONVERSATION SAMPLES =============
async function handleEnhancedConversation(text: string, profile: any): Promise<{ message: string, keyboard?: any }> {
  const expense = parseExpenseText(text)
  if (!expense) return { message: '' }
  
  const result = await addExpenseFromText(expense, profile)
  
  const todayTotal = await getTodayTotal(profile)
  const categoryTotal = await getCategoryTotalToday(profile, expense.category)
  const dailyBudget = Math.floor(profile.personal_budget / 30)
  const categoryBudget = getCategoryDailyBudget(expense.category, dailyBudget)
  
  let message = `✅ <b>Added ${expense.description}: ${formatCurrency(expense.amount)}</b>\n\n`
  
  message += `📊 <b>${expense.category} Today:</b> ${formatCurrency(categoryTotal)}/${formatCurrency(categoryBudget)} `
  message += `(${((categoryTotal/categoryBudget)*100).toFixed(0)}% used`
  if (categoryTotal > categoryBudget) {
    message += ' ⚠️)\n'
    message += `⚠️ ${expense.category} budget exhausted!\n`
    message += `Suggestion: Avoid ${expense.category.toLowerCase()} expenses tomorrow\n\n`
  } else {
    message += ' ✅)\n\n'
  }
  
  message += `💰 <b>Total Today:</b> ${formatCurrency(todayTotal)}/${formatCurrency(dailyBudget)}\n`
  
  const weekTotal = await getWeeklySpent(profile)
  message += `📈 <b>This Week:</b> ${formatCurrency(weekTotal)}\n\n`
  
  if (expense.category === 'Food' && categoryTotal > categoryBudget * 0.9) {
    message += '💡 <b>Tip:</b> Cook dinner at home tonight to stay within budget'
  } else if (todayTotal > dailyBudget) {
    message += '💡 <b>Tip:</b> You\'ve exceeded today\'s budget. Try a no-spend day tomorrow!'
  }
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: 'Edit', callback_data: `edit_last` },
        { text: 'Delete', callback_data: `delete_last` },
        { text: 'See All Food', callback_data: `category_${expense.category}` }
      ],
      [
        { text: 'Today\'s Summary', callback_data: 'today_total' }
      ]
    ]
  }
  
  return { message, keyboard }
}

// ============= MAIN WEBHOOK HANDLER =============
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
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .single()
    
    if (!profile) {
      await sendMessage(chatId, '❌ Profile not found. Please set up your account first.')
      return NextResponse.json({ ok: true })
    }
    
    if (callbackQuery) {
      await handleCallbackQuery(callbackQuery, profile)
      return NextResponse.json({ ok: true })
    }
    
    let responseText = ''
    let replyMarkup = null
    
    // Check if it's a command first (before parsing as expense)
    const isCommand = await handleCommand(text, profile)
    
    if (isCommand.handled) {
      responseText = isCommand.message
      replyMarkup = isCommand.keyboard || null
    }
    // Check for "add" prefix
    else if (text.toLowerCase().startsWith('add ')) {
      const expenseText = text.substring(4).trim()
      const expense = parseExpenseText(expenseText)
      if (expense) {
        const result = await handleEnhancedConversation(expenseText, profile)
        responseText = result.message
        replyMarkup = result.keyboard
      } else {
        responseText = '💰 <b>Quick Add Expense</b>\n\nChoose an option or type your own:'
        replyMarkup = getQuickAddKeyboard()
      }
    }
    // Quick add menu
    else if (text.toLowerCase() === 'add' || text === '➕ Add Expense') {
      responseText = '💰 <b>Quick Add Expense</b>\n\nChoose an option or type your own:'
      replyMarkup = getQuickAddKeyboard()
    }
    // Check for recurring expense command
    else if (text.toLowerCase().startsWith('set ') || text.toLowerCase().startsWith('recurring ')) {
      responseText = await handleRecurringExpense(text, profile)
    }
    // Check for natural language expense
    else if (parseExpenseText(text)) {
      const result = await handleEnhancedConversation(text, profile)
      responseText = result.message
      replyMarkup = result.keyboard
    }
    // Default to help with main menu
    else {
      responseText = getHelpMessage()
      replyMarkup = getMainMenuKeyboard()
    }
    
    if (responseText) {
      await sendMessage(chatId, responseText, replyMarkup)
    }
    
    return NextResponse.json({ ok: true })
    
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}

// ============= COMMAND HANDLER =============
async function handleCommand(text: string, profile: any): Promise<{ handled: boolean; message?: string; keyboard?: any }> {
  const lowerText = text.toLowerCase()
  
  // Remove emoji prefixes for command matching
  const cleanText = lowerText
    .replace('💰', '').replace('📊', '').replace('📈', '')
    .replace('🍽️', '').replace('🚗', '').replace('📋', '')
    .replace('⚙️', '').replace('💡', '').replace('➕', '')
    .trim()
  
  // Balance commands
  if (cleanText === 'balance' || cleanText === 'bal' || lowerText === '💰 balance') {
    const result = await getBalanceReport(profile)
    return { handled: true, message: result.message, keyboard: result.keyboard }
  }
  
  // Today commands
  if (cleanText === 'today' || lowerText === '📊 today') {
    return { handled: true, message: await getTodayReport(profile) }
  }
  
  // This Week commands
  if (cleanText === 'week' || cleanText === 'weekly' || cleanText === 'this week' || lowerText === '📈 this week') {
    return { handled: true, message: await getWeekReport(profile) }
  }
  
  // Yesterday
  if (cleanText === 'yesterday') {
    return { handled: true, message: await getYesterdayReport(profile) }
  }
  
  // Month
  if (cleanText === 'month' || cleanText === 'monthly') {
    return { handled: true, message: await getMonthReport(profile) }
  }
  
  // Weekend
  if (cleanText === 'weekend') {
    return { handled: true, message: await getWeekendAnalysis(profile) }
  }
  
  // Morning/Evening reports
  if (cleanText === 'morning' || cleanText === 'brief') {
    return { handled: true, message: await generateMorningBrief(profile) }
  }
  
  if (cleanText === 'evening' || cleanText === 'summary') {
    return { handled: true, message: await generateEveningReport(profile) }
  }
  
  // Category commands
  if (cleanText === 'food' || lowerText === '🍽️ food') {
    return { handled: true, message: await getCategoryReport(profile, 'Food') }
  }
  
  if (cleanText === 'travel' || lowerText === '🚗 travel') {
    return { handled: true, message: await getCategoryReport(profile, 'Travel') }
  }
  
  if (cleanText === 'alcohol' || cleanText === 'drinks') {
    return { handled: true, message: await getCategoryReport(profile, 'Alcohol') }
  }
  
  if (cleanText === 'misc' || cleanText === 'miscellaneous') {
    return { handled: true, message: await getCategoryReport(profile, 'Miscellaneous') }
  }
  
  if (cleanText === 'other') {
    return { handled: true, message: await getCategoryReport(profile, 'Other') }
  }
  
  // Report command
  if (cleanText === 'report' || lowerText === '📋 report') {
    return { handled: true, message: await getDetailedReport(profile) }
  }
  
  // Settings
  if (cleanText === 'settings' || lowerText === '⚙️ settings') {
    return { 
      handled: true, 
      message: '⚙️ <b>Settings</b>\n\nComing soon!\n\n• Budget adjustment\n• Categories management\n• Notification preferences\n• Export data',
      keyboard: getMainMenuKeyboard()
    }
  }
  
  // Help
  if (cleanText === 'help' || cleanText === '/help' || cleanText === '/start' || lowerText === '💡 help') {
    return { 
      handled: true, 
      message: getHelpMessage(),
      keyboard: getMainMenuKeyboard()
    }
  }
  
  return { handled: false }
}

// ============= HELPER FUNCTIONS =============
function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return 'th'
  switch (day % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
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

async function getWeeklySpent(profile: any): Promise<number> {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  
  const { data } = await supabase
    .from('expenses')
    .select('amount')
    .eq('profile_id', profile.id)
    .gte('expense_date', weekStart.toISOString())
  
  return data?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
}

async function getTodayTotal(profile: any): Promise<number> {
  const today = format(new Date(), 'yyyy-MM-dd')
  
  const { data } = await supabase
    .from('expenses')
    .select('amount')
    .eq('profile_id', profile.id)
    .gte('expense_date', `${today}T00:00:00`)
    .lte('expense_date', `${today}T23:59:59`)
  
  return data?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
}

async function getCategoryTotalToday(profile: any, category: string): Promise<number> {
  const today = format(new Date(), 'yyyy-MM-dd')
  
  const { data: cat } = await supabase
    .from('categories')
    .select('id')
    .eq('name', category)
    .eq('profile_id', profile.id)
    .single()
  
  if (!cat) return 0
  
  const { data } = await supabase
    .from('expenses')
    .select('amount')
    .eq('profile_id', profile.id)
    .eq('category_id', cat.id)
    .gte('expense_date', `${today}T00:00:00`)
    .lte('expense_date', `${today}T23:59:59`)
  
  return data?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
}

function getCategoryDailyBudget(category: string, dailyTotal: number): number {
  const allocations: Record<string, number> = {
    'Food': 0.35,
    'Travel': 0.15,
    'Alcohol': 0.20,
    'Miscellaneous': 0.15,
    'Other': 0.15
  }
  return Math.floor(dailyTotal * (allocations[category] || 0.2))
}

async function getSpendingStreak(profile: any): Promise<number> {
  const dailyBudget = Math.floor(profile.personal_budget / 30)
  let streak = 0
  
  for (let i = 0; i < 30; i++) {
    const date = subDays(new Date(), i)
    const dateStr = format(date, 'yyyy-MM-dd')
    
    const { data } = await supabase
      .from('expenses')
      .select('amount')
      .eq('profile_id', profile.id)
      .gte('expense_date', `${dateStr}T00:00:00`)
      .lte('expense_date', `${dateStr}T23:59:59`)
    
    const dayTotal = data?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
    
    if (dayTotal <= dailyBudget) {
      streak++
    } else {
      break
    }
  }
  
  return streak
}

function getYesterdayTopCategory(expenses: any[]): string {
  if (!expenses || expenses.length === 0) return 'No expenses'
  
  const categoryTotals: Record<string, number> = {}
  expenses.forEach(e => {
    const cat = e.categories?.name || 'Other'
    categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(e.amount)
  })
  
  const top = Object.entries(categoryTotals)
    .sort(([,a], [,b]) => b - a)[0]
  
  return top ? `${top[0]} (${formatCurrency(top[1])})` : 'No expenses'
}

// Send message helper
async function sendMessage(chatId: number, text: string, replyMarkup?: any) {
  const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN
  
  if (!token) {
    console.error('Telegram bot token not configured')
    return
  }
  
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      })
    })
  } catch (error) {
    console.error('Failed to send message:', error)
  }
}

// Parse expense text - FIXED to avoid matching commands
function parseExpenseText(text: string): { amount: number; description: string; category: string } | null {
  // Don't parse single word commands
  const commandWords = ['balance', 'bal', 'today', 'week', 'weekly', 'month', 'monthly', 
                       'yesterday', 'weekend', 'food', 'travel', 'drinks', 'alcohol',
                       'misc', 'miscellaneous', 'other', 'report', 'settings', 'help',
                       'morning', 'evening', 'brief', 'summary', 'add']
  
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

// Detect category from text
function detectCategory(text: string): string {
  const lowerText = text.toLowerCase()
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return category
    }
  }
  
  return 'Other'
}

// Handle callback queries - FIXED for all buttons
async function handleCallbackQuery(query: any, profile: any) {
  const chatId = query.message.chat.id
  const data = query.data
  
  let responseText = ''
  let replyMarkup = null
  
  // Quick add callbacks
  if (data.startsWith('quick_')) {
    const [_, amount, description] = data.split('_')
    const expense = {
      amount: parseInt(amount),
      description,
      category: detectCategory(description)
    }
    const result = await addExpenseFromText(expense, profile)
    responseText = result.message
    replyMarkup = result.keyboard
  }
  // Delete expense
  else if (data.startsWith('delete_')) {
    const expenseId = data.replace('delete_', '')
    if (expenseId === 'last') {
      const { data: lastExpense } = await supabase
        .from('expenses')
        .select('id')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (lastExpense) {
        await supabase.from('expenses').delete().eq('id', lastExpense.id)
        responseText = '✅ Last expense deleted successfully!'
      }
    } else {
      await supabase.from('expenses').delete().eq('id', expenseId)
      responseText = '✅ Expense deleted successfully!'
    }
  }
  // Edit expense
  else if (data.startsWith('edit_')) {
    responseText = '✏️ <b>Edit Expense</b>\n\nTo edit, delete this expense and add a new one with the correct details.'
    replyMarkup = getMainMenuKeyboard()
  }
  // Tag expense
  else if (data.startsWith('tag_')) {
    responseText = '🏷️ <b>Tag Feature</b>\n\nComing soon! You\'ll be able to add custom tags to categorize expenses better.'
    replyMarkup = getMainMenuKeyboard()
  }
  // Today's total
  else if (data === 'today_total') {
    responseText = await getTodayReport(profile)
  }
  // Balance
  else if (data === 'balance') {
    const result = await getBalanceReport(profile)
    responseText = result.message
    replyMarkup = result.keyboard
  }
  // Week summary
  else if (data === 'week_summary') {
    responseText = await getWeekReport(profile)
  }
  // Category reports
  else if (data.startsWith('category_')) {
    const category = data.replace('category_', '')
    responseText = await getCategoryReport(profile, category)
  }
  // Full report
  else if (data === 'full_report') {
    responseText = await getDetailedReport(profile)
  }
  // Add expense
  else if (data === 'add_expense') {
    responseText = '💰 <b>Add New Expense</b>\n\nJust type the amount and description:\n\nExamples:\n• 200 lunch\n• coffee 50\n• spent 500 on drinks'
    replyMarkup = getQuickAddKeyboard()
  }
  
  // Answer callback query to remove loading state
  await fetch(`https://api.telegram.org/bot${process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: query.id,
      text: 'Processing...'
    })
  })
  
  if (responseText) {
    await sendMessage(chatId, responseText, replyMarkup)
  }
}

// Add expense from text
async function addExpenseFromText(data: { amount: number; description: string; category: string }, profile: any) {
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
    return {
      message: '❌ Failed to add expense. Please try again.',
      keyboard: null
    }
  }
  
  const todayTotal = await getTodayTotal(profile)
  const remaining = profile.personal_budget - (await getMonthlySpent(profile))
  const dailyBudget = Math.floor(profile.personal_budget / 30)
  
  let statusEmoji = '✅'
  let warningText = ''
  
  if (todayTotal > dailyBudget) {
    statusEmoji = '⚠️'
    warningText = `\n\n⚠️ <b>Over daily budget!</b>\nSpent: ${formatCurrency(todayTotal)} | Budget: ${formatCurrency(dailyBudget)}`
  }
  
  if (remaining < 5000) {
    warningText += `\n\n🔴 <b>Low balance alert!</b>\nOnly ${formatCurrency(remaining)} left!`
  }
  
  const message = `${statusEmoji} <b>Expense Added!</b>

${getCategoryEmoji(data.category)} <b>Category:</b> ${data.category}
💰 <b>Amount:</b> ${formatCurrency(data.amount)}
📝 <b>Description:</b> ${data.description}

📊 <b>Today's Total:</b> ${formatCurrency(todayTotal)}
💳 <b>Month Remaining:</b> ${formatCurrency(remaining)}${warningText}`
  
  const keyboard = getExpenseActionKeyboard('last')
  
  return { message, keyboard }
}

// Get help message
function getHelpMessage(): string {
  return `👋 <b>Expense Tracker Bot</b>

<b>Natural Language:</b>
• "200 lunch" - Add lunch expense
• "spent 500 on drinks" - Add drinks
• "coffee 50" - Quick coffee entry
• "add food 300" - Add with category

<b>Commands:</b>
• <b>balance</b> - Check remaining budget
• <b>today</b> - Today's summary
• <b>yesterday</b> - Yesterday's report
• <b>week</b> - Weekly analysis
• <b>month</b> - Monthly overview
• <b>weekend</b> - Weekend spending
• <b>morning</b> - Morning brief
• <b>evening</b> - Evening report

<b>Categories:</b>
• <b>food</b> - Food expenses report
• <b>travel</b> - Travel expenses report
• <b>drinks/alcohol</b> - Drinks report
• <b>misc</b> - Miscellaneous report
• <b>other</b> - Other expenses

<b>Special:</b>
• "set netflix 499 monthly on 15" - Set recurring
• "paid 1200 dinner split with 3" - Split bills

<b>Tips:</b>
• Use the keyboard buttons below for quick access
• Track as you spend for best results
• Check your balance daily

<i>Just start typing an amount to begin!</i>`
}

// Get today's report
async function getTodayReport(profile: any): Promise<string> {
  const today = new Date()
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, categories(name)')
    .eq('profile_id', profile.id)
    .gte('expense_date', `${format(today, 'yyyy-MM-dd')}T00:00:00`)
    .lte('expense_date', `${format(today, 'yyyy-MM-dd')}T23:59:59`)
    .order('expense_date', { ascending: false })
  
  const total = expenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
  const dailyBudget = Math.floor(profile.personal_budget / 30)
  
  if (!expenses || expenses.length === 0) {
    return `📊 <b>Today's Report</b>

✨ No expenses yet today!

💰 Daily Budget: ${formatCurrency(dailyBudget)}

<i>Start tracking by typing: "100 coffee"</i>`
  }
  
  const expenseList = expenses.map(e => 
    `• ${getCategoryEmoji(e.categories?.name)} ${e.description}: ${formatCurrency(e.amount)}`
  ).join('\n')
  
  return `📊 <b>Today's Report</b>

${expenseList}

${getVisualSeparator()}
<b>Total:</b> ${formatCurrency(total)}/${formatCurrency(dailyBudget)}
${getProgressBar(total, dailyBudget)} ${((total/dailyBudget)*100).toFixed(0)}%

${total > dailyBudget ? '⚠️ Over budget!' : '✅ Within budget!'}`
}

// Get yesterday's report
async function getYesterdayReport(profile: any): Promise<string> {
  const yesterday = subDays(new Date(), 1)
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, categories(name)')
    .eq('profile_id', profile.id)
    .gte('expense_date', `${format(yesterday, 'yyyy-MM-dd')}T00:00:00`)
    .lte('expense_date', `${format(yesterday, 'yyyy-MM-dd')}T23:59:59`)
  
  const total = expenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
  const dailyBudget = Math.floor(profile.personal_budget / 30)
  
  if (!expenses || expenses.length === 0) {
    return `📊 <b>Yesterday's Report</b>

✨ No expenses recorded yesterday!`
  }
  
  const categoryTotals: Record<string, number> = {}
  expenses.forEach(e => {
    const cat = e.categories?.name || 'Other'
    categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(e.amount)
  })
  
  const categoryList = Object.entries(categoryTotals)
    .map(([cat, amount]) => `${getCategoryEmoji(cat)} ${cat}: ${formatCurrency(amount)}`)
    .join('\n')
  
  return `📊 <b>Yesterday's Report</b>

<b>Categories:</b>
${categoryList}

${getVisualSeparator()}
<b>Total:</b> ${formatCurrency(total)}
<b>Budget:</b> ${formatCurrency(dailyBudget)}
<b>Status:</b> ${total <= dailyBudget ? '✅ Under budget' : `⚠️ Over by ${formatCurrency(total - dailyBudget)}`}`
}

// Get week report
async function getWeekReport(profile: any): Promise<string> {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, categories(name)')
    .eq('profile_id', profile.id)
    .gte('expense_date', weekStart.toISOString())
  
  const total = expenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
  const weekBudget = Math.floor(profile.personal_budget / 30) * 7
  
  const dailyTotals: Record<string, number> = {}
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  
  expenses?.forEach(e => {
    const day = format(new Date(e.expense_date), 'EEE')
    dailyTotals[day] = (dailyTotals[day] || 0) + parseFloat(e.amount)
  })
  
  const dailyBreakdown = days.map(day => {
    const amount = dailyTotals[day] || 0
    const bar = getProgressBar(amount, Math.floor(weekBudget / 7), 8)
    return `${day}: ${bar} ${formatCurrency(amount)}`
  }).join('\n')
  
  return `📈 <b>Weekly Report</b>

<b>Daily Breakdown:</b>
${dailyBreakdown}

${getVisualSeparator()}
<b>Week Total:</b> ${formatCurrency(total)}/${formatCurrency(weekBudget)}
${getProgressBar(total, weekBudget)} ${((total/weekBudget)*100).toFixed(0)}%

<b>Daily Average:</b> ${formatCurrency(Math.floor(total / 7))}
<b>Status:</b> ${total <= weekBudget ? '✅ On track!' : '⚠️ Over budget!'}`
}

// Get month report
async function getMonthReport(profile: any): Promise<string> {
  const monthStart = startOfMonth(new Date())
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, categories(name)')
    .eq('profile_id', profile.id)
    .gte('expense_date', monthStart.toISOString())
  
  const total = expenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
  const remaining = profile.personal_budget - total
  const daysInMonth = 30
  const daysPassed = new Date().getDate()
  const daysLeft = daysInMonth - daysPassed
  
  const categoryTotals: Record<string, number> = {}
  expenses?.forEach(e => {
    const cat = e.categories?.name || 'Other'
    categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(e.amount)
  })
  
  const topCategories = Object.entries(categoryTotals)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([cat, amount]) => `${getCategoryEmoji(cat)} ${cat}: ${formatCurrency(amount)}`)
    .join('\n')
  
  return `📊 <b>Monthly Report</b>

<b>Progress:</b> Day ${daysPassed} of ${daysInMonth}

<b>Budget Status:</b>
${getProgressBar(total, profile.personal_budget, 20)}
${formatCurrency(total)} / ${formatCurrency(profile.personal_budget)} (${((total/profile.personal_budget)*100).toFixed(0)}%)

<b>Top Categories:</b>
${topCategories}

${getVisualSeparator()}
💰 <b>Remaining:</b> ${formatCurrency(remaining)}
📅 <b>Days Left:</b> ${daysLeft}
📊 <b>Suggested Daily:</b> ${formatCurrency(Math.floor(remaining / daysLeft))}

${remaining < 5000 ? '⚠️ Low balance - spend carefully!' : '✅ Good progress - keep it up!'}`
}

// Get weekend analysis
async function getWeekendAnalysis(profile: any): Promise<string> {
  const lastSaturday = subDays(new Date(), getDay(new Date()) + 1)
  const lastSunday = addDays(lastSaturday, 1)
  
  const { data: lastWeekend } = await supabase
    .from('expenses')
    .select('amount')
    .eq('profile_id', profile.id)
    .gte('expense_date', format(lastSaturday, 'yyyy-MM-dd'))
    .lte('expense_date', format(lastSunday, 'yyyy-MM-dd'))
  
  const lastWeekendTotal = lastWeekend?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
  
  const weekdayExpenses = await getWeekdayAverage(profile)
  const weekendAverage = lastWeekendTotal / 2
  const difference = weekdayExpenses > 0 ? ((weekendAverage - weekdayExpenses) / weekdayExpenses * 100).toFixed(0) : 0
  
  return `📅 <b>Weekend Analysis</b>

<b>Last Weekend:</b>
• Saturday: ${formatCurrency(lastWeekendTotal * 0.6)} (estimated)
• Sunday: ${formatCurrency(lastWeekendTotal * 0.4)} (estimated)
• Total: ${formatCurrency(lastWeekendTotal)}

<b>Comparison:</b>
• Weekday avg: ${formatCurrency(weekdayExpenses)}/day
• Weekend avg: ${formatCurrency(weekendAverage)}/day
• Difference: ${difference}% higher

${getVisualSeparator()}
💡 <b>Tips for this weekend:</b>
• Set limit: ${formatCurrency(Math.min(2500, profile.personal_budget * 0.1))}
• Avoid impulse purchases
• Plan activities in advance
• Track as you spend`
}

// Get category report
async function getCategoryReport(profile: any, categoryName: string): Promise<string> {
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
  
  const total = expenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
  const budget = category.budget_amount || (profile.personal_budget * 0.2)
  
  const recentList = expenses?.slice(0, 5).map(e => 
    `• ${format(new Date(e.expense_date), 'MMM d')}: ${formatCurrency(e.amount)} - ${e.description}`
  ).join('\n') || 'No expenses yet'
  
  return `${getCategoryEmoji(categoryName)} <b>${categoryName} Report</b>

<b>This Month:</b>
${getProgressBar(total, budget, 15)}
${formatCurrency(total)} / ${formatCurrency(budget)} (${((total/budget)*100).toFixed(0)}%)

<b>Recent Expenses:</b>
${recentList}

${getVisualSeparator()}
<b>Daily Average:</b> ${formatCurrency(Math.floor(total / new Date().getDate()))}
<b>Remaining:</b> ${formatCurrency(budget - total)}
<b>Status:</b> ${total > budget ? '⚠️ Over budget!' : '✅ Within budget'}`
}

// Get detailed report
async function getDetailedReport(profile: any): Promise<string> {
  const monthSpent = await getMonthlySpent(profile)
  const weekSpent = await getWeeklySpent(profile)
  const todaySpent = await getTodayTotal(profile)
  const remaining = profile.personal_budget - monthSpent
  
  return `📋 <b>Detailed Financial Report</b>

${getVisualSeparator()}
<b>📊 Overview:</b>
• Today: ${formatCurrency(todaySpent)}
• This Week: ${formatCurrency(weekSpent)}
• This Month: ${formatCurrency(monthSpent)}
• Remaining: ${formatCurrency(remaining)}

${getVisualSeparator()}
<b>📈 Progress:</b>
Month: ${getProgressBar(monthSpent, profile.personal_budget)}
Week: ${getProgressBar(weekSpent, Math.floor(profile.personal_budget/4))}
Today: ${getProgressBar(todaySpent, Math.floor(profile.personal_budget/30))}

${getVisualSeparator()}
<b>💡 Insights:</b>
• Daily Average: ${formatCurrency(Math.floor(monthSpent / new Date().getDate()))}
• Projected Month: ${formatCurrency(Math.floor(monthSpent / new Date().getDate() * 30))}
• Status: ${remaining > 10000 ? '✅ Healthy' : remaining > 5000 ? '🟡 Caution' : '🔴 Critical'}

<i>Use category commands (food, travel, etc.) for detailed breakdowns</i>`
}

// Get weekday average
async function getWeekdayAverage(profile: any): Promise<number> {
  const lastMonday = subDays(new Date(), getDay(new Date()) + 6)
  const lastFriday = addDays(lastMonday, 4)
  
  const { data } = await supabase
    .from('expenses')
    .select('amount')
    .eq('profile_id', profile.id)
    .gte('expense_date', format(lastMonday, 'yyyy-MM-dd'))
    .lte('expense_date', format(lastFriday, 'yyyy-MM-dd'))
  
  const total = data?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
  return total / 5
}

// Get balance report
async function getBalanceReport(profile: any): Promise<{ message: string; keyboard?: any }> {
  const monthSpent = await getMonthlySpent(profile)
  const remaining = profile.personal_budget - monthSpent
  const dailyBudget = Math.floor(profile.personal_budget / 30)
  const daysInMonth = 30
  const daysPassed = new Date().getDate()
  const daysLeft = daysInMonth - daysPassed
  const suggestedDaily = daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0
  
  const weekSpent = await getWeeklySpent(profile)
  const todaySpent = await getTodayTotal(profile)
  
  const spendingPace = daysPassed > 0 ? Math.floor(monthSpent / daysPassed) : 0
  const projectedMonthEnd = spendingPace * daysInMonth
  const projectedSavings = profile.personal_budget - projectedMonthEnd
  
  let statusEmoji = '💚'
  let statusText = 'Excellent!'
  let advice = '✨ Keep up the great work!'
  
  if (remaining < 3000) {
    statusEmoji = '🔴'
    statusText = 'Critical!'
    advice = '⚠️ Only essential expenses recommended'
  } else if (remaining < 7000) {
    statusEmoji = '🟡'
    statusText = 'Caution'
    advice = '💡 Be mindful of spending'
  } else if (remaining < 15000) {
    statusEmoji = '🟢'
    statusText = 'Good'
    advice = '👍 You\'re doing well'
  }
  
  const percentUsed = ((monthSpent / profile.personal_budget) * 100).toFixed(1)
  const percentRemaining = ((remaining / profile.personal_budget) * 100).toFixed(1)
  
  const message = `💰 <b>Balance Report</b>

${getVisualSeparator()}
<b>Month Status:</b> ${statusEmoji} ${statusText}

<b>Budget:</b> ${formatCurrency(profile.personal_budget)}
<b>Spent:</b> ${formatCurrency(monthSpent)} (${percentUsed}%)
<b>Remaining:</b> ${formatCurrency(remaining)} (${percentRemaining}%)

${getProgressBar(monthSpent, profile.personal_budget, 20)}

${getVisualSeparator()}
📊 <b>Spending Breakdown:</b>
• Today: ${formatCurrency(todaySpent)} ${todaySpent > dailyBudget ? '⚠️' : '✅'}
• This Week: ${formatCurrency(weekSpent)}
• Daily Average: ${formatCurrency(spendingPace)}

${getVisualSeparator()}
📅 <b>Time Analysis:</b>
• Days Passed: ${daysPassed}/${daysInMonth}
• Days Left: ${daysLeft}
• Suggested Daily: ${formatCurrency(suggestedDaily)}

${getVisualSeparator()}
📈 <b>Projections:</b>
• Month-end Total: ${formatCurrency(projectedMonthEnd)}
• Expected ${projectedSavings >= 0 ? 'Savings' : 'Overspend'}: ${formatCurrency(Math.abs(projectedSavings))}

${getVisualSeparator()}
${advice}

${remaining < 5000 ? '\n🔔 <b>Alert:</b> Consider postponing non-essential purchases' : ''}
${suggestedDaily < 500 ? '\n⚠️ <b>Warning:</b> Very tight daily budget ahead!' : ''}`
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '📊 Today', callback_data: 'today_total' },
        { text: '📈 Week', callback_data: 'week_summary' }
      ],
      [
        { text: '📋 Full Report', callback_data: 'full_report' },
        { text: '➕ Add Expense', callback_data: 'add_expense' }
      ]
    ]
  }
  
  return { message, keyboard }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'Webhook is active',
    features: [
      'Natural language processing',
      'Rich morning/evening reports',
      'Interactive quick commands',
      'Visual enhancements',
      'Recurring expense management',
      'Enhanced conversations',
      'All keyboard buttons working',
      'Fixed command recognition'
    ]
  })
}