#!/usr/bin/env node
/**
 * A simple utility to view server logs from the command line
 * 
 * Usage:
 *   node view-logs.js [options]
 * 
 * Options:
 *   --date YYYY-MM-DD : View logs for specific date (default: today)
 *   --level INFO|WARN|ERROR|DEBUG : Filter by log level
 *   --lines N : Show last N lines (default: 100)
 *   --follow : Watch for new log entries
 *   --list : List available log files
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Get the logs directory
const logDir = path.join(__dirname, '../logs');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  date: new Date().toISOString().split('T')[0], // Default to today
  level: null,
  lines: 100,
  follow: false,
  list: false
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--list') {
    options.list = true;
  } else if (arg === '--follow') {
    options.follow = true;
  } else if (arg === '--date' && i + 1 < args.length) {
    options.date = args[++i];
  } else if (arg === '--level' && i + 1 < args.length) {
    options.level = args[++i].toUpperCase();
  } else if (arg === '--lines' && i + 1 < args.length) {
    const lines = parseInt(args[++i]);
    if (!isNaN(lines)) {
      options.lines = lines;
    }
  } else if (arg === '--help') {
    console.log(`
Usage: node view-logs.js [options]

Options:
  --date YYYY-MM-DD : View logs for specific date (default: today)
  --level INFO|WARN|ERROR|DEBUG : Filter by log level
  --lines N : Show last N lines (default: 100)
  --follow : Watch for new log entries
  --list : List available log files
  --help : Show this help message
    `);
    process.exit(0);
  }
}

// List available log files
if (options.list) {
  if (!fs.existsSync(logDir)) {
    console.error('Logs directory does not exist yet.');
    process.exit(1);
  }
  
  const logFiles = fs.readdirSync(logDir)
    .filter(file => file.startsWith('server-') && file.endsWith('.log'))
    .map(file => {
      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);
      return {
        date: file.replace('server-', '').replace(/\..*\.log$/, '').replace('.log', ''),
        filename: file,
        size: (stats.size / 1024).toFixed(2) + ' KB',
        created: stats.birthtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort newest first

  console.log('\nAvailable log files:');
  console.log('===================');
  
  if (logFiles.length === 0) {
    console.log('No log files found.');
  } else {
    logFiles.forEach((file, index) => {
      console.log(`${index + 1}. ${file.date} (${file.size}) - ${file.filename}`);
    });
  }
  
  console.log('\nTo view a log file: node view-logs.js --date YYYY-MM-DD');
  process.exit(0);
}

// Validate date format
if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
  console.error('Invalid date format. Use YYYY-MM-DD');
  process.exit(1);
}

// Determine which log files to read for the date
const getLogFilesForDate = (date) => {
  const baseLogFile = path.join(logDir, `server-${date}.log`);
  const result = [];
  
  if (fs.existsSync(baseLogFile)) {
    result.push(baseLogFile);
  }
  
  // Check for rotated log files
  let rotationNum = 1;
  let rotatedFile;
  do {
    rotatedFile = path.join(logDir, `server-${date}.${rotationNum}.log`);
    if (fs.existsSync(rotatedFile)) {
      result.push(rotatedFile);
      rotationNum++;
    } else {
      break;
    }
  } while (true);
  
  return result;
};

const logFiles = getLogFilesForDate(options.date);

if (logFiles.length === 0) {
  console.error(`No log files found for date: ${options.date}`);
  console.log('Use --list to see available log files.');
  process.exit(1);
}

console.log(`Viewing logs for ${options.date}`);
console.log(`Log level filter: ${options.level || 'ALL'}`);
console.log(`Showing last ${options.lines} lines`);
console.log('===========================================');

// Read and display logs
const readLogs = () => {
  const allLines = [];
  
  // Read all log files for the date
  for (const logFile of logFiles) {
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim() !== '');
      
      // Apply level filter if specified
      if (options.level) {
        const filteredLines = lines.filter(line => line.includes(`[${options.level}]`));
        allLines.push(...filteredLines);
      } else {
        allLines.push(...lines);
      }
    } catch (err) {
      console.error(`Error reading log file ${logFile}:`, err.message);
    }
  }
  
  // Sort all lines chronologically
  allLines.sort();
  
  // Show the last N lines
  const lastLines = allLines.slice(-options.lines);
  
  // Clear console and print lines
  console.clear();
  console.log(`Logs for ${options.date} | Level: ${options.level || 'ALL'} | Last ${options.lines} lines`);
  console.log('===========================================');
  
  for (const line of lastLines) {
    // Color-code based on log level
    if (line.includes('[ERROR]')) {
      console.log('\x1b[31m%s\x1b[0m', line); // Red
    } else if (line.includes('[WARN]')) {
      console.log('\x1b[33m%s\x1b[0m', line); // Yellow
    } else if (line.includes('[DEBUG]')) {
      console.log('\x1b[36m%s\x1b[0m', line); // Cyan
    } else {
      console.log(line);
    }
  }
  
  return lastLines.length;
};

// Initial read
readLogs();

// If follow mode is enabled, watch for changes
if (options.follow) {
  console.log('\nWatching for new log entries... (Press Ctrl+C to exit)');
  
  const mainLogFile = logFiles[0];
  let lastSize = fs.statSync(mainLogFile).size;
  
  // Check for changes every second
  const watcher = setInterval(() => {
    try {
      const currentSize = fs.statSync(mainLogFile).size;
      
      if (currentSize > lastSize) {
        readLogs();
        lastSize = currentSize;
      }
    } catch (err) {
      // File might have been rotated or deleted
      clearInterval(watcher);
      console.error(`Error watching log file: ${err.message}`);
      process.exit(1);
    }
  }, 1000);
  
  // Handle interruption
  process.on('SIGINT', () => {
    clearInterval(watcher);
    console.log('\nStopped watching logs.');
    process.exit(0);
  });
} 