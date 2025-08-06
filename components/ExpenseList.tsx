'use client'

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function ExpenseList() {
  const { expenses, deleteExpense, settings } = useStore()
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  const filteredExpenses = expenses
    .filter(expense => {
      if (filter !== 'all' && expense.category !== filter) return false
      if (searchTerm && !expense.description.toLowerCase().includes(searchTerm.toLowerCase())) return false
      return true
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10)

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      deleteExpense(id)
      toast.success('Expense deleted')
    }
  }

  const getDisplayDescription = (expense: any) => {
    if (settings.privacyMode && expense.isFake) {
      return expense.description === 'Miscellaneous' ? 'Miscellaneous' : expense.description
    }
    return expense.description
  }

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Recent Expenses</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input py-1 text-sm"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="select py-1 text-sm"
          >
            <option value="all">All</option>
            <option value="Food">Food</option>
            <option value="Travel">Travel</option>
            <option value="Miscellaneous">Misc</option>
            <option value="Alcohol">Drinks</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        {filteredExpenses.map((expense) => (
          <div
            key={expense.id}
            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{getDisplayDescription(expense)}</span>
                {expense.tags?.map((tag) => (
                  <span key={tag} className="text-xs px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded">
                    #{tag}
                  </span>
                ))}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {expense.category} {expense.subcategory && `• ${expense.subcategory}`} • {format(new Date(expense.date), 'MMM d, h:mm a')}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-lg">
                {settings.currency}{expense.amount.toLocaleString()}
              </span>
              <button
                onClick={() => handleDelete(expense.id)}
                className="text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 p-1 rounded"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}