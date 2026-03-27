/**
 * Twilio webhook handler for incoming SMS responses
 * Records responses and cancels pending alerts
 */

import { kv } from '@vercel/kv';
import twilio from 'twilio';

export default async function handler(req, res) {
  try {
    // Verify Twilio signature
    const twilioSignature = req.headers['x-twilio-signature'];
    const url = `https://${req.headers.host}${req.url}`;
    
    const isValid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      twilioSignature,
      url,
      req.body
    );

    if (!isValid && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Invalid Twilio signature' });
    }

    const { From: fromPhone, Body: messageBody } = req.body;

    console.log(`Received SMS from ${fromPhone}: ${messageBody}`);

    // Find subscriber by phone
    const subscriberKeys = await kv.keys('subscriber:*');
    const subscribers = await Promise.all(
      subscriberKeys.map(key => kv.get(key))
    );
    
    const subscriber = subscribers.find(s => s && s.phone === fromPhone);

    if (!subscriber) {
      console.log(`Unknown phone number: ${fromPhone}`);
      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Handle STOP/unsubscribe
    const bodyLower = messageBody.trim().toLowerCase();
    if (bodyLower === 'stop' || bodyLower === 'unsubscribe') {
      await kv.set(`subscriber:${subscriber.id}`, {
        ...subscriber,
        status: 'unsubscribed',
        unsubscribedAt: new Date().toISOString()
      });

      return res.status(200).send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been unsubscribed from wellness check-ins. Reply START to re-subscribe.</Message></Response>'
      );
    }

    // Handle START/resubscribe
    if (bodyLower === 'start' || bodyLower === 'subscribe') {
      await kv.set(`subscriber:${subscriber.id}`, {
        ...subscriber,
        status: 'active',
        resubscribedAt: new Date().toISOString()
      });

      return res.status(200).send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Welcome back! You will receive wellness check-ins 3 times daily.</Message></Response>'
      );
    }

    // Find the most recent pending check-in for this subscriber
    const checkInKeys = await kv.keys(`checkin:*:${subscriber.id}`);
    const checkIns = await Promise.all(
      checkInKeys.map(key => kv.get(key))
    );

    const pendingCheckIns = checkIns
      .filter(c => c && c.status === 'pending')
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

    if (pendingCheckIns.length > 0) {
      const latestCheckIn = pendingCheckIns[0];
      
      // Mark as responded
      await kv.set(`checkin:${latestCheckIn.id}:${subscriber.id}`, {
        ...latestCheckIn,
        status: 'responded',
        respondedAt: new Date().toISOString(),
        responseText: messageBody
      });

      console.log(`Check-in ${latestCheckIn.id} marked as responded for ${subscriber.id}`);
    }

    // Update subscriber response stats
    await kv.set(`subscriber:${subscriber.id}`, {
      ...subscriber,
      lastResponseReceived: new Date().toISOString(),
      totalResponsesReceived: (subscriber.totalResponsesReceived || 0) + 1
    });

    // Send confirmation
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thank you! Your response has been recorded. 💙</Message></Response>'
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
