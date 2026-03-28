/**
 * Send scheduled check-ins via Telegram (for testing before Twilio approval)
 * Reads subscribers from GitHub, sends Telegram messages
 */

import { getSubscribers } from '../../lib/github-storage.js';

export default async function handler(req, res) {
  // Verify cron secret or admin key
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];
  
  const isAuthorized = 
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    apiKey === process.env.ADMIN_API_KEY ||
    apiKey === 'PUBLIC_OPTIN'; // Temporary for testing

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const timestamp = now.toISOString();
    const checkInId = `checkin_${Date.now()}`;

    // Get all active subscribers
    const subscribers = await getSubscribers();
    const activeSubscribers = subscribers.filter(s => s.status === 'active');

    console.log(`Sending Telegram check-ins to ${activeSubscribers.length} subscribers`);

    const results = {
      sent: [],
      failed: [],
      total: activeSubscribers.length
    };

    for (const subscriber of activeSubscribers) {
      try {
        // For testing, we'll use the subscriber's phone as Telegram chat ID
        // In production, you'd map phone numbers to Telegram user IDs
        const message = `Hi ${subscriber.firstName}! 🌟\n\nThis is your wellness check-in. Please reply "OK" to confirm you're doing well.\n\n💙 CasRes Wellness Check-In`;

        // Send via Telegram
        const telegramResponse = await fetch(`${process.env.GATEWAY_URL || 'http://localhost:3000'}/api/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'send',
            channel: 'telegram',
            target: subscriber.telegramUserId || process.env.TEST_TELEGRAM_USER_ID,
            message: message
          })
        });

        if (telegramResponse.ok) {
          results.sent.push({
            subscriberId: subscriber.id,
            phone: subscriber.phone,
            telegramUserId: subscriber.telegramUserId
          });

          console.log(`✅ Check-in sent to ${subscriber.firstName} ${subscriber.lastName}`);
        } else {
          throw new Error(`Telegram send failed: ${telegramResponse.status}`);
        }

      } catch (error) {
        console.error(`Failed to send check-in to ${subscriber.phone}:`, error);
        results.failed.push({
          subscriberId: subscriber.id,
          phone: subscriber.phone,
          error: error.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      checkInId,
      timestamp,
      platform: 'telegram',
      results
    });

  } catch (error) {
    console.error('Error in Telegram check-in handler:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
