/**
 * CasRes Background Worker
 * Automatically schedules and sends test check-ins for new activations
 */

import { getSubscribers, saveSubscribers } from './lib/github-storage.js';

const TELEGRAM_TOKEN = process.env.CASRES_BOT_TOKEN;
const CHECK_INTERVAL = 10000; // Check every 10 seconds
const scheduledTasks = new Map(); // Track scheduled tasks per subscriber

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

async function sendCheckIn(subscriber, checkInNumber) {
  if (!subscriber.telegramChatId) return;

  const message = `🌟 *Test Check-In #${checkInNumber}*\n\nHi ${subscriber.firstName}!\n\nThis is test check-in #${checkInNumber}.\n\nPlease reply *OK* to confirm you're doing well.\n\n💙 Reply OK to confirm`;

  console.log(`Sending check-in #${checkInNumber} to ${subscriber.firstName} (${subscriber.id})`);
  
  await sendTelegramMessage(subscriber.telegramChatId, message);

  // Update subscriber record
  const subscribers = await getSubscribers();
  const sub = subscribers.find(s => s.id === subscriber.id);
  if (sub) {
    sub.lastCheckInSent = new Date().toISOString();
    sub.totalCheckInsSent = (sub.totalCheckInsSent || 0) + 1;
    await saveSubscribers(subscribers);
  }
}

async function sendAlert(subscriber) {
  // Check if they responded
  const subscribers = await getSubscribers();
  const sub = subscribers.find(s => s.id === subscriber.id);
  
  if (!sub) return;

  const lastCheckIn = sub.lastCheckInSent ? new Date(sub.lastCheckInSent) : null;
  const lastResponse = sub.lastResponseReceived ? new Date(sub.lastResponseReceived) : null;

  if (lastResponse && lastCheckIn && lastResponse > lastCheckIn) {
    console.log(`Skipping alert for ${sub.firstName} - they responded`);
    return;
  }

  console.log(`Sending alert for ${sub.firstName} (${sub.id}) - no response`);

  const alertMessage = `⚠️ *WELLNESS ALERT*\n\n${sub.firstName} ${sub.lastName} has not responded to 3 wellness check-ins.\n\n📱 Phone: ${sub.phone}\n⏰ Last check-in sent: ${lastCheckIn ? lastCheckIn.toLocaleString() : 'Unknown'}\n❌ No response received\n\nPlease call ${sub.firstName} to verify their wellbeing.\n\n_This is a test alert from CasRes wellness check-in service._`;

  // Find provider by phone number and send to their Telegram if connected
  let providerChatId = null;
  
  // Normalize phone numbers (remove all non-digits, handle US country code)
  const normalizePhone = (phone) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    // If 10 digits, assume US and add 1
    if (digits.length === 10) return '1' + digits;
    return digits;
  };
  
  const providerPhoneNormalized = normalizePhone(sub.providerPhone);
  
  const provider = subscribers.find(s => normalizePhone(s.phone) === providerPhoneNormalized);
  
  if (provider && provider.telegramChatId) {
    providerChatId = provider.telegramChatId;
    console.log(`Sending alert to provider ${provider.firstName} via Telegram (${providerChatId})`);
  } else {
    // Fallback to hardcoded for testing
    providerChatId = '8259734518';
    console.log(`Provider not found in Telegram (searched for ${sub.providerPhone} -> ${providerPhoneNormalized}), sending to default (${providerChatId})`);
  }

  await sendTelegramMessage(providerChatId, alertMessage);

  // Update alert tracking
  sub.lastAlertSent = new Date().toISOString();
  sub.totalAlertsSent = (sub.totalAlertsSent || 0) + 1;
  await saveSubscribers(subscribers);
}

function scheduleCheckIns(subscriber) {
  // Don't reschedule if already scheduled
  if (scheduledTasks.has(subscriber.id)) {
    return;
  }

  console.log(`Scheduling test check-ins for ${subscriber.firstName} (${subscriber.id})`);

  const tasks = {
    checkin1: setTimeout(() => sendCheckIn(subscriber, 1), 60000),      // 1 min
    checkin2: setTimeout(() => sendCheckIn(subscriber, 2), 120000),     // 2 min
    checkin3: setTimeout(() => sendCheckIn(subscriber, 3), 180000),     // 3 min
    alert: setTimeout(() => sendAlert(subscriber), 240000)              // 4 min
  };

  scheduledTasks.set(subscriber.id, tasks);

  // Clean up after all tasks complete
  setTimeout(() => {
    scheduledTasks.delete(subscriber.id);
    console.log(`Completed task cycle for ${subscriber.id}`);
  }, 250000); // Clean up after 4+ minutes
}

async function monitorNewActivations() {
  try {
    const subscribers = await getSubscribers();

    for (const sub of subscribers) {
      // Check if they just activated (has Telegram chat ID but no check-ins sent yet)
      if (sub.telegramChatId && sub.totalCheckInsSent === 0 && !scheduledTasks.has(sub.id)) {
        console.log(`New activation detected: ${sub.firstName} (${sub.id})`);
        scheduleCheckIns(sub);
      }
      
      // Check if they need a cycle restart (responded to a check-in)
      if (sub.needsCycleRestart && scheduledTasks.has(sub.id)) {
        console.log(`Cycle restart requested for ${sub.firstName} (${sub.id})`);
        
        // Cancel existing scheduled tasks
        const tasks = scheduledTasks.get(sub.id);
        if (tasks) {
          Object.values(tasks).forEach(timer => clearTimeout(timer));
          scheduledTasks.delete(sub.id);
          console.log(`Cancelled pending tasks for ${sub.id}`);
        }
        
        // Clear the restart flag
        sub.needsCycleRestart = false;
        await saveSubscribers(subscribers);
        
        // Schedule restart in 1 minute
        setTimeout(() => {
          console.log(`Restarting cycle for ${sub.firstName} (${sub.id})`);
          scheduleCheckIns(sub);
        }, 60000);
      }
    }
  } catch (error) {
    console.error('Monitor error:', error);
  }
}

// Main worker loop
async function start() {
  console.log('🦀 CasRes Background Worker started');
  console.log(`Checking for new activations every ${CHECK_INTERVAL / 1000} seconds`);

  // Initial check
  await monitorNewActivations();

  // Run check loop
  setInterval(async () => {
    await monitorNewActivations();
  }, CHECK_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, cleaning up...');
  scheduledTasks.forEach((tasks, id) => {
    Object.values(tasks).forEach(timer => clearTimeout(timer));
  });
  process.exit(0);
});

start();
