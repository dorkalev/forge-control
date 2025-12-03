import dotenv from 'dotenv';
import fetch from 'node-fetch';
import crypto from 'crypto';

dotenv.config();

// Mock Linear webhook payload for testing
const mockLinearWebhook = {
  "action": "update",
  "type": "Issue",
  "data": {
    "id": "b43a1e3f-5b7d-4c8e-9a0b-123456789abc",
    "identifier": "SDK-123",
    "title": "Fix authentication bug in OAuth flow",
    "description": "There's an issue with the OAuth flow where tokens aren't being stored properly",
    "assignee": {
      "id": "assignee-id-123",
      "name": "random-user",
      "displayName": "Forge Agent",
      "email": "forge@example.com"
    },
    "state": {
      "name": "In Progress",
      "type": "started"
    },
    "priority": 1,
    "createdAt": "2025-01-01T10:00:00.000Z",
    "updatedAt": "2025-01-01T12:00:00.000Z"
  },
  "updatedFrom": {
    "assignee": null
  },
  "organizationId": "org-123",
  "webhookTimestamp": Date.now()
};

function computeLinearSignature(bodyBuffer) {
  const s = process.env.WEBHOOK_SIGNING_SECRET || process.env.LINEAR_WEBHOOK_SECRET || process.env.LINEAR_WEBHOOK_SIGNING_SECRET || process.env.LINEAR_SIGNING_SECRET;
  if (!s) throw new Error('No Linear webhook signing secret found in env');
  const key = s.startsWith('lin_wh_') ? Buffer.from(s.slice(7), 'base64') : Buffer.from(s, 'utf8');
  return crypto.createHmac('sha256', key).update(bodyBuffer).digest('hex');
}

async function testWebhook() {
  console.log('🧪 Testing webhook with mock Linear payload...');

  try {
    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
    const bodyText = JSON.stringify(mockLinearWebhook);
    const bodyBuffer = Buffer.from(bodyText, 'utf8');
    const sig = computeLinearSignature(bodyBuffer);
    const response = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Linear-Webhook',
        'Linear-Event': 'Issue',
        'Linear-Delivery': 'test-delivery-123',
        'Linear-Signature': sig
      },
      body: bodyText
    });

    const result = await response.json();
    console.log('✅ Response:', result);

    if (response.ok) {
      console.log('✅ Webhook test successful!');
    } else {
      console.log('❌ Webhook test failed:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('❌ Error testing webhook:', error.message);
  }
}

// Test production webhook as well
async function testProductionWebhook() {
  console.log('🧪 Testing production webhook...');

  try {
    const baseUrl = process.env.RENDER_PUBLIC_URL || 'https://your-app.onrender.com';
    const bodyText = JSON.stringify(mockLinearWebhook);
    const bodyBuffer = Buffer.from(bodyText, 'utf8');
    const sig = computeLinearSignature(bodyBuffer);
    const response = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Linear-Webhook',
        'Linear-Event': 'Issue',
        'Linear-Delivery': 'test-delivery-prod-123',
        'Linear-Signature': sig
      },
      body: bodyText
    });

    const result = await response.json();
    console.log('✅ Production Response:', result);

    if (response.ok) {
      console.log('✅ Production webhook test successful!');
    } else {
      console.log('❌ Production webhook test failed:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('❌ Error testing production webhook:', error.message);
  }
}

// Run tests
console.log('Starting webhook tests...\n');

// Test local first (if running)
testWebhook().then(() => {
  console.log('\n' + '='.repeat(50) + '\n');
  // Then test production
  return testProductionWebhook();
}).catch(console.error);
