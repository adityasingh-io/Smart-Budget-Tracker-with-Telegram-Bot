'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import Dashboard from '@/components/Dashboard'
import QuickActions from '@/components/QuickActions'
import InsightsPanel from '@/components/InsightsPanel'
import ExpenseList from '@/components/ExpenseList'
import Header from '@/components/Header'

export default function Home() {
  const { initialized, initialize } = useStore()
  const router = useRouter()

  useEffect(() => {
    initialize()
  }, [initialize])

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <InsightsPanel />
            <Dashboard />
            <ExpenseList />
          </div>
          
          <div className="space-y-6">
            <QuickActions />
          </div>
        </div>
      </main>
    </div>
  )
}