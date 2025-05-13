// Extreme memory optimization script for large file processing
const fs = require('fs');
const path = require('path');

console.log('🔧 EXTREME MEMORY OPTIMIZATION 🔧');
console.log('This script will modify your server to handle very large files with limited memory');

// Create optimized .env file
const createEnvFile = () => {
  console.log('\n📝 Creating optimized .env file...');
  const envContent = `# Server configuration
PORT=3001

# EXTREME Memory optimization settings
DEFAULT_CHUNK_SIZE=50
DEFAULT_BATCH_SIZE=10
FORCE_GC_INTERVAL=1000
HIGH_MEMORY_THRESHOLD=512
MAX_ROWS=50000
CONCURRENT_PROCESSING=1
LOW_MEMORY_MODE=true

# Network settings
FETCH_TIMEOUT=120000
RETRY_COUNT=3
RETRY_DELAY=3000

# File processing
TEMP_FILE_CLEANUP_INTERVAL=3600000
`;

  fs.writeFileSync(path.join(__dirname, '.env.extreme'), envContent);
  console.log('✅ Created .env.extreme file with extremely optimized settings');
  console.log('   Copy this to .env to use: copy .env.extreme .env');
};

// Create a streamlined startup script with memory limits
const createStartupScript = () => {
  console.log('\n📝 Creating optimized startup script...');
  const scriptContent = `// Optimized server startup with memory limits
const { execSync } = require('child_process');
const fs = require('fs');

// Check available memory
const mem = process.memoryUsage();
console.log('Available memory:', Math.round(mem.heapTotal / 1024 / 1024), 'MB');

// Set appropriate memory limit based on available system memory
const memoryLimit = Math.min(3072, Math.max(1024, Math.round(mem.heapTotal / 1024 / 1024)));
console.log(\`Setting memory limit to \${memoryLimit}MB\`);

// Enable garbage collection
const gcFlags = '--expose-gc';

// Options that help with memory usage
const v8Flags = '--optimize-for-size --max-old-space-size=' + memoryLimit + ' --gc-interval=100';

// Check if we're using the extreme optimized .env file
if (!fs.existsSync('.env') && fs.existsSync('.env.extreme')) {
  console.log('No .env file found. Copying .env.extreme to .env...');
  fs.copyFileSync('.env.extreme', '.env');
}

// Start the server with memory optimizations
const command = \`node \${gcFlags} \${v8Flags} src/server/index.js\`;
console.log('Starting server with command:', command);

try {
  execSync(command, { stdio: 'inherit' });
} catch (error) {
  console.error('Error starting server:', error);
  process.exit(1);
}`;

  fs.writeFileSync(path.join(__dirname, 'start-optimized.js'), scriptContent);
  console.log('✅ Created start-optimized.js script');
  console.log('   Run this with: node start-optimized.js');
};

// Create a modified version of the uploadHandler with extreme optimizations
const patchUploadHandler = () => {
  console.log('\n📝 Creating patch for uploadHandler.js...');
  
  // Read the current file
  const uploadHandlerPath = path.join(__dirname, 'src', 'server', 'uploadHandler.js');
  if (!fs.existsSync(uploadHandlerPath)) {
    console.error('❌ Could not find uploadHandler.js at', uploadHandlerPath);
    return;
  }
  
  let content = fs.readFileSync(uploadHandlerPath, 'utf8');
  
  // Make a backup of the original file
  const backupPath = path.join(__dirname, 'src', 'server', 'uploadHandler.js.backup');
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, content);
    console.log('✅ Created backup of uploadHandler.js');
  }
  
  // Patch 1: Reduce default chunk and batch sizes in processProductFileInChunks
  console.log('   Patching chunk and batch size defaults...');
  content = content.replace(
    /const chunkSize = job\.chunk_size \|\| config\.defaultChunkSize \|\| 250;/g,
    'const chunkSize = job.chunk_size || config.defaultChunkSize || 50; // Extremely reduced for memory optimization'
  );
  
  content = content.replace(
    /const batchSize = job\.batch_size \|\| config\.defaultBatchSize \|\| 50;/g,
    'const batchSize = job.batch_size || config.defaultBatchSize || 10; // Extremely reduced for memory optimization'
  );
  
  // Patch 2: Add stream backpressure management
  console.log('   Adding stream backpressure management...');
  content = content.replace(
    /fileStream\.pause\(\);/g,
    'fileStream.pause();\n          // Give the event loop time to catch up and handle backpressure\n          await new Promise(resolve => setTimeout(resolve, 50));'
  );
  
  // Patch 3: Add more aggressive throttling based on memory
  console.log('   Adding more aggressive memory throttling...');
  const memoryCheckCode = `
  // Track memory usage and implement aggressive throttling
  let lastMemoryCheck = Date.now();
  let gcInterval = null;
  let throttleDelay = 0; // Dynamic throttling delay
  let highMemCount = 0; // Count consecutive high memory events
  
  // Set up garbage collection interval for all file sizes in extreme mode
  if (global.gc) {
    console.log(\`Setting up forced garbage collection interval for file processing\`);
    gcInterval = setInterval(() => {
      try {
        const memUsage = process.memoryUsage();
        const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const memPct = Math.round(memUsage.heapUsed / memUsage.heapTotal * 100);
        console.log(\`Memory usage: \${memUsageMB}MB / \${Math.round(memUsage.heapTotal / 1024 / 1024)}MB (\${memPct}%)\`);
        
        // Aggressive throttling based on memory usage
        if (memUsageMB > (config.highMemoryThreshold || 512)) {
          highMemCount++;
          throttleDelay = Math.min(5000, throttleDelay + 1000); // Increase throttling aggressively
          
          // If memory is critically high, force garbage collection and pause longer
          if (memPct > 90 || highMemCount > 3) {
            console.log(\`CRITICAL: Memory usage is \${memPct}% - forcing GC and adding extra delay\`);
            global.gc();
            return new Promise(resolve => setTimeout(resolve, 1000)).then(() => {
              global.gc(); // Double GC to be thorough
              highMemCount = 0; // Reset after taking action
            });
          }
          
          console.log(\`High memory usage detected (\${memUsageMB}MB), setting throttle delay to \${throttleDelay}ms\`);
        } else if (throttleDelay > 0 && memUsageMB < ((config.highMemoryThreshold || 512) * 0.6)) {
          // If memory usage is below 60% of threshold, reduce throttling
          throttleDelay = Math.max(0, throttleDelay - 500);
          highMemCount = Math.max(0, highMemCount - 1);
          console.log(\`Memory usage acceptable (\${memUsageMB}MB), reducing throttle delay to \${throttleDelay}ms\`);
        }
        
        global.gc();
        console.log('Forced garbage collection complete');
      } catch (err) {
        console.error('Error during garbage collection:', err);
      }
    }, config.forceGCInterval || 1000);
  }`;
  
  // Find where to insert new memory handling code in product file processing
  const funcStart = content.indexOf('async function processProductFileInChunks');
  if (funcStart === -1) {
    console.log('❌ Could not find processProductFileInChunks function');
  } else {
    const insertPosition = content.indexOf('let totalProcessed = 0;', funcStart) + 'let totalProcessed = 0;'.length;
    if (insertPosition !== -1) {
      // Replace existing memory tracking section
      const existingMemTrackingStart = content.indexOf('// Track memory usage', funcStart);
      const existingMemTrackingEnd = content.indexOf('let lastUpdateTime = Date.now();', funcStart);
      
      if (existingMemTrackingStart !== -1 && existingMemTrackingEnd !== -1) {
        content = content.substring(0, existingMemTrackingStart) + memoryCheckCode + content.substring(existingMemTrackingEnd);
        console.log('✅ Replaced memory tracking code');
      } else {
        // Insert new memory tracking code
        content = content.slice(0, insertPosition) + memoryCheckCode + content.slice(insertPosition);
        console.log('✅ Added memory tracking code');
      }
    }
  }
  
  // Patch 4: Add chunk processing timeout to prevent memory build-up
  console.log('   Adding processing timeouts...');
  const timeoutCode = `
          // Add timeout protection to prevent processing from hanging
          const chunkProcessingPromise = processProductChunk(currentChunk, job, fieldMapping, results);
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Chunk processing timeout')), 60000);
          });
          
          try {
            await Promise.race([chunkProcessingPromise, timeoutPromise]);
            totalProcessed += currentChunk.length;
            currentChunk = [];
          } catch (error) {
            console.error('Error or timeout processing product chunk:', error);
            // Force reset of current chunk if timeout occurred
            if (error.message === 'Chunk processing timeout') {
              console.warn('TIMEOUT: Forcing chunk reset to prevent memory issues');
              currentChunk = [];
              // Force garbage collection
              if (global.gc) {
                global.gc();
                console.log('Forced garbage collection after timeout');
              }
            }
          }`;
  
  // Replace the existing chunk processing section
  content = content.replace(
    /try {\s+await processProductChunk\(currentChunk, job, fieldMapping, results\);\s+totalProcessed \+= currentChunk\.length;\s+currentChunk = \[\];/g,
    timeoutCode
  );
  
  // Patch 5: Add memory decompression protection
  console.log('   Adding memory decompression protection...');
  const streamOptions = `      // Set up aggressive stream handling to prevent memory issues
      const streamOptions = { 
        encoding: 'utf8',
        highWaterMark: 16 * 1024, // Smaller buffer size of 16KB
        emitClose: true,
        autoDestroy: true
      };
      console.log('Creating read stream for product file with options:', streamOptions);
      const fileStream = fs.createReadStream(job.file_path, streamOptions);
    
      // Set up CSV parser with strict limits
      const csvOptions = {
        skipLines: 0,
        maxRows: config.maxRows || 50000, // Hard limit on rows
        strict: false, // Be more forgiving with CSV format
        objectMode: true,
        highWaterMark: 50 // Process fewer objects at once
      };
      console.log('CSV parser options:', csvOptions);`;
  
  // Replace the existing stream creation
  content = content.replace(
    /console\.log\('Creating read stream for product file\.\.\.'\);\s+const fileStream = fs\.createReadStream\(job\.file_path, { encoding: 'utf8' }\);/g,
    streamOptions
  );
  
  // Also update the CSV pipe setup
  content = content.replace(
    /fileStream\s+\.pipe\(csv\(\)\)/g,
    'fileStream\n      .pipe(csv(csvOptions))'
  );
  
  // Patch 6: Implement low memory mode with hard limits
  console.log('   Implementing low memory mode with hard limits...');
  const lowMemoryCode = `    // Apply low memory mode if configured
    if (config.lowMemoryMode) {
      console.log('🚨 RUNNING IN LOW MEMORY MODE 🚨');
      
      // Override values with extremely conservative settings
      if (chunkSize > 50) {
        console.log(\`Overriding chunk size \${chunkSize} with 50 due to low memory mode\`);
        chunkSize = 50;
      }
      
      if (batchSize > 10) {
        console.log(\`Overriding batch size \${batchSize} with 10 due to low memory mode\`);
        batchSize = 10;
      }
      
      // Hard limit on total rows to process in low memory mode
      const hardRowLimit = config.maxRows || 50000;
      if (totalRows > hardRowLimit) {
        console.warn(\`🚨 WARNING: File contains \${totalRows} rows, but low memory mode limits to \${hardRowLimit}\`);
        console.warn('The import will be truncated. Process your file in smaller chunks for complete import.');
        
        // Update job to warn user
        await updateJobStatus(job.id, 'processing', 
          \`WARNING: File is too large (\${totalRows} rows). Only processing first \${hardRowLimit} rows in low memory mode.\`);
        
        totalRows = hardRowLimit;
      }
    }`;
  
  // Insert low memory mode code
  const insertPoint = content.indexOf('console.log(`Processing product file in chunks. Batch size: ${batchSize}, Chunk size: ${chunkSize}, Estimated total rows: ${totalRows}`);');
  if (insertPoint !== -1) {
    content = content.slice(0, insertPoint) + lowMemoryCode + '\n\n  ' + content.slice(insertPoint);
    console.log('✅ Added low memory mode code');
  }
  
  // Patch 7: Add memory safeguards to mapProductData
  console.log('   Adding memory safeguards to data mapping functions...');
  
  // Add batch processing to mapProductData
  const mapProductDataStart = content.indexOf('async function mapProductData(csvData, fieldMapping');
  if (mapProductDataStart !== -1) {
    const functionStart = content.indexOf('{', mapProductDataStart) + 1;
    
    const batchProcessingCode = `
    // Process in small batches to prevent memory issues
    console.log(\`Map product data called with \${csvData.length} rows\`);
    
    // In low memory mode, process in very small batches
    const batchSize = config.lowMemoryMode ? 50 : 500;
    const totalBatches = Math.ceil(csvData.length / batchSize);
    
    if (csvData.length > batchSize) {
      console.log(\`Breaking data mapping into \${totalBatches} batches of \${batchSize} rows each\`);
    }
    
    const mappedData = [];
    
    // Process in batches
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, csvData.length);
      const batch = csvData.slice(start, end);
      
      console.log(\`Processing batch \${batchIndex + 1}/\${totalBatches} (\${batch.length} rows)\`);
      
      // Force GC between batches if available
      if (global.gc && batchIndex > 0) {
        global.gc();
      }
      
      // Process this batch
`;
    
    const batchClosingCode = `
      // Allow event loop to continue before next batch
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }`;
    
    // Find the main loop
    const mainLoopStart = content.indexOf('for (const row of csvData) {', mapProductDataStart);
    const mainLoopEnd = content.indexOf('console.log(`Mapping complete. ${mappedData.length} valid products of ${csvData.length} total`);', mapProductDataStart);
    
    if (mainLoopStart !== -1 && mainLoopEnd !== -1) {
      // Extract the loop content
      const loopContent = content.substring(mainLoopStart, mainLoopEnd);
      
      // Replace csvData with batch
      const modifiedLoopContent = loopContent.replace(/csvData/g, 'batch');
      
      // Construct the new function content
      const newContent = 
        content.substring(functionStart, mainLoopStart) + 
        batchProcessingCode + 
        modifiedLoopContent +
        batchClosingCode +
        content.substring(mainLoopEnd);
      
      // Replace the function content
      content = content.substring(0, functionStart) + newContent;
      console.log('✅ Modified mapProductData with batch processing');
    }
  }
  
  // Patch 8: Add dynamic throttling to importProductData
  const importProductDataStart = content.indexOf('async function importProductData(mappedData, progressCallback, batchSize)');
  if (importProductDataStart !== -1) {
    const batchLoopStart = content.indexOf('for (let i = 0; i < mappedData.length; i += batchSize) {', importProductDataStart);
    if (batchLoopStart !== -1) {
      const delayCode = `
      // Apply dynamic throttling between batches
      if (i + batchSize < mappedData.length) {
        // Check memory to determine delay
        const memUsage = process.memoryUsage();
        const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const memPct = Math.round(memUsage.heapUsed / memUsage.heapTotal * 100);
        
        let throttleDelay = 100; // base delay
        
        // Adjust delay based on memory pressure
        if (memPct > 85) throttleDelay = 2000;
        else if (memPct > 75) throttleDelay = 1000;
        else if (memPct > 60) throttleDelay = 500;
        
        console.log(\`Memory at \${memPct}%, waiting \${throttleDelay}ms before next batch\`);
        await new Promise(resolve => setTimeout(resolve, throttleDelay));
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          console.log('Forced garbage collection between batches');
        }
      }`;
      
      // Find the existing delay code
      const existingDelayStart = content.indexOf('// Add a small delay between batches', importProductDataStart);
      const existingDelayEnd = content.indexOf('await new Promise(resolve => setTimeout(resolve, 200));', existingDelayStart) + 'await new Promise(resolve => setTimeout(resolve, 200));'.length;
      
      if (existingDelayStart !== -1 && existingDelayEnd !== -1) {
        // Replace the existing delay code
        content = content.substring(0, existingDelayStart) + delayCode + content.substring(existingDelayEnd);
        console.log('✅ Enhanced throttling in importProductData');
      }
    }
  }
  
  // Save modified file
  const outputPath = path.join(__dirname, 'src', 'server', 'uploadHandler.js.optimized');
  fs.writeFileSync(outputPath, content);
  console.log('✅ Created optimized version at', outputPath);
  console.log('   To apply these changes:');
  console.log('   1. Rename uploadHandler.js.optimized to uploadHandler.js');
  console.log('   2. Restart your server with: node start-optimized.js');
};

// Create additional script to monitor memory usage
const createMemoryMonitor = () => {
  console.log('\n📝 Creating memory monitoring script...');
  const monitorScript = `// Memory monitoring script
const fs = require('fs');

// Output file
const outputFile = 'memory-log.csv';
fs.writeFileSync(outputFile, 'timestamp,heapUsed,heapTotal,external,arrayBuffers,rss\\n');

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
  console.log(\`[\${now}] Heap: \${heapUsedMB}MB/\${heapTotalMB}MB, External: \${externalMB}MB, Buffers: \${arrayBuffersMB}MB, RSS: \${rssMB}MB\`);
  
  // Log to CSV
  fs.appendFileSync(outputFile, \`\${now},\${heapUsedMB},\${heapTotalMB},\${externalMB},\${arrayBuffersMB},\${rssMB}\\n\`);
}, 1000);`;

  fs.writeFileSync(path.join(__dirname, 'monitor-memory.js'), monitorScript);
  console.log('✅ Created monitor-memory.js script');
  console.log('   Run this alongside your server with: node monitor-memory.js');
};

// Create script to analyze and split large CSV files
const createFileSplitter = () => {
  console.log('\n📝 Creating CSV file splitter script...');
  const splitterScript = `// CSV file splitter for large import files
const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Check command line arguments
if (process.argv.length < 4) {
  console.log('Usage: node split-csv.js <input-file.csv> <rows-per-file>');
  console.log('Example: node split-csv.js large-products.csv 5000');
  process.exit(1);
}

const inputFile = process.argv[2];
const rowsPerFile = parseInt(process.argv[3]) || 5000;

if (!fs.existsSync(inputFile)) {
  console.error(\`Error: File not found: \${inputFile}\`);
  process.exit(1);
}

console.log(\`Splitting \${inputFile} into chunks of \${rowsPerFile} rows...\`);

// Create output directory
const fileBaseName = path.basename(inputFile, '.csv');
const outputDir = \`\${fileBaseName}-split\`;

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Read the header line first
const inputStream = fs.createReadStream(inputFile, { encoding: 'utf8' });
const reader = readline.createInterface({ input: inputStream });

let headerLine = '';
let currentFileIndex = 1;
let currentRowCount = 0;
let totalRowCount = 0;
let outputStream = null;

reader.on('line', (line) => {
  // First line is the header
  if (!headerLine) {
    headerLine = line;
    // Open the first output file
    const outputFile = path.join(outputDir, \`\${fileBaseName}-\${currentFileIndex}.csv\`);
    outputStream = fs.createWriteStream(outputFile);
    outputStream.write(\`\${headerLine}\\n\`);
    console.log(\`Created output file: \${outputFile}\`);
    return;
  }
  
  // Write data line to current output file
  outputStream.write(\`\${line}\\n\`);
  currentRowCount++;
  totalRowCount++;
  
  // If we've reached the target row count, start a new file
  if (currentRowCount >= rowsPerFile) {
    // Close current file
    outputStream.end();
    
    // Increment file index and reset row count
    currentFileIndex++;
    currentRowCount = 0;
    
    // Open new file
    const outputFile = path.join(outputDir, \`\${fileBaseName}-\${currentFileIndex}.csv\`);
    outputStream = fs.createWriteStream(outputFile);
    outputStream.write(\`\${headerLine}\\n\`); // Write header
    console.log(\`Created output file: \${outputFile}\`);
  }
});

reader.on('close', () => {
  if (outputStream) {
    outputStream.end();
  }
  
  console.log(\`✅ Split complete!\`);
  console.log(\`Total rows processed: \${totalRowCount}\`);
  console.log(\`Created \${currentFileIndex} files in the \${outputDir} directory\`);
  console.log(\`Each file contains the header row plus up to \${rowsPerFile} data rows\`);
  console.log(\`\nTo import these files:\`);
  console.log(\`1. Start with the optimized server: node start-optimized.js\`);
  console.log(\`2. Import each file separately through your app\`);
});`;

  fs.writeFileSync(path.join(__dirname, 'split-csv.js'), splitterScript);
  console.log('✅ Created split-csv.js script');
  console.log('   Use this to split large CSV files: node split-csv.js large-file.csv 5000');
};

// Execute all optimization functions
createEnvFile();
createStartupScript();
patchUploadHandler();
createMemoryMonitor();
createFileSplitter();

console.log('\n✅ Optimization script complete!');
console.log('\nTo apply these optimizations:');
console.log('1. Copy the optimized environment variables: copy .env.extreme .env');
console.log('2. Apply the patched uploadHandler: rename src/server/uploadHandler.js.optimized to src/server/uploadHandler.js');
console.log('3. For very large files, split them first: node split-csv.js your-large-file.csv 5000');
console.log('4. Start server with memory limits: node start-optimized.js');
console.log('\nFor monitoring memory usage while your server is running:');
console.log('node monitor-memory.js');
console.log('\nHappy importing!'); 