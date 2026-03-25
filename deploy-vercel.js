const fs = require('fs');
const https = require('https');

const token = fs.readFileSync('/tmp/API_Keys_Inventory.csv', 'utf8')
  .split('\n')
  .find(line => line.startsWith('Vercel,API Token,'))
  .split(',')[2]
  .trim();

const files = [
  { file: 'index.html', path: 'index.html' },
  { file: 'privacy.html', path: 'privacy.html' },
  { file: 'terms.html', path: 'terms.html' },
  { file: 'api/optin.js', path: 'api/optin.js' },
  { file: 'vercel.json', path: 'vercel.json' }
];

const fileContents = files.map(f => ({
  file: f.path,
  data: fs.readFileSync(f.file, 'utf8')
}));

const deploymentData = {
  name: 'casres',
  files: fileContents,
  projectSettings: {
    framework: null
  },
  target: 'production'
};

const data = JSON.stringify(deploymentData);

const options = {
  hostname: 'api.vercel.com',
  path: '/v13/deployments',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Response:', body);
  });
});

req.on('error', (e) => {
  console.error('Error:', e);
});

req.write(data);
req.end();
