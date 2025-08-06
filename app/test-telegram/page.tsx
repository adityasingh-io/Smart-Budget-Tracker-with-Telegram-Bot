// app/test-telegram/page.tsx
'use client'

import { useState } from 'react'
import { telegram } from '@/lib/telegram'
import toast from 'react-hot-toast'

export default function TestTelegramPage() {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const testMessages = [
    {
      title: 'Test Connection',
      message: '✅ Telegram bot connected successfully!\n\nYour expense tracker can now send you notifications.',
    },
    {
      title: 'Daily Summary',
      message: `📊 <b>Daily Summary</b>\n\n💰 Spent Today: ₹850\n💳 Remaining: ₹28,150\n🍽️ Food: ₹450\n🚗 Travel: ₹200\n📦 Misc: ₹200\n\n✅ You're within budget!`,
    },
    {
      title: 'Morning Reminder',
      message: `🌅 Good Morning!\n\n📊 Daily Budget: ₹1,167\n💰 Monthly Remaining: ₹28,150\n\nDon't forget to track your expenses today! 💪`,
    },
    {
      title: 'Over Budget Alert',
      message: `🚨 <b>Budget Alert!</b>\n\nYou've exceeded today's budget!\nSpent: ₹1,500 (Budget: ₹1,167)\n\nTry to save tomorrow to balance out.`,
    },
    {
      title: 'Low Balance Warning',
      message: `⚠️ <b>Low Balance!</b>\n\nOnly ₹3,500 remaining for 8 days.\nSuggested daily limit: ₹437\n\nBe careful with spending!`,
    }
  ]

  const sendTestMessage = async (text: string) => {
    setSending(true)
    try {
      const success = await telegram.sendMessage(text)
      if (success) {
        toast.success('Message sent! Check your Telegram.')
      } else {
        toast.error('Failed to send. Check your bot token and chat ID.')
      }
    } catch (error) {
      toast.error('Error sending message')
      console.error(error)
    } finally {
      setSending(false)
    }
  }

  const sendCustomMessage = async () => {
    if (!message.trim()) {
      toast.error('Please enter a message')
      return
    }
    await sendTestMessage(message)
    setMessage('')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-transparent">
          Test Telegram Bot
        </h1>

        {/* Connection Status */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Connection Status</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">Bot Token:</span>
              <span className={process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN ? 'text-green-600' : 'text-red-600'}>
                {process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN ? '✅ Configured' : '❌ Not set'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Chat ID:</span>
              <span className={process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID ? 'text-green-600' : 'text-red-600'}>
                {process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID ? '✅ Configured' : '❌ Not set'}
              </span>
            </div>
          </div>
          
          {(!process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || !process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID) && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Add your bot token and chat ID to .env.local file
              </p>
            </div>
          )}
        </div>

        {/* Test Messages */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Send Test Messages</h2>
          <div className="grid gap-3">
            {testMessages.map((test) => (
              <div key={test.title} className="flex items-center justify-between p-3 border rounded-lg dark:border-gray-700">
                <div>
                  <h3 className="font-medium">{test.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {test.message.substring(0, 50)}...
                  </p>
                </div>
                <button
                  onClick={() => sendTestMessage(test.message)}
                  disabled={sending}
                  className="btn-primary px-4 py-2"
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Message */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Send Custom Message</h2>
          <div className="space-y-4">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message here... (HTML formatting supported)"
              className="input w-full h-32 resize-none"
            />
            <button
              onClick={sendCustomMessage}
              disabled={sending || !message.trim()}
              className="btn-primary"
            >
              {sending ? 'Sending...' : 'Send Custom Message'}
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h3 className="font-semibold mb-2">📝 Setup Instructions</h3>
          <ol className="text-sm space-y-1 list-decimal list-inside">
            <li>Create bot with @BotFather on Telegram</li>
            <li>Get your bot token</li>
            <li>Send a message to your bot</li>
            <li>Get your chat ID from the API</li>
            <li>Add both to .env.local</li>
            <li>Restart Next.js server</li>
            <li>Test messages above</li>
          </ol>
        </div>
      </div>
    </div>
  )
}