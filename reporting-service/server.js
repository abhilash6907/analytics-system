const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

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

// Event Schema (same as processor)
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

// GET /stats - Get analytics for a site and date
app.get('/stats', async (req, res) => {
  try {
    const { site_id, date } = req.query;

    if (!site_id || !date) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Missing required parameters: site_id, date (YYYY-MM-DD)' 
      });
    }

    // Parse date range (whole day)
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);

    // Query events for the site and date
    const events = await Event.find({
      site_id,
      timestamp: {
        $gte: startDate,
        $lt: endDate
      }
    });

    // Calculate total views
    const total_views = events.length;

    // Calculate unique users
    const unique_users = new Set(events.map(e => e.user_id).filter(Boolean)).size;

    // Calculate top paths
    const pathCounts = {};
    events.forEach(event => {
      if (event.path) {
        pathCounts[event.path] = (pathCounts[event.path] || 0) + 1;
      }
    });

    const top_paths = Object.entries(pathCounts)
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10); // Top 10 paths

    res.json({
      site_id,
      date,
      total_views,
      unique_users,
      top_paths
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch stats' });
  }
});

// GET /stats/aggregated - Advanced aggregation using MongoDB pipeline
app.get('/stats/aggregated', async (req, res) => {
  try {
    const { site_id, date } = req.query;

    if (!site_id || !date) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Missing required parameters: site_id, date (YYYY-MM-DD)' 
      });
    }

    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);

    // Aggregation pipeline
    const stats = await Event.aggregate([
      {
        $match: {
          site_id,
          timestamp: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $facet: {
          total: [{ $count: 'views' }],
          unique_users: [
            { $group: { _id: '$user_id' } },
            { $count: 'count' }
          ],
          top_paths: [
            { $group: { _id: '$path', views: { $sum: 1 } } },
            { $sort: { views: -1 } },
            { $limit: 10 },
            { $project: { path: '$_id', views: 1, _id: 0 } }
          ]
        }
      }
    ]);

    const result = {
      site_id,
      date,
      total_views: stats[0]?.total[0]?.views || 0,
      unique_users: stats[0]?.unique_users[0]?.count || 0,
      top_paths: stats[0]?.top_paths || []
    };

    res.json(result);

  } catch (error) {
    console.error('Error fetching aggregated stats:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch stats' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'reporting-service' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Reporting Service running on port ${PORT}`);
});
