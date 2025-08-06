// middleware.ts (in your project root)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Pages that don't require authentication
const publicPaths = [
  '/login',
  '/api/auth/login',
  '/api/auth/check',
  '/api/telegram/webhook',    // ← ADD THIS LINE! Telegram webhook must be public
  '/api/cron/reminders',      // ← ADD THIS TOO! Cron jobs must be public
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Allow public paths - CHECK IF PATH STARTS WITH ANY PUBLIC PATH
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Check for auth token
  const token = request.cookies.get('auth-token')
  
  if (!token) {
    // Redirect to login if no token
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Verify token is still valid (simple check - enhance as needed)
  const tokenData = JSON.parse(token.value || '{}')
  const tokenAge = Date.now() - (tokenData.timestamp || 0)
  const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days

  if (tokenAge > maxAge) {
    // Token expired, redirect to login
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('auth-token')
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
  ],
}