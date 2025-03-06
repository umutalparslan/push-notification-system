// index.js
const express = require('express');
const path = require('path');
const cors = require('cors'); // CORS’u ekledik
const customerRoutes = require('./src/routes/customer');
const campaignRoutes = require('./src/routes/campaign');
const authMiddleware = require('./src/middleware/auth');
const subscriptionRoutes = require('./src/routes/subscription');
require('dotenv').config();
require('./src/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS ayarları
app.use(cors({
  origin: 'http://localhost:3001', // Frontend’in çalıştığı origin
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // İzin verilen HTTP metodları
  allowedHeaders: ['Content-Type', 'Authorization'], // İzin verilen başlıklar
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend/public')));

app.use('/api/customers', (req, res, next) => {
  if (req.path === '/' || req.path === '/login' || req.path === '/register') return next();
  authMiddleware(req, res, next);
}, customerRoutes);

app.use('/api/campaigns', authMiddleware, campaignRoutes);

app.use('/api/external/subscription', subscriptionRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});