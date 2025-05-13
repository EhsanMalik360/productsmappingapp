/**
 * Deployment helper script for memory optimizations
 * This script doesn't change your deployment process, but provides
 * a way to add optimizations to any deployment environment.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Preparing memory optimizations for deployment...');

// Create optimize.js file in src/server if it doesn't exist
const optimizePath = path.join(__dirname, 'src/server/optimize.js');
if (!fs.existsSync(optimizePath)) {
  console.log('Creating optimize.js in server directory...');
  
  // Create directory if it doesn't exist
  const serverDir = path.join(__dirname, 'src/server');
  if (!fs.existsSync(serverDir)) {
    fs.mkdirSync(serverDir, { recursive: true });
  }
  
  const optimizeContent = `/**
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
            console.log(\`Garbage collection freed \${freedMB}MB of memory\`);
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
}`;
  
  fs.writeFileSync(optimizePath, optimizeContent);
  console.log('✅ Created optimize.js');
}

// Check if index.js already imports optimize.js
const indexPath = path.join(__dirname, 'src/server/index.js');
if (fs.existsSync(indexPath)) {
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  
  if (!indexContent.includes('require(\'./optimize\')') && !indexContent.includes('require("./optimize")')) {
    console.log('Adding optimization import to index.js...');
    
    // Create backup
    fs.writeFileSync(`${indexPath}.bak`, indexContent);
    console.log('Created backup of index.js');
    
    // Add optimization import
    const updatedContent = `// Import memory optimization module first
try {
  require('./optimize');
} catch (e) {
  console.warn('Memory optimization module not loaded:', e.message);
}

${indexContent}`;
    
    fs.writeFileSync(indexPath, updatedContent);
    console.log('✅ Updated index.js with optimization import');
  } else {
    console.log('✅ index.js already imports optimize.js');
  }
} else {
  console.warn('⚠️ Could not find src/server/index.js');
}

console.log('\n🎉 Optimization setup complete!');
console.log('\nYour deployment can now handle large files more efficiently.');
console.log('No changes were made to your deployment process - simply deploy as usual.');
console.log('\nFor best results, add the --expose-gc flag to your Node.js process:');
console.log('NODE_OPTIONS="--expose-gc" npm run server'); 