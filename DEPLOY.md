# Deployment Instructions

## Option 1: Manual Git Push (if you have credentials set up)

```bash
cd /home/openclaw/.openclaw/workspace/casres
git push origin main
```

## Option 2: Deploy via Vercel CLI

The code is ready to deploy! Once you have Twilio set up:

### 1. Install Vercel CLI (if needed)
```bash
npm i -g vercel
```

### 2. Deploy
```bash
cd /home/openclaw/.openclaw/workspace/casres
vercel --prod
```

### 3. Set up Vercel KV Storage
In Vercel dashboard:
- Go to Storage tab
- Create new KV Database
- Link to casres project

### 4. Add Environment Variables
In Vercel dashboard → Settings → Environment Variables:

```
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890
CRON_SECRET=<generate random string>
ADMIN_API_KEY=<generate random string>
ALERT_THRESHOLD_HOURS=4
NODE_ENV=production
```

### 5. Configure Twilio Webhook
In Twilio console for your phone number:
- Webhook URL: `https://casres-cshaugers-projects.vercel.app/api/checkin/webhook`
- Method: POST

## Testing

### Add a test subscriber
```bash
curl -X POST https://casres-cshaugers-projects.vercel.app/api/subscribers/add \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "phone": "YOUR_PHONE",
    "providerName": "Provider",
    "providerPhone": "PROVIDER_PHONE",
    "consent": true
  }'
```

### Trigger manual check-in (for testing)
```bash
curl -X POST https://casres-cshaugers-projects.vercel.app/api/checkin/send \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Files Changed
- ✅ API endpoints created (checkin/send, webhook, alert)
- ✅ Subscriber management (add, list, update)
- ✅ Vercel cron jobs configured
- ✅ Package.json with dependencies
- ✅ README with full documentation
