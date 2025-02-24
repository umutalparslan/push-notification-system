// src/routes/customer.js (tam güncel hali)
const express = require('express');
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../logger');
const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  const { email, password, phone, address, first_name, last_name, company_name } = req.body;

  if (!email || !password) {
    logger.warn('Register attempt without email or password');
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO customers (email, password, phone, address, first_name, last_name, company_name) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email, api_key, first_name, last_name, company_name, created_at',
      [email, hashedPassword, phone, address, first_name, last_name, company_name]
    );
    logger.info(`New customer registered: ${result.rows[0].id}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Error in customer registration', { error: err.stack });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    logger.warn('Login attempt without email or password');
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const customer = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
    if (customer.rows.length === 0) {
      logger.warn(`Invalid login attempt for email: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, customer.rows[0].password);
    if (!validPassword) {
      logger.warn(`Invalid password for email: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { customer_id: customer.rows[0].id, api_key: customer.rows[0].api_key },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    logger.info(`Token generated for customer ${customer.rows[0].id}`);
    res.json({ token, customer: { id: customer.rows[0].id, email, api_key: customer.rows[0].api_key } });
  } catch (err) {
    logger.error('Error in /login endpoint', { error: err.stack });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Profil Güncelleme
router.put('/profile', async (req, res) => {
  const { phone, address, first_name, last_name, company_name } = req.body;
  const customerId = req.customer.id; // authMiddleware’den geliyor

  try {
    const result = await pool.query(
      'UPDATE customers SET phone = $1, address = $2, first_name = $3, last_name = $4, company_name = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING *',
      [phone, address, first_name, last_name, company_name, customerId]
    );
    if (result.rows.length === 0) {
      logger.warn(`Profile update failed for customer ${customerId}`);
      return res.status(404).json({ error: 'Customer not found' });
    }
    logger.info(`Profile updated for customer ${customerId}`);
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Error in profile update', { error: err.stack });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Uygulama Ekleme
router.post('/applications', async (req, res) => {
  const { customer_id, name, platform, credentials } = req.body;

  if (!customer_id || !name || !platform || !credentials) {
    logger.warn('Application creation attempt with missing fields');
    return res.status(400).json({ error: 'customer_id, name, platform, and credentials are required' });
  }

  const validPlatforms = ['ios', 'android', 'web'];
  if (!validPlatforms.includes(platform)) {
    logger.warn(`Invalid platform: ${platform}`);
    return res.status(400).json({ error: 'Invalid platform' });
  }

  if (!credentials.type || (platform === 'android' && credentials.type !== 'fcm') ||
      (platform === 'ios' && !['p8', 'p12'].includes(credentials.type)) ||
      (platform === 'web' && !['vapid', 'p12'].includes(credentials.type))) {
    logger.warn('Invalid credentials format');
    return res.status(400).json({ error: 'Invalid credentials format' });
  }

  try {
    const customerId = req.customer.id; // authMiddleware’den geliyor
    const result = await pool.query('SELECT * FROM applications WHERE customer_id = $1', [customerId]);
    logger.info(`Applications listed for customer ${customerId}`);
    res.json(result.rows); // PostgreSQL’den gelen rows bir dizi olmalı
  } catch (err) {
    logger.error('Error fetching applications', { error: err.stack });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Uygulamaları Listeleme (Yeni Endpoint)
router.get('/applications', async (req, res) => {
  try {
    const customerId = req.customer.id; // authMiddleware’den geliyor
    const result = await pool.query('SELECT * FROM applications WHERE customer_id = $1', [customerId]);
    logger.info(`Applications listed for customer ${customerId}`);
    res.json(result.rows); // Müşteriye ait uygulamaları dizi olarak döndürür
  } catch (err) {
    logger.error('Error fetching applications', { error: err.stack });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Mevcut diğer endpoint’ler (users, tokens) buraya gelir...
router.post('/users', async (req, res) => {
  const { customer_id, attributes } = req.body;

  if (!customer_id) {
    logger.warn('User creation attempt without customer_id');
    return res.status(400).json({ error: 'customer_id is required' });
  }

  const userAttributes = attributes || {};

  try {
    const customerCheck = await pool.query('SELECT id FROM customers WHERE id = $1', [customer_id]);
    if (customerCheck.rows.length === 0) {
      logger.warn(`Customer not found: ${customer_id}`);
      return res.status(404).json({ error: 'Customer not found' });
    }

    const result = await pool.query(
      'INSERT INTO users (customer_id, attributes) VALUES ($1, $2) RETURNING *',
      [customer_id, userAttributes]
    );
    logger.info(`New user created: ${result.rows[0].id}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Error in user creation', { error: err.stack });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

router.post('/tokens', async (req, res) => {
  const { user_id, application_id, device_token, platform } = req.body;

  if (!user_id || !application_id || !device_token || !platform) {
    logger.warn('Token creation attempt with missing fields');
    return res.status(400).json({ error: 'user_id, application_id, device_token, and platform are required' });
  }

  const validPlatforms = ['ios', 'android', 'web'];
  if (!validPlatforms.includes(platform)) {
    logger.warn(`Invalid platform: ${platform}`);
    return res.status(400).json({ error: 'Invalid platform' });
  }

  try {
    const userCheck = await pool.query('SELECT customer_id FROM users WHERE id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      logger.warn(`User not found: ${user_id}`);
      return res.status(404).json({ error: 'User not found' });
    }

    const appCheck = await pool.query('SELECT id FROM applications WHERE id = $1 AND customer_id = $2', [application_id, userCheck.rows[0].customer_id]);
    if (appCheck.rows.length === 0) {
      logger.warn(`Application not found or mismatch: ${application_id}`);
      return res.status(404).json({ error: 'Application not found or does not belong to customer' });
    }

    const result = await pool.query(
      'INSERT INTO tokens (user_id, application_id, device_token, platform) VALUES ($1, $2, $3, $4) RETURNING *',
      [user_id, application_id, device_token, platform]
    );
    logger.info(`New token created: ${result.rows[0].id}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Error in token creation', { error: err.stack });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

module.exports = router;