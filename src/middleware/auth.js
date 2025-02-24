// src/middleware/auth.js (güncellenmiş hali, log’ları detaylandır)
const jwt = require('jsonwebtoken');
const pool = require('../db');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  console.log('Auth token received:', token); // Token’ı log’la
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded); // Decoded payload’ı log’la
    const customerResult = await pool.query('SELECT id FROM customers WHERE id = $1 AND api_key = $2', [decoded.customer_id, decoded.api_key]);
    if (customerResult.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token or customer not found' });
    }
    req.customer = { id: customerResult.rows[0].id };
    console.log('Customer ID set:', req.customer.id);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Token verification failed', details: err.message });
  }
};

module.exports = authMiddleware;