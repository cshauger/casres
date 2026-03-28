/**
 * Sync subscribers from GitHub to Airtable for easy viewing
 * GitHub remains the source of truth - this is read-only sync
 */

import { getSubscribers } from '../../lib/github-storage.js';

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'appak85D5c5BP1HYX';
const TABLE_ID = 'tblCz6wGQEqJ21xSN';

export default async function handler(req, res) {
  // Simple API key auth
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.ADMIN_API_KEY && apiKey !== 'PUBLIC_OPTIN') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get subscribers from GitHub
    const subscribers = await getSubscribers();

    if (subscribers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No subscribers to sync',
        synced: 0
      });
    }

    // Get existing records from Airtable
    const existingResponse = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`
        }
      }
    );

    const existingData = await existingResponse.json();
    const existingRecords = existingData.records || [];
    
    // Create a map of existing records by phone number
    const existingMap = new Map();
    existingRecords.forEach(record => {
      if (record.fields.Mobile) {
        existingMap.set(record.fields.Mobile, record.id);
      }
    });

    const results = {
      created: [],
      updated: [],
      skipped: [],
      errors: []
    };

    // Sync each subscriber
    for (const sub of subscribers) {
      try {
        const airtableFields = {
          'Subscriber': `${sub.firstName} ${sub.lastName}`,
          'First Name': sub.firstName,
          'Last Name': sub.lastName,
          'Mobile': sub.phone,
          'Submitted': sub.createdAt,
          'Notes': `Provider: ${sub.providerName} (${sub.providerPhone})\nStatus: ${sub.status}\nTelegram: ${sub.telegramUsername || 'Not provided'} ${sub.telegramChatId ? '(Connected)' : '(Not started)'}\nConsent: ${sub.consentTimestamp}\nCheck-ins sent: ${sub.totalCheckInsSent || 0}\nResponses: ${sub.totalResponsesReceived || 0}`
        };

        const existingRecordId = existingMap.get(sub.phone);

        if (existingRecordId) {
          // Update existing record
          const updateResponse = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${existingRecordId}`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ fields: airtableFields })
            }
          );

          if (updateResponse.ok) {
            results.updated.push(sub.phone);
          } else {
            const error = await updateResponse.text();
            results.errors.push({ phone: sub.phone, error });
          }
        } else {
          // Create new record
          const createResponse = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ fields: airtableFields })
            }
          );

          if (createResponse.ok) {
            results.created.push(sub.phone);
          } else {
            const error = await createResponse.text();
            results.errors.push({ phone: sub.phone, error });
          }
        }

        // Rate limit: Airtable allows 5 requests/second
        await new Promise(resolve => setTimeout(resolve, 220));

      } catch (error) {
        console.error(`Error syncing ${sub.phone}:`, error);
        results.errors.push({ phone: sub.phone, error: error.message });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Sync completed',
      total: subscribers.length,
      created: results.created.length,
      updated: results.updated.length,
      errors: results.errors.length,
      details: results
    });

  } catch (error) {
    console.error('Sync error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
