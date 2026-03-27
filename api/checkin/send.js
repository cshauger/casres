/**
 * Send scheduled check-ins to all active subscribers
 * Triggered by Vercel Cron (3x daily)
 */

import { kv } from '@vercel/kv';
import twilio from 'twilio';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export default async function handler(req, res) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const timestamp = now.toISOString();
    const checkInId = `checkin_${Date.now()}`;

    // Get all active subscribers
    const subscriberKeys = await kv.keys('subscriber:*');
    const subscribers = await Promise.all(
      subscriberKeys.map(key => kv.get(key))
    );

    const activeSubscribers = subscribers.filter(s => s && s.status === 'active');

    console.log(`Sending check-ins to ${activeSubscribers.length} subscribers`);

    const results = {
      sent: [],
      failed: [],
      total: activeSubscribers.length
    };

    for (const subscriber of activeSubscribers) {
      try {
        // Send check-in SMS
        const message = await twilioClient.messages.create({
          to: subscriber.phone,
          from: process.env.TWILIO_PHONE_NUMBER,
          body: `Hi ${subscriber.firstName}! This is your wellness check-in. Please reply "OK" to confirm you're doing well. 💙`
        });

        // Record the check-in in KV
        const checkInData = {
          id: checkInId,
          subscriberId: subscriber.id,
          subscriberName: `${subscriber.firstName} ${subscriber.lastName}`,
          subscriberPhone: subscriber.phone,
          providerPhone: subscriber.providerPhone,
          providerName: subscriber.providerName,
          sentAt: timestamp,
          twilioMessageSid: message.sid,
          status: 'pending', // pending -> responded | no_response -> alert_sent
          respondedAt: null,
          alertSentAt: null
        };

        await kv.set(`checkin:${checkInId}:${subscriber.id}`, checkInData, {
          ex: 86400 * 7 // Keep for 7 days
        });

        // Update subscriber's last check-in time
        await kv.set(`subscriber:${subscriber.id}`, {
          ...subscriber,
          lastCheckInSent: timestamp,
          totalCheckInsSent: (subscriber.totalCheckInsSent || 0) + 1
        });

        results.sent.push({
          subscriberId: subscriber.id,
          phone: subscriber.phone,
          messageSid: message.sid
        });

      } catch (error) {
        console.error(`Failed to send check-in to ${subscriber.phone}:`, error);
        results.failed.push({
          subscriberId: subscriber.id,
          phone: subscriber.phone,
          error: error.message
        });
      }
    }

    // Store check-in batch metadata
    await kv.set(`checkin_batch:${checkInId}`, {
      id: checkInId,
      timestamp,
      results
    }, { ex: 86400 * 7 });

    return res.status(200).json({
      success: true,
      checkInId,
      timestamp,
      results
    });

  } catch (error) {
    console.error('Error in check-in handler:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
