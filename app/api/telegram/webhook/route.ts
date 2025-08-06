// app/api/telegram/webhook/route.ts
export async function POST(request: Request) {
    try {
      // Just log and return OK - no imports, no dependencies
      const body = await request.json()
      console.log('Telegram webhook received:', JSON.stringify(body))
      
      // Return plain Response, not NextResponse
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (e) {
      console.error('Webhook error:', e)
      // Even on error, return 200 OK
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }
  }
  
  export async function GET() {
    return new Response(JSON.stringify({ 
      status: 'Webhook is working',
      time: new Date().toISOString() 
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }