'use client'

import { useStore } from '@/lib/store'
import { format, subMonths } from 'date-fns'

export default function TrendsAnalysis() {
  const { expenses, settings } = useStore()

  const getLast6Months = () => {
    const months = []
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i)
      months.push({
        label: format(date, 'MMM'),
        month: format(date, 'yyyy-MM'),
      })
    }
    return months
  }

  const months = getLast6Months()
  const monthlyData = months.map(({ label, month }) => {
    const monthExpenses = expenses.filter(e => e.date.startsWith(month))
    return {
      label,
      total: monthExpenses.reduce((sum, e) => sum + e.amount, 0),
      food: monthExpenses.filter(e => e.category === 'Food').reduce((sum, e) => sum + e.amount, 0),
      misc: monthExpenses.filter(e => e.category === 'Miscellaneous').reduce((sum, e) => sum + e.amount, 0),
    }
  })

  const currentMonthTotal = monthlyData[monthlyData.length - 1]?.total || 0
  const lastMonthTotal = monthlyData[monthlyData.length - 2]?.total || 0
  const changePercent = lastMonthTotal ? ((currentMonthTotal - lastMonthTotal) / lastMonthTotal * 100).toFixed(1) : '0'

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">6-Month Trends</h3>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg bg-gradient-to-r from-primary-500/10 to-secondary-500/10">
          <p className="text-sm text-gray-600 dark:text-gray-400">Avg Monthly</p>
          <p className="text-xl font-bold">
            {settings.currency}{Math.round(monthlyData.reduce((sum, m) => sum + m.total, 0) / 6).toLocaleString()}
          </p>
        </div>
        
        <div className="p-4 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10">
          <p className="text-sm text-gray-600 dark:text-gray-400">This vs Last Month</p>
          <p className="text-xl font-bold">
            {parseFloat(changePercent) > 0 ? '+' : ''}{changePercent}%
          </p>
        </div>

        <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-indigo-500/10">
          <p className="text-sm text-gray-600 dark:text-gray-400">Highest Month</p>
          <p className="text-xl font-bold">
            {settings.currency}{Math.max(...monthlyData.map(m => m.total)).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {monthlyData.map((month) => (
          <div key={month.label}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium">{month.label}</span>
              <span className="text-sm">{settings.currency}{month.total.toLocaleString()}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-primary-500 to-secondary-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(month.total / settings.personalBudget) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}