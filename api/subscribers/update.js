/**
 * Update subscriber status or details
 */

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple API key auth
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { id } = req.query;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Subscriber ID required' });
    }

    // Get existing subscriber
    const subscriber = await kv.get(`subscriber:${id}`);

    if (!subscriber) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    // Allowed updates (prevent modifying system fields)
    const allowedFields = [
      'firstName',
      'lastName',
      'providerName',
      'providerPhone',
      'status'
    ];

    const updatedSubscriber = { ...subscriber };

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updatedSubscriber[field] = updates[field];
      }
    }

    updatedSubscriber.updatedAt = new Date().toISOString();

    await kv.set(`subscriber:${id}`, updatedSubscriber);

    console.log(`Subscriber ${id} updated:`, updates);

    return res.status(200).json({
      success: true,
      subscriber: {
        id: updatedSubscriber.id,
        name: `${updatedSubscriber.firstName} ${updatedSubscriber.lastName}`,
        phone: updatedSubscriber.phone,
        providerName: updatedSubscriber.providerName,
        providerPhone: updatedSubscriber.providerPhone,
        status: updatedSubscriber.status,
        updatedAt: updatedSubscriber.updatedAt
      }
    });

  } catch (error) {
    console.error('Error updating subscriber:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
