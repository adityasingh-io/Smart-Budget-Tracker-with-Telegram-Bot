'use client'

import { useStore } from '@/lib/store'
import { format, eachDayOfInterval, getDay } from 'date-fns'

export default function HeatmapCalendar() {
  const { expenses, settings, getFiscalMonthBounds } = useStore()
  
  const { fiscalStart, fiscalEnd } = getFiscalMonthBounds()
  const days = eachDayOfInterval({ start: fiscalStart, end: fiscalEnd })

  const getSpendingForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return expenses
      .filter(e => e.date.startsWith(dateStr))
      .reduce((sum, e) => sum + e.amount, 0)
  }

  const getHeatmapColor = (amount: number) => {
    if (amount === 0) return 'bg-gray-100 dark:bg-gray-800'
    if (amount <= 200) return 'bg-green-200 dark:bg-green-900'
    if (amount <= 400) return 'bg-green-400 dark:bg-green-700'
    if (amount <= 600) return 'bg-yellow-400 dark:bg-yellow-700'
    if (amount <= 1000) return 'bg-orange-400 dark:bg-orange-700'
    return 'bg-red-500 dark:bg-red-700'
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Spending Heatmap - Fiscal Month ({format(fiscalStart, 'MMM d')} - {format(fiscalEnd, 'MMM d')})</h3>
      
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map(day => (
          <div key={day} className="text-center text-xs font-medium text-gray-500">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: getDay(fiscalStart) }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}
        
        {days.map(day => {
          const spending = getSpendingForDay(day)
          return (
            <div
              key={day.toISOString()}
              className={`aspect-square rounded flex items-center justify-center text-xs font-medium cursor-pointer hover:ring-2 hover:ring-primary-500 transition-all ${getHeatmapColor(spending)}`}
              title={`${format(day, 'MMM d')}: ${settings.currency}${spending}`}
            >
              {format(day, 'd')}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-gray-100 dark:bg-gray-800 rounded" />
          <span>No spending</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-green-400 dark:bg-green-700 rounded" />
          <span>Low</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-yellow-400 dark:bg-yellow-700 rounded" />
          <span>Medium</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-red-500 dark:bg-red-700 rounded" />
          <span>High</span>
        </div>
      </div>
    </div>
  )
}