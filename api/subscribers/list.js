/**
 * List all subscribers from GitHub storage
 */

import { getSubscribers } from '../../lib/github-storage.js';

export default async function handler(req, res) {
  // Simple API key auth (same as add endpoint for now)
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== 'PUBLIC_OPTIN' && apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { status } = req.query;

    // Get all subscribers
    let subscribers = await getSubscribers();

    // Apply status filter if provided
    if (status) {
      subscribers = subscribers.filter(s => s.status === status);
    }

    // Sort by creation date (newest first)
    subscribers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Return sanitized data
    const sanitizedSubscribers = subscribers.map(s => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      phone: s.phone,
      providerName: s.providerName,
      providerPhone: s.providerPhone,
      status: s.status,
      createdAt: s.createdAt,
      lastCheckInSent: s.lastCheckInSent,
      lastResponseReceived: s.lastResponseReceived,
      totalCheckInsSent: s.totalCheckInsSent || 0,
      totalResponsesReceived: s.totalResponsesReceived || 0
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
