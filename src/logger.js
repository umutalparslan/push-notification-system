// src/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Konsola yaz
    new winston.transports.Console(),
    // Hataları bir dosyaya yaz
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // Tüm logları bir dosyaya yaz
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

module.exports = logger;