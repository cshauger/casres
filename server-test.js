/**
 * Simple local test server for the opt-in form
 * Run: node server-test.js
 * Visit: http://localhost:3000
 */

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = 3000;

// Mock subscriber storage (in-memory for testing)
const subscribers = [];

const server = createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);

  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Serve HTML files
  if (req.method === 'GET') {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    
    try {
      const content = await readFile(join(__dirname, filePath));
      const ext = filePath.split('.').pop();
      const contentTypes = {
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript'
      };
      
      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
      res.end(content);
    } catch (err) {
      res.writeHead(404);
      res.end('Not Found');
    }
    return;
  }

  // Mock API endpoint: POST /api/subscribers/add
  if (req.method === 'POST' && req.url === '/api/subscribers/add') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        // Mock validation
        if (!data.firstName || !data.lastName || !data.phone || !data.providerPhone || !data.consent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Missing required fields',
            required: ['firstName', 'lastName', 'phone', 'providerPhone', 'consent']
          }));
          return;
        }

        // Check for duplicate
        const cleanPhone = data.phone.replace(/\D/g, '');
        const formattedPhone = cleanPhone.length === 10 ? `+1${cleanPhone}` : `+${cleanPhone}`;
        
        const duplicate = subscribers.find(s => s.phone === formattedPhone);
        if (duplicate) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Phone number already registered',
            existingSubscriber: {
              id: duplicate.id,
              name: `${duplicate.firstName} ${duplicate.lastName}`
            }
          }));
          return;
        }

        // Format provider phone
        const cleanProviderPhone = data.providerPhone.replace(/\D/g, '');
        const formattedProviderPhone = cleanProviderPhone.length === 10 ? `+1${cleanProviderPhone}` : `+${cleanProviderPhone}`;

        // Create subscriber
        const subscriber = {
          id: `sub_${Date.now()}`,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: formattedPhone,
          providerName: data.providerName,
          providerPhone: formattedProviderPhone,
          status: 'active',
          createdAt: new Date().toISOString()
        };

        subscribers.push(subscriber);

        console.log('\n✅ New Subscriber Added:');
        console.log(JSON.stringify(subscriber, null, 2));
        console.log(`\nTotal subscribers: ${subscribers.length}`);
        
        // Mock welcome SMS
        const welcomeMsg = `Hi ${subscriber.firstName}! Welcome to CasRes wellness check-ins. You'll receive 3 check-ins daily (8am, 2pm, 8pm). Simply reply "OK" to each one. Your caregiver (${subscriber.providerName}) will be notified if you don't respond. Reply STOP to unsubscribe anytime. 💙`;
        console.log('\n📱 Mock Welcome SMS:');
        console.log(`   To: ${formattedPhone}`);
        console.log(`   Message: ${welcomeMsg}\n`);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          welcomeMessageSent: true,
          subscriber: {
            id: subscriber.id,
            name: `${subscriber.firstName} ${subscriber.lastName}`,
            phone: formattedPhone,
            providerName: data.providerName,
            providerPhone: formattedProviderPhone,
            status: 'active'
          }
        }));

      } catch (err) {
        console.error('Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }

  // Default 404
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🦀 CasRes Test Server Running`);
  console.log(`\n📱 Open in browser: http://localhost:${PORT}`);
  console.log(`   Or externally: http://<your-ip>:${PORT}`);
  console.log(`\nThis is a local test server. API calls are mocked.`);
  console.log(`Subscribers are stored in memory (cleared on restart).\n`);
});
