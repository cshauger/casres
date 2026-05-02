/**
 * CasRes Background Worker - Production Mode
 * Sends check-ins at scheduled times (8:00 AM, 2:00 PM, 8:00 PM PT)
 */

import { getSubscribers, saveSubscribers } from './lib/github-storage.js';

const TELEGRAM_TOKEN = process.env.CASRES_BOT_TOKEN;
const CHECK_INTERVAL = 30000; // Check every 30 seconds

// Check-in times (Pacific Time)
const CHECK_IN_TIMES = [
  { hour: 9, minute: 5 },
  { hour: 14, minute: 0 },
  { hour: 20, minute: 0 }
];

const lastSentTimes = new Map(); // Track when we last sent each check-in

async function sendTelegramMessage(chatId, text) {
  try {
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
  } catch (error) {
    console.error('Telegram send error:', error);
    return null;
  }
}

function getCurrentPacificTime() {
  const now = new Date();
  // Convert to Pacific Time
  const pacificTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  return pacificTime;
}

function shouldSendCheckIn(checkInTime) {
  const now = getCurrentPacificTime();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  // Check if we're at the scheduled time (within the check interval window)
  if (currentHour === checkInTime.hour && currentMinute === checkInTime.minute) {
    // Check if we already sent this check-in today
    const today = now.toDateString();
    const key = `${checkInTime.hour}-${checkInTime.minute}-${today}`;
    
    if (!lastSentTimes.has(key)) {
      lastSentTimes.set(key, Date.now());
      return true;
    }
  }
  
  return false;
}

async function sendCheckInToSubscriber(subscriber, checkInNumber) {
  if (!subscriber.telegramChatId) return;

  const message = `🌟 *Check-In #${checkInNumber}*\n\nHi ${subscriber.firstName}!\n\nPlease reply with any message to confirm you're doing well.\n\n💙 Just send a quick reply`;

  console.log(`Sending check-in #${checkInNumber} to ${subscriber.firstName} (${subscriber.id})`);
  
  await sendTelegramMessage(subscriber.telegramChatId, message);

  // Update subscriber record
  const subscribers = await getSubscribers();
  const sub = subscribers.find(s => s.id === subscriber.id);
  if (sub) {
    sub.lastCheckInSent = new Date().toISOString();
    sub.lastCheckInNumber = checkInNumber;
    sub.totalCheckInsSent = (sub.totalCheckInsSent || 0) + 1;
    
    // Reset daily response tracking at first check-in
    if (checkInNumber === 1) {
      sub.dailyResponseReceived = false;
    }
    
    // Increment floating counter for next time
    sub.currentCheckInLevel = checkInNumber + 1;
    
    await saveSubscribers(subscribers);
  }
}

async function sendAlertToProvider(subscriber) {
  const subscribers = await getSubscribers();
  
  const alertMessage = `⚠️ *WELLNESS ALERT*\n\n${subscriber.firstName} ${subscriber.lastName} has not responded to any wellness check-ins today.\n\n📱 Phone: ${subscriber.phone}\n⏰ Last check-in sent: ${subscriber.lastCheckInSent || 'Unknown'}\n❌ No response received\n\nPlease call ${subscriber.firstName} to verify their wellbeing.`;

  // Find provider by phone number
  const normalizePhone = (phone) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return '1' + digits;
    return digits;
  };
  
  const providerPhoneNormalized = normalizePhone(subscriber.providerPhone);
  const provider = subscribers.find(s => normalizePhone(s.phone) === providerPhoneNormalized);
  
  let providerChatId = provider && provider.telegramChatId ? provider.telegramChatId : '8259734518';
  
  console.log(`Sending alert for ${subscriber.firstName} to provider (${providerChatId})`);
  await sendTelegramMessage(providerChatId, alertMessage);

  // Update alert tracking
  const sub = subscribers.find(s => s.id === subscriber.id);
  if (sub) {
    sub.lastAlertSent = new Date().toISOString();
    sub.totalAlertsSent = (sub.totalAlertsSent || 0) + 1;
    await saveSubscribers(subscribers);
  }
}

async function runScheduledCheckIns() {
  try {
    const subscribers = await getSubscribers();
    
    // Check each scheduled time
    for (const checkInTime of CHECK_IN_TIMES) {
      if (shouldSendCheckIn(checkInTime)) {
        console.log(`Triggering check-in at ${checkInTime.hour}:${String(checkInTime.minute).padStart(2, '0')} PT`);
        
        // Send to all active subscribers (NOT providers) with Telegram connected
        for (const sub of subscribers) {
          if (sub.status === 'active' && sub.telegramChatId && sub.source !== 'auto_provider_creation') {
            // Use floating counter - only resets when user replies
            const nextCheckInNumber = sub.currentCheckInLevel || 1;
            await sendCheckInToSubscriber(sub, nextCheckInNumber);
          }
        }
      }
    }
    
    const now = getCurrentPacificTime();
    
    // Check for alerts: 30 minutes after 3rd check-in missed
    const refreshedSubs = await getSubscribers();
    let modified = false;
    
    for (const sub of refreshedSubs) {
      if (sub.status === 'active' && sub.telegramChatId && sub.source !== 'auto_provider_creation') {
        // If counter > 3 (3 check-ins missed) and we haven't alerted yet
        if (sub.currentCheckInLevel > 3 && !sub.alertTriggeredForCurrentCycle) {
          // Check if 30 minutes have passed since last check-in was sent
          if (sub.lastCheckInSent) {
            const lastCheckInTime = new Date(sub.lastCheckInSent);
            const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
            
            if (lastCheckInTime <= thirtyMinutesAgo) {
              console.log(`No response from ${sub.firstName} 30 min after 3rd check-in - sending alert`);
              await sendAlertToProvider(sub);
              sub.alertTriggeredForCurrentCycle = true;
              modified = true;
            }
          }
        }
      }
    }
    
    if (modified) {
       await saveSubscribers(refreshedSubs);
    }
    
  } catch (error) {
    console.error('Scheduler error:', error);
  }
}

// Main worker loop
async function start() {
  console.log('🦀 CasRes Production Worker started');
  console.log(`Check-in times (Pacific): ${CHECK_IN_TIMES.map(t => `${t.hour}:${String(t.minute).padStart(2, '0')}`).join(', ')}`);

  // Run check loop
  setInterval(async () => {
    await runScheduledCheckIns();
  }, CHECK_INTERVAL);
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

start();
