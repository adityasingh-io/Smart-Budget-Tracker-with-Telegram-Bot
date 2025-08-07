import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { format, subDays, startOfWeek, startOfMonth, startOfDay, endOfDay } from 'date-fns'

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
    
    const message = body.message || body.edited_message
    if (!message) {
      return NextResponse.json({ ok: true })
    }
    
    const chatId = message.chat?.id
    const text = message.text?.trim() || ''
    
    console.log(`Processing: "${text}" from chat ${chatId}`)
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .single()
    
    if (profileError || !profile) {
      console.error('Profile error:', profileError)
      await sendMessage(chatId, '❌ Profile not found')
      return NextResponse.json({ ok: true })
    }
    
    console.log('Profile found:', { id: profile.id, budget: profile.personal_budget })
    
    if (text.toLowerCase() === 'debug') {
      let debugInfo = '<b>🔍 DEBUG INFO</b>\n\n'
      
      debugInfo += '<b>Profile:</b>\n'
      debugInfo += `• ID: ${profile.id}\n`
      debugInfo += `• Budget: ₹${profile.personal_budget}\n\n`
      
      const { data: allExpenses, error: allError } = await supabase
        .from('expenses')
        .select('*')
        .eq('profile_id', profile.id)
        .order('expense_date', { ascending: false })
        .limit(5)
      
      debugInfo += '<b>Last 5 Expenses (RAW):</b>\n'
      if (allError) {
        debugInfo += `Error: ${allError.message}\n`
      } else if (!allExpenses || allExpenses.length === 0) {
        debugInfo += 'No expenses found at all!\n'
      } else {
        allExpenses.forEach(e => {
          debugInfo += `• ${e.expense_date} - ₹${e.amount} - ${e.description}\n`
        })
      }
      
      debugInfo += '\n<b>Today Query Test:</b>\n'
      const todayStart = startOfDay(new Date())
      const todayEnd = endOfDay(new Date())
      debugInfo += `• Start: ${todayStart.toISOString()}\n`
      debugInfo += `• End: ${todayEnd.toISOString()}\n`
      
      const { data: todayExpenses, error: todayError } = await supabase
        .from('expenses')
        .select('*')
        .eq('profile_id', profile.id)
        .gte('expense_date', todayStart.toISOString())
        .lte('expense_date', todayEnd.toISOString())
      
      if (todayError) {
        debugInfo += `• Error: ${todayError.message}\n`
      } else {
        debugInfo += `• Found: ${todayExpenses?.length || 0} expenses\n`
      }
      
      debugInfo += '\n<b>Categories Test:</b>\n'
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('*')
        .eq('profile_id', profile.id)
      
      if (catError) {
        debugInfo += `Error: ${catError.message}\n`
      } else if (!categories || categories.length === 0) {
        debugInfo += 'No categories found!\n'
      } else {
        categories.forEach(c => {
          debugInfo += `• ${c.name} (ID: ${c.id})\n`
        })
      }
      
      await sendMessage(chatId, debugInfo)
      return NextResponse.json({ ok: true })
    }
    
    if (text.toLowerCase() === 'today') {
      const todayStart = startOfDay(new Date())
      const todayEnd = endOfDay(new Date())
      
      console.log('Today query:', {
        start: todayStart.toISOString(),
        end: todayEnd.toISOString(),
        profile_id: profile.id
      })
      
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select(`
          *,
          categories (
            name
          )
        `)
        .eq('profile_id', profile.id)
        .gte('expense_date', todayStart.toISOString())
        .lte('expense_date', todayEnd.toISOString())
        .order('expense_date', { ascending: false })
      
      console.log('Today query result:', {
        error: error?.message,
        count: expenses?.length || 0,
        expenses: expenses?.map(e => ({
          date: e.expense_date,
          amount: e.amount,
          desc: e.description
        }))
      })
      
      if (error) {
        await sendMessage(chatId, `❌ Error: ${error.message}`)
        return NextResponse.json({ ok: true })
      }
      
      const total = expenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
      const dailyBudget = Math.floor(profile.personal_budget / 30)
      
      let response = '<b>📊 Today\'s Report</b>\n\n'
      
      if (!expenses || expenses.length === 0) {
        response += '✨ No expenses yet today!\n\n'
        response += `💰 Daily Budget: ₹${dailyBudget}`
      } else {
        response += '<b>Expenses:</b>\n'
        expenses.forEach(e => {
          const catName = e.categories?.name || 'Uncategorized'
          response += `• ${e.description} (${catName}): ₹${e.amount}\n`
        })
        response += `\n<b>Total:</b> ₹${total}/${dailyBudget}`
        response += `\n<b>Status:</b> ${total > dailyBudget ? '⚠️ Over budget' : '✅ Within budget'}`
      }
      
      await sendMessage(chatId, response)
      return NextResponse.json({ ok: true })
    }
    
    if (text.toLowerCase() === 'test') {
      const { data: testExpenses, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('profile_id', profile.id)
        .limit(10)
      
      let response = '<b>🧪 TEST QUERY</b>\n\n'
      response += `Profile ID: ${profile.id}\n`
      response += `Error: ${error?.message || 'None'}\n`
      response += `Found: ${testExpenses?.length || 0} expenses\n\n`
      
      if (testExpenses && testExpenses.length > 0) {
        response += '<b>Sample expenses:</b>\n'
        testExpenses.slice(0, 3).forEach(e => {
          response += `• Date: ${e.expense_date}\n`
          response += `  Amount: ₹${e.amount}\n`
          response += `  Desc: ${e.description}\n`
          response += `  Category ID: ${e.category_id || 'null'}\n\n`
        })
      }
      
      await sendMessage(chatId, response)
      return NextResponse.json({ ok: true })
    }
    
    await sendMessage(chatId, `Commands:\n• debug - Full debug info\n• today - Today's expenses\n• test - Test query\n\nYou said: "${text}"`)
    return NextResponse.json({ ok: true })
    
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'Diagnostic mode active',
    commands: ['debug', 'today', 'test']
  })
}