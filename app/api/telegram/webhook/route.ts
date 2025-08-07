import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { format, subDays, startOfWeek, startOfMonth, startOfDay, endOfDay } from 'date-fns'

// Send message to Telegram - FIXED keyboard handling
async function sendMessage(chatId: number, text: string, useKeyboard: boolean = false) {
  const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN
  if (!token) return
  
  try {
    const body: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    }
    
    // Only add keyboard if explicitly requested
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
  // Skip if it's a command
  const commands = ['balance', 'today', 'yesterday', 'week', 'month', 'report', 'help', 'food', 'travel', 'drinks', 'misc', 'other', 'morning', 'evening', 'weekend']
  if (commands.includes(text.toLowerCase())) return null
  
  // Try different patterns
  const patterns = [
    /^(\d+)\s+(.+)$/,           // "200 lunch"
    /^(.+)\s+(\d+)$/,           // "lunch 200"
    /^spent?\s+(\d+)\s+(?:on\s+)?(.+)$/i,  // "spent 200 on lunch"
    /^paid?\s+(\d+)\s+(?:for\s+)?(.+)$/i,  // "paid 200 for lunch"
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

async function getMonthlySpent(profile: any): Promise<number> {
  const monthStart = startOfMonth(new Date())
  
  const { data } = await supabase
    .from('expenses')
    .select('amount')
    .eq('profile_id', profile.id)
    .gte('expense_date', monthStart.toISOString())
  
  return data?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
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
          const remaining = profile.personal_budget - spent
          await sendMessage(chatId, `✅ Added: ${description} - ${formatMoney(amount)}\n💰 Remaining: ${formatMoney(remaining)}`)
        } else {
          await sendMessage(chatId, '❌ Failed to add expense')
        }
      }
      
      // Answer callback to remove loading state
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
    
    // Process commands
    let response = ''
    let useKeyboard = false
    let useInline = false
    
    // Balance command
    if (command === 'balance' || command === 'bal') {
      const spent = await getMonthlySpent(profile)
      const remaining = profile.personal_budget - spent
      const daysLeft = 30 - new Date().getDate()
      const dailySuggested = daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0
      
      response = `💰 <b>Balance Report</b>\n\n`
      response += `Budget: ${formatMoney(profile.personal_budget)}\n`
      response += `Spent: ${formatMoney(spent)}\n`
      response += `Remaining: ${formatMoney(remaining)}\n\n`
      response += `Days left: ${daysLeft}\n`
      response += `Suggested daily: ${formatMoney(dailySuggested)}`
    }
    // Today command
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
      const dailyBudget = Math.floor(profile.personal_budget / 30)
      
      response = `📊 <b>Today's Report</b>\n\n`
      
      if (!expenses || expenses.length === 0) {
        response += 'No expenses yet today!\n\n'
        response += `Daily budget: ${formatMoney(dailyBudget)}`
      } else {
        expenses.forEach(e => {
          response += `• ${e.description}: ${formatMoney(Number(e.amount))}\n`
        })
        response += `\nTotal: ${formatMoney(total)} / ${formatMoney(dailyBudget)}\n`
        response += total > dailyBudget ? '⚠️ Over budget!' : '✅ Within budget!'
      }
    }
    // Yesterday command
    else if (command === 'yesterday') {
      const yesterday = subDays(new Date(), 1)
      const startOfYesterday = startOfDay(yesterday)
      const endOfYesterday = endOfDay(yesterday)
      
      const { data: expenses } = await supabase
        .from('expenses')
        .select('*, categories(name)')
        .eq('profile_id', profile.id)
        .gte('expense_date', startOfYesterday.toISOString())
        .lte('expense_date', endOfYesterday.toISOString())
      
      const total = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
      
      response = `📊 <b>Yesterday's Report</b>\n\n`
      
      if (!expenses || expenses.length === 0) {
        response += 'No expenses yesterday!'
      } else {
        expenses.forEach(e => {
          response += `• ${e.description}: ${formatMoney(Number(e.amount))}\n`
        })
        response += `\nTotal: ${formatMoney(total)}`
      }
    }
    // Week command
    else if (command === 'week' || command === 'weekly' || command === 'this week') {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
      
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('profile_id', profile.id)
        .gte('expense_date', weekStart.toISOString())
      
      const total = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
      const weekBudget = Math.floor(profile.personal_budget / 30) * 7
      
      response = `📈 <b>Weekly Report</b>\n\n`
      response += `Week total: ${formatMoney(total)} / ${formatMoney(weekBudget)}\n`
      response += `Daily average: ${formatMoney(Math.floor(total / 7))}\n`
      response += total > weekBudget ? '⚠️ Over weekly budget!' : '✅ Within budget!'
    }
    // Month command
    else if (command === 'month' || command === 'monthly') {
      const spent = await getMonthlySpent(profile)
      const remaining = profile.personal_budget - spent
      const daysPassed = new Date().getDate()
      
      response = `📊 <b>Monthly Report</b>\n\n`
      response += `Day ${daysPassed} of 30\n\n`
      response += `Budget: ${formatMoney(profile.personal_budget)}\n`
      response += `Spent: ${formatMoney(spent)}\n`
      response += `Remaining: ${formatMoney(remaining)}\n\n`
      response += remaining < 5000 ? '⚠️ Low balance!' : '✅ Good progress!'
    }
    // Weekend command
    else if (command === 'weekend') {
      response = `📅 <b>Weekend Tips</b>\n\n`
      response += `• Set a weekend limit\n`
      response += `• Track as you spend\n`
      response += `• Avoid impulse purchases\n`
      response += `• Suggested limit: ${formatMoney(2500)}`
    }
    // Morning command
    else if (command === 'morning' || command === 'brief') {
      const spent = await getMonthlySpent(profile)
      const remaining = profile.personal_budget - spent
      const daysLeft = 30 - new Date().getDate()
      const dailySuggested = daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0
      
      response = `🌅 <b>Good Morning!</b>\n\n`
      response += `Today's budget: ${formatMoney(dailySuggested)}\n`
      response += `Month remaining: ${formatMoney(remaining)}\n`
      response += `Days left: ${daysLeft}\n\n`
      response += `Have a great day!`
    }
    // Evening command
    else if (command === 'evening' || command === 'summary') {
      const todayStart = startOfDay(new Date())
      const todayEnd = endOfDay(new Date())
      
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('profile_id', profile.id)
        .gte('expense_date', todayStart.toISOString())
        .lte('expense_date', todayEnd.toISOString())
      
      const todayTotal = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
      
      response = `🌙 <b>Evening Summary</b>\n\n`
      response += `Today's spending: ${formatMoney(todayTotal)}\n`
      response += `Expenses logged: ${expenses?.length || 0}\n\n`
      response += `Great job tracking today!`
    }
    // Report command
    else if (command === 'report') {
      const spent = await getMonthlySpent(profile)
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
      
      const { data: weekExpenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('profile_id', profile.id)
        .gte('expense_date', weekStart.toISOString())
      
      const weekTotal = weekExpenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
      
      response = `📋 <b>Detailed Report</b>\n\n`
      response += `<b>This Month:</b>\n`
      response += `• Spent: ${formatMoney(spent)}\n`
      response += `• Remaining: ${formatMoney(profile.personal_budget - spent)}\n\n`
      response += `<b>This Week:</b>\n`
      response += `• Spent: ${formatMoney(weekTotal)}\n\n`
      response += `Status: ${spent > profile.personal_budget * 0.8 ? '⚠️ High spending' : '✅ On track'}`
    }
    // Category commands
    else if (command === 'food') {
      response = await getCategoryReport(profile, 'Food')
    }
    else if (command === 'travel') {
      response = await getCategoryReport(profile, 'Travel')
    }
    else if (command === 'drinks' || command === 'alcohol') {
      response = await getCategoryReport(profile, 'Alcohol')
    }
    else if (command === 'misc' || command === 'miscellaneous') {
      response = await getCategoryReport(profile, 'Miscellaneous')
    }
    else if (command === 'other') {
      response = await getCategoryReport(profile, 'Other')
    }
    // Add command
    else if (command === 'add') {
      response = '💰 <b>Quick Add</b>\n\nChoose below or type:\n"200 lunch" or "coffee 50"'
      useInline = true
    }
    // Help command
    else if (command === 'help' || command === '/help' || command === '/start') {
      response = `👋 <b>Expense Tracker</b>\n\n`
      response += `<b>Commands:</b>\n`
      response += `• balance - Check remaining\n`
      response += `• today - Today's expenses\n`
      response += `• yesterday - Yesterday's expenses\n`
      response += `• week - Weekly report\n`
      response += `• month - Monthly report\n`
      response += `• report - Detailed report\n\n`
      response += `<b>Add expense:</b>\n`
      response += `Just type: "200 lunch" or "coffee 50"\n\n`
      response += `<b>Categories:</b>\n`
      response += `• food, travel, drinks, misc, other`
      useKeyboard = true
    }
    // Try to parse as expense
    else {
      // Check if it's "add X"
      if (command.startsWith('add ')) {
        const expenseText = text.substring(4)
        const expense = parseExpense(expenseText)
        if (expense) {
          const success = await addExpense(profile, expense.amount, expense.description, detectCategory(expense.description))
          if (success) {
            const spent = await getMonthlySpent(profile)
            const remaining = profile.personal_budget - spent
            response = `✅ Added: ${expense.description} - ${formatMoney(expense.amount)}\n💰 Remaining: ${formatMoney(remaining)}`
          } else {
            response = '❌ Failed to add expense'
          }
        } else {
          response = 'Invalid format. Try: "200 lunch"'
        }
      }
      // Try direct expense parsing
      else {
        const expense = parseExpense(text)
        if (expense) {
          const success = await addExpense(profile, expense.amount, expense.description, detectCategory(expense.description))
          if (success) {
            const spent = await getMonthlySpent(profile)
            const remaining = profile.personal_budget - spent
            response = `✅ Added: ${expense.description} - ${formatMoney(expense.amount)}\n💰 Remaining: ${formatMoney(remaining)}`
          } else {
            response = '❌ Failed to add expense'
          }
        } else {
          response = `Command not recognized: "${text}"\n\nType "help" for commands`
        }
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
  
  const monthStart = startOfMonth(new Date())
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('profile_id', profile.id)
    .eq('category_id', category.id)
    .gte('expense_date', monthStart.toISOString())
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
    version: '4.0 - Fixed keyboards'
  })
}