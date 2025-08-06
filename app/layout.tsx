// app/layout.tsx
import './globals.css'
import Providers from '@/components/Providers'
import { Toaster } from 'react-hot-toast'

export const metadata = {
  title: 'Personal Expense Tracker',
  description: 'Smart personal finance management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          {children}
          <Toaster 
            position="top-right"
            toastOptions={{
              className: 'dark:bg-gray-800 dark:text-white',
              style: {
                background: '#333',
                color: '#fff',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}