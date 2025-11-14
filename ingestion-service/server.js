const express = require('express');
const { Queue } = require('bullmq');
const Redis = require('ioredis');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Redis connection
const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null
});

// BullMQ Queue
const eventQueue = new Queue('analytics-events', { connection });

// POST /event - Accept events and push to queue
app.post('/event', async (req, res) => {
  try {
    const { site_id, event_type, path, user_id, timestamp } = req.body;

    // Validation
    if (!site_id || !event_type || !timestamp) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Missing required fields: site_id, event_type, timestamp' 
      });
    }

    // Push to Redis queue
    await eventQueue.add('process-event', {
      site_id,
      event_type,
      path,
      user_id,
      timestamp
    });

    // Return immediately
    res.json({ status: 'accepted' });
  } catch (error) {
    console.error('Error enqueueing event:', error);
    res.status(500).json({ status: 'error', message: 'Failed to accept event' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ingestion-service' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Ingestion Service running on port ${PORT}`);
});
