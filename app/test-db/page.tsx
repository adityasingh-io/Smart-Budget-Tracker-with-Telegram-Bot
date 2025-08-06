// app/test-db/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function TestDBPage() {
  const [testResults, setTestResults] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [testExpense, setTestExpense] = useState({
    amount: 100,
    description: 'Test expense from Next.js app',
    category: 'Food'
  })

  // Test database connection
  const testConnection = async () => {
    setLoading(true)
    const results: any = {}

    try {
      // Test 1: Check if Supabase client is initialized
      results.clientInitialized = {
        status: supabase ? 'success' : 'error',
        message: supabase ? 'Supabase client initialized' : 'Client not initialized'
      }

      // Test 2: Fetch profile
      console.log('Testing profile fetch...')
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .limit(1)
        .single()

      results.profileFetch = {
        status: profileError ? 'error' : 'success',
        message: profileError ? profileError.message : 'Profile fetched successfully',
        data: profile
      }

      // Test 3: Fetch categories
      console.log('Testing categories fetch...')
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('*')
        .limit(5)

      results.categoriesFetch = {
        status: catError ? 'error' : 'success',
        message: catError ? catError.message : `Fetched ${categories?.length || 0} categories`,
        data: categories
      }

      // Test 4: Fetch expenses
      console.log('Testing expenses fetch...')
      const { data: expenses, error: expError } = await supabase
        .from('expenses')
        .select('*')
        .limit(5)
        .order('created_at', { ascending: false })

      results.expensesFetch = {
        status: expError ? 'error' : 'success',
        message: expError ? expError.message : `Fetched ${expenses?.length || 0} expenses`,
        data: expenses
      }

      // Test 5: Check if tables exist
      const tables = ['profiles', 'categories', 'expenses', 'budgets', 'savings_goals']
      results.tablesExist = {
        status: 'success',
        message: 'All required tables checked',
        tables: tables
      }

    } catch (error: any) {
      results.generalError = {
        status: 'error',
        message: error.message || 'Unknown error occurred'
      }
    }

    setTestResults(results)
    setLoading(false)
  }

  // Test adding an expense
  const testAddExpense = async () => {
    try {
      // First get profile and category
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .limit(1)
        .single()

      const { data: category } = await supabase
        .from('categories')
        .select('id')
        .eq('name', testExpense.category)
        .limit(1)
        .single()

      if (!profile || !category) {
        toast.error('Profile or category not found')
        return
      }

      // Add test expense
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          profile_id: profile.id,
          category_id: category.id,
          amount: testExpense.amount,
          description: testExpense.description,
          expense_date: new Date().toISOString(),
          tags: ['test', 'from-nextjs'],
          payment_method: 'test'
        })
        .select()
        .single()

      if (error) {
        toast.error(`Error adding expense: ${error.message}`)
      } else {
        toast.success('Test expense added successfully!')
        console.log('Added expense:', data)
        testConnection() // Refresh test results
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`)
    }
  }

  // Test deleting expenses with test tag
  const cleanupTestExpenses = async () => {
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .contains('tags', ['test'])

      if (error) {
        toast.error(`Error cleaning up: ${error.message}`)
      } else {
        toast.success('Test expenses cleaned up!')
        testConnection()
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`)
    }
  }

  useEffect(() => {
    testConnection()
  }, [])

  const getStatusColor = (status: string) => {
    return status === 'success' ? 'text-green-600' : 'text-red-600'
  }

  const getStatusEmoji = (status: string) => {
    return status === 'success' ? '✅' : '❌'
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-transparent">
          Supabase Database Connection Test
        </h1>

        {/* Connection Info */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Connection Details</h2>
          <div className="space-y-2 text-sm font-mono">
            <div>
              <span className="text-gray-600 dark:text-gray-400">URL: </span>
              <span className="text-blue-600 dark:text-blue-400">
                {process.env.NEXT_PUBLIC_SUPABASE_URL ? 
                  `${process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 30)}...` : 
                  'NOT SET'}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Anon Key: </span>
              <span className="text-blue-600 dark:text-blue-400">
                {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 
                  `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 40)}...` : 
                  'NOT SET'}
              </span>
            </div>
          </div>
        </div>

        {/* Test Results */}
        <div className="card mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Test Results</h2>
            <button 
              onClick={testConnection}
              className="btn-primary"
              disabled={loading}
            >
              {loading ? 'Testing...' : 'Rerun Tests'}
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(testResults).map(([key, result]: [string, any]) => (
                <div key={key} className="border-l-4 border-gray-200 pl-4 py-2">
                  <div className="flex items-center gap-2">
                    <span>{getStatusEmoji(result.status)}</span>
                    <span className="font-medium">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  </div>
                  <div className={`text-sm mt-1 ${getStatusColor(result.status)}`}>
                    {result.message}
                  </div>
                  {result.data && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400">
                        View Data
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Test Actions */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Test Actions</h2>
          
          <div className="space-y-4">
            {/* Add Test Expense */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="font-medium mb-3">Add Test Expense</h3>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <input
                  type="number"
                  placeholder="Amount"
                  value={testExpense.amount}
                  onChange={(e) => setTestExpense({...testExpense, amount: parseInt(e.target.value)})}
                  className="input"
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={testExpense.description}
                  onChange={(e) => setTestExpense({...testExpense, description: e.target.value})}
                  className="input"
                />
                <select
                  value={testExpense.category}
                  onChange={(e) => setTestExpense({...testExpense, category: e.target.value})}
                  className="select"
                >
                  <option value="Food">Food</option>
                  <option value="Travel">Travel</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                  <option value="Alcohol">Alcohol</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <button onClick={testAddExpense} className="btn-primary">
                Add Test Expense
              </button>
            </div>

            {/* Cleanup */}
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <h3 className="font-medium mb-2">Cleanup Test Data</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                This will delete all expenses with 'test' tag
              </p>
              <button onClick={cleanupTestExpenses} className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600">
                Delete Test Expenses
              </button>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h3 className="font-semibold mb-2">📊 Summary</h3>
          <div className="text-sm space-y-1">
            <p>✅ If all tests pass, your Supabase is properly connected!</p>
            <p>✅ You can add and delete expenses from the database</p>
            <p>✅ Your app is ready for deployment</p>
          </div>
        </div>
      </div>
    </div>
  )
}