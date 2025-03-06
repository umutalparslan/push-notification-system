const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'push_notification',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
  max: 50, // Bağlantı havuzunu artır
  idleTimeoutMillis: 10000, // Daha kısa idle timeout
  connectionTimeoutMillis: 1000, // Daha hızlı bağlantı timeout
});

// Bağlantıyı test et
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Database connection failed:', err.stack);
  }
  console.log('Connected to the database');
  release(); // Bağlantıyı serbest bırak
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err.stack);
});

module.exports = pool;