/**
 * Send a single test check-in immediately
 * Called manually or via scheduler for testing
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
    const { subscriberId, checkInNumber } = req.query;

    if (!subscriberId) {
      return res.status(400).json({ error: 'subscriberId required' });
    }

    const subscribers = await getSubscribers();
    const subscriber = subscribers.find(s => s.id === subscriberId);

    if (!subscriber) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    if (!subscriber.telegramChatId) {
      return res.status(400).json({ error: 'Subscriber has not activated Telegram' });
    }

    // Check if they already responded since the last check-in
    const lastCheckIn = subscriber.lastCheckInSent ? new Date(subscriber.lastCheckInSent) : null;
    const lastResponse = subscriber.lastResponseReceived ? new Date(subscriber.lastResponseReceived) : null;

    if (lastResponse && lastCheckIn && lastResponse > lastCheckIn) {
      // They already responded! Skip this check-in
      return res.status(200).json({
        success: true,
        skipped: true,
        reason: 'Subscriber already responded',
        lastResponse: subscriber.lastResponseReceived
      });
    }

    const number = checkInNumber || '1';
    const message = `🌟 *Test Check-In #${number}*\n\nHi ${subscriber.firstName}!\n\nThis is test check-in #${number} (sent ${Math.round(parseInt(number))} minute${number === '1' ? '' : 's'} after registration).\n\nPlease reply *OK* to confirm you're doing well.\n\n_In production, these would be sent at 8am, 2pm, and 8pm._\n\n💙 Reply OK to confirm`;

    const result = await sendTelegramMessage(subscriber.telegramChatId, message);

    if (result.ok) {
      subscriber.lastCheckInSent = new Date().toISOString();
      subscriber.totalCheckInsSent = (subscriber.totalCheckInsSent || 0) + 1;
      await saveSubscribers(subscribers);

      return res.status(200).json({
        success: true,
        checkInNumber: number,
        subscriber: {
          name: `${subscriber.firstName} ${subscriber.lastName}`,
          telegramChatId: subscriber.telegramChatId
        }
      });
    } else {
      throw new Error(`Telegram send failed: ${JSON.stringify(result)}`);
    }

  } catch (error) {
    console.error('Test check-in error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
