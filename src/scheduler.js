const schedule = require('node-schedule');
const pool = require('./db');
const { sendToQueue } = require('./queue');

async function scheduleCampaigns() {
  try {
    // Durumu 'draft' ve scheduled_at dolu olan kampanyaları al, sadece gelecekteki tarihleri kontrol et
    const campaigns = await pool.query(
      "SELECT * FROM campaigns WHERE status = 'draft' AND scheduled_at IS NOT NULL AND scheduled_at > NOW()"
    );

    campaigns.rows.forEach(campaign => {
      const job = schedule.scheduleJob(campaign.scheduled_at, async () => {
        try {
          console.log(`Scheduling campaign ${campaign.id} for execution at ${campaign.scheduled_at}`);
          await sendToQueue(campaign);
          await pool.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['sent', campaign.id]); // 'sent' olarak güncelle
        } catch (err) {
          console.error(`Error scheduling campaign ${campaign.id}:`, err);
        }
      });
      console.log(`Campaign ${campaign.id} scheduled for ${campaign.scheduled_at}`);
    });
  } catch (err) {
    console.error('Error in scheduler:', err);
  }
}

// Scheduler’ı başlat
function startScheduler() {
  // Her dakika çalışacak bir cron job
  schedule.scheduleJob('* * * * *', () => {
    console.log('Checking for scheduled campaigns...');
    scheduleCampaigns();
  });
}

startScheduler();

module.exports = { scheduleCampaigns };