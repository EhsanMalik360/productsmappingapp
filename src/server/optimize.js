/**
 * Memory optimization module for Amazon Product Analysis
 * 
 * This module applies memory optimization settings when imported
 * without disrupting your existing deployment.
 * 
 * Usage: Simply require/import this file at the TOP of your src/server/index.js
 * Example: require('./optimize'); // At the very top of index.js
 */

console.log('🚀 Applying memory optimizations...');

// Check available memory
const mem = process.memoryUsage();
console.log('Available memory:', Math.round(mem.heapTotal / 1024 / 1024), 'MB');

// Apply optimization settings
process.env.EXTREME_OPTIMIZATION = 'true';
process.env.DEFAULT_CHUNK_SIZE = '50';
process.env.DEFAULT_BATCH_SIZE = '10';
process.env.FORCE_GC_INTERVAL = '1000';
process.env.HIGH_MEMORY_THRESHOLD = '512';
process.env.MAX_ROWS = '50000';
process.env.CONCURRENT_PROCESSING = '1';
process.env.LOW_MEMORY_MODE = 'true';
process.env.CSV_HIGH_WATER_MARK = '16';
process.env.CSV_OBJECT_HIGH_WATER_MARK = '50';

// Configure garbage collection
try {
  // Only run optimization if we're in production/server mode
  const isProductionServer = process.argv[1] && process.argv[1].includes('index.js');
  
  if (isProductionServer) {
    // Set up garbage collection interval if available
    if (global.gc) {
      console.log('✅ Garbage collection is available');
      
      // Schedule regular GC
      const gcInterval = setInterval(() => {
        try {
          const memBefore = process.memoryUsage();
          global.gc();
          const memAfter = process.memoryUsage();
          
          // Calculate freed memory
          const freedMB = Math.round((memBefore.heapUsed - memAfter.heapUsed) / (1024 * 1024));
          
          if (freedMB > 5) {
            console.log(`Garbage collection freed ${freedMB}MB of memory`);
          }
        } catch (err) {
          console.error('Error during garbage collection:', err);
        }
      }, parseInt(process.env.FORCE_GC_INTERVAL) || 30000);
      
      // Clean up on exit
      process.on('exit', () => {
        clearInterval(gcInterval);
      });
    } else {
      console.log('⚠️ Garbage collection is not available. For best performance, start Node with --expose-gc flag.');
    }
    
    console.log('ℹ️ Memory optimization settings applied:');
    console.log('- Chunk Size:', process.env.DEFAULT_CHUNK_SIZE);
    console.log('- Batch Size:', process.env.DEFAULT_BATCH_SIZE);
    console.log('- Low Memory Mode:', process.env.LOW_MEMORY_MODE);
  }
} catch (error) {
  console.error('Error setting up memory optimizations:', error);
} 