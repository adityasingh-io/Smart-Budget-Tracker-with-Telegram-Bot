'use client'

import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement } from 'chart.js'
import { Doughnut, Bar, Line } from 'react-chartjs-2'
import { useStore } from '@/lib/store'
import { startOfWeek, endOfWeek, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement)

export default function ChartsSection({ timeRange }: { timeRange: string }) {
  const { expenses, settings, categories, getFiscalMonthBounds } = useStore()
  
  const getTimeRangeBounds = () => {
    const now = new Date()
    switch (timeRange) {
      case 'week':
        return { start: startOfWeek(now), end: endOfWeek(now) }
      case 'month':
        const bounds = getFiscalMonthBounds()
        return { start: bounds.fiscalStart, end: bounds.fiscalEnd }
      case 'quarter':
        return { start: startOfQuarter(now), end: endOfQuarter(now) }
      case 'year':
        return { start: startOfYear(now), end: endOfYear(now) }
      default:
        const defaultBounds = getFiscalMonthBounds()
        return { start: defaultBounds.fiscalStart, end: defaultBounds.fiscalEnd }
    }
  }
  
  const { start, end } = getTimeRangeBounds()
  
  const filteredExpenses = expenses.filter(e => {
    const expenseDate = new Date(e.date)
    return expenseDate >= start && expenseDate <= end
  })

  const categoryData = categories.reduce((acc, cat) => {
    acc[cat.name] = filteredExpenses
      .filter(e => e.category === cat.name)
      .reduce((sum, e) => sum + e.amount, 0)
    return acc
  }, {} as Record<string, number>)

  const doughnutData = {
    labels: Object.keys(categoryData),
    datasets: [{
      data: Object.values(categoryData),
      backgroundColor: [
        'rgba(139, 92, 246, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(236, 72, 153, 0.8)',
        'rgba(34, 197, 94, 0.8)',
        'rgba(251, 146, 60, 0.8)',
      ],
      borderWidth: 0,
    }],
  }

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    return date
  })

  const dailySpending = last7Days.map(date => {
    const dateStr = date.toISOString().split('T')[0]
    return expenses
      .filter(e => e.date.startsWith(dateStr))
      .reduce((sum, e) => sum + e.amount, 0)
  })

  const lineData = {
    labels: last7Days.map(d => d.toLocaleDateString('en', { weekday: 'short' })),
    datasets: [{
      label: 'Daily Spending',
      data: dailySpending,
      borderColor: 'rgba(139, 92, 246, 1)',
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      tension: 0.4,
    }],
  }

  const barData = {
    labels: Object.keys(categoryData),
    datasets: [
      {
        label: 'Spent',
        data: Object.values(categoryData),
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
      },
      {
        label: 'Budget',
        data: Object.keys(categoryData).map(cat => settings.categoryBudgets[cat] || 0),
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
      },
    ],
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Category Breakdown</h3>
        <div className="h-64">
          <Doughnut data={doughnutData} options={{ maintainAspectRatio: false }} />
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Daily Trend</h3>
        <div className="h-64">
          <Line data={lineData} options={{ maintainAspectRatio: false }} />
        </div>
      </div>

      <div className="card lg:col-span-2">
        <h3 className="text-lg font-semibold mb-4">Budget vs Actual</h3>
        <div className="h-64">
          <Bar data={barData} options={{ maintainAspectRatio: false }} />
        </div>
      </div>
    </div>
  )
}