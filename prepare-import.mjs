// Import preparation script for large CSV files
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a readline interface for user input
const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🚀 LARGE FILE IMPORT PREPARATION TOOL 🚀');
console.log('This tool will help you prepare large CSV files for import');
console.log('=====================================================\n');

// Prompt the user for the file path
const promptForFile = () => {
  return new Promise((resolve) => {
    rl.question('Enter the path to your CSV file: ', (filePath) => {
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Error: File not found at ${filePath}`);
        return promptForFile().then(resolve);
      }
      resolve(filePath);
    });
  });
};

// Prompt for batch size
const promptForBatchSize = () => {
  return new Promise((resolve) => {
    rl.question('How many rows per file? (recommended: 2000-5000) [5000]: ', (answer) => {
      const batchSize = parseInt(answer) || 5000;
      resolve(batchSize);
    });
  });
};

// Count rows in a file
const countRows = (filePath) => {
  return new Promise((resolve) => {
    let lineCount = 0;
    const s = fs.createReadStream(filePath);
    s.on('data', (chunk) => {
      for (let i=0; i < chunk.length; ++i) {
        if (chunk[i] === 10) lineCount++;
      }
    });
    s.on('end', () => {
      resolve(lineCount);
    });
  });
};

// Split a CSV file into smaller chunks
const splitFile = async (filePath, rowsPerFile) => {
  console.log(`\nSplitting ${filePath} into chunks of ${rowsPerFile} rows...`);
  
  // Create output directory
  const fileBaseName = path.basename(filePath, '.csv');
  const outputDir = path.join(path.dirname(filePath), `${fileBaseName}-split`);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  
  // Read the header line first
  const inputStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const reader = readline.createInterface({ input: inputStream });
  
  let headerLine = '';
  let currentFileIndex = 1;
  let currentRowCount = 0;
  let totalRowCount = 0;
  let outputStream = null;
  
  return new Promise((resolve) => {
    reader.on('line', (line) => {
      // First line is the header
      if (!headerLine) {
        headerLine = line;
        // Open the first output file
        const outputFile = path.join(outputDir, `${fileBaseName}-${currentFileIndex}.csv`);
        outputStream = fs.createWriteStream(outputFile);
        outputStream.write(`${headerLine}\n`);
        console.log(`Created output file: ${outputFile}`);
        return;
      }
      
      // Write data line to current output file
      outputStream.write(`${line}\n`);
      currentRowCount++;
      totalRowCount++;
      
      // Show progress
      if (totalRowCount % 10000 === 0) {
        process.stdout.write(`Processed ${totalRowCount} rows...\r`);
      }
      
      // If we've reached the target row count, start a new file
      if (currentRowCount >= rowsPerFile) {
        // Close current file
        outputStream.end();
        
        // Increment file index and reset row count
        currentFileIndex++;
        currentRowCount = 0;
        
        // Open new file
        const outputFile = path.join(outputDir, `${fileBaseName}-${currentFileIndex}.csv`);
        outputStream = fs.createWriteStream(outputFile);
        outputStream.write(`${headerLine}\n`); // Write header
        console.log(`Created output file: ${outputFile}`);
      }
    });
    
    reader.on('close', () => {
      if (outputStream) {
        outputStream.end();
      }
      
      console.log(`\n\n✅ Split complete!`);
      console.log(`Total rows processed: ${totalRowCount}`);
      console.log(`Created ${currentFileIndex} files in: ${outputDir}`);
      
      resolve({
        outputDir,
        fileCount: currentFileIndex,
        totalRows: totalRowCount,
        fileBaseName
      });
    });
  });
};

// Generate instructions for importing
const generateInstructions = (result) => {
  console.log('\n\n📋 IMPORT INSTRUCTIONS 📋');
  console.log('=========================');
  console.log('1. Start the server with memory optimizations:');
  console.log('   node start-optimized.mjs');
  console.log('\n2. Import each file separately, waiting for one to complete before starting the next:');
  
  for (let i = 1; i <= result.fileCount; i++) {
    console.log(`   - ${result.fileBaseName}-${i}.csv (${i} of ${result.fileCount})`);
  }
  
  console.log('\n3. Monitor memory usage while importing:');
  console.log('   node monitor-memory.mjs');
  
  console.log('\nNotes:');
  console.log('- Each file has approximately 1/' + result.fileCount + ' of the original data');
  console.log('- Wait for each import to fully complete before starting the next one');
  console.log('- If you encounter memory issues, try reducing the rows per file');
};

// Main function
const main = async () => {
  try {
    const filePath = await promptForFile();
    
    // Count rows in the file
    console.log('Counting rows in the file...');
    const rowCount = await countRows(filePath);
    console.log(`File contains approximately ${rowCount} rows`);
    
    // Estimate memory requirements
    const estimatedMemoryPerRow = 0.5; // MB per 1000 rows (rough estimate)
    const estimatedTotalMemory = Math.round(rowCount * estimatedMemoryPerRow / 1000);
    console.log(`Estimated memory required for full import: ~${estimatedTotalMemory}MB`);
    
    // Recommend batch size based on row count
    let recommendedBatchSize = 5000;
    if (rowCount > 100000) recommendedBatchSize = 2000;
    if (rowCount > 500000) recommendedBatchSize = 1000;
    
    console.log(`\nRecommended batch size for your file: ${recommendedBatchSize} rows per file`);
    const batchSize = await promptForBatchSize();
    
    // Split the file
    const result = await splitFile(filePath, batchSize);
    
    // Generate instructions
    generateInstructions(result);
    
    console.log('\n✅ File preparation complete!');
    rl.close();
  } catch (error) {
    console.error('An error occurred:', error);
    rl.close();
  }
};

// Run the main function
main(); 