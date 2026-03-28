/**
 * CasRes - Express.js server for DigitalOcean App Platform
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSubscribers, saveSubscribers } from './lib/github-storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const TELEGRAM_TOKEN = process.env.CASRES_BOT_TOKEN;

// Helper: Send Telegram message
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

// API: Add Subscriber
app.post('/api/subscribers/add', async (req, res) => {
  try {
    const { firstName, lastName, phone, providerName, providerPhone } = req.body;
    
    if (!firstName || !lastName || !phone || !providerName || !providerPhone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const subscribers = await getSubscribers();
    
    // Format phone numbers (just store as provided for now)
    const formattedPhone = phone;
    const formattedProviderPhone = providerPhone;
    
    // Check for duplicate phone number
    const normalizePhone = (phone) => phone ? phone.replace(/\D/g, '') : '';
    const phoneNormalized = normalizePhone(formattedPhone);
    const existing = subscribers.find(s => normalizePhone(s.phone) === phoneNormalized);
    
    if (existing) {
      return res.status(400).json({ 
        error: 'Phone number already registered',
        message: `This phone number is already registered. If you need to update your information, please contact support.`
      });
    }
    
    const subscriberId = `sub_${Date.now()}`;
    const linkToken = Buffer.from(`${subscriberId}:${Date.now()}`).toString('base64').replace(/[=+\/]/g, '').substring(0, 16);

    const subscriber = {
      id: subscriberId,
      firstName,
      lastName,
      phone,
      providerName,
      providerPhone,
      telegramChatId: null,
      telegramLinkToken: linkToken,
      consentGiven: true,
      consentTimestamp: new Date().toISOString(),
      consentIp: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      status: 'active',
      source: req.body.source || 'web_optin',
      createdAt: new Date().toISOString(),
      lastCheckInSent: null,
      lastResponseReceived: null,
      totalCheckInsSent: 0,
      totalResponsesReceived: 0
    };

    subscribers.push(subscriber);
    await saveSubscribers(subscribers);

    return res.status(201).json({
      success: true,
      subscriber: { id: subscriber.id, firstName, lastName },
      telegram: {
        activationLink: `https://t.me/CASResBot?start=${linkToken}`,
        instructions: 'Click to activate Telegram check-ins'
      }
    });
  } catch (error) {
    console.error('Add subscriber error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// API: List Subscribers
app.get('/api/subscribers/list', async (req, res) => {
  try {
    const subscribers = await getSubscribers();
    return res.status(200).json({ subscribers });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// API: Telegram Webhook
app.post('/api/telegram/webhook', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = message.chat.id;
    const text = message.text || '';
    const textUpper = text.trim().toUpperCase();

    // Handle /start with link token
    if (text.startsWith('/start ')) {
      const token = text.split(' ')[1];
      const subscribers = await getSubscribers();
      const subscriber = subscribers.find(s => s.telegramLinkToken === token);

      if (subscriber) {
        subscriber.telegramChatId = chatId.toString();
        await saveSubscribers(subscribers);
        
        await sendTelegramMessage(chatId,
          `✅ *Welcome ${subscriber.firstName}!*\n\nYour Telegram account is now connected to CasRes wellness check-ins.\n\n📅 *Daily Check-In Schedule (Pacific Time):*\n• 12:30 PM\n• 1:00 PM\n• 1:30 PM\n\nJust reply with any message to confirm you're doing well.\n\nIf you don't respond to any check-ins, we'll alert ${subscriber.providerName} at 2:00 PM.\n\n💙 You're all set!`
        );
        return res.status(200).json({ ok: true });
      }
    }

    // Handle any text response (except commands) as acknowledgement
    if (text && !text.startsWith('/')) {
      const subscribers = await getSubscribers();
      const subscriber = subscribers.find(s => s.telegramChatId === chatId.toString());

      if (subscriber) {
        subscriber.lastResponseReceived = new Date().toISOString();
        subscriber.totalResponsesReceived = (subscriber.totalResponsesReceived || 0) + 1;
        subscriber.dailyResponseReceived = true; // Mark as responded for today
        await saveSubscribers(subscribers);

        await sendTelegramMessage(chatId,
          `✅ Thank you ${subscriber.firstName}! Wellness check-in confirmed. 💙\n\n*⚠️ IF THIS IS A REAL EMERGENCY, CALL 911 IMMEDIATELY*\n\n_Next check-in: 12:30 PM, 1:00 PM, or 1:30 PM Pacific_`
        );
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// API: Send Test Check-in
app.get('/api/telegram/send-test-checkin', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== 'PUBLIC_OPTIN' && apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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

    // Check if they already responded
    const lastCheckIn = subscriber.lastCheckInSent ? new Date(subscriber.lastCheckInSent) : null;
    const lastResponse = subscriber.lastResponseReceived ? new Date(subscriber.lastResponseReceived) : null;

    if (lastResponse && lastCheckIn && lastResponse > lastCheckIn) {
      return res.status(200).json({
        success: true,
        skipped: true,
        reason: 'Subscriber already responded',
        lastResponse: subscriber.lastResponseReceived
      });
    }

    const number = checkInNumber || '1';
    const message = `🌟 *Test Check-In #${number}*\n\nHi ${subscriber.firstName}!\n\nThis is test check-in #${number}.\n\nPlease reply *OK* to confirm you're doing well.\n\n💙 Reply OK to confirm`;

    await sendTelegramMessage(subscriber.telegramChatId, message);

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
  } catch (error) {
    console.error('Send check-in error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// API: Alert Provider
app.get('/api/telegram/alert-provider', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== 'PUBLIC_OPTIN' && apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subscriberId } = req.query;
    if (!subscriberId) {
      return res.status(400).json({ error: 'subscriberId required' });
    }

    const subscribers = await getSubscribers();
    const subscriber = subscribers.find(s => s.id === subscriberId);

    if (!subscriber) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    const lastCheckIn = subscriber.lastCheckInSent ? new Date(subscriber.lastCheckInSent) : null;
    const lastResponse = subscriber.lastResponseReceived ? new Date(subscriber.lastResponseReceived) : null;

    if (lastResponse && lastCheckIn && lastResponse > lastCheckIn) {
      return res.status(200).json({
        success: true,
        alertSent: false,
        reason: 'Subscriber responded',
        lastResponse: subscriber.lastResponseReceived
      });
    }

    const alertMessage = `⚠️ *WELLNESS ALERT*\n\n${subscriber.firstName} ${subscriber.lastName} has not responded to 3 wellness check-ins.\n\n📱 Phone: ${subscriber.phone}\n⏰ Last check-in sent: ${lastCheckIn ? lastCheckIn.toLocaleString() : 'Unknown'}\n❌ No response received\n\nPlease call ${subscriber.firstName} to verify their wellbeing.\n\n_This is a test alert from CasRes wellness check-in service._`;

    const providerChatId = '8259734518'; // Curtis for testing
    await sendTelegramMessage(providerChatId, alertMessage);

    subscriber.lastAlertSent = new Date().toISOString();
    subscriber.totalAlertsSent = (subscriber.totalAlertsSent || 0) + 1;
    await saveSubscribers(subscribers);

    return res.status(200).json({
      success: true,
      alertSent: true,
      method: 'telegram',
      subscriber: {
        name: `${subscriber.firstName} ${subscriber.lastName}`,
        lastCheckIn: subscriber.lastCheckInSent,
        lastResponse: subscriber.lastResponseReceived
      }
    });
  } catch (error) {
    console.error('Alert error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// API: Sync Airtable
app.post('/api/sync/airtable', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== 'PUBLIC_OPTIN' && apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.status(200).json({ success: true, message: 'Airtable sync not yet implemented in Express version' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'casres', timestamp: new Date().toISOString() });
});

// Serve static HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦀 CasRes server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`GitHub storage: ${process.env.GITHUB_TOKEN ? '✅' : '❌'}`);
  console.log(`Telegram bot: ${process.env.CASRES_BOT_TOKEN ? '✅' : '❌'}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});
