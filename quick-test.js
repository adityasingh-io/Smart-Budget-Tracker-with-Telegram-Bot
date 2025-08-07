// diagnostic-test.js - Run this to find the issue
// node diagnostic-test.js

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
}

console.log(`${colors.cyan}${colors.bright}
╔══════════════════════════════════════════════════════════╗
║            TELEGRAM BOT DIAGNOSTIC TEST                  ║
╚══════════════════════════════════════════════════════════╝
${colors.reset}`)

// Step 1: Check if server is running
async function checkServer() {
  console.log('\n📡 Checking server connection...')
  try {
    const response = await fetch('http://localhost:3000/api/telegram/webhook', {
      method: 'GET'
    })
    const data = await response.json()
    console.log(`${colors.green}✅ Server is running${colors.reset}`)
    console.log('   Response:', JSON.stringify(data, null, 2))
    return true
  } catch (error) {
    console.log(`${colors.red}❌ Cannot connect to server${colors.reset}`)
    console.log('   Error:', error.message)
    console.log('\n   Please start your Next.js server: npm run dev')
    return false
  }
}

// Step 2: Test basic webhook response
async function testWebhookResponse() {
  console.log('\n🔍 Testing webhook response...')
  
  try {
    const response = await fetch('http://localhost:3000/api/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          message_id: 123,
          chat: { id: 123456789, type: 'private' },
          from: { id: 987654321, first_name: 'Test' },
          text: 'help',
          date: Date.now() / 1000
        }
      })
    })
    
    const data = await response.json()
    
    if (response.ok && data.ok) {
      console.log(`${colors.green}✅ Webhook responds with ok: true${colors.reset}`)
    } else {
      console.log(`${colors.red}❌ Webhook response not ok${colors.reset}`)
      console.log('   Status:', response.status)
      console.log('   Data:', JSON.stringify(data, null, 2))
    }
    
    return { success: response.ok, data }
  } catch (error) {
    console.log(`${colors.red}❌ Webhook request failed${colors.reset}`)
    console.log('   Error:', error.message)
    return { success: false, error: error.message }
  }
}

// Step 3: Check environment variables
function checkEnvironment() {
  console.log('\n🔧 Checking environment variables...')
  
  const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN
  
  if (token) {
    console.log(`${colors.green}✅ NEXT_PUBLIC_TELEGRAM_BOT_TOKEN is set${colors.reset}`)
    console.log(`   Token: ${token.substring(0, 10)}...${token.substring(token.length - 5)}`)
  } else {
    console.log(`${colors.red}❌ NEXT_PUBLIC_TELEGRAM_BOT_TOKEN is NOT set${colors.reset}`)
    console.log('\n   This is likely the issue!')
    console.log('   Add to your .env.local file:')
    console.log('   NEXT_PUBLIC_TELEGRAM_BOT_TOKEN=your_bot_token_here')
  }
  
  return !!token
}

// Step 4: Test with intercepted fetch
async function testWithInterceptedFetch() {
  console.log('\n🎯 Testing with intercepted fetch to capture Telegram API calls...')
  
  let telegramCalls = []
  const originalFetch = global.fetch
  
  // Intercept fetch
  global.fetch = async function(url, options) {
    if (url && url.includes('api.telegram.org')) {
      const body = JSON.parse(options?.body || '{}')
      telegramCalls.push({
        url: url,
        method: body.method || 'sendMessage',
        text: body.text,
        chat_id: body.chat_id
      })
      return { ok: true, json: async () => ({ ok: true }) }
    }
    return originalFetch(url, options)
  }
  
  // Make test request
  try {
    await fetch('http://localhost:3000/api/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          message_id: 123,
          chat: { id: 123456789, type: 'private' },
          from: { id: 987654321, first_name: 'Test' },
          text: 'balance',
          date: Date.now() / 1000
        }
      })
    })
    
    // Restore original fetch
    global.fetch = originalFetch
    
    if (telegramCalls.length > 0) {
      console.log(`${colors.green}✅ Telegram API was called${colors.reset}`)
      console.log('   Calls made:', telegramCalls.length)
      telegramCalls.forEach((call, i) => {
        console.log(`\n   Call ${i + 1}:`)
        console.log(`   - Chat ID: ${call.chat_id}`)
        console.log(`   - Text: ${call.text?.substring(0, 50)}...`)
      })
    } else {
      console.log(`${colors.red}❌ No Telegram API calls were made${colors.reset}`)
      console.log('   The webhook is not calling sendMessage')
    }
    
    return telegramCalls.length > 0
  } catch (error) {
    global.fetch = originalFetch
    console.log(`${colors.red}❌ Test failed${colors.reset}`)
    console.log('   Error:', error.message)
    return false
  }
}

// Step 5: Test direct webhook import (if possible)
async function testDirectImport() {
  console.log('\n📦 Checking if webhook file exists...')
  
  try {
    // Try to check if the file exists
    const fs = require('fs')
    const path = require('path')
    
    const possiblePaths = [
      './app/api/telegram/webhook/route.ts',
      './src/app/api/telegram/webhook/route.ts',
      '../app/api/telegram/webhook/route.ts',
      './pages/api/telegram/webhook.ts'
    ]
    
    let found = false
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        console.log(`${colors.green}✅ Found webhook at: ${p}${colors.reset}`)
        found = true
        
        // Check if it has sendMessage function
        const content = fs.readFileSync(p, 'utf8')
        if (content.includes('sendMessage')) {
          console.log(`${colors.green}✅ sendMessage function found${colors.reset}`)
        } else {
          console.log(`${colors.red}❌ sendMessage function not found${colors.reset}`)
        }
        
        if (content.includes('NEXT_PUBLIC_TELEGRAM_BOT_TOKEN')) {
          console.log(`${colors.green}✅ Uses NEXT_PUBLIC_TELEGRAM_BOT_TOKEN${colors.reset}`)
        } else {
          console.log(`${colors.yellow}⚠️ Doesn't reference NEXT_PUBLIC_TELEGRAM_BOT_TOKEN${colors.reset}`)
        }
        
        break
      }
    }
    
    if (!found) {
      console.log(`${colors.yellow}⚠️ Could not find webhook file${colors.reset}`)
      console.log('   Tried paths:', possiblePaths.join(', '))
    }
  } catch (error) {
    console.log(`${colors.yellow}⚠️ Could not check file system${colors.reset}`)
  }
}

// Step 6: Test with console output monitoring
async function testWithConsoleMonitoring() {
  console.log('\n📝 Making test request and checking server console...')
  
  const testMessage = {
    message: {
      message_id: Date.now(),
      chat: { id: 123456789, type: 'private' },
      from: { id: 987654321, first_name: 'Test' },
      text: 'help',
      date: Date.now() / 1000
    }
  }
  
  console.log('\nSending test message:')
  console.log(JSON.stringify(testMessage, null, 2))
  
  try {
    const response = await fetch('http://localhost:3000/api/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testMessage)
    })
    
    const data = await response.json()
    
    console.log('\nResponse received:')
    console.log('Status:', response.status)
    console.log('Data:', JSON.stringify(data, null, 2))
    
    console.log(`\n${colors.yellow}⚠️ CHECK YOUR NEXT.JS SERVER CONSOLE${colors.reset}`)
    console.log('Look for:')
    console.log('  1. "Webhook received:" log')
    console.log('  2. "Telegram bot token not configured" error')
    console.log('  3. Any error messages')
    
  } catch (error) {
    console.log(`${colors.red}❌ Request failed: ${error.message}${colors.reset}`)
  }
}

// Main diagnostic runner
async function runDiagnostics() {
  const results = {
    server: false,
    webhook: false,
    environment: false,
    telegramCalls: false
  }
  
  // Run all checks
  results.server = await checkServer()
  if (!results.server) {
    console.log(`\n${colors.red}${colors.bright}❌ Server is not running. Start it with: npm run dev${colors.reset}`)
    return
  }
  
  const webhookTest = await testWebhookResponse()
  results.webhook = webhookTest.success
  
  results.environment = checkEnvironment()
  
  results.telegramCalls = await testWithInterceptedFetch()
  
  await testDirectImport()
  
  await testWithConsoleMonitoring()
  
  // Final diagnosis
  console.log(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}`)
  console.log(`${colors.bright}🔬 DIAGNOSIS${colors.reset}`)
  console.log('─'.repeat(60))
  
  if (!results.environment) {
    console.log(`\n${colors.red}${colors.bright}🚨 MAIN ISSUE: Missing Bot Token${colors.reset}`)
    console.log('\nSolution:')
    console.log('1. Create or edit .env.local file in your project root')
    console.log('2. Add this line:')
    console.log(`   ${colors.yellow}NEXT_PUBLIC_TELEGRAM_BOT_TOKEN=your_actual_bot_token${colors.reset}`)
    console.log('3. Restart your Next.js server')
    console.log('4. Run the tests again')
    console.log('\nGet your bot token from @BotFather on Telegram')
  } else if (!results.telegramCalls) {
    console.log(`\n${colors.red}${colors.bright}🚨 MAIN ISSUE: Webhook not sending messages${colors.reset}`)
    console.log('\nPossible causes:')
    console.log('1. sendMessage function has an error')
    console.log('2. Token is set but invalid')
    console.log('3. Supabase queries are failing')
    console.log('\nCheck your Next.js server console for error messages')
  } else {
    console.log(`\n${colors.green}${colors.bright}✅ Everything seems to be working!${colors.reset}`)
  }
  
  console.log(`\n${colors.cyan}Need help? Check:${colors.reset}`)
  console.log('1. Next.js server console for errors')
  console.log('2. .env.local file for correct token')
  console.log('3. Supabase connection and data')
  console.log('4. Network/firewall settings')
}

// Run diagnostics
runDiagnostics().catch(error => {
  console.error(`${colors.red}Diagnostic error:`, error)
  console.log(colors.reset)
})