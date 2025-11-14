const { Worker } = require('bullmq');
const Redis = require('ioredis');
const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✓ Connected to MongoDB Atlas');
}).catch(err => {
  console.error('✗ MongoDB connection error:', err);
  process.exit(1);
});

// Event Schema
const eventSchema = new mongoose.Schema({
  site_id: { type: String, required: true, index: true },
  event_type: { type: String, required: true },
  path: { type: String },
  user_id: { type: String, index: true },
  timestamp: { type: Date, required: true, index: true }
}, { 
  timestamps: true 
});

const Event = mongoose.model('Event', eventSchema);

// Redis connection for BullMQ
const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null
});

// BullMQ Worker - Process events from queue
const worker = new Worker('analytics-events', async (job) => {
  try {
    const { site_id, event_type, path, user_id, timestamp } = job.data;

    // Save to MongoDB
    const event = new Event({
      site_id,
      event_type,
      path,
      user_id,
      timestamp: new Date(timestamp)
    });

    await event.save();
    console.log(`✓ Event saved: ${event_type} for site ${site_id}`);

    return { success: true };
  } catch (error) {
    console.error('✗ Error processing event:', error);
    throw error; // BullMQ will retry
  }
}, { 
  connection,
  concurrency: 10 // Process up to 10 jobs concurrently
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

console.log('Processor Worker started - waiting for events...');
