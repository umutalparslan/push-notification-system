// src/routes/subscription.js
const express = require('express');
const pool = require('../db');
const logger = require('../logger');

const router = express.Router();

/**
 * @route POST /api/external/tokens
 * @desc Add a new token to the tokens table (external access)
 * @access Public (no JWT required, can be modified for API key or other auth)
 * @body { application_id, user_id, device_token, platform }
 * @returns { status, message, token_id }
 */
router.post('/', async (req, res) => {
  const { application_id, user_id, device_token, platform } = req.body;

  // Girdi doğrulama
  if (!application_id || !user_id || !device_token || !platform) {
    logger.warn('Missing required fields for token creation', { body: req.body });
    return res.status(400).json({ error: 'application_id, user_id, device_token, and platform are required' });
  }

  // device_token formatını kontrol et (örneğin, APNs için 64 karakterlik hexadecimal)
  if (platform === 'ios' && device_token.length !== 64) {
    logger.warn('Invalid device_token format for iOS', { device_token, platform });
    return res.status(400).json({ error: 'Invalid device_token format for iOS (must be 64 characters hexadecimal)' });
  }

  try {
    // application_id’nin varlığını kontrol et (customer_id kontrolü yapılmıyor, çünkü dışarıdan erişim)
    const application = await pool.query(
      'SELECT id FROM applications WHERE id = $1',
      [application_id]
    );
    if (application.rows.length === 0) {
      logger.warn('Application not found', { application_id });
      return res.status(404).json({ error: 'Application not found' });
    }

    // user_id’nin varlığını kontrol et (opsiyonel, veritabanına bağlı)
    const user = await pool.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (user.rows.length === 0) {
      logger.warn('User not found', { user_id });
      return res.status(404).json({ error: 'User not found' });
    }

    // tokens tablosuna insert
    const result = await pool.query(
      'INSERT INTO tokens (device_token, application_id, user_id, platform, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [device_token, application_id, user_id, platform, new Date()]
    );

    logger.info('New token created via external API', { token_id: result.rows[0].id, application_id, user_id, platform });
    res.status(201).json({
      status: 'success',
      message: 'Token added successfully',
      token_id: result.rows[0].id,
    });
  } catch (err) {
    logger.error('Error adding token to database via external API', { error: err.stack, body: req.body });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

module.exports = router;