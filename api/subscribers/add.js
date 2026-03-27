/**
 * Add subscriber - JSON file storage using GitHub
 */

import { getSubscribers, saveSubscribers } from '../../lib/github-storage.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple API key auth
  const apiKey = req.headers['x-api-key'];
  const isPublicOptin = apiKey === 'PUBLIC_OPTIN';
  const isAdminAccess = apiKey === process.env.ADMIN_API_KEY;
  
  if (!isPublicOptin && !isAdminAccess) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const {
      firstName,
      lastName,
      phone,
      providerName,
      providerPhone,
      consent
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !phone || !providerPhone || !consent) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['firstName', 'lastName', 'phone', 'providerPhone', 'consent']
      });
    }

    // Format phone numbers
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanProviderPhone = providerPhone.replace(/\D/g, '');

    if (cleanPhone.length !== 10 && cleanPhone.length !== 11) {
      return res.status(400).json({ error: 'Invalid subscriber phone number' });
    }

    if (cleanProviderPhone.length !== 10 && cleanProviderPhone.length !== 11) {
      return res.status(400).json({ error: 'Invalid provider phone number' });
    }

    const formattedPhone = cleanPhone.length === 10 ? `+1${cleanPhone}` : `+${cleanPhone}`;
    const formattedProviderPhone = cleanProviderPhone.length === 10 ? `+1${cleanProviderPhone}` : `+${cleanProviderPhone}`;

    // Get existing subscribers
    const subscribers = await getSubscribers();

    // Check for duplicate
    const duplicate = subscribers.find(s => s.phone === formattedPhone);
    if (duplicate) {
      return res.status(400).json({
        error: 'Phone number already registered',
        existingSubscriber: {
          name: `${duplicate.firstName} ${duplicate.lastName}`,
          status: duplicate.status
        }
      });
    }

    // Create subscriber
    const subscriberId = `sub_${Date.now()}`;
    const subscriber = {
      id: subscriberId,
      firstName,
      lastName,
      phone: formattedPhone,
      providerName: providerName || 'Provider',
      providerPhone: formattedProviderPhone,
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

    // Add to array and save
    subscribers.push(subscriber);
    await saveSubscribers(subscribers);

    console.log(`New subscriber added: ${subscriberId} (${formattedPhone})`);
    console.log(`Total subscribers: ${subscribers.length}`);

    return res.status(201).json({
      success: true,
      welcomeMessageSent: false,
      note: 'Subscriber saved. Configure Twilio to enable welcome SMS.',
      subscriber: {
        id: subscriber.id,
        name: `${firstName} ${lastName}`,
        phone: formattedPhone,
        providerName,
        providerPhone: formattedProviderPhone,
        status: 'active'
      }
    });

  } catch (error) {
    console.error('Error adding subscriber:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
