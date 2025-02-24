// src/queue.js (tam güncel hal, birleştirilmiş ve optimize edilmiş)
const amqp = require('amqplib');
const admin = require('firebase-admin');
const apn = require('apn');
const webpush = require('web-push');
const redis = require('redis'); // Redis için ekledik
const pool = require('./db');
const logger = require('./logger');

// Redis istemcisini başlat (opsiyonel)
const redisClient = redis.createClient({ url: 'redis://localhost:6379' });
redisClient.connect().catch(err => console.error('Redis connection failed:', err));

// FCM başlatma
function initializeFCM(credentials) {
  if (credentials.type === 'fcm') {
    return admin.initializeApp({
      credential: admin.credential.cert(credentials.service_account),
    }, `app-${Date.now()}`);
  }
  throw new Error('Unsupported FCM credentials');
}

// APNs başlatma (p8 ve p12 için)
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

// Redis’ten token’ları al (opsiyonel önbellekleme)
async function getTokensFromCacheOrDB(applicationId, segmentQuery) {
  const cacheKey = `tokens:${applicationId}:${JSON.stringify(segmentQuery || 'all')}`;
  
  // Redis’ten hızlıca kontrol et
  let cached = await redisClient.get(cacheKey);
  if (cached) {
    console.log(`Cache hit for ${cacheKey} (fast)`);
    return JSON.parse(cached);
  }

  // Veritabanından hızlıca al, zaman alıyorsa log’la
  console.time(`DB query for ${cacheKey}`);
  let tokensResult;
  if (segmentQuery) {
    const queryParts = Object.entries(segmentQuery).map(([key, value]) => {
      if (typeof value === 'string' && value.startsWith('>')) {
        return `(attributes->>'${key}')::int > ${parseInt(value.slice(1))}`;
      }
      return `attributes->>'${key}' = '${value}'`;
    });
    const query = `
      SELECT DISTINCT ON (device_token) t.device_token, t.id as token_id, t.user_id
      FROM tokens t
      JOIN users u ON t.user_id = u.id
      WHERE t.application_id = $1 AND ${queryParts.join(' AND ')}
    `;
    tokensResult = await pool.query(query, [applicationId]);
  } else {
    tokensResult = await pool.query(
      'SELECT DISTINCT ON (device_token) device_token, id as token_id, user_id FROM tokens WHERE application_id = $1',
      [applicationId]
    );
  }
  console.timeEnd(`DB query for ${cacheKey}`);

  const tokens = tokensResult.rows;
  if (tokens.length > 0) {
    // Redis’e kaydet (1 saat TTL)
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(tokens));
    console.log(`Cache miss, stored in ${cacheKey}`);
  }
  return tokens;
}

let globalChannel = null;

async function getChannel() {
  if (!globalChannel) {
    const conn = await amqp.connect('amqp://localhost');
    globalChannel = await conn.createChannel();
    await globalChannel.assertQueue('campaign_queue', { durable: true });
  }
  return globalChannel;
}

// src/queue.js (güncellenmiş hali, log’ları detaylandır)
async function startQueue() {
  try {
    const channel = await getChannel();
    console.log('Queue worker started, waiting for campaigns...');

    // Kampanyaları yalnızca bir kez işlemek için bir kontrol ekleyelim
    const processedCampaigns = new Set();

    channel.consume('campaign_queue', async (msg) => {
      const campaign = JSON.parse(msg.content.toString());
      console.log('Processing campaign:', campaign);

      // Aynı kampanyanın birden fazla kez işlenmesini önle
      if (processedCampaigns.has(campaign.id)) {
        console.warn(`Campaign ${campaign.id} already processed, skipping...`);
        channel.ack(msg);
        return;
      }

      if (!campaign.application_ids || !Array.isArray(campaign.application_ids)) {
        console.error('Invalid or missing application_ids in campaign:', campaign);
        channel.ack(msg);
        return;
      }

      const appResult = await pool.query('SELECT credentials, platform, id FROM applications WHERE id = ANY($1)', [campaign.application_ids]);
      if (appResult.rows.length === 0) {
        console.error('No applications found for campaign:', campaign.application_ids);
        channel.ack(msg);
        return;
      }

      const apps = appResult.rows;
      console.log('Found applications:', apps);
      for (const app of apps) {
        const { credentials, platform, id: application_id } = app;

        let tokens;
        try {
          console.time('Fetching tokens');
          tokens = await getTokensFromCacheOrDB(application_id, campaign.segment_query);
          console.timeEnd('Fetching tokens');
          console.log(`Tokens fetched for app ${application_id}:`, tokens);
        } catch (err) {
          console.error(`Error fetching tokens for application ${application_id}:`, err);
          continue;
        }

        // Benzersiz token’ları al, yinelenenleri tamamen filtrele
        const uniqueTokens = [];
        const seenTokens = new Set();
        for (const row of tokens) {
          if (!seenTokens.has(row.device_token)) {
            seenTokens.add(row.device_token);
            uniqueTokens.push(row);
          }
        }

        if (uniqueTokens.length === 0) {
          console.log(`No matching tokens found for application ${application_id}`);
          continue;
        }

        try {
          if (platform === 'android') {
            console.time('Sending FCM');
            const firebaseApp = initializeFCM(credentials);
            const message = {
              notification: {
                title: campaign.title,
                body: campaign.message,
              },
              tokens: uniqueTokens.map(t => t.device_token),
            };
            const response = await firebaseApp.messaging().sendEachForMulticast(message, { timeout: 5000 });
            console.timeEnd('Sending FCM');
            console.log(`Successfully sent FCM message for app ${application_id}:`, response);

            for (const [index, token] of uniqueTokens.entries()) {
              const status = response.responses[index].success ? 'delivered' : 'failed';
              const errorMessage = response.responses[index].error ? response.responses[index].error.message : null;
              const row = uniqueTokens[index];
              console.log(`Inserting notification for token ${row.device_token} (Status: ${status})`);
              await pool.query(
                'INSERT INTO notifications (campaign_id, user_id, token_id, application_id, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
                [campaign.id, row.user_id, row.token_id || null, application_id, status, errorMessage]
              );
            }
            firebaseApp.delete();
          } else if (platform === 'ios') {
            console.time('Sending APNs');
            const apnProvider = initializeAPNs(credentials);
            const notification = new apn.Notification({
              alert: {
                title: campaign.title,
                body: campaign.message,
              },
              topic: credentials.bundle_id,
            });

            const uniqueTokensList = [...new Set(uniqueTokens.map(t => t.device_token))];
            console.log(`Sending APNs to unique tokens for app ${application_id} (Count: ${uniqueTokensList.length}):`, uniqueTokensList);

            const responses = await apnProvider.send(notification, uniqueTokensList, { timeout: 5000 });
            console.timeEnd('Sending APNs');
            console.log(`APNs response for app ${application_id}:`, responses);

            for (const [index, token] of uniqueTokensList.entries()) {
              const status = responses.failed.length === 0 || !responses.failed.some(f => f.device === token) ? 'delivered' : 'failed';
              const errorMessage = responses.failed.find(f => f.device === token)?.response?.reason || null;
              const row = uniqueTokens.find(t => t.device_token === token);
              console.log(`Inserting notification for token ${token} (Status: ${status})`);
              const existingNotification = await pool.query(
                'SELECT id FROM notifications WHERE campaign_id = $1 AND token_id = $2 AND application_id = $3 AND status = $4',
                [campaign.id, row.token_id || null, application_id, status]
              );

              if (existingNotification.rows.length === 0) {
                await pool.query(
                  'INSERT INTO notifications (campaign_id, user_id, token_id, application_id, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
                  [campaign.id, row.user_id, row.token_id || null, application_id, status, errorMessage]
                );
              } else {
                console.warn(`Notification already exists for campaign ${campaign.id}, token ${token}, skipping insertion`);
              }
            }
            apnProvider.shutdown();
          } else if (platform === 'web') {
            console.time('Sending WebPush');
            if (credentials.type === 'vapid') {
              webpush.setVapidDetails(
                'mailto:support@yourdomain.com',
                credentials.public_key,
                credentials.private_key
              );

              for (const [index, token] of uniqueTokens.entries()) {
                const subscription = JSON.parse(token.device_token);
                try {
                  await webpush.sendNotification(subscription, JSON.stringify({
                    title: campaign.title,
                    body: campaign.message,
                  }), { timeout: 5000 });
                  console.timeEnd('Sending WebPush');
                  const row = uniqueTokens[index];
                  await pool.query(
                    'INSERT INTO notifications (campaign_id, user_id, token_id, application_id, status) VALUES ($1, $2, $3, $4, $5)',
                    [campaign.id, row.user_id, row.token_id || null, application_id, 'delivered']
                  );
                } catch (err) {
                  console.error('Web Push error for token:', token.device_token, err);
                  const row = uniqueTokens[index];
                  await pool.query(
                    'INSERT INTO notifications (campaign_id, user_id, token_id, application_id, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
                    [campaign.id, row.user_id, row.token_id || null, application_id, 'failed', err.message]
                  );
                }
              }
              console.log(`Successfully sent Web Push (VAPID) message for app ${application_id}`);
            } else if (credentials.type === 'p12') {
              const apnProvider = initializeAPNs(credentials);
              const notification = new apn.Notification({
                alert: {
                  title: campaign.title,
                  body: campaign.message,
                },
                topic: credentials.bundle_id,
              });

              const uniqueTokensList = [...new Set(uniqueTokens.map(t => t.device_token))];
              const responses = await apnProvider.send(notification, uniqueTokensList, { timeout: 5000 });
              console.timeEnd('Sending WebPush');
              console.log(`Successfully sent APNs message (Safari Web) for app ${application_id}:`, responses);

              for (const [index, token] of uniqueTokensList.entries()) {
                const status = responses.failed.length === 0 || !responses.failed.some(f => f.device === token) ? 'delivered' : 'failed';
                const errorMessage = responses.failed.find(f => f.device === token)?.response?.reason || null;
                const row = uniqueTokens.find(t => t.device_token === token);
                await pool.query(
                  'INSERT INTO notifications (campaign_id, user_id, token_id, application_id, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
                  [campaign.id, row.user_id, row.token_id || null, application_id, status, errorMessage]
                );
              }
              apnProvider.shutdown();
            }
          }

          await pool.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['sent', campaign.id]);
          console.log(`Campaign ${campaign.id} status updated to 'sent'`);
        } catch (err) {
          console.error('Push send timeout or error:', err);
          console.error('Error sending message for app:', application_id, err);
          for (const row of uniqueTokens) {
            await pool.query(
              'INSERT INTO notifications (campaign_id, user_id, token_id, application_id, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
              [campaign.id, row.user_id, row.token_id || null, application_id, 'failed', err.message]
            );
          }
        }
      }

      // Kampanyayı işledikten sonra Set’e ekle
      processedCampaigns.add(campaign.id);
      channel.ack(msg);
    }, { noAck: false });
  } catch (err) {
    console.error('Queue error:', err);
  }
}

startQueue();

module.exports = {
  sendToQueue: async (campaign) => {
    const channel = await getChannel();
    channel.sendToQueue('campaign_queue', Buffer.from(JSON.stringify(campaign)), { persistent: true });
    console.log('Campaign sent to queue:', campaign);
  }
};