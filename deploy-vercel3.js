const fs = require('fs');
const https = require('https');

const token = fs.readFileSync('/tmp/API_Keys_Inventory.csv', 'utf8')
  .split('\n')
  .find(line => line.startsWith('Vercel,API Token,'))
  .split(',')[2]
  .trim();

const files = [
  'index.html',
  'privacy.html',
  'terms.html',
  'api/optin.js',
  'vercel.json'
];

const fileData = files.map(path => ({
  file: path,
  data: fs.readFileSync(path, 'utf8').toString('base64'),
  encoding: 'base64'
}));

const deploymentData = {
  name: 'casres',
  files: fileData
  // Removed target: 'production'
};

const data = JSON.stringify(deploymentData);

const options = {
  hostname: 'api.vercel.com',
  path: '/v13/deployments',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    try {
      const response = JSON.parse(body);
      if (response.url) {
        console.log('✅ Deployed successfully!');
        console.log('URL: https://' + response.url);
        console.log('Deployment ID:', response.id);
      } else {
        console.log('Response:', body);
      }
    } catch (e) {
      console.log('Raw response:', body);
    }
  });
});

req.on('error', (e) => {
  console.error('Error:', e);
});

req.write(data);
req.end();
