/**
 * Alert provider via Telegram if subscriber hasn't responded
 * Called 10 minutes after final check-in (13 min total)
 */

import { getSubscribers, saveSubscribers } from '../../lib/github-storage.js';

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
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== 'PUBLIC_OPTIN' && apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { subscriberId } = req.query;

    if (!subscriberId) {
      return res.status(400).json({ error: 'subscriberId required' });
    }

    const subscribers = await getSubscribers();
    const subscriber = subscribers.find(s => s.id === subscriberId);

    if (!subscriber) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    // Check if they responded since the last check-in
    const lastCheckIn = subscriber.lastCheckInSent ? new Date(subscriber.lastCheckInSent) : null;
    const lastResponse = subscriber.lastResponseReceived ? new Date(subscriber.lastResponseReceived) : null;

    if (lastResponse && lastCheckIn && lastResponse > lastCheckIn) {
      // They responded! No alert needed
      return res.status(200).json({
        success: true,
        alertSent: false,
        reason: 'Subscriber responded',
        lastResponse: subscriber.lastResponseReceived
      });
    }

    // No response - send alert to provider
    const providerName = subscriber.providerName || 'Provider';
    const alertMessage = `⚠️ *WELLNESS ALERT*

${subscriber.firstName} ${subscriber.lastName} has not responded to 3 wellness check-ins.

📱 Phone: ${subscriber.phone}
⏰ Last check-in sent: ${lastCheckIn ? lastCheckIn.toLocaleString() : 'Unknown'}
❌ No response received

Please call ${subscriber.firstName} to verify their wellbeing.

_This is a test alert from CasRes wellness check-in service._`;

    // Try to send via Telegram first (if we have provider's chat ID)
    // For now, we'll send to the subscriber's emergency contact or back to Curtis
    // In production, provider would need to activate their own Telegram
    
    let alertSent = false;
    let method = 'none';

    // For testing: send to Curtis (subscriber's provider)
    // In production: look up provider's Telegram chat ID
    const providerChatId = '8259734518'; // Curtis for testing
    
    if (providerChatId) {
      const result = await sendTelegramMessage(providerChatId, alertMessage);
      if (result.ok) {
        alertSent = true;
        method = 'telegram';
      }
    }

    // Update subscriber record
    subscriber.lastAlertSent = new Date().toISOString();
    subscriber.totalAlertsSent = (subscriber.totalAlertsSent || 0) + 1;
    await saveSubscribers(subscribers);

    return res.status(200).json({
      success: true,
      alertSent,
      method,
      subscriber: {
        name: `${subscriber.firstName} ${subscriber.lastName}`,
        lastCheckIn: subscriber.lastCheckInSent,
        lastResponse: subscriber.lastResponseReceived
      }
    });

  } catch (error) {
    console.error('Alert error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
