'use client'

import { useStore } from '@/lib/store'
import { motion } from 'framer-motion'

export default function InsightsPanel() {
  const { getInsights, settings } = useStore()
  const insights = getInsights()

  const insightCards = [
    {
      type: insights.spendingPace.status,
      title: 'Spending Pace',
      message: insights.spendingPace.message,
      icon: insights.spendingPace.status === 'danger' ? '🚨' : insights.spendingPace.status === 'warning' ? '⚠️' : '✅',
    },
    {
      type: insights.weekendSpending.status,
      title: 'Weekend Pattern',
      message: insights.weekendSpending.message,
      icon: '📊',
    },
    {
      type: insights.foodHabits.status,
      title: 'Food Habits',
      message: insights.foodHabits.message,
      icon: '🍽️',
    },
    {
      type: 'info',
      title: 'Streak',
      message: `${insights.streak} days within food budget`,
      icon: '🔥',
    },
  ]

  const getTypeClasses = (type: string) => {
    switch(type) {
      case 'danger': return 'border-red-500 bg-red-50 dark:bg-red-900/20'
      case 'warning': return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
      case 'success': return 'border-green-500 bg-green-50 dark:bg-green-900/20'
      default: return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Insights & Alerts</h2>
      
      {insightCards.map((insight, index) => (
        <motion.div
          key={insight.title}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className={`p-4 rounded-lg border-l-4 ${getTypeClasses(insight.type)}`}
        >
          <div className="flex items-start space-x-3">
            <span className="text-2xl">{insight.icon}</span>
            <div className="flex-1">
              <h3 className="font-medium">{insight.title}</h3>
              <p className="text-sm mt-1 opacity-90">{insight.message}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}