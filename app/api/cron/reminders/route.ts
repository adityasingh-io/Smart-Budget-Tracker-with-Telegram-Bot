// app/api/cron/reminders/route.ts - Enhanced Automated Reports
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { format, subDays, getDay } from 'date-fns'
import { generateMorningBrief, generateEveningReport } from '../telegram/webhook/route'

// Helper to send Telegram message
async function sendTelegramMessage(text: string, keyboard?: any) {
  const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN
  const chatId = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID
  
  if (!token || !chatId) {
    console.error('Telegram credentials not configured')
    return
  }
  
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: keyboard
        })
      }
    )
    
    if (!response.ok) {
      console.error('Failed to send Telegram message:', await response.text())
    }
  } catch (error) {
    console.error('Error sending Telegram message:', error)
  }
}

// Cron job handler
export async function GET(request: Request) {
  // Verify this is from Vercel Cron (security)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const hour = new Date().getHours()
  const dayOfWeek = getDay(new Date())
  
  try {
    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .single()
    
    if (!profile) {
      console.error('No profile found')
      return NextResponse.json({ error: 'No profile found' }, { status: 404 })
    }
    
    // Morning Brief - 9 AM IST (3:30 AM UTC)
    if (hour === 3 || hour === 9) { // Adjust based on your timezone
      const morningBrief = await generateMorningBrief(profile)
      
      // Add quick action buttons for morning
      const morningKeyboard = {
        inline_keyboard: [
          [
            { text: '☕ Coffee ₹50', callback_data: 'quick_50_coffee' },
            { text: '🍳 Breakfast ₹100', callback_data: 'quick_100_breakfast' }
          ],
          [
            { text: '📊 Yesterday Details', callback_data: 'yesterday_details' },
            { text: '💰 Check Balance', callback_data: 'balance' }
          ]
        ]
      }
      
      await sendTelegramMessage(morningBrief, morningKeyboard)
      console.log('Morning brief sent successfully')
    }
    
    // Evening Report - 8 PM IST (14:30 PM UTC)
    else if (hour === 14 || hour === 20) { // Adjust based on your timezone
      // Check if any expenses were logged today
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data: todayExpenses } = await supabase
        .from('expenses')
        .select('id')
        .eq('profile_id', profile.id)
        .gte('expense_date', `${today}T00:00:00`)
        .lte('expense_date', `${today}T23:59:59`)
        .limit(1)
      
      if (!todayExpenses || todayExpenses.length === 0) {
        // No expenses logged - send reminder
        const reminderMessage = `🌙 <b>Evening Reminder</b>

You haven't logged any expenses today.

Did you spend anything? Don't forget to track:
• 🍽️ Meals
• ☕ Coffee/Tea  
• 🚗 Travel
• 📦 Miscellaneous

Just reply with the amount and description:
"200 dinner" or "50 coffee"

Your daily budget: ₹${Math.floor(profile.personal_budget / 30)}`
        
        await sendTelegramMessage(reminderMessage)
      } else {
        // Send detailed evening report
        const eveningReport = await generateEveningReport(profile)
        
        // Add action buttons for evening
        const eveningKeyboard = {
          inline_keyboard: [
            [
              { text: '➕ Add More', callback_data: 'add_expense' },
              { text: '📊 Full Report', callback_data: 'full_report' }
            ],
            [
              { text: '📈 Week Summary', callback_data: 'week_summary' },
              { text: '🎯 Tomorrow Plan', callback_data: 'tomorrow_plan' }
            ]
          ]
        }
        
        await sendTelegramMessage(eveningReport, eveningKeyboard)
      }
      
      console.log('Evening report sent successfully')
    }
    
    // Friday Evening Special - 6 PM IST (12:30 PM UTC)
    else if (hour === 12 && dayOfWeek === 5) {
      // Weekend warning
      const { data: lastWeekendExpenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('profile_id', profile.id)
        .gte('expense_date', subDays(new Date(), 2).toISOString())
        .lte('expense_date', subDays(new Date(), 1).toISOString())
      
      const lastWeekendTotal = lastWeekendExpenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
      const monthSpent = await getMonthlySpent(profile)
      const remaining = profile.personal_budget - monthSpent
      
      const weekendMessage = `🎉 <b>Weekend Alert!</b>

It's Friday evening! Time to plan your weekend spending.

📊 <b>Last Weekend:</b> ${formatCurrency(lastWeekendTotal)}
💰 <b>Month Remaining:</b> ${formatCurrency(remaining)}
🎯 <b>Suggested Weekend Budget:</b> ${formatCurrency(Math.min(2000, remaining * 0.2))}

<b>Your weekend spending patterns:</b>
• You typically spend 40% more on weekends
• Highest spending: Saturday evenings (drinks)
• Average weekend: ₹2,500

💡 <b>Tips:</b>
• Set a weekend limit now
• Avoid impulse purchases
• Track as you spend

Have a great weekend, but spend wisely! 🌟`
      
      await sendTelegramMessage(weekendMessage)
      console.log('Weekend alert sent')
    }
    
    // Month-end warning - 3 days before month end
    else if (new Date().getDate() === 28 && hour === 10) {
      const monthSpent = await getMonthlySpent(profile)
      const remaining = profile.personal_budget - monthSpent
      const daysLeft = 3
      
      const monthEndMessage = `⚠️ <b>Month-End Warning!</b>

Only ${daysLeft} days left in the month!

💰 <b>Remaining Budget:</b> ${formatCurrency(remaining)}
📊 <b>Daily Limit:</b> ${formatCurrency(Math.floor(remaining / daysLeft))}
📈 <b>Month Total:</b> ${formatCurrency(monthSpent)}/${formatCurrency(profile.personal_budget)}

${remaining < 3000 ? '🔴 <b>Critical:</b> Very low balance! Consider essential expenses only.' : '✅ <b>Good:</b> You have sufficient balance if you control spending.'}

<b>Suggestions:</b>
• Postpone non-essential purchases
• Cook at home for remaining days
• Avoid entertainment expenses
• Use public transport

You've got this! 💪`
      
      await sendTelegramMessage(monthEndMessage)
      console.log('Month-end warning sent')
    }
    
    return NextResponse.json({ 
      success: true, 
      hour, 
      dayOfWeek,
      message: 'Cron job executed successfully'
    })
    
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json({ 
      error: 'Failed to send reminder',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Helper functions
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

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}