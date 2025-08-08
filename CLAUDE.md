# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Personal Expense Tracker - A Next.js 15 application for smart personal finance management with Telegram bot integration, automated reminders, and fiscal month budgeting.

## Commands

### Development
```bash
npm run dev      # Start development server on http://localhost:3000
npm run build    # Create production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Database Operations
- Use Supabase client from `lib/supabase.ts`
- Test database connections at `/test-db` route
- Main tables: `profiles`, `expenses`, `categories`, `monthly_salaries`

### Telegram Bot Testing
- Test endpoint: `/test-telegram`
- Webhook: `/api/telegram/webhook`
- Bot utilities in `lib/telegram.ts`

## Architecture

### Core State Management
The application uses Zustand store (`lib/store.ts`) with complex fiscal month logic:
- **Fiscal months** run from salary day to salary day (not calendar months)
- **Daily budgets** are dynamically calculated based on remaining budget and days
- **Payday countdown** tracks days until next salary

### Key Architectural Patterns

1. **App Router Structure**: All pages in `/app` directory using Next.js 15 App Router
2. **Server Components**: Most components are server components with client components marked explicitly
3. **Authentication**: Middleware-based auth (`middleware.ts`) protecting routes except public paths
4. **API Routes**: Located in `/app/api/` for cron jobs and webhooks

### Component Hierarchy
```
app/page.tsx (Dashboard)
├── components/Dashboard.tsx (main orchestrator)
    ├── ExpenseList.tsx (CRUD operations)
    ├── ChartsSection.tsx (visualizations)
    ├── InsightsPanel.tsx (AI insights)
    └── QuickActions.tsx (quick entry)
```

### Critical Business Logic

#### Fiscal Month Calculation
The app uses custom fiscal month logic based on salary day:
- If today < salary day: fiscal month = current month - 1
- If today >= salary day: fiscal month = current month
- Budget resets on salary day, not month start

#### Daily Budget Formula
```
remainingBudget / remainingDaysInFiscalMonth
```
Adjusts dynamically as expenses are added.

#### Telegram Integration
- Webhook receives messages at `/api/telegram/webhook`
- Parses expenses from natural language
- Sends morning briefs (9 AM) and evening reports (7 PM) via cron

### Database Schema Key Points

**profiles table**: User settings including `salary_day`, `total_salary`, `personal_budget`
**expenses table**: Core expense data with `expense_date`, `amount`, `category_id`
**monthly_salaries**: Allows salary variations per month
**categories**: User-defined categories with optional budgets and subcategories

### Environment Variables
Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_TELEGRAM_BOT_TOKEN`
- `NEXT_PUBLIC_TELEGRAM_CHAT_ID`
- `CRON_SECRET` (for Vercel cron authentication)

### Deployment
- Platform: Vercel
- Database: Supabase
- Cron jobs configured in `vercel.json`
- Production URL: https://personal-expense-tracker-chi-six.vercel.app/

### Common Development Tasks

#### Adding New Expense Category
1. Update category in database via Supabase dashboard or API
2. Categories are dynamically loaded in components

#### Modifying Telegram Bot Commands
1. Edit webhook handler in `/app/api/telegram/webhook/route.ts`
2. Update message parsing logic in `lib/telegram.ts`
3. Test using `/test-telegram` interface

#### Adjusting Reminder Times
1. Modify cron schedule in `vercel.json`
2. Update reminder logic in `/app/api/cron/reminders/route.ts`

#### Debugging Fiscal Month Issues
1. Check `calculateFiscalMonth()` in `lib/store.ts`
2. Verify user's `salary_day` in profiles table
3. Use console logs in `fetchExpensesForCurrentFiscalMonth()`

### Code Style Conventions
- TypeScript with minimal type assertions
- Async/await for all database operations
- Early returns for error handling
- Tailwind CSS for all styling (no separate CSS files)
- Components use default exports
- API routes return NextResponse with proper status codes