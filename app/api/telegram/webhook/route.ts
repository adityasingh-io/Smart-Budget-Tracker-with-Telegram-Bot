// app/api/telegram/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// IMPORTANT: Export named functions for each HTTP method
export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json()
    console.log('Webhook received:', JSON.stringify(body, null, 2))
    
    // Extract message from Telegram
    const message = body.message || body.edited_message
    if (!message || !message.text) {
      return NextResponse.json({ ok: true })
    }
    
    const text = message.text.toLowerCase().trim()
    const chatId = message.chat.id
    
    // Prepare response
    let responseText = ''
    
    // Handle commands
    if (text === 'balance' || text === 'bal') {
      // Get balance
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .single()
      
      const currentMonth = new Date()
      currentMonth.setDate(1)
      currentMonth.setHours(0, 0, 0, 0)
      
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .gte('expense_date', currentMonth.toISOString())
      
      const totalSpent = expenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
      const remaining = (profile?.personal_budget || 35000) - totalSpent
      
      responseText = `💰 *Balance Check*\n\nRemaining: ₹${remaining.toLocaleString()}\nSpent: ₹${totalSpent.toLocaleString()}\nDaily avg: ₹${Math.floor(totalSpent / new Date().getDate())}`
    }
    else if (text.startsWith('add ') || /^\d+\s+\w+/.test(text)) {
      // Parse add command: "add 200 food" or "200 food"
      const match = text.match(/(?:add\s+)?(\d+)\s+(.+)/)
      
      if (match) {
        const amount = parseInt(match[1])
        const categoryText = match[2]
        
        // Map common words to categories
        const categoryMap: Record<string, string> = {
          'food': 'Food',
          'lunch': 'Food',
          'dinner': 'Food',
          'breakfast': 'Food',
          'coffee': 'Food',
          'chai': 'Food',
          'snacks': 'Food',
          'uber': 'Travel',
          'cab': 'Travel',
          'auto': 'Travel',
          'travel': 'Travel',
          'petrol': 'Travel',
          'drinks': 'Alcohol',
          'beer': 'Alcohol',
          'alcohol': 'Alcohol',
          'bar': 'Alcohol',
          'misc': 'Miscellaneous',
          'miscellaneous': 'Miscellaneous',
          'cigarette': 'Miscellaneous',
          'cig': 'Miscellaneous',
          'smoke': 'Miscellaneous',
          'other': 'Other'
        }
        
        const categoryName = categoryMap[categoryText.toLowerCase()] || 'Other'
        
        // Get profile and category
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .single()
        
        const { data: category } = await supabase
          .from('categories')
          .select('id')
          .eq('name', categoryName)
          .single()
        
        if (profile && category) {
          // Add expense
          const { error } = await supabase
            .from('expenses')
            .insert({
              profile_id: profile.id,
              category_id: category.id,
              amount: amount,
              description: `Via Telegram: ${categoryText}`,
              expense_date: new Date().toISOString(),
              tags: ['telegram'],
              payment_method: 'cash'
            })
          
          if (!error) {
            responseText = `✅ Expense added!\n\nAmount: ₹${amount}\nCategory: ${categoryName}\n\nType "balance" to check remaining.`
          } else {
            responseText = '❌ Failed to add expense. Try again.'
          }
        } else {
          responseText = '❌ Error finding category. Try: food, travel, drinks, misc'
        }
      } else {
        responseText = 'Format: "add [amount] [category]"\nExample: "add 200 food"'
      }
    }
    else if (text === 'report' || text === 'summary') {
      // Get recent expenses
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount, description, expense_date')
        .order('expense_date', { ascending: false })
        .limit(5)
      
      if (expenses && expenses.length > 0) {
        responseText = '📊 *Recent Expenses*\n\n'
        expenses.forEach(e => {
          const date = new Date(e.expense_date).toLocaleDateString()
          responseText += `${date}: ₹${e.amount} - ${e.description}\n`
        })
      } else {
        responseText = 'No recent expenses found.'
      }
    }
    else if (text === 'help' || text === 'start' || text === '/start') {
      responseText = `👋 *Expense Tracker Bot*\n\nCommands:\n• balance - Check remaining budget\n• add [amount] [category] - Add expense\n• report - Recent expenses\n• help - Show this message\n\nExamples:\n• "balance"\n• "add 200 food"\n• "500 uber"\n• "report"`
    }
    else {
      responseText = `I don't understand "${text}".\n\nTry:\n• balance\n• add 200 food\n• report\n• help`
    }
    
    // Send response back to Telegram
    if (responseText) {
      const telegramToken = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN
      
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: responseText,
          parse_mode: 'Markdown'
        })
      })
    }
    
    // Always return 200 OK to Telegram
    return NextResponse.json({ ok: true })
    
  } catch (error) {
    console.error('Webhook error:', error)
    // Still return 200 to prevent Telegram from retrying
    return NextResponse.json({ ok: true })
  }
}

// Handle GET requests (for testing)
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    status: 'Webhook is active',
    message: 'Send POST requests from Telegram'
  }, { status: 405 })
}