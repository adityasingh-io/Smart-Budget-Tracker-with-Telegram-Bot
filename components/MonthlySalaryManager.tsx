// components/MonthlySalaryManager.tsx
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function MonthlySalaryManager() {
  const [monthlySalaries, setMonthlySalaries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editingMonth, setEditingMonth] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    month: format(new Date(), 'yyyy-MM'),
    totalSalary: 100000,
    personalBudget: 35000,
    notes: ''
  })

  useEffect(() => {
    loadMonthlySalaries()
  }, [])

  const loadMonthlySalaries = async () => {
    setLoading(true)
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .single()

      if (!profile) return

      const { data, error } = await supabase
        .from('monthly_salaries')
        .select('*')
        .eq('profile_id', profile.id)
        .order('month', { ascending: false })
        .limit(12) // Last 12 months

      if (error) throw error
      setMonthlySalaries(data || [])
    } catch (error) {
      console.error('Error loading monthly salaries:', error)
      toast.error('Failed to load salary data')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .single()

      if (!profile) throw new Error('Profile not found')

      const monthDate = new Date(formData.month + '-01')

      if (editingMonth) {
        // Update existing
        const { error } = await supabase
          .from('monthly_salaries')
          .update({
            total_salary: formData.totalSalary,
            personal_budget: formData.personalBudget,
            notes: formData.notes
          })
          .eq('profile_id', profile.id)
          .eq('month', monthDate.toISOString())

        if (error) throw error
        toast.success('Monthly salary updated!')
      } else {
        // Insert new
        const { error } = await supabase
          .from('monthly_salaries')
          .insert({
            profile_id: profile.id,
            month: monthDate.toISOString(),
            total_salary: formData.totalSalary,
            personal_budget: formData.personalBudget,
            notes: formData.notes
          })

        if (error) {
          if (error.code === '23505') {
            toast.error('Salary for this month already exists')
          } else {
            throw error
          }
        } else {
          toast.success('Monthly salary added!')
        }
      }

      // Reset form
      setEditingMonth(null)
      setFormData({
        month: format(new Date(), 'yyyy-MM'),
        totalSalary: 100000,
        personalBudget: 35000,
        notes: ''
      })
      
      // Reload data
      loadMonthlySalaries()
    } catch (error: any) {
      console.error('Error saving monthly salary:', error)
      toast.error('Failed to save salary data')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (salary: any) => {
    setEditingMonth(salary.month)
    setFormData({
      month: format(new Date(salary.month), 'yyyy-MM'),
      totalSalary: salary.total_salary,
      personalBudget: salary.personal_budget,
      notes: salary.notes || ''
    })
  }

  const handleDelete = async (month: string) => {
    if (!confirm('Are you sure you want to delete this month\'s salary?')) return

    setLoading(true)
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .single()

      if (!profile) throw new Error('Profile not found')

      const { error } = await supabase
        .from('monthly_salaries')
        .delete()
        .eq('profile_id', profile.id)
        .eq('month', month)

      if (error) throw error
      
      toast.success('Monthly salary deleted')
      loadMonthlySalaries()
    } catch (error) {
      console.error('Error deleting monthly salary:', error)
      toast.error('Failed to delete salary data')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">
          {editingMonth ? 'Edit Monthly Salary' : 'Add Monthly Salary'}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Month</label>
            <input
              type="month"
              value={formData.month}
              onChange={(e) => setFormData({ ...formData, month: e.target.value })}
              className="input"
              disabled={!!editingMonth}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Total Salary</label>
            <input
              type="number"
              value={formData.totalSalary}
              onChange={(e) => setFormData({ ...formData, totalSalary: parseInt(e.target.value) })}
              className="input"
              placeholder="100000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Personal Budget</label>
            <input
              type="number"
              value={formData.personalBudget}
              onChange={(e) => setFormData({ ...formData, personalBudget: parseInt(e.target.value) })}
              className="input"
              placeholder="35000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Notes (Optional)</label>
            <input
              type="text"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input"
              placeholder="Bonus, deductions, etc."
            />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={handleSave}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Saving...' : editingMonth ? 'Update' : 'Add'}
          </button>
          
          {editingMonth && (
            <button
              onClick={() => {
                setEditingMonth(null)
                setFormData({
                  month: format(new Date(), 'yyyy-MM'),
                  totalSalary: 100000,
                  personalBudget: 35000,
                  notes: ''
                })
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Monthly Salary History</h3>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : monthlySalaries.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No monthly salaries added yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b dark:border-gray-700">
                  <th className="text-left py-2">Month</th>
                  <th className="text-left py-2">Total Salary</th>
                  <th className="text-left py-2">Personal Budget</th>
                  <th className="text-left py-2">Notes</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {monthlySalaries.map((salary) => (
                  <tr key={salary.id} className="border-b dark:border-gray-700">
                    <td className="py-2">
                      {format(new Date(salary.month), 'MMM yyyy')}
                    </td>
                    <td className="py-2">₹{salary.total_salary.toLocaleString()}</td>
                    <td className="py-2">₹{salary.personal_budget.toLocaleString()}</td>
                    <td className="py-2 text-sm text-gray-600 dark:text-gray-400">
                      {salary.notes || '-'}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(salary)}
                          className="text-blue-600 hover:text-blue-700 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(salary.month)}
                          className="text-red-600 hover:text-red-700 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h4 className="font-medium mb-2">📊 How Monthly Salaries Work</h4>
        <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
          <li>• Each month can have different salary and budget amounts</li>
          <li>• If no monthly salary is set, defaults from profile are used</li>
          <li>• Budget calculations use the monthly values when available</li>
          <li>• Perfect for tracking bonuses, increments, or variable income</li>
        </ul>
      </div>
    </div>
  )
}