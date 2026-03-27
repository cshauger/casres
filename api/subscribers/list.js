/**
 * List all subscribers with optional status filter
 */

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Simple API key auth
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { status } = req.query;

    // Get all subscribers
    const subscriberKeys = await kv.keys('subscriber:*');
    let subscribers = await Promise.all(
      subscriberKeys.map(key => kv.get(key))
    );

    // Filter out null values
    subscribers = subscribers.filter(s => s !== null);

    // Apply status filter if provided
    if (status) {
      subscribers = subscribers.filter(s => s.status === status);
    }

    // Sort by creation date (newest first)
    subscribers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Return sanitized data
    const sanitizedSubscribers = subscribers.map(s => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      phone: s.phone,
      providerName: s.providerName,
      providerPhone: s.providerPhone,
      status: s.status,
      createdAt: s.createdAt,
      lastCheckInSent: s.lastCheckInSent,
      lastResponseReceived: s.lastResponseReceived,
      totalCheckInsSent: s.totalCheckInsSent || 0,
      totalResponsesReceived: s.totalResponsesReceived || 0,
      responseRate: s.totalCheckInsSent > 0
        ? ((s.totalResponsesReceived / s.totalCheckInsSent) * 100).toFixed(1) + '%'
        : 'N/A'
    }));

    return res.status(200).json({
      success: true,
      count: sanitizedSubscribers.length,
      subscribers: sanitizedSubscribers
    });

  } catch (error) {
    console.error('Error listing subscribers:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
