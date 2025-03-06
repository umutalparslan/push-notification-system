// src/routes/campaign.js
const express = require('express');
const pool = require('../db');
const { sendToQueue } = require('../queue');
const logger = require('../logger');
const router = express.Router();

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const customerId = req.customer.id;
    const campaign = await pool.query('SELECT * FROM campaigns WHERE id = $1 AND customer_id = $2', [id, customerId]);
    if (campaign.rows.length === 0) {
      logger.warn(`Campaign fetch failed: not found for id ${id}, customer ${customerId}`);
      return res.status(404).json({ error: `Campaign with ID ${id} not found for customer ${customerId}` });
    }

    logger.info(`Campaign ${id} fetched for customer ${customerId}`);
    res.json(campaign.rows[0]);
  } catch (err) {
    logger.error('Error fetching campaign', { error: err.stack, id, customerId });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Kampanya listeleme (GET /)
router.get('/', async (req, res) => {
  try {
    const customerId = req.customer.id;
    const campaigns = await pool.query('SELECT * FROM campaigns WHERE customer_id = $1', [customerId]);

    const campaignList = await Promise.all(campaigns.rows.map(async (camp) => {
      const stats = await pool.query(
        'SELECT status, COUNT(*) as count FROM notifications WHERE campaign_id = $1 GROUP BY status',
        [camp.id]
      );
      const result = { sent: 0, delivered: 0, opened: 0, errors: 0 };
      stats.rows.forEach(row => {
        if (row.status === 'sent') result.sent = parseInt(row.count);
        if (row.status === 'delivered') result.delivered = parseInt(row.count);
        if (row.status === 'opened') result.opened = parseInt(row.count);
        if (row.status === 'failed') result.errors = parseInt(row.count);
      });
      return { ...camp, ...result };
    }));

    logger.info(`Campaigns listed for customer ${customerId}`);
    res.json(campaignList);
  } catch (err) {
    logger.error('Error fetching campaigns', { error: err.stack });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Yeni kampanya oluşturma (POST /)
router.post('/', async (req, res) => {
  const { title, message, application_ids, segment_query, scheduled_at } = req.body;

  if (!title || !message || !application_ids || !Array.isArray(application_ids)) {
    logger.warn('Campaign creation attempt with missing or invalid fields', { body: req.body });
    return res.status(400).json({ error: 'title, message, and application_ids (array) are required' });
  }

  const customerId = req.customer.id;
  console.log('Customer ID from token:', customerId);

  const campaignSegment = segment_query || null;
  let scheduledDate = null;
  if (scheduled_at) {
    scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      logger.warn('Invalid scheduled_at date provided');
      return res.status(400).json({ error: 'Invalid scheduled_at date' });
    }
    if (scheduledDate <= new Date()) {
      logger.warn('Scheduled_at cannot be in the past');
      return res.status(400).json({ error: 'Scheduled_at cannot be in the past' });
    }
  }

  try {
    const appCheck = await pool.query('SELECT id FROM applications WHERE id = ANY($1) AND customer_id = $2', [application_ids, customerId]);
    if (appCheck.rows.length !== application_ids.length) {
      const foundIds = appCheck.rows.map(row => row.id);
      const missingIds = application_ids.filter(id => !foundIds.includes(parseInt(id)));
      logger.warn(`Application mismatch for customer ${customerId}: requested ${application_ids}, missing ${missingIds}`);
      return res.status(404).json({ error: `One or more applications not found or do not belong to customer: ${missingIds}` });
    }

    const result = await pool.query(
      'INSERT INTO campaigns (customer_id, title, message, segment_query, scheduled_at, application_ids, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [customerId, title, message, campaignSegment, scheduledDate, application_ids, 'draft']
    );
    logger.info(`New campaign created: ${result.rows[0].id} for customer ${customerId}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Error in campaign creation', { error: err.stack, body: req.body, customerId });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Kampanyayı RabbitMQ ile kuyruğa ekle
// src/routes/campaign.js (güncellenmiş hali, hata kontrolü ve log’larla)
router.post('/:id/send', async (req, res) => {
  const { id } = req.params;

  console.time('Queuing campaign with ID ' + id);
  console.log('Queuing campaign with ID:', id, 'for customer:', req.customer.id);

  try {
    const customerId = req.customer.id;
    const campaign = await pool.query('SELECT * FROM campaigns WHERE id = $1 AND status = $2 AND customer_id = $3', [id, 'draft', customerId]); // 'draft' yerine 'queued' kontrol et
    if (campaign.rows.length === 0) {
      logger.warn(`Campaign send attempt failed: not found or not queued for id ${id}, customer ${customerId}`);
      return res.status(404).json({ 
        error: `Campaign with ID ${id} not found or not in queued status for customer ${customerId}`,
        details: { id, customerId, status: 'queued' }
      });
    }

    const campaignData = campaign.rows[0];
    if (campaignData.scheduled_at && campaignData.scheduled_at > new Date()) {
      logger.warn(`Cannot send scheduled campaign ${id} immediately, it will be sent at ${campaignData.scheduled_at}`);
      return res.status(400).json({ error: 'Cannot send scheduled campaign immediately' });
    }

    // RabbitMQ kuyruğuna ekle
    try {
      await sendToQueue(campaignData);
      await pool.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['sent', id]); // 'sent' olarak güncelle
      console.log(`Campaign ${id} queued and status updated to 'sent' immediately`);
    } catch (queueErr) {
      logger.error('Error queuing campaign to RabbitMQ', { error: queueErr.stack, id, customerId });
      return res.status(500).json({ error: 'Failed to queue campaign', details: queueErr.message });
    }

    logger.info(`Campaign ${id} queued for sending`);
    console.timeEnd('Queuing campaign with ID ' + id);
    res.json({ message: 'Campaign queued for sending', campaign: campaignData });
  } catch (err) {
    logger.error('Error sending campaign', { error: err.stack, id, customerId: req.customer.id });
    console.timeEnd('Queuing campaign with ID ' + id);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Kampanya raporu
router.get('/:id/report', async (req, res) => {
  const { id } = req.params;

  try {
    const customerId = req.customer.id;
    const campaignCheck = await pool.query('SELECT id FROM campaigns WHERE id = $1 AND customer_id = $2', [id, customerId]);
    if (campaignCheck.rows.length === 0) {
      logger.warn(`Campaign report fetch failed: not found for id ${id}`);
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const report = await pool.query(
      'SELECT status, COUNT(*) as count FROM notifications WHERE campaign_id = $1 GROUP BY status',
      [id]
    );
    const result = { sent: 0, delivered: 0, opened: 0, failed: 0 };
    report.rows.forEach(row => {
      if (row.status === 'sent') result.sent = parseInt(row.count);
      if (row.status === 'delivered') result.delivered = parseInt(row.count);
      if (row.status === 'opened') result.opened = parseInt(row.count);
      if (row.status === 'failed') result.failed = parseInt(row.count);
    });
    logger.info(`Campaign report fetched for id ${id}`);
    res.json(result);
  } catch (err) {
    logger.error('Error fetching campaign report', { error: err.stack });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

module.exports = router;