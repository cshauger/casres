/**
 * Telegram webhook for @CASResBot
 * Handles incoming messages (OK responses, /start, etc.)
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const update = req.body;
    
    if (!update.message) {
      return res.status(200).json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text?.trim();
    const textUpper = text?.toUpperCase();
    const firstName = message.from.first_name || 'there';
    const telegramUsername = message.from.username ? `@${message.from.username}` : null;

    console.log(`📨 @CASResBot message from ${firstName} (${chatId}): ${text}`);

    // Handle /start command (with optional deep link token)
    if (textUpper.startsWith('/START')) {
      const token = text.split(' ')[1]; // Get token after /start
      
      if (token) {
        // Deep link activation
        const subscribers = await getSubscribers();
        const subscriber = subscribers.find(s => s.telegramLinkToken === token);
        
        if (subscriber) {
          // Auto-link account
          subscriber.telegramChatId = chatId.toString();
          await saveSubscribers(subscribers);
          
          // Schedule test check-ins via OpenClaw cron (1, 2, 3, 7 minutes)
          const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://casres.com';
          const now = Date.now();
          
          try {
            // Schedule 3 check-ins + 1 alert
            const schedules = [
              { delay: 60000, type: 'checkin', number: 1 },    // 1 min
              { delay: 120000, type: 'checkin', number: 2 },   // 2 min
              { delay: 180000, type: 'checkin', number: 3 },   // 3 min
              { delay: 240000, type: 'alert', number: null }   // 4 min (1 min after 3rd)
            ];

            for (const schedule of schedules) {
              const executeAt = new Date(now + schedule.delay);
              const url = schedule.type === 'checkin'
                ? `${baseUrl}/api/telegram/send-test-checkin?subscriberId=${subscriber.id}&checkInNumber=${schedule.number}`
                : `${baseUrl}/api/telegram/alert-provider?subscriberId=${subscriber.id}`;

              // Create OpenClaw cron job
              const cronPayload = {
                action: 'add',
                job: {
                  name: `CasRes ${schedule.type} #${schedule.number || 'alert'} - ${subscriber.firstName}`,
                  schedule: {
                    kind: 'at',
                    at: executeAt.toISOString()
                  },
                  payload: {
                    kind: 'systemEvent',
                    text: `curl -s "${url}" -H "x-api-key: PUBLIC_OPTIN"`
                  },
                  sessionTarget: 'main'
                }
              };

              // Call OpenClaw cron API
              await fetch(`${process.env.GATEWAY_URL || 'http://localhost:3000'}/cron`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cronPayload)
              });
            }

            console.log(`✅ Scheduled 4 tasks for ${subscriber.firstName} (${subscriber.id})`);
          } catch (cronError) {
            console.error('Failed to schedule cron jobs:', cronError);
            // Continue anyway - they're still linked
          }
          
          await sendTelegramMessage(chatId,
            `✅ *Welcome ${subscriber.firstName}!*\n\nYour Telegram account is now connected to CasRes wellness check-ins.\n\n🧪 *Test Mode:*\nYou'll receive 3 check-ins in the next 3 minutes.\nIf you don't reply "OK", we'll alert ${subscriber.providerName} 1 minute later (4 min total).\n\nJust reply *OK* to any check-in!\n\n💙 Testing in progress...`
          );
          return res.status(200).json({ ok: true });
        }
      }
      
      // Regular /start (no token or invalid token)
      const welcomeMsg = `👋 Hi ${firstName}!\n\nI'm the *CasRes Wellness Check-In Bot*.\n\nTo register for wellness check-ins:\n1. Visit https://casres.com\n2. Complete the enrollment form\n3. Click the Telegram activation link\n   _OR_ send /link to connect manually\n\nReply *OK* to confirm check-ins when you receive them.`;
      
      await sendTelegramMessage(chatId, welcomeMsg);
      return res.status(200).json({ ok: true });
    }

    // Handle /link command
    if (textUpper === '/LINK') {
      if (!telegramUsername) {
        await sendTelegramMessage(chatId,
          `⚠️ You need to set a Telegram username first.\n\nGo to Settings → Edit Profile → Username in Telegram.`
        );
        return res.status(200).json({ ok: true });
      }

      const subscribers = await getSubscribers();
      const subscriber = subscribers.find(s => 
        s.telegramUsername?.toLowerCase() === telegramUsername.toLowerCase()
      );

      if (subscriber) {
        // Link the account
        subscriber.telegramChatId = chatId.toString();
        await saveSubscribers(subscribers);

        await sendTelegramMessage(chatId,
          `✅ *Account Linked!*\n\nHi ${subscriber.firstName}!\n\nYour Telegram account (${telegramUsername}) is now connected.\n\nYou'll receive wellness check-ins at:\n• 8:00 AM\n• 2:00 PM\n• 8:00 PM (Pacific Time)\n\nJust reply *OK* to each check-in. If you don't respond within 4 hours, we'll notify ${subscriber.providerName}.\n\n💙 You're all set!`
        );
      } else {
        await sendTelegramMessage(chatId,
          `❌ No account found for ${telegramUsername}\n\nMake sure you:\n1. Signed up at https://casres.com\n2. Entered your Telegram username (${telegramUsername}) during enrollment\n\nIf you just signed up, try again in a minute.`
        );
      }
      return res.status(200).json({ ok: true });
    }

    // Handle OK response
    if (textUpper === 'OK' || textUpper === 'OK!' || text === '👍') {
      const subscribers = await getSubscribers();
      const subscriber = subscribers.find(s => s.telegramChatId === chatId.toString());

      if (subscriber) {
        // Update response tracking
        subscriber.lastResponseReceived = new Date().toISOString();
        subscriber.totalResponsesReceived = (subscriber.totalResponsesReceived || 0) + 1;
        await saveSubscribers(subscribers);

        await sendTelegramMessage(chatId,
          `✅ Thank you ${subscriber.firstName}! Your wellness check-in is confirmed. 💙\n\n_Next check-in: 8am, 2pm, or 8pm PT_`
        );
      } else {
        await sendTelegramMessage(chatId,
          `I don't have you registered yet.\n\nPlease sign up at https://casres.com and I'll link your account!`
        );
      }
      return res.status(200).json({ ok: true });
    }

    // Handle STOP/unsubscribe
    if (textUpper === 'STOP' || textUpper === 'UNSUBSCRIBE') {
      const subscribers = await getSubscribers();
      const subscriber = subscribers.find(s => s.telegramChatId === chatId.toString());

      if (subscriber) {
        subscriber.status = 'unsubscribed';
        subscriber.unsubscribedAt = new Date().toISOString();
        await saveSubscribers(subscribers);

        await sendTelegramMessage(chatId,
          `You have been unsubscribed from wellness check-ins.\n\nReply *START* to re-subscribe anytime.`
        );
      } else {
        await sendTelegramMessage(chatId, `You're not currently subscribed.`);
      }
      return res.status(200).json({ ok: true });
    }

    // Default response
    await sendTelegramMessage(chatId,
      `I didn't understand that.\n\n• Send /link to connect your account\n• Reply *OK* to confirm wellness check-ins\n• Reply *STOP* to unsubscribe\n• Send /start for help`
    );

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Telegram webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
