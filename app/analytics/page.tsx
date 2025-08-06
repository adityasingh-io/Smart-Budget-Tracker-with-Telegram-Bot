'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import ChartsSection from '@/components/ChartsSection'
import HeatmapCalendar from '@/components/HeatmapCalendar'
import TrendsAnalysis from '@/components/TrendsAnalysis'
import { useStore } from '@/lib/store'

export default function AnalyticsPage() {
  const { expenses, categories } = useStore()
  const [timeRange, setTimeRange] = useState('month')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-transparent">
            Analytics & Reports
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Deep dive into your spending patterns
          </p>
        </div>

        <div className="mb-6 flex gap-2">
          {['week', 'month', 'quarter', 'year'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg transition-all ${
                timeRange === range
                  ? 'btn-primary'
                  : 'btn-secondary'
              }`}
            >
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>

        <div className="space-y-6">
          <ChartsSection timeRange={timeRange} />
          <HeatmapCalendar />
          <TrendsAnalysis />
        </div>
      </main>
    </div>
  )
}