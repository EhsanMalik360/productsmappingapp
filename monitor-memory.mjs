// Memory monitoring script
import fs from 'fs';

// Output file
const outputFile = 'memory-log.csv';
fs.writeFileSync(outputFile, 'timestamp,heapUsed,heapTotal,external,arrayBuffers,rss\n');

console.log('Memory monitoring started. Press Ctrl+C to stop.');
console.log('Logging to', outputFile);

// Log memory usage every second
setInterval(() => {
  const mem = process.memoryUsage();
  const now = new Date().toISOString();
  
  // Convert bytes to MB for better readability
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const externalMB = Math.round(mem.external / 1024 / 1024);
  const arrayBuffersMB = Math.round(mem.arrayBuffers / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  
  // Display in console
  console.log(`[${now}] Heap: ${heapUsedMB}MB/${heapTotalMB}MB, External: ${externalMB}MB, Buffers: ${arrayBuffersMB}MB, RSS: ${rssMB}MB`);
  
  // Log to CSV
  fs.appendFileSync(outputFile, `${now},${heapUsedMB},${heapTotalMB},${externalMB},${arrayBuffersMB},${rssMB}\n`);
}, 1000);