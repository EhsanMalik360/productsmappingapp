// CSV file splitter for large import files
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
  console.error(`Error: File not found: ${inputFile}`);
  process.exit(1);
}

console.log(`Splitting ${inputFile} into chunks of ${rowsPerFile} rows...`);

// Create output directory
const fileBaseName = path.basename(inputFile, '.csv');
const outputDir = `${fileBaseName}-split`;

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
  
  // Show progress periodically
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
  
  console.log(`\n✅ Split complete!`);
  console.log(`Total rows processed: ${totalRowCount}`);
  console.log(`Created ${currentFileIndex} files in the ${outputDir} directory`);
  console.log(`Each file contains the header row plus up to ${rowsPerFile} data rows`);
  console.log(`\nTo import these files:`);
  console.log(`1. Start with the optimized server: node start-optimized.js`);
  console.log(`2. Import each file separately through your app`);
}); 