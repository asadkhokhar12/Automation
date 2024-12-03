import { createHmac } from 'crypto';
import { post } from 'axios';
import { updateOrttoUser, updateOrttoEnrollment } from './ortto';

// Environment Variables
const THINKIFIC_API_KEY = process.env.THINKIFIC_API_KEY;
const THINKIFIC_SUBDOMAIN = process.env.THINKIFIC_SUBDOMAIN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Function to create Thinkific Webhooks
const createWebhook = async (topic) => {
  try {
    const response = await post(
      `https://${THINKIFIC_SUBDOMAIN}.thinkific.com/api/v2/webhooks`,
      {
        topic,
        target_url: WEBHOOK_URL,
        secret: WEBHOOK_SECRET,
      },
      {
        headers: {
          Authorization: `Bearer ${THINKIFIC_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`${topic} Webhook Created:`, response.data);
  } catch (error) {
    console.error(`Error creating ${topic} webhook:`, error.response?.data || error.message);
  }
};

// Create Webhooks for 'users.create' and 'enrollments.create'
createWebhook('users.create');
createWebhook('enrollments.create');

// Middleware to Verify Webhook Signature
const verifyWebhook = (req, res, next) => {
  const signature = req.headers['x-thinkific-signature'];
  const payload = JSON.stringify(req.body);

  const computedHash = createHmac('sha256', WEBHOOK_SECRET)
    .update(payload, 'utf8')
    .digest('hex');

  if (computedHash !== signature) {
    console.error('Invalid webhook signature');
    return res.status(400).send('Invalid signature');
  }
  next();
};

// Handle Incoming Webhooks
const handleWebhook = async (req, res) => {
  const { topic, data } = req.body;

  try {
    if (topic === 'users.create') {
      await updateOrttoUser(data);
    } else if (topic === 'enrollments.create') {
      await updateOrttoEnrollment(data);
    }
    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Error processing webhook:', error.message);
    res.status(500).send('Internal Server Error');
  }
};

export default { verifyWebhook, handleWebhook };
