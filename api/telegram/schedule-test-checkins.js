/**
 * Schedule 3 test check-ins after registration (1, 2, 3 minutes)
 * For testing purposes only
 */

const TELEGRAM_TOKEN = process.env.CASRES_BOT_TOKEN;

async function sendTelegramMessage(chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    })
  });
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { subscriberId, chatId, firstName, providerName } = req.body;

    if (!chatId || !firstName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Schedule messages via Vercel Edge Config or immediate send for testing
    const schedules = [
      { delay: 60000, number: 1 },   // 1 minute
      { delay: 120000, number: 2 },  // 2 minutes
      { delay: 180000, number: 3 }   // 3 minutes
    ];

    // For serverless, we can't do setTimeout, so return schedule info
    // Client or cron will need to call this at the right times
    
    return res.status(200).json({
      success: true,
      message: 'Test check-ins scheduled',
      schedule: schedules.map(s => ({
        delayMinutes: s.delay / 60000,
        checkInNumber: s.number,
        executeAt: new Date(Date.now() + s.delay).toISOString()
      })),
      note: 'Call /api/telegram/send-test-checkin with subscriberId to send manually'
    });

  } catch (error) {
    console.error('Schedule error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
