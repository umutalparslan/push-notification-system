const express = require('express');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const logger = require('../logger');
const { sendToQueue } = require('../queue');

const router = express.Router();

/**
 * @route POST /api/campaigns
 * @desc Yeni bir kampanya oluştur
 * @access Private (JWT ile korunuyor)
 * @body { title, message, send_to, segment_id, scheduled_at, application_ids }
 */
router.post('/', authMiddleware, async (req, res) => {
  const { title, message, send_to, segment_id, scheduled_at, application_ids } = req.body;
  const customerId = req.customer.id;

  // Girdi doğrulama
  if (!title || !message || !application_ids || !Array.isArray(application_ids)) {
    logger.warn('Missing or invalid required fields for campaign creation', { body: req.body, customerId });
    return res.status(400).json({ error: 'title, message, and application_ids are required' });
  }

  if (!send_to || !['all', 'segment'].includes(send_to)) {
    logger.warn('Invalid send_to value', { body: req.body, customerId });
    return res.status(400).json({ error: 'send_to must be "all" or "segment"' });
  }

  let segmentQuery = null;
  if (send_to === 'segment') {
    if (!segment_id) {
      logger.warn('segment_id required when send_to is segment', { body: req.body, customerId });
      return res.status(400).json({ error: 'segment_id is required when send_to is "segment"' });
    }

    // Segmentin varlığını ve müşteriye ait olduğunu kontrol et
    const segment = await pool.query('SELECT * FROM segments WHERE id = $1 AND customer_id = $2', [segment_id, customerId]);
    if (segment.rows.length === 0) {
      logger.warn(`Segment not found for id ${segment_id}, customer ${customerId}`);
      return res.status(404).json({ error: `Segment with ID ${segment_id} not found` });
    }

    segmentQuery = segment.rows[0].segment_query; // Segmentin filtresini al
  }

  try {
    // Kampanyayı veritabanına ekle
    const result = await pool.query(
      'INSERT INTO campaigns (customer_id, title, message, segment_query, send_to, segment_id, scheduled_at, application_ids, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [customerId, title, message, segmentQuery, send_to, segment_id, scheduled_at, application_ids, 'queued', new Date()]
    );

    const campaign = result.rows[0];
    await sendToQueue(campaign); // Kuyruğa ekle
    logger.info('New campaign created', { campaign_id: campaign.id, customerId });
    res.status(201).json(campaign);
  } catch (err) {
    logger.error('Error creating campaign', { error: err.stack, body: req.body, customerId });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * @route GET /api/campaigns
 * @desc Tüm kampanyaları listele
 * @access Private (JWT ile korunuyor)
 */
router.get('/', authMiddleware, async (req, res) => {
  const customerId = req.customer.id;

  try {
    const result = await pool.query('SELECT * FROM campaigns WHERE customer_id = $1 ORDER BY created_at DESC', [customerId]);
    res.json(result.rows);
  } catch (err) {
    logger.error('Error fetching campaigns', { error: err.stack, customerId });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * @route POST /api/campaigns/:id/send
 * @desc Kampanyayı gönder
 * @access Private (JWT ile korunuyor)
 */
router.post('/:id/send', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const customerId = req.customer.id;

  try {
    const campaign = await pool.query('SELECT * FROM campaigns WHERE id = $1 AND customer_id = $2', [id, customerId]);
    if (campaign.rows.length === 0) {
      logger.warn(`Campaign send attempt failed: not found for id ${id}, customer ${customerId}`);
      return res.status(404).json({ error: `Campaign with ID ${id} not found for customer ${customerId}` });
    }

    const campaignData = campaign.rows[0];
    if (campaignData.status !== 'queued') {
      logger.warn(`Cannot send campaign ${id} with status ${campaignData.status}`);
      return res.status(400).json({ error: `Campaign status must be 'queued', current status is '${campaignData.status}'` });
    }

    await sendToQueue(campaignData);
    await pool.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['sent', id]);
    logger.info(`Campaign ${id} sent successfully for customer ${customerId}`);
    res.json({ message: 'Campaign sent successfully', campaign: campaignData });
  } catch (err) {
    logger.error('Error sending campaign', { error: err.stack, id, customerId });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

module.exports = router;