/**
 * Test check-in via Telegram
 * Simple endpoint to test the check-in flow before Twilio approval
 * Sends check-in message to configured Telegram user
 */

import { getSubscribers } from '../../lib/github-storage.js';

export default async function handler(req, res) {
  // Simple auth for testing
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== 'PUBLIC_OPTIN' && apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const subscribers = await getSubscribers();
    const activeSubscribers = subscribers.filter(s => s.status === 'active');

    if (activeSubscribers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No active subscribers to test',
        count: 0
      });
    }

    // Get subscriber info for the message
    const subscriber = activeSubscribers[0]; // First subscriber for testing

    const checkInMessage = `🌟 **CasRes Wellness Check-In (TEST)**

Hi ${subscriber.firstName}!

This is your wellness check-in. In production, this would be sent via SMS to ${subscriber.phone}.

Please confirm you're doing well by replying "OK".

---
Provider: ${subscriber.providerName} (${subscriber.providerPhone})
System: Telegram Test Mode`;

    return res.status(200).json({
      success: true,
      mode: 'test',
      message: 'Check-in test ready',
      subscriber: {
        name: `${subscriber.firstName} ${subscriber.lastName}`,
        phone: subscriber.phone,
        provider: subscriber.providerName
      },
      messagePreview: checkInMessage,
      note: 'To send this as a real Telegram message, call /api/checkin/send-live with your bot'
    });

  } catch (error) {
    console.error('Error in test check-in:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
