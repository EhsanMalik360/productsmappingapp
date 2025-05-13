// Script to optimize Amazon product imports for low memory environments
const fs = require('fs');
const path = require('path');

// Path to server config.js
const configPath = path.join(__dirname, 'src', 'server', 'config.js');
// Path to product chunk processing file
const uploadHandlerPath = path.join(__dirname, 'src', 'server', 'uploadHandler.js');

// Create a .env file for memory optimization
const createEnvFile = () => {
  console.log('Creating optimized .env file...');
  const envContent = `# Server configuration
PORT=3001

# Memory optimization settings for Amazon Product Imports
DEFAULT_CHUNK_SIZE=250
DEFAULT_BATCH_SIZE=50
FORCE_GC_INTERVAL=2000
HIGH_MEMORY_THRESHOLD=1024
MAX_ROWS=500000

# Network settings
FETCH_TIMEOUT=120000
RETRY_COUNT=3
RETRY_DELAY=3000

# File processing
TEMP_FILE_CLEANUP_INTERVAL=3600000
`;

  fs.writeFileSync(path.join(__dirname, '.env.optimize'), envContent);
  console.log('✅ Created .env.optimize file with optimized settings');
  console.log('   Copy this to .env to use these settings: copy .env.optimize .env');
};

// Optimize the product file chunk processing function
const optimizeProductFileChunkProcessing = () => {
  console.log('Optimizing product file chunk processing...');
  
  try {
    // Read the uploadHandler.js file
    let content = fs.readFileSync(uploadHandlerPath, 'utf8');
    
    // Find the processProductFileInChunks function
    const funcStart = content.indexOf('async function processProductFileInChunks');
    if (funcStart === -1) {
      console.log('❌ Could not find processProductFileInChunks function');
      return;
    }
    
    // Replace the hardcoded chunk size with a configurable one
    content = content.replace(
      /const chunkSize = 5000;/g,
      'const chunkSize = job.chunk_size || config.defaultChunkSize || 250; // Use smaller chunks for memory optimization'
    );
    
    // Add memory monitoring and throttling similar to supplier import process
    const memoryMonitoringCode = `
  // Track memory usage and implement throttling
  let lastMemoryCheck = Date.now();
  let gcInterval = null;
  let throttleDelay = 0; // Dynamic throttling delay
  
  // Set up garbage collection interval for large files
  if (global.gc && totalRows > 5000) {
    console.log(\`Setting up forced garbage collection interval for product file processing\`);
    gcInterval = setInterval(() => {
      try {
        const memUsage = process.memoryUsage();
        const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        console.log(\`Memory usage: \${memUsageMB}MB / \${Math.round(memUsage.heapTotal / 1024 / 1024)}MB (\${Math.round(memUsage.heapUsed / memUsage.heapTotal * 100)}%)\`);
        
        // Adjust throttling based on memory usage
        if (memUsageMB > (config.highMemoryThreshold || 1024)) {
          throttleDelay = Math.min(2000, throttleDelay + 500); // Increase throttling gradually
          console.log(\`High memory usage detected (\${memUsageMB}MB), setting throttle delay to \${throttleDelay}ms\`);
        } else if (throttleDelay > 0 && memUsageMB < ((config.highMemoryThreshold || 1024) * 0.7)) {
          // If memory usage is below 70% of threshold, reduce throttling
          throttleDelay = Math.max(0, throttleDelay - 500);
          console.log(\`Memory usage acceptable (\${memUsageMB}MB), reducing throttle delay to \${throttleDelay}ms\`);
        }
        
        global.gc();
        console.log('Forced garbage collection complete');
      } catch (err) {
        console.error('Error during garbage collection:', err);
      }
    }, config.forceGCInterval || 5000);
  }`;
    
    // Find the position to insert the memory monitoring code (after the declaration of totalProcessed)
    const insertPosition = content.indexOf('let totalProcessed = 0;', funcStart) + 'let totalProcessed = 0;'.length;
    
    // Insert the memory monitoring code
    content = content.slice(0, insertPosition) + memoryMonitoringCode + content.slice(insertPosition);
    
    // Add throttling before processing chunks
    content = content.replace(
      /console\.log\(`Processing product chunk of \${currentChunk\.length} rows\.\.\.\`\);/g,
      `console.log(\`Processing product chunk of \${currentChunk.length} rows...\`);
          
          // Apply throttling if necessary
          if (throttleDelay > 0) {
            console.log(\`Throttling processing for \${throttleDelay}ms to manage memory usage\`);
            await new Promise(resolve => setTimeout(resolve, throttleDelay));
          }
          
          // Check memory usage before processing chunk
          const memoryUsage = process.memoryUsage();
          const memoryUsageMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
          console.log(\`Current memory usage: \${memoryUsageMB}MB\`);`
    );
    
    // Add cleanup of the garbage collection interval
    content = content.replace(
      /console\.log\(`File processing complete\. Total rows processed: \${totalProcessed}\`\);/g,
      `console.log(\`File processing complete. Total rows processed: \${totalProcessed}\`);
      
      // Clear the garbage collection interval if set
      if (gcInterval) {
        clearInterval(gcInterval);
        console.log('Cleared garbage collection interval');
      }`
    );
    
    // Add memory-optimized product batch size
    content = content.replace(
      /const batchSize = job\.batch_size \|\| 100;/g, 
      'const batchSize = job.batch_size || config.defaultBatchSize || 50; // Use smaller batches for memory optimization'
    );
    
    // Save the modified content to a backup file
    fs.writeFileSync(uploadHandlerPath + '.optimized', content);
    console.log('✅ Created optimized version of uploadHandler.js');
    console.log('   Review the changes in uploadHandler.js.optimized and apply them manually');
  } catch (error) {
    console.error('❌ Error optimizing file:', error);
  }
};

// Run the optimizations
console.log('🚀 Starting Amazon Product Import Optimization');
createEnvFile();
optimizeProductFileChunkProcessing();
console.log('\n✅ Optimization complete!');
console.log('\nTo apply the optimizations:');
console.log('1. Copy .env.optimize to .env');
console.log('2. Review and apply the changes from uploadHandler.js.optimized to uploadHandler.js');
console.log('3. Restart your server with: node --max-old-space-size=4096 src/server/index.js');
console.log('\nThese changes will significantly reduce memory usage during Amazon product imports.'); 