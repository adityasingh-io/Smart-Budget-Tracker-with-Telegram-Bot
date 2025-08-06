'use client'

import { useState } from 'react'
import { useStore } from '@/lib/store'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function QuickActions() {
  const { addExpense, settings, categories } = useStore()
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    amount: '',
    category: 'Food',
    subcategory: '',
    description: '',
    tags: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    isFake: false,
  })

  const quickButtons = [
    { label: 'Coffee', amount: 50, category: 'Food', subcategory: 'Coffee' },
    { label: 'Lunch', amount: 200, category: 'Food', subcategory: 'Lunch' },
    { label: 'Dinner', amount: 400, category: 'Food', subcategory: 'Dinner' },
    { label: 'Misc ₹100', amount: 100, category: 'Miscellaneous', description: 'Miscellaneous', isFake: true },
    { label: 'Misc ₹200', amount: 200, category: 'Miscellaneous', description: 'Miscellaneous', isFake: true },
    { label: 'Drinks ₹500', amount: 500, category: 'Alcohol', description: 'Drinks' },
    { label: 'Drinks ₹1000', amount: 1000, category: 'Alcohol', description: 'Drinks' },
    { label: 'Drinks ₹1500', amount: 1500, category: 'Alcohol', description: 'Drinks' },
  ]

  const handleQuickAdd = (button: any) => {
    const expense = {
      id: Date.now().toString(),
      amount: button.amount,
      category: button.category,
      subcategory: button.subcategory || '',
      description: button.description || button.label,
      tags: [],
      date: new Date().toISOString(),
      isFake: button.isFake || false,
    }
    
    addExpense(expense)
    toast.success(`Added ${settings.currency}${button.amount} to ${button.category}`)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const expense = {
      id: Date.now().toString(),
      amount: parseFloat(formData.amount),
      category: formData.category,
      subcategory: formData.subcategory,
      description: formData.description,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      date: new Date(formData.date).toISOString(),
      isFake: formData.isFake,
    }
    
    addExpense(expense)
    toast.success('Expense added successfully!')
    setShowAddForm(false)
    setFormData({
      amount: '',
      category: 'Food',
      subcategory: '',
      description: '',
      tags: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      isFake: false,
    })
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
      
      <div className="grid grid-cols-2 gap-2 mb-4">
        {quickButtons.map((button) => (
          <button
            key={button.label}
            onClick={() => handleQuickAdd(button)}
            className="btn-secondary text-sm py-3 hover:scale-105 transition-transform"
          >
            {button.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => setShowAddForm(!showAddForm)}
        className="btn-primary w-full"
      >
        {showAddForm ? 'Cancel' : '➕ Add Custom Expense'}
      </button>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            type="number"
            placeholder="Amount"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            className="input"
            required
          />
          
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="select"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Subcategory (optional)"
            value={formData.subcategory}
            onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
            className="input"
          />

          <input
            type="text"
            placeholder="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="input"
            required
          />

          <input
            type="text"
            placeholder="Tags (comma separated)"
            value={formData.tags}
            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
            className="input"
          />

          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="input"
          />

          {settings.privacyMode && (
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.isFake}
                onChange={(e) => setFormData({ ...formData, isFake: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Mark as private entry</span>
            </label>
          )}

          <button type="submit" className="btn-primary w-full">
            Add Expense
          </button>
        </form>
      )}
    </div>
  )
}