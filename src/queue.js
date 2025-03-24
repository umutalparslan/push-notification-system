const amqp = require('amqplib');
const pool = require('./db');
const logger = require('./logger');
const apn = require('apn');
const admin = require('firebase-admin');
const webpush = require('web-push');

let channel;
const queueName = 'campaign_queue';

// RabbitMQ bağlantısı
async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    channel = await connection.createChannel();
    await channel.assertQueue(queueName, { durable: true });
    logger.info('RabbitMQ connected and queue asserted');
    return channel;
  } catch (err) {
    logger.error('RabbitMQ connection failed', { error: err.stack });
    throw err;
  }
}

// Kuyruğa mesaj gönder
async function sendToQueue(campaign) {
  try {
    if (!channel) {
      await connectRabbitMQ();
    }
    const message = Buffer.from(JSON.stringify(campaign));
    channel.sendToQueue(queueName, message, { persistent: true });
    logger.info(`Campaign ${campaign.id} sent to queue`);
  } catch (err) {
    logger.error('Error sending campaign to queue', { error: err.stack, campaign });
    throw err;
  }
}

// Token’ları veritabanından çek (segmentasyona göre)
async function getTokensFromDB(applicationId, sendTo, segmentQuery, batchSize = 10000) {
  try {
    let tokens = [];
    let offset = 0;

    while (true) {
      let tokensResult;
      try {
        if (sendTo === 'segment' && segmentQuery) {
          const queryParts = Object.entries(segmentQuery).map(([key, value]) => {
            if (typeof value === 'string' && value.startsWith('>')) {
              return `(u.attributes->>'${key}')::int > ${parseInt(value.slice(1))}`;
            } else if (typeof value === 'string' && value.startsWith('<')) {
              return `(u.attributes->>'${key}')::int < ${parseInt(value.slice(1))}`;
            } else if (typeof value === 'string' && value.includes('-')) {
              const [min, max] = value.split('-').map(Number);
              return `(u.attributes->>'${key}')::int BETWEEN ${min} AND ${max}`;
            } else {
              return `u.attributes->>'${key}' = '${value}'`;
            }
          });
          tokensResult = await pool.query(
            `SELECT t.device_token, t.id as token_id, t.user_id
             FROM tokens t
             JOIN users u ON t.user_id = u.id
             WHERE t.application_id = $1 AND ${queryParts.join(' AND ')}
             LIMIT $2 OFFSET $3`,
            [applicationId, batchSize, offset]
          );
        } else {
          tokensResult = await pool.query(
            'SELECT device_token, id as token_id, user_id FROM tokens WHERE application_id = $1 LIMIT $2 OFFSET $3',
            [applicationId, batchSize, offset]
          );
        }
      } catch (queryErr) {
        logger.error('Database query failed:', { error: queryErr.stack, applicationId, offset });
        break;
      }

      if (!tokensResult || !tokensResult.rows) {
        console.warn('No results or invalid response from database query:', { applicationId, offset });
        break;
      }

      if (tokensResult.rows.length === 0) {
        break;
      }

      tokens = tokens.concat(tokensResult.rows);
      offset += batchSize;
      console.log(`Fetched tokens for application ${applicationId}, offset ${offset}, count: ${tokensResult.rows.length}`);

      if (tokensResult.rows.length < batchSize) {
        break;
      }
    }

    if (tokens.length > 0) {
      console.log(`Total fetched tokens for application ${applicationId}: ${tokens.length}`);
    } else {
      logger.warn('No tokens found for application:', { applicationId, sendTo, segmentQuery });
      return [];
    }

    return tokens;
  } catch (err) {
    logger.error('Error fetching tokens from DB:', { error: err.stack, applicationId, sendTo, segmentQuery });
    throw err;
  }
}

// APNs için başlatma
function initializeAPNs(credentials) {
  return new apn.Provider({
    token: {
      key: credentials.key,
      keyId: credentials.key_id,
      teamId: credentials.team_id,
    },
    production: false,
  });
}

// FCM için başlatma
function initializeFCM(credentials) {
  return admin.initializeApp({
    credential: admin.credential.cert(credentials),
  });
}

// Push bildirimlerini gönder
async function processPushBatch(campaign, app, tokensBatch) {
  const { credentials, platform, id: application_id } = app;
  const uniqueTokens = [...new Set(tokensBatch.map(t => t.device_token))].map(token => {
    const row = tokensBatch.find(t => t.device_token === token);
    return row;
  });

  console.log(`Processing push for app ${application_id}, tokens:`, uniqueTokens);

  if (uniqueTokens.length === 0) {
    logger.warn('No unique tokens found for application:', { application_id, campaign_id: campaign.id });
    return;
  }

  try {
    if (platform === 'ios') {
      const apnProvider = initializeAPNs(credentials);
      const notification = new apn.Notification({
        alert: { title: campaign.title, body: campaign.message },
        topic: credentials.bundle_id,
      });

      const responses = await apnProvider.send(notification, uniqueTokens.map(t => t.device_token), { timeout: 2000 });
      console.log(`APNs response for app ${application_id}, batch size ${uniqueTokens.length}:`, responses);

      for (const token of uniqueTokens) {
        const status = responses.failed.length === 0 || !responses.failed.some(f => f.device === token.device_token) ? 'delivered' : 'failed';
        const errorMessage = responses.failed.find(f => f.device === token.device_token)?.response?.reason || null;
        await pool.query(
          'INSERT INTO notifications (campaign_id, user_id, token_id, application_id, status, error_message) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (campaign_id, token_id, application_id) DO UPDATE SET status = EXCLUDED.status, error_message = EXCLUDED.error_message',
          [campaign.id, token.user_id, token.token_id || null, application_id, status, errorMessage]
        );
        console.log(`Inserted notification for token ${token.device_token}, status: ${status}`);
      }
      apnProvider.shutdown();
    } else if (platform === 'android') {
      const firebaseApp = initializeFCM(credentials);
      const messages = uniqueTokens.map(token => ({
        notification: { title: campaign.title, body: campaign.message },
        token: token.device_token,
      }));
      const responses = await Promise.all(messages.map(msg => firebaseApp.messaging().send(msg, { timeout: 2000 })));
      console.log(`FCM responses for app ${application_id}, batch size ${uniqueTokens.length}:`, responses);

      for (const [i, token] of uniqueTokens.entries()) {
        const status = responses[i].success ? 'delivered' : 'failed';
        const errorMessage = responses[i].error?.message || null;
        await pool.query(
          'INSERT INTO notifications (campaign_id, user_id, token_id, application_id, status, error_message) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (campaign_id, token_id, application_id) DO UPDATE SET status = EXCLUDED.status, error_message = EXCLUDED.error_message',
          [campaign.id, token.user_id, token.token_id || null, application_id, status, errorMessage]
        );
        console.log(`Inserted notification for token ${token.device_token}, status: ${status}`);
      }
      firebaseApp.delete();
    } else if (platform === 'web') {
      if (credentials.type === 'vapid') {
        webpush.setVapidDetails('mailto:support@yourdomain.com', credentials.public_key, credentials.private_key);
        await Promise.all(uniqueTokens.map(async token => {
          try {
            await webpush.sendNotification(JSON.parse(token.device_token), JSON.stringify({
              title: campaign.title, body: campaign.message,
            }), { timeout: 2000 });
            await pool.query(
              'INSERT INTO notifications (campaign_id, user_id, token_id, application_id, status) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (campaign_id, token_id, application_id) DO UPDATE SET status = EXCLUDED.status',
              [campaign.id, token.user_id, token.token_id || null, application_id, 'delivered']
            );
            console.log(`Inserted notification for token ${token.device_token}, status: delivered`);
          } catch (err) {
            await pool.query(
              'INSERT INTO notifications (campaign_id, user_id, token_id, application_id, status, error_message) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (campaign_id, token_id, application_id) DO UPDATE SET status = EXCLUDED.status, error_message = EXCLUDED.error_message',
              [campaign.id, token.user_id, token.token_id || null, application_id, 'failed', err.message]
            );
            console.log(`Inserted notification for token ${token.device_token}, status: failed, error: ${err.message}`);
          }
        }));
      } else if (credentials.type === 'p12') {
        const apnProvider = initializeAPNs(credentials);
        const notification = new apn.Notification({
          alert: { title: campaign.title, body: campaign.message },
          topic: credentials.bundle_id,
        });
        const responses = await apnProvider.send(notification, uniqueTokens.map(t => t.device_token), { timeout: 2000 });
        for (const token of uniqueTokens) {
          const status = responses.failed.length === 0 ? 'delivered' : 'failed';
          const errorMessage = responses.failed.find(f => f.device === token.device_token)?.response?.reason || null;
          await pool.query(
            'INSERT INTO notifications (campaign_id, user_id, token_id, application_id, status, error_message) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (campaign_id, token_id, application_id) DO UPDATE SET status = EXCLUDED.status, error_message = EXCLUDED.error_message',
            [campaign.id, token.user_id, token.token_id || null, application_id, status, errorMessage]
          );
          console.log(`Inserted notification for token ${token.device_token}, status: ${status}`);
        }
        apnProvider.shutdown();
      }
    }
  } catch (err) {
    logger.error('Error processing push batch for app:', { error: err.stack, application_id, campaign_id: campaign.id });
    throw err;
  }
}

// Kuyruktan mesaj tüketimi
connectRabbitMQ().then(() => {
  channel.consume(queueName, async (msg) => {
    if (msg !== null) {
      try {
        const campaign = JSON.parse(msg.content.toString());
        console.log('Processing campaign from queue:', campaign);

        const apps = await pool.query('SELECT * FROM applications WHERE id = ANY($1)', [campaign.application_ids]);
        for (const app of apps.rows) {
          const tokens = await getTokensFromDB(app.id, campaign.send_to, campaign.segment_query);
          await processPushBatch(campaign, app, tokens);
        }

        channel.ack(msg);
      } catch (err) {
        logger.error('Error processing campaign:', { error: err.stack, campaign_id: campaign?.id });
        channel.nack(msg, false, false);
      }
    }
  }, { noAck: false });
}).catch(err => {
  logger.error('Failed to start RabbitMQ consumer:', { error: err.stack });
  process.exit(1);
});

module.exports = { sendToQueue };