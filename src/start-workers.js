// src/start-workers.js
const { spawn } = require('child_process');

const workerCount = 3;
for (let i = 0; i < workerCount; i++) {
  spawn('node', ['src/queue.js'], { stdio: 'inherit' });
}
console.log(`${workerCount} workers started`);