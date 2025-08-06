// lib/telegram.ts
const TELEGRAM_BOT_TOKEN = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || ''
const TELEGRAM_CHAT_ID = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID || ''

export const telegram = {
  // Send a message
  async sendMessage(text: string) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: 'HTML'
          })
        }
      )
      return response.ok
    } catch (error) {
      console.error('Telegram send failed:', error)
      return false
    }
  },

  // Send daily summary
  async sendDailySummary(data: {
    spent: number,
    remaining: number,
    foodAvg: number,
    topCategory: string
  }) {
    const message = `
📊 <b>Daily Expense Summary</b>

💰 Spent Today: ₹${data.spent}
💳 Remaining: ₹${data.remaining}
🍽️ Food Average: ₹${data.foodAvg}
📈 Top Category: ${data.topCategory}

${data.remaining < 5000 ? '⚠️ <b>Low balance alert!</b>' : '✅ Budget on track'}

Reply with:
• "add [amount] [category]" to add expense
• "balance" to check remaining
• "report" for detailed report
    `
    return this.sendMessage(message)
  },

  // Send reminder
  async sendReminder(type: 'morning' | 'evening' | 'overbudget') {
    const messages = {
      morning: '🌅 Good morning! You have ₹X for today. Reply "balance" to check.',
      evening: '🌙 Don\'t forget to log today\'s expenses! Reply "add [amount] [category]"',
      overbudget: '🚨 Alert! You\'ve exceeded your daily budget by ₹X'
    }
    return this.sendMessage(messages[type])
  },

  // Parse incoming messages (for two-way communication)
  parseCommand(text: string) {
    const lower = text.toLowerCase().trim()
    
    // Check balance
    if (lower === 'balance' || lower === 'bal') {
      return { command: 'balance' }
    }
    
    // Add expense: "add 200 food" or "200 lunch"
    const addMatch = lower.match(/(?:add\s+)?(\d+)\s+(.+)/)
    if (addMatch) {
      return {
        command: 'add',
        amount: parseInt(addMatch[1]),
        category: addMatch[2]
      }
    }
    
    // Get report
    if (lower === 'report' || lower === 'summary') {
      return { command: 'report' }
    }
    
    return { command: 'unknown' }
  }
}

// Automated reminder functions (call these from Vercel Cron or Supabase Edge Functions)
export const automatedReminders = {
  // Morning reminder - 9 AM
  async morningReminder() {
    const { getRemainingBudget, getTodaySpending } = useStore.getState()
    const remaining = getRemainingBudget()
    const dailyBudget = Math.floor(remaining / new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate())
    
    await telegram.sendMessage(
      `🌅 Good morning!\n\n` +
      `Today's budget: ₹${dailyBudget}\n` +
      `Month remaining: ₹${remaining}\n\n` +
      `Have a great day! 💪`
    )
  },

  // Evening reminder - 8 PM
  async eveningReminder() {
    const { getTodaySpending, expenses } = useStore.getState()
    const todaySpent = getTodaySpending()
    
    if (todaySpent === 0) {
      await telegram.sendMessage(
        `🌙 Hey! You haven't logged any expenses today.\n\n` +
        `Did you spend anything? Reply with:\n` +
        `"add [amount] [category]"\n\n` +
        `Example: "add 200 food"`
      )
    } else {
      await telegram.sendMessage(
        `🌙 Today's spending: ₹${todaySpent}\n\n` +
        `Any more expenses to add?`
      )
    }
  },

  // Overbudget alert (real-time)
  async overbudgetAlert(amount: number, category: string) {
    await telegram.sendMessage(
      `🚨 <b>Budget Alert!</b>\n\n` +
      `You just spent ₹${amount} on ${category}.\n` +
      `This puts you over budget for today!\n\n` +
      `Consider reducing spending for the rest of the day.`
    )
  }
}