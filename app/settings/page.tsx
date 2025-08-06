// app/settings/page.tsx
'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import { useStore } from '@/lib/store'
import toast from 'react-hot-toast'
import MonthlySalaryManager from '@/components/MonthlySalaryManager'

export default function SettingsPage() {
  const { settings, updateSettings, categories } = useStore()
  const [activeTab, setActiveTab] = useState('general')

  const handleSettingChange = (key: string, value: any) => {
    updateSettings({ [key]: value })
    toast.success('Settings updated!')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-transparent">
            Settings
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="card">
              <nav className="space-y-2">
                {['general', 'salary', 'budget', 'categories', 'privacy', 'data'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`w-full text-left px-4 py-2 rounded-lg transition-all ${
                      activeTab === tab
                        ? 'bg-gradient-to-r from-primary-500 to-secondary-500 text-white'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="card">
              {activeTab === 'general' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Salary Day</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={settings.salaryDay}
                      onChange={(e) => handleSettingChange('salaryDay', parseInt(e.target.value))}
                      className="input"
                    />
                    <p className="text-sm text-gray-500 mt-1">Day of month when salary arrives</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Default Total Salary</label>
                    <input
                      type="number"
                      value={settings.totalSalary}
                      onChange={(e) => handleSettingChange('totalSalary', parseInt(e.target.value))}
                      className="input"
                    />
                    <p className="text-sm text-gray-500 mt-1">Used when no monthly salary is set</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Default Personal Budget</label>
                    <input
                      type="number"
                      value={settings.personalBudget}
                      onChange={(e) => handleSettingChange('personalBudget', parseInt(e.target.value))}
                      className="input"
                    />
                    <p className="text-sm text-gray-500 mt-1">Used when no monthly budget is set</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Currency</label>
                    <select
                      value={settings.currency}
                      onChange={(e) => handleSettingChange('currency', e.target.value)}
                      className="select"
                    >
                      <option value="₹">₹ (INR)</option>
                      <option value="$">$ (USD)</option>
                      <option value="€">€ (EUR)</option>
                    </select>
                  </div>
                </div>
              )}

              {activeTab === 'salary' && (
                <MonthlySalaryManager />
              )}

              {activeTab === 'budget' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Category Budgets</h3>
                  {Object.entries(settings.categoryBudgets).map(([category, budget]) => (
                    <div key={category}>
                      <label className="block text-sm font-medium mb-2">{category}</label>
                      <input
                        type="number"
                        value={budget}
                        onChange={(e) => {
                          const newBudgets = { ...settings.categoryBudgets }
                          newBudgets[category] = parseInt(e.target.value)
                          handleSettingChange('categoryBudgets', newBudgets)
                        }}
                        className="input"
                      />
                    </div>
                  ))}

                  <div>
                    <label className="block text-sm font-medium mb-2">Daily Food Budget</label>
                    <input
                      type="number"
                      value={settings.dailyFoodBudget}
                      onChange={(e) => handleSettingChange('dailyFoodBudget', parseInt(e.target.value))}
                      className="input"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'categories' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Manage Categories</h3>
                  <div className="space-y-4">
                    {categories.map((category) => (
                      <div key={category.id} className="p-4 border rounded-lg dark:border-gray-700">
                        <h4 className="font-medium">{category.name}</h4>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {category.subcategories.map((sub) => (
                            <span key={sub} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm">
                              {sub}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'privacy' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Privacy Mode</h4>
                      <p className="text-sm text-gray-500">Enable fake entries for sensitive expenses</p>
                    </div>
                    <button
                      onClick={() => handleSettingChange('privacyMode', !settings.privacyMode)}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        settings.privacyMode ? 'bg-primary-500' : 'bg-gray-300'
                      }`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        settings.privacyMode ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Fake Entry Mappings</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between p-2 bg-gray-100 dark:bg-gray-800 rounded">
                        <span>Cigarettes → Miscellaneous</span>
                      </div>
                      <div className="flex justify-between p-2 bg-gray-100 dark:bg-gray-800 rounded">
                        <span>Alcohol → Drinks</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'data' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-4">Data Management</h4>
                    <div className="space-y-3">
                      <button className="btn-primary w-full">
                        Export to CSV
                      </button>
                      <button className="btn-primary w-full">
                        Export to JSON
                      </button>
                      <button className="btn-secondary w-full">
                        Import Data
                      </button>
                      <button className="bg-red-500 text-white px-4 py-2 rounded-lg w-full hover:bg-red-600">
                        Clear All Data
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}