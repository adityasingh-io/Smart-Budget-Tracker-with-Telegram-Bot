'use client'

import { useStore } from '@/lib/store'
import { motion } from 'framer-motion'

export default function Dashboard() {
  const { 
    expenses, 
    settings, 
    getTotalSpent, 
    getRemainingBudget,
    getCategorySpending,
    getTodaySpending 
  } = useStore()

  const totalSpent = getTotalSpent()
  const remaining = getRemainingBudget()
  const percentUsed = (totalSpent / settings.personalBudget) * 100

  const cards = [
    {
      title: 'Total Spent',
      value: `${settings.currency}${totalSpent.toLocaleString()}`,
      subtitle: `${percentUsed.toFixed(1)}% of budget`,
      color: percentUsed > 80 ? 'red' : percentUsed > 60 ? 'yellow' : 'green',
    },
    {
      title: 'Remaining',
      value: `${settings.currency}${remaining.toLocaleString()}`,
      subtitle: `For this month`,
      color: remaining < 5000 ? 'red' : remaining < 10000 ? 'yellow' : 'green',
    },
    {
      title: "Today's Spending",
      value: `${settings.currency}${getTodaySpending().toLocaleString()}`,
      subtitle: 'So far today',
      color: 'blue',
    },
    {
      title: 'Food Average',
      value: `${settings.currency}${Math.round(getCategorySpending('Food') / 30)}`,
      subtitle: `Target: ${settings.currency}${settings.dailyFoodBudget}/day`,
      color: getCategorySpending('Food') / 30 > settings.dailyFoodBudget ? 'red' : 'green',
    },
  ]

  const getColorClasses = (color: string) => {
    switch(color) {
      case 'red': return 'from-red-500 to-pink-500'
      case 'yellow': return 'from-yellow-500 to-orange-500'
      case 'green': return 'from-green-500 to-emerald-500'
      case 'blue': return 'from-blue-500 to-indigo-500'
      default: return 'from-gray-500 to-gray-600'
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="card relative overflow-hidden"
        >
          <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${getColorClasses(card.color)}`} />
          
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            {card.title}
          </h3>
          <p className="text-2xl font-bold mb-1">{card.value}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{card.subtitle}</p>
        </motion.div>
      ))}
    </div>
  )
}