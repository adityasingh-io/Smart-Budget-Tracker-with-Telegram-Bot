'use client'

import { useState } from 'react'

type TestScenario = {
  name: string
  emoji: string
  params: string
  description: string
}

const scenarios: TestScenario[] = [
  {
    name: 'Morning Brief (9 AM)',
    emoji: '🌅',
    params: 'test=true&hour=9',
    description: 'Tests the morning brief that normally runs at 9 AM IST'
  },
  {
    name: 'Morning Brief (3:30 AM UTC)',
    emoji: '🌄',
    params: 'test=true&hour=3',
    description: 'Tests the morning brief at UTC time'
  },
  {
    name: 'Evening Report (8 PM)',
    emoji: '🌙',
    params: 'test=true&hour=20',
    description: 'Tests the evening report that normally runs at 8 PM IST'
  },
  {
    name: 'Evening Report (2:30 PM UTC)',
    emoji: '🌆',
    params: 'test=true&hour=14',
    description: 'Tests the evening report at UTC time'
  },
  {
    name: 'Weekend Alert (Friday 6 PM)',
    emoji: '🎉',
    params: 'test=true&hour=12&day=5',
    description: 'Tests the Friday weekend spending alert'
  },
  {
    name: 'Month-End Warning',
    emoji: '⚠️',
    params: 'test=true&hour=10&date=28',
    description: 'Tests the month-end warning (28th of month)'
  },
  {
    name: 'Current Time (No Override)',
    emoji: '⏰',
    params: '',
    description: 'Tests with actual current time - may not trigger any message'
  }
]

export default function TestTelegramPage() {
  const [results, setResults] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [cronSecret, setCronSecret] = useState('')
  const [useProduction, setUseProduction] = useState(false)
  const [customUrl, setCustomUrl] = useState('https://personal-expense-tracker-chi-six.vercel.app')

  const getBaseUrl = () => {
    if (customUrl) return customUrl
    if (useProduction && window.location.hostname !== 'localhost') {
      return `https://${window.location.hostname}`
    }
    return ''
  }

  const testScenario = async (scenario: TestScenario) => {
    if (!cronSecret) {
      alert('Please enter your CRON_SECRET first!')
      return
    }

    setLoading(prev => ({ ...prev, [scenario.name]: true }))
    setResults(prev => ({ ...prev, [scenario.name]: null }))

    try {
      const baseUrl = getBaseUrl()
      const url = scenario.params 
        ? `${baseUrl}/api/cron/reminders?${scenario.params}`
        : `${baseUrl}/api/cron/reminders`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cronSecret}`
        }
      })

      const data = await response.json()

      setResults(prev => ({
        ...prev,
        [scenario.name]: {
          success: response.ok,
          status: response.status,
          data
        }
      }))
    } catch (error) {
      setResults(prev => ({
        ...prev,
        [scenario.name]: {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }))
    } finally {
      setLoading(prev => ({ ...prev, [scenario.name]: false }))
    }
  }

  const testAll = async () => {
    for (const scenario of scenarios) {
      await testScenario(scenario)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  const getStatusColor = (result: any) => {
    if (!result) return 'bg-gray-100'
    if (result.success) return 'bg-green-100 border-green-300'
    return 'bg-red-100 border-red-300'
  }

  const getStatusEmoji = (result: any) => {
    if (!result) return '⏳'
    if (result.success) return '✅'
    return '❌'
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          🧪 Telegram Cron Job Tester
        </h1>
        <p className="text-gray-600 mb-8">
          Test your Telegram bot's scheduled messages without waiting for cron times
        </p>

        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">⚙️ Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CRON_SECRET <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={cronSecret}
                onChange={(e) => setCronSecret(e.target.value)}
                placeholder="Enter your CRON_SECRET from environment variables"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                This should match the CRON_SECRET in your .env.local and Vercel environment
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom URL (Optional)
              </label>
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://your-app.vercel.app"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave empty for local testing, or enter your Vercel deployment URL
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="useProduction"
                checked={useProduction}
                onChange={(e) => setUseProduction(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="useProduction" className="text-sm text-gray-700">
                Use production URL (when deployed)
              </label>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={testAll}
              disabled={!cronSecret}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              🚀 Test All Scenarios
            </button>
            <button
              onClick={() => setResults({})}
              className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              🔄 Clear Results
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {scenarios.map((scenario) => (
            <div
              key={scenario.name}
              className={`bg-white rounded-lg shadow-md p-6 border-2 transition-all ${getStatusColor(results[scenario.name])}`}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span className="text-2xl">{scenario.emoji}</span>
                    {scenario.name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{scenario.description}</p>
                  {scenario.params && (
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded mt-2 inline-block">
                      {scenario.params}
                    </code>
                  )}
                </div>
                <span className="text-2xl">{getStatusEmoji(results[scenario.name])}</span>
              </div>

              <button
                onClick={() => testScenario(scenario)}
                disabled={!cronSecret || loading[scenario.name]}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading[scenario.name] ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Testing...
                  </span>
                ) : (
                  'Test This Scenario'
                )}
              </button>

              {results[scenario.name] && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-sm">
                    <p className="font-medium mb-2">
                      Status: {results[scenario.name].success ? 
                        <span className="text-green-600">Success</span> : 
                        <span className="text-red-600">Failed</span>
                      }
                      {results[scenario.name].status && (
                        <span className="ml-2 text-gray-500">
                          (HTTP {results[scenario.name].status})
                        </span>
                      )}
                    </p>
                    
                    {results[scenario.name].data && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                          View Response Data
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto max-h-48">
                          {JSON.stringify(results[scenario.name].data, null, 2)}
                        </pre>
                      </details>
                    )}
                    
                    {results[scenario.name].error && (
                      <p className="text-red-600 text-sm mt-2">
                        Error: {results[scenario.name].error}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 bg-blue-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-3">📝 Notes:</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• Make sure your Telegram bot token and chat ID are configured in environment variables</li>
            <li>• The test mode will actually send messages to your Telegram chat</li>
            <li>• Check your Telegram to verify the messages are being received correctly</li>
            <li>• Your actual cron schedules in vercel.json:
              <ul className="ml-6 mt-1">
                <li>- 3:30 AM UTC daily (9:00 AM IST)</li>
                <li>- 2:30 PM UTC daily (8:00 PM IST)</li>
              </ul>
            </li>
            <li>• View function logs in Vercel dashboard for debugging</li>
          </ul>
        </div>
      </div>
    </div>
  )
}