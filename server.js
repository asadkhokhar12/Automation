import express from 'express';
import { json } from 'body-parser';
import { verifyWebhook, handleWebhook } from './thinkific';
import { config } from 'dotenv';

config();

const app = express();
app.use(json());

// Routes
app.post('/webhooks/thinkific', verifyWebhook, handleWebhook);

// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
