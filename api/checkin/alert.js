/**
 * Check for unanswered check-ins and alert providers
 * Runs periodically (e.g., every 30 minutes)
 */

import { kv } from '@vercel/kv';
import twilio from 'twilio';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Alert if no response after this many hours
const ALERT_THRESHOLD_HOURS = parseInt(process.env.ALERT_THRESHOLD_HOURS || '4', 10);

export default async function handler(req, res) {
  // Verify cron secret
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const thresholdTime = new Date(now.getTime() - (ALERT_THRESHOLD_HOURS * 60 * 60 * 1000));

    // Get all check-ins
    const checkInKeys = await kv.keys('checkin:*');
    const checkIns = await Promise.all(
      checkInKeys.map(key => kv.get(key))
    );

    // Find pending check-ins that are past the threshold
    const overdueCheckIns = checkIns.filter(c => {
      if (!c || c.status !== 'pending') return false;
      const sentAt = new Date(c.sentAt);
      return sentAt < thresholdTime;
    });

    console.log(`Found ${overdueCheckIns.length} overdue check-ins`);

    const alerts = {
      sent: [],
      failed: []
    };

    for (const checkIn of overdueCheckIns) {
      try {
        // Send alert to provider
        const alertMessage = `⚠️ WELLNESS ALERT: ${checkIn.subscriberName} (${checkIn.subscriberPhone}) has not responded to check-in sent at ${new Date(checkIn.sentAt).toLocaleString()}. Please call to verify their wellbeing.`;

        const message = await twilioClient.messages.create({
          to: checkIn.providerPhone,
          from: process.env.TWILIO_PHONE_NUMBER,
          body: alertMessage
        });

        // Update check-in status
        const key = `checkin:${checkIn.id}:${checkIn.subscriberId}`;
        await kv.set(key, {
          ...checkIn,
          status: 'alert_sent',
          alertSentAt: now.toISOString(),
          alertMessageSid: message.sid
        });

        alerts.sent.push({
          checkInId: checkIn.id,
          subscriberId: checkIn.subscriberId,
          providerPhone: checkIn.providerPhone,
          messageSid: message.sid
        });

        console.log(`Alert sent for check-in ${checkIn.id}`);

      } catch (error) {
        console.error(`Failed to send alert for check-in ${checkIn.id}:`, error);
        alerts.failed.push({
          checkInId: checkIn.id,
          error: error.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      timestamp: now.toISOString(),
      thresholdHours: ALERT_THRESHOLD_HOURS,
      overdueCount: overdueCheckIns.length,
      alerts
    });

  } catch (error) {
    console.error('Error in alert handler:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
