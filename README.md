# 💬 Smart Budget Tracker with Telegram Bot

> **Track expenses by simply sending a message. Get AI-powered insights delivered to your chat.**

Stop opening apps to log expenses. Just text your spending to a Telegram bot and get instant budget analysis, daily reports, and smart warnings—all through messages you actually read.

## 🚀 Why This Changes Everything

**No more forgotten expenses.** Text "Coffee 150" and instantly know if you're over budget.

**Real-time budget alerts.** Get warned before you overspend, not after checking your bank statement.

**Fiscal month budgeting.** Unlike other trackers, this works with your salary cycle—not arbitrary calendar months.

**Telegram-first design.** Your expense tracker lives where you already spend time: in your messages.

## ✨ Core Features

### 📱 Telegram Bot Integration
- **Instant logging**: "Lunch 450" → Expense tracked + Budget updated
- **Morning briefs**: Daily budget summary at 9 AM
- **Evening reports**: Spending recap and tomorrow's budget at 7 PM  
- **Smart alerts**: Real-time warnings when approaching limits
- **Natural language**: No forms, just chat naturally

### 🧠 Fiscal Month Intelligence
- **Salary-based cycles**: Budget resets on your payday, not month-end
- **Dynamic daily budgets**: Adjusts remaining budget across remaining days
- **Payday countdown**: Always know how many days until next salary
- **Real budget tracking**: No more "where did my money go?" moments

### 📊 Advanced Analytics
- **Spending heatmaps**: Visual calendar of your expense patterns
- **Weekend vs weekday analysis**: See if you overspend on weekends
- **Category breakdowns**: Understand where every rupee goes
- **6-month trends**: Track spending patterns across fiscal cycles
- **Food budget streaks**: Gamify staying within daily food limits

### 🎯 Smart Insights
- **AI-powered analysis**: Get personalized spending insights
- **Projected month-end**: Know if you'll overspend before it happens
- **Weekly comparisons**: Compare current week vs previous week
- **Budget health scoring**: Instant overview of financial status

## 🛠️ Tech Stack

- **Next.js 15** - Modern React framework with App Router
- **Supabase** - Real-time database and authentication
- **Telegram Bot API** - Seamless messaging integration
- **Chart.js** - Beautiful data visualizations
- **Tailwind CSS** - Responsive, modern UI
- **TypeScript** - Type-safe development
- **Vercel** - Deployment with cron jobs for automated reports

## 🚀 Quick Start

### 1. Clone and Setup
```bash
git clone https://github.com/yourusername/smart-budget-tracker.git
cd smart-budget-tracker
npm install
```

### 2. Environment Setup
Create `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_TELEGRAM_BOT_TOKEN=your_telegram_bot_token
NEXT_PUBLIC_TELEGRAM_CHAT_ID=your_chat_id
CRON_SECRET=your_cron_secret
```

### 3. Database Setup
1. Create a Supabase project
2. Run the provided SQL migrations [Query Gist](https://gist.github.com/adityasingh-io/318c8119e900218759cf57734de0d816)
3. Set up your Telegram bot via [@BotFather](https://t.me/BotFather)

### 4. Run Development
```bash
npm run dev
```

Visit `http://localhost:3000` to configure your first fiscal month budget.

## 💡 How It Works

### 1. **Set Your Salary Day**
Tell the app when you get paid (e.g., 7th of every month)

### 2. **Configure Your Budget** 
Set your monthly personal budget (separate from savings/investments)

### 3. **Start Texting Expenses**
```
🧑 "Groceries 2500"
🤖 "✅ Logged ₹2500 for Groceries. Remaining budget: ₹28,500. Daily limit: ₹950"

🧑 "Auto rickshaw 80"  
🤖 "✅ Logged ₹80 for Travel. Today's spending: ₹180. Can still spend: ₹770"
```

### 4. **Get Intelligent Reports**
- **9 AM**: "Good morning! You have ₹870/day for the next 15 days. Yesterday: ₹450"
- **7 PM**: "Today's total: ₹1,200 (₹330 over budget). Consider a no-spend day tomorrow."

## 🎯 Perfect For

- **Salary earners** who think in pay cycles, not calendar months
- **Busy professionals** who want effortless expense tracking
- **Telegram users** who prefer chat-based interactions
- **Data-driven spenders** who want actionable insights
- **Budget-conscious individuals** who need real-time awareness

## 🔒 Privacy & Security

- All data stored in your own Supabase instance
- Telegram messages processed securely
- No expense data shared with third parties
- Optional privacy mode for sensitive transactions

## 🚀 Deployment

### Vercel (Recommended)
```bash
npm run build
vercel --prod
```

Add your environment variables in Vercel dashboard and configure cron jobs for automated reports.

## 🤝 Contributing

We love contributions! Whether it's:
- 🐛 Bug fixes
- ✨ New features  
- 📝 Documentation improvements
- 🎨 UI enhancements

See [Contributing Guidelines](CONTRIBUTING.md) for details.

---

**Ready to revolutionize your expense tracking?** 

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/smart-budget-tracker)

**Questions?** Open an issue or [start a discussion](https://github.com/yourusername/smart-budget-tracker/discussions).

**Love it?** ⭐ Star this repo and share with friends who hate traditional expense apps!
