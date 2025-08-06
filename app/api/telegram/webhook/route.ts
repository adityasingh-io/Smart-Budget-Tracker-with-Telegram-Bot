// app/api/telegram/webhook/route.ts
import { NextResponse } from 'next/server'
import { telegram } from '@/lib/telegram'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  const body = await request.json()
  
  // Extract message from Telegram
  const message = body.message?.text
  const chatId = body.message?.chat?.id
  
  if (!message) {
    return NextResponse.json({ ok: true })
  }
  
  const command = telegram.parseCommand(message)
  
  try {
    switch (command.command) {
      case 'balance':
        // Get remaining budget
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .single()
        
        const { data: expenses } = await supabase
          .from('expenses')
          .select('*')
          .gte('expense_date', new Date(new Date().setDate(1)).toISOString())
        
        const totalSpent = expenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0
        const remaining = (profile?.personal_budget || 35000) - totalSpent
        
        await telegram.sendMessage(
          `💰 <b>Balance Check</b>\n\n` +
          `Remaining: ₹${remaining}\n` +
          `Spent: ₹${totalSpent}\n` +
          `Daily avg: ₹${Math.floor(totalSpent / new Date().getDate())}`
        )
        break
      
      case 'add':
        // Add expense via Telegram
        const { data: profileForAdd } = await supabase
          .from('profiles')
          .select('*')
          .single()
        
        // Map common words to categories
        const categoryMap: any = {
          'food': 'Food',
          'lunch': 'Food',
          'dinner': 'Food',
          'breakfast': 'Food',
          'coffee': 'Food',
          'uber': 'Travel',
          'cab': 'Travel',
          'travel': 'Travel',
          'drinks': 'Alcohol',
          'beer': 'Alcohol',
          'misc': 'Miscellaneous',
          'cigarette': 'Miscellaneous',
          'cig': 'Miscellaneous'
        }
        
        const categoryName = categoryMap[command.category?.toLowerCase()] || 'Other'
        
        // Get category ID
        const { data: category } = await supabase
          .from('categories')
          .select('id')
          .eq('name', categoryName)
          .single()
        
        // Add expense
        await supabase
          .from('expenses')
          .insert({
            profile_id: profileForAdd?.id,
            category_id: category?.id,
            amount: command.amount,
            description: `Added via Telegram: ${command.category}`,
            expense_date: new Date().toISOString(),
            tags: ['telegram'],
            payment_method: 'cash'
          })
        
        await telegram.sendMessage(
          `✅ Expense added!\n\n` +
          `Amount: ₹${command.amount}\n` +
          `Category: ${categoryName}\n\n` +
          `Type "balance" to check remaining budget.`
        )
        break
      
      case 'report':
        // Send detailed report
        const { data: reportExpenses } = await supabase
          .from('expenses')
          .select('*')
          .gte('expense_date', new Date(new Date().setDate(1)).toISOString())
          .order('expense_date', { ascending: false })
          .limit(10)
        
        let reportText = `📊 <b>Recent Expenses</b>\n\n`
        reportExpenses?.forEach(e => {
          const date = new Date(e.expense_date).toLocaleDateString()
          reportText += `${date}: ₹${e.amount} - ${e.description}\n`
        })
        
        await telegram.sendMessage(reportText)
        break
      
      default:
        await telegram.sendMessage(
          `I don't understand that command.\n\n` +
          `Try:\n` +
          `• "balance" - Check remaining\n` +
          `• "add 200 food" - Add expense\n` +
          `• "report" - Recent expenses`
        )
    }
  } catch (error) {
    console.error('Webhook error:', error)
    await telegram.sendMessage('Sorry, something went wrong. Please try again.')
  }
  
  return NextResponse.json({ ok: true })
}