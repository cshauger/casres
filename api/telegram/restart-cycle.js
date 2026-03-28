/**
 * Restart wellness check-in cycle for a subscriber
 * Used for testing - simulates next day's cycle
 */

export default async function handler(req, res) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== 'PUBLIC_OPTIN' && apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { subscriberId } = req.query;

    if (!subscriberId) {
      return res.status(400).json({ error: 'subscriberId required' });
    }

    // Schedule the full cycle starting NOW
    const baseUrl = 'https://casres.com';
    
    // Trigger all 4 tasks in background
    const tasks = [
      { delay: 0, url: `${baseUrl}/api/telegram/send-test-checkin?subscriberId=${subscriberId}&checkInNumber=1` },
      { delay: 60, url: `${baseUrl}/api/telegram/send-test-checkin?subscriberId=${subscriberId}&checkInNumber=2` },
      { delay: 120, url: `${baseUrl}/api/telegram/send-test-checkin?subscriberId=${subscriberId}&checkInNumber=3` },
      { delay: 180, url: `${baseUrl}/api/telegram/alert-provider?subscriberId=${subscriberId}` }
    ];

    // Return immediately with schedule info
    return res.status(200).json({
      success: true,
      message: 'Cycle restarted',
      subscriberId,
      schedule: [
        { task: 'Check-in #1', delaySeconds: 0, status: 'Call manually or via cron' },
        { task: 'Check-in #2', delaySeconds: 60 },
        { task: 'Check-in #3', delaySeconds: 120 },
        { task: 'Alert', delaySeconds: 180 }
      ],
      note: 'Use the same curl commands as before to trigger the 4 tasks'
    });

  } catch (error) {
    console.error('Restart error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
