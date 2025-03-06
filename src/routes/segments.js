// src/routes/segments.js
const express = require('express');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const logger = require('../logger');

const router = express.Router();

/**
 * @route POST /api/segments
 * @desc Yeni bir segment oluştur
 * @access Private (JWT ile korunuyor)
 */
router.post('/', authMiddleware, async (req, res) => {
  const { name, description, segment_query } = req.body;
  const customerId = req.customer.id;

  if (!name || !segment_query) {
    logger.warn('Missing required fields for segment creation', { body: req.body, customerId });
    return res.status(400).json({ error: 'name and segment_query are required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO segments (customer_id, name, description, segment_query, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [customerId, name, description, segment_query, new Date(), new Date()]
    );

    logger.info('New segment created', { segment_id: result.rows[0].id, customerId });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Error creating segment', { error: err.stack, body: req.body, customerId });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * @route GET /api/segments
 * @desc Tüm segmentleri listele
 * @access Private (JWT ile korunuyor)
 */
router.get('/', authMiddleware, async (req, res) => {
  const customerId = req.customer.id;

  try {
    const result = await pool.query('SELECT * FROM segments WHERE customer_id = $1 ORDER BY created_at DESC', [customerId]);
    res.json(result.rows);
  } catch (err) {
    logger.error('Error fetching segments', { error: err.stack, customerId });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * @route PUT /api/segments/:id
 * @desc Bir segmenti güncelle
 * @access Private (JWT ile korunuyor)
 */
router.put('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, description, segment_query } = req.body;
  const customerId = req.customer.id;

  if (!name || !segment_query) {
    logger.warn('Missing required fields for segment update', { body: req.body, customerId });
    return res.status(400).json({ error: 'name and segment_query are required' });
  }

  try {
    const result = await pool.query(
      'UPDATE segments SET name = $1, description = $2, segment_query = $3, updated_at = $4 WHERE id = $5 AND customer_id = $6 RETURNING *',
      [name, description, segment_query, new Date(), id, customerId]
    );

    if (result.rows.length === 0) {
      logger.warn(`Segment not found for id ${id}, customer ${customerId}`);
      return res.status(404).json({ error: `Segment with ID ${id} not found` });
    }

    logger.info('Segment updated', { segment_id: id, customerId });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Error updating segment', { error: err.stack, id, customerId });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * @route DELETE /api/segments/:id
 * @desc Bir segmenti sil
 * @access Private (JWT ile korunuyor)
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const customerId = req.customer.id;

  try {
    const result = await pool.query('DELETE FROM segments WHERE id = $1 AND customer_id = $2 RETURNING *', [id, customerId]);

    if (result.rows.length === 0) {
      logger.warn(`Segment not found for id ${id}, customer ${customerId}`);
      return res.status(404).json({ error: `Segment with ID ${id} not found` });
    }

    logger.info('Segment deleted', { segment_id: id, customerId });
    res.json({ message: 'Segment deleted successfully' });
  } catch (err) {
    logger.error('Error deleting segment', { error: err.stack, id, customerId });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

module.exports = router;