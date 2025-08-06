// app/login/page.tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from') || '/'
  
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Get profile and check password
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, password_hash')
        .single()

      if (error) throw error

      // Simple password check (in production, use proper hashing)
      if (profile.password_hash !== password) {
        toast.error('Invalid password')
        setLoading(false)
        return
      }

      // Update last login
      await supabase
        .from('profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', profile.id)

      // Set auth cookie
      document.cookie = `auth-token=${JSON.stringify({
        authenticated: true,
        timestamp: Date.now(),
        profileId: profile.id
      })}; path=/; max-age=${7 * 24 * 60 * 60}` // 7 days

      toast.success('Login successful!')
      router.push(from)
    } catch (error: any) {
      console.error('Login error:', error)
      toast.error('Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      // First verify current password
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('id, password_hash')
        .single()

      if (fetchError) throw fetchError

      if (profile.password_hash !== password) {
        toast.error('Current password is incorrect')
        setLoading(false)
        return
      }

      // Update password
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ password_hash: newPassword })
        .eq('id', profile.id)

      if (updateError) throw updateError

      toast.success('Password changed successfully!')
      setShowChangePassword(false)
      setPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error: any) {
      console.error('Password change error:', error)
      toast.error('Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-blue-600 to-purple-700">
      <div className="w-full max-w-md">
        <div className="card backdrop-blur-lg bg-white/90 dark:bg-gray-900/90 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-20 h-20 gradient-bg rounded-xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
              ₹
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              Personal Expense Tracker
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Enter your password to continue
            </p>
          </div>

          {!showChangePassword ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full"
                  placeholder="Enter your password"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3"
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>

              <button
                type="button"
                onClick={() => setShowChangePassword(true)}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 w-full text-center"
              >
                Change Password
              </button>
            </form>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Current Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full"
                  placeholder="Enter current password"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input w-full"
                  placeholder="Enter new password (min 6 chars)"
                  required
                  minLength={6}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input w-full"
                  placeholder="Confirm new password"
                  required
                  minLength={6}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePassword(false)
                    setPassword('')
                    setNewPassword('')
                    setConfirmPassword('')
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary flex-1"
                >
                  {loading ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>First time?</strong> Default password is: <code className="font-mono">admin123</code>
            </p>
            <p className="text-xs mt-1 text-yellow-700 dark:text-yellow-300">
              Please change it immediately after logging in!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}