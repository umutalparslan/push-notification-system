const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
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