// src/middleware/auth.js (güncellenmiş hali)
const jwt = require('jsonwebtoken');
const pool = require('../db');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { maxAge: '1h' });
    const customerResult = await pool.query('SELECT id FROM customers WHERE id = $1 AND api_key = $2', [decoded.customer_id, decoded.api_key]);
    if (customerResult.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token or customer' });
    }
    req.customer = { id: customerResult.rows[0].id };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Token verification failed', details: err.message });
  }
};

module.exports = authMiddleware;