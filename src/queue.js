// src/queue.js (güncellenmiş hali, hata kontrolü ve log’larla)
const amqp = require('amqplib');
const admin = require('firebase-admin');
const apn = require('apn');
const webpush = require('web-push');
const redis = require('redis');
const pool = require('./db'); // Tek bir `pool` tanımı
const logger = require('./logger');

const redisClient = redis.createClient({ url: 'redis://localhost:6379', retry_strategy: options => 1000 });
redisClient.on('error', err => console.error('Redis Client Error:', err));
redisClient.connect().catch(err => console.error('Redis connection failed:', err));

let globalChannel = null;

async function getChannel() {
  if (!globalChannel) {
    try {
      console.time('RabbitMQ connection');
      const conn = await amqp.connect('amqp://localhost:5672');
      globalChannel = await conn.createChannel();
      await globalChannel.assertQueue('campaign_queue', { durable: true });
      console.timeEnd('RabbitMQ connection');
      console.log('RabbitMQ channel initialized successfully');
    } catch (err) {
      logger.error('RabbitMQ connection error:', { error: err.stack });
      throw err;
    }
  }
  return globalChannel;
}

// FCM başlatma
function initializeFCM(credentials) {
  if (credentials.type === 'fcm') {
    return admin.initializeApp({
      credential: admin.credential.cert(credentials.service_account),
    }, `app-${Date.now()}`);
  }
  throw new Error('Unsupported FCM credentials');
}

// APNs başlatma
function initializeAPNs(credentials) {
  if (credentials.type === 'p8') {
    return new apn.Provider({
      token: {
        key: Buffer.from(credentials.key, 'base64'),
        keyId: credentials.key_id,
        teamId: credentials.team_id,
      },
      production: false,
    });
  } else if (credentials.type === 'p12') {
    return new apn.Provider({
      pfx: Buffer.from(credentials.certificate, 'base64'),
      passphrase: credentials.password,
      production: false,
    });
  }
  throw new Error('Unsupported APNs credentials');
}

// Veritabanından token’ları al
async function getTokensFromDB(applicationId, segmentQuery, batchSize = 10000) {
  try {
    let tokens = [];
    let offset = 0;

    do {
      let tokensResult; // Her iterasyonda yeni bir `tokensResult` tanımla
      try {
        if (segmentQuery) {
          const queryParts = Object.entries(segmentQuery).map(([key, value]) => {
            if (typeof value === 'string' && value.startsWith('>')) {
              return `(attributes->>'${key}')::int > ${parseInt(value.slice(1))}`;
            }
            return `attributes->>'${key}' = '${value}'`;
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
        break; // Sorgu başarısızsa döngüden çık
      }

      // `tokensResult`’in tanımlı olup olmadığını kontrol et
      if (!tokensResult || !tokensResult.rows) {
        console.warn('No results or invalid response from database query:', { applicationId, offset });
        break; // Sonuç yoksa veya geçersizse döngüden çık
      }

      tokens = tokens.concat(tokensResult.rows);
      offset += batchSize;
      console.log(`Fetched tokens for application ${applicationId}, offset ${offset}:`, tokensResult.rows); // Her batch’te alınan token’ları log’la
    } while (tokensResult.rows.length === batchSize); // Sadece `tokensResult.rows.length` kontrol et

    if (tokens.length > 0) {
      console.log('All fetched tokens for application:', tokens); // Tüm token’ları log’la
    } else {
      logger.warn('No tokens found for application:', { applicationId, segmentQuery });
      return []; // Boş dizi döndür, hata fırlatma
    }

    return tokens;
  } catch (err) {
    logger.error('Error fetching tokens from DB:', { error: err.stack, applicationId, segmentQuery });
    throw err;
  }
}

// Sıralı push gönderimi
// src/queue.js (güncellenmiş `processPushBatch` fonksiyonu, opsiyonel)
async function processPushBatch(campaign, app, tokensBatch) {
  const { credentials, platform, id: application_id } = app;
  const uniqueTokens = [...new Set(tokensBatch.map(t => t.device_token))].map(token => {
    const row = tokensBatch.find(t => t.device_token === token);
    return row;
  });

  console.log(`Processing push for app ${application_id}, tokens:`, uniqueTokens); // Yeni token’ları log’la

  if (uniqueTokens.length === 0) {
    logger.warn('No unique tokens found for application:', { application_id, campaign_id: campaign.id });
    return; // Hiç token yoksa işlemi sonlandır
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
        console.log(`Inserted notification for token ${token.device_token}, status: ${status}`); // Her token için log ekle
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

// RabbitMQ consumer
async function startQueue() {
  try {
    const channel = await getChannel();
    console.log('Queue worker started, waiting for campaigns...');

    channel.consume('campaign_queue', async (msg) => {
      const campaign = JSON.parse(msg.content.toString());
      console.log('Processing campaign from queue:', campaign);

      try {
        const apps = await pool.query('SELECT credentials, platform, id FROM applications WHERE id = ANY($1)', [campaign.application_ids]);
        if (apps.rows.length === 0) {
          logger.error('No applications found for campaign:', { application_ids: campaign.application_ids });
          channel.ack(msg);
          return;
        }

        // Token’ları batch’ler halinde al ve sıralı işleme
        const batchSize = 10000; // Her batch 10,000 token
        for (const app of apps.rows) {
          const tokens = await getTokensFromDB(app.id, campaign.segment_query, batchSize);
          const tokenBatches = [];
          for (let i = 0; i < tokens.length; i += batchSize) {
            tokenBatches.push(tokens.slice(i, i + batchSize));
          }

          // Sıralı işlem
          for (const batch of tokenBatches) {
            await processPushBatch(campaign, app, batch);
          }
        }

        // Status güncellemesini işlemden sonra yap
        await pool.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['sent', campaign.id]);
        console.log(`Campaign ${campaign.id} status updated to 'sent'`);
      } catch (err) {
        logger.error('Error processing campaign:', { error: err.stack, campaign_id: campaign.id });
      }

      channel.ack(msg);
    }, { noAck: false });
  } catch (err) {
    logger.error('Queue error:', { error: err.stack });
  }
}

// Kampanyayı kuyruğa ekle
async function sendToQueue(campaign) {
  try {
    const channel = await getChannel();
    channel.sendToQueue('campaign_queue', Buffer.from(JSON.stringify(campaign)), { persistent: true });
    console.log('Campaign sent to queue:', campaign);
  } catch (err) {
    logger.error('Error sending campaign to queue:', { error: err.stack, campaign });
    throw err;
  }
}

startQueue();

module.exports = { sendToQueue };