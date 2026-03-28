/**
 * CasRes - Express.js server for DigitalOcean App Platform
 * Combines all Vercel serverless functions into one Express app
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Import API handlers
import addSubscriber from './api/subscribers/add.js';
import listSubscribers from './api/subscribers/list.js';
import updateSubscriber from './api/subscribers/update.js';
import telegramWebhook from './api/telegram/webhook.js';
import sendCheckins from './api/telegram/send-checkins.js';
import sendTestCheckin from './api/telegram/send-test-checkin.js';
import alertProvider from './api/telegram/alert-provider.js';
import syncAirtable from './api/sync/airtable.js';

// Helper to wrap Vercel-style handlers for Express
function wrapHandler(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('Handler error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };
}

// API Routes - Subscribers
app.post('/api/subscribers/add', wrapHandler(addSubscriber));
app.get('/api/subscribers/list', wrapHandler(listSubscribers));
app.post('/api/subscribers/update', wrapHandler(updateSubscriber));

// API Routes - Telegram
app.post('/api/telegram/webhook', wrapHandler(telegramWebhook));
app.post('/api/telegram/send-checkins', wrapHandler(sendCheckins));
app.get('/api/telegram/send-test-checkin', wrapHandler(sendTestCheckin));
app.get('/api/telegram/alert-provider', wrapHandler(alertProvider));

// API Routes - Sync
app.post('/api/sync/airtable', wrapHandler(syncAirtable));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'casres', timestamp: new Date().toISOString() });
});

// Serve static HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/debug.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'debug.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦀 CasRes server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`GitHub storage: ${process.env.GITHUB_TOKEN ? '✅' : '❌'}`);
  console.log(`Telegram bot: ${process.env.CASRES_BOT_TOKEN ? '✅' : '❌'}`);
  console.log(`Airtable sync: ${process.env.AIRTABLE_TOKEN ? '✅' : '❌'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});
