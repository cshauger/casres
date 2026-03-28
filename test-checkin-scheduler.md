# Test Check-In Scheduler

Since Vercel serverless can't do setTimeout, we'll use OpenClaw cron to schedule test check-ins.

## After Registration

When a user registers with Telegram, create 3 cron jobs:

```javascript
// Example: User just registered with subscriberId = sub_123456789

// Check-in #1 (1 minute later)
POST https://casres.com/api/telegram/send-test-checkin?subscriberId=sub_123456789&checkInNumber=1

// Check-in #2 (2 minutes later)
POST https://casres.com/api/telegram/send-test-checkin?subscriberId=sub_123456789&checkInNumber=2

// Check-in #3 (3 minutes later)
POST https://casres.com/api/telegram/send-test-checkin?subscriberId=sub_123456789&checkInNumber=3
```

## Manual Testing

To test immediately:
```bash
curl "https://casres.com/api/telegram/send-test-checkin?subscriberId=YOUR_SUB_ID&checkInNumber=1" \
  -H "x-api-key: PUBLIC_OPTIN"
```
