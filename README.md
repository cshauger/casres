# CasRes - Elderly Wellness Check-In Service

Automated SMS wellness check-ins for elderly subscribers with provider alerts.

## Features

- **3x Daily Check-Ins**: Scheduled SMS messages sent at 8am, 2pm, and 8pm
- **Response Tracking**: Records and acknowledges subscriber responses
- **Provider Alerts**: Automatic SMS alerts to caregivers if no response after 4 hours
- **Subscriber Management**: REST API for adding, listing, and updating subscribers
- **TCPA Compliant**: Built-in consent tracking and STOP/START handling

## Architecture

- **Platform**: Vercel Serverless Functions
- **Database**: Vercel KV (Redis)
- **SMS**: Twilio
- **Scheduling**: Vercel Cron Jobs

## API Endpoints

### Check-Ins (Automated)
- `POST /api/checkin/send` - Send check-ins (cron: 8am, 2pm, 8pm)
- `POST /api/checkin/alert` - Check for non-responses (cron: every 30 min)
- `POST /api/checkin/webhook` - Twilio webhook for incoming SMS

### Subscriber Management
- `POST /api/subscribers/add` - Add new subscriber
- `GET /api/subscribers/list` - List all subscribers
- `PATCH /api/subscribers/update?id={id}` - Update subscriber

## Setup

### 1. Deploy to Vercel

```bash
vercel
```

### 2. Enable Vercel KV

```bash
vercel env add KV_URL
vercel env add KV_REST_API_URL
vercel env add KV_REST_API_TOKEN
vercel env add KV_REST_API_READ_ONLY_TOKEN
```

Or via Vercel dashboard: Storage → Create KV Database

### 3. Configure Environment Variables

In Vercel dashboard or via CLI:

```bash
vercel env add TWILIO_ACCOUNT_SID
vercel env add TWILIO_AUTH_TOKEN
vercel env add TWILIO_PHONE_NUMBER
vercel env add CRON_SECRET
vercel env add ADMIN_API_KEY
vercel env add ALERT_THRESHOLD_HOURS
```

### 4. Configure Twilio Webhook

In Twilio console, set webhook URL for your number:

```
https://your-domain.vercel.app/api/checkin/webhook
```

Method: POST

## Usage

### Add a Subscriber

```bash
curl -X POST https://your-domain.vercel.app/api/subscribers/add \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  -d '{
    "firstName": "Mary",
    "lastName": "Smith",
    "phone": "5551234567",
    "providerName": "Dr. Johnson",
    "providerPhone": "5559876543",
    "consent": true
  }'
```

### List Subscribers

```bash
curl https://your-domain.vercel.app/api/subscribers/list \
  -H "x-api-key: YOUR_ADMIN_API_KEY"
```

### Update Subscriber Status

```bash
curl -X PATCH "https://your-domain.vercel.app/api/subscribers/update?id=SUBSCRIBER_ID" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  -d '{"status": "inactive"}'
```

## Cron Schedule

Defined in `vercel.json`:

- **Check-ins**: 8am, 2pm, 8pm daily (Pacific Time adjustable)
- **Alerts**: Every 30 minutes

## Data Structure

### Subscriber
```json
{
  "id": "uuid",
  "firstName": "Mary",
  "lastName": "Smith",
  "phone": "+15551234567",
  "providerName": "Dr. Johnson",
  "providerPhone": "+15559876543",
  "status": "active",
  "createdAt": "2026-03-27T00:00:00.000Z",
  "totalCheckInsSent": 15,
  "totalResponsesReceived": 14
}
```

### Check-In
```json
{
  "id": "checkin_1234567890",
  "subscriberId": "uuid",
  "sentAt": "2026-03-27T08:00:00.000Z",
  "status": "responded",
  "respondedAt": "2026-03-27T08:15:00.000Z",
  "alertSentAt": null
}
```

## Security

- All cron endpoints protected with `CRON_SECRET`
- Admin API protected with `ADMIN_API_KEY`
- Twilio webhook validates request signatures
- TCPA compliance with consent tracking

## Next Steps

- [ ] Add web dashboard for provider monitoring
- [ ] SMS delivery reports and retry logic
- [ ] Multi-language support
- [ ] Customizable check-in messages
- [ ] Analytics and reporting

## License

MIT
