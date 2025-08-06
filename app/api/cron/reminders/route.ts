// app/api/cron/reminders/route.ts
import { NextResponse } from 'next/server'
import { telegram } from '@/lib/telegram'
import { supabase } from '@/lib/supabase'

// This runs automatically via Vercel Cron
export async function GET(request: Request) {
  // Verify this is from Vercel Cron (security)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hour = new Date().getHours()
  
  try {
    // Morning reminder - 9 AM
    if (hour === 9) {
      // Get today's budget info
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .single()
      
      const { data: monthSalary } = await supabase
        .from('monthly_salaries')
        .select('*')
        .eq('month', new Date(new Date().setDate(1)).toISOString())
        .single()
      
      const budget = monthSalary?.personal_budget || profile?.personal_budget || 35000
      const dailyBudget = Math.floor(budget / 30)
      
      await telegram.sendMessage(
        `🌅 Good Morning!\n\n` +
        `📊 Daily Budget: ₹${dailyBudget}\n` +
        `💰 Monthly Remaining: ₹${budget}\n\n` +
        `Don't forget to track your expenses today! 💪`
      )
    }
    
    // Evening reminder - 8 PM
    if (hour === 20) {
      // Check if expenses were added today
      const today = new Date().toISOString().split('T')[0]
      const { data: todayExpenses } = await supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', `${today}T00:00:00`)
        .lte('expense_date', `${today}T23:59:59`)
      
      if (!todayExpenses || todayExpenses.length === 0) {
        await telegram.sendMessage(
          `🌙 Evening Reminder!\n\n` +
          `You haven't logged any expenses today.\n` +
          `Did you spend anything? Don't forget to add it! 📝\n\n` +
          `Open the app to add expenses.`
        )
      } else {
        const total = todayExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
        await telegram.sendMessage(
          `🌙 Day Summary\n\n` +
          `✅ You logged ${todayExpenses.length} expenses\n` +
          `💰 Total spent: ₹${total}\n\n` +
          `Any more expenses to add before bed?`
        )
      }
    }
    
    // Weekend warning - Friday 6 PM
    if (hour === 18 && new Date().getDay() === 5) {
      await telegram.sendMessage(
        `🎉 Weekend Alert!\n\n` +
        `Remember: You typically spend 40% more on weekends.\n` +
        `Plan your weekend budget wisely! 🎯\n\n` +
        `Tip: Set a weekend spending limit now.`
      )
    }
    
    return NextResponse.json({ success: true, hour })
  } catch (error) {
    console.error('Cron error:', error)
    return NextResponse.json({ error: 'Failed to send reminder' }, { status: 500 })
  }
}

// vercel.json (add to project root)
/*
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "0 9,20 * * *"
    }
  ]
}
*/