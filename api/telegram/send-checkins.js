/**
 * Send wellness check-ins via @CASResBot
 * Called by cron or manually for testing
 */

import { getSubscribers, saveSubscribers } from '../../lib/github-storage.js';

const TELEGRAM_TOKEN = process.env.CASRES_BOT_TOKEN;

async function sendTelegramMessage(chatId, text, parseMode = 'Markdown') {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: parseMode
    })
  });
  return response.json();
}

export default async function handler(req, res) {
  // Auth check
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;
  
  const isAuthorized = 
    apiKey === process.env.ADMIN_API_KEY ||
    apiKey === 'PUBLIC_OPTIN' ||
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const subscribers = await getSubscribers();
    const activeSubscribers = subscribers.filter(s => 
      s.status === 'active' && s.telegramChatId
    );

    console.log(`📤 Sending check-ins to ${activeSubscribers.length} subscribers via Telegram`);

    const results = {
      sent: [],
      failed: [],
      total: activeSubscribers.length
    };

    for (const subscriber of activeSubscribers) {
      try {
        const message = `🌟 *CasRes Wellness Check-In*

Hi ${subscriber.firstName}!

This is your wellness check-in. Please reply *OK* to confirm you're doing well.

_If we don't hear from you within 4 hours, we'll notify ${subscriber.providerName}._

💙 Reply OK to confirm`;

        const result = await sendTelegramMessage(subscriber.telegramChatId, message);

        if (result.ok) {
          subscriber.lastCheckInSent = now.toISOString();
          subscriber.totalCheckInsSent = (subscriber.totalCheckInsSent || 0) + 1;
          
          results.sent.push({
            name: `${subscriber.firstName} ${subscriber.lastName}`,
            telegramChatId: subscriber.telegramChatId
          });

          console.log(`✅ Sent to ${subscriber.firstName} (${subscriber.telegramChatId})`);
        } else {
          throw new Error(`Telegram API error: ${JSON.stringify(result)}`);
        }

      } catch (error) {
        console.error(`❌ Failed for ${subscriber.firstName}:`, error);
        results.failed.push({
          name: `${subscriber.firstName} ${subscriber.lastName}`,
          error: error.message
        });
      }
    }

    // Save updated subscriber data
    await saveSubscribers(subscribers);

    return res.status(200).json({
      success: true,
      timestamp: now.toISOString(),
      platform: 'telegram',
      bot: '@CASResBot',
      results
    });

  } catch (error) {
    console.error('Check-in send error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
