/**
 * Fix script for uploadHandler.js syntax error
 * This script will replace the problematic mapProductData function
 * with a fixed version to resolve the deployment issue.
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Starting uploadHandler.js fix script...');

// Load the fixed mapProductData function
const fixedFunction = fs.readFileSync(path.join(__dirname, 'src/server/fix-product-mapping.js'), 'utf8');

// Remove the module.exports line from the fixed function
const fixedFunctionCode = fixedFunction.replace('module.exports = mapProductData;', '');

// Path to the uploadHandler.js file
const handlerPath = path.join(__dirname, 'src/server/uploadHandler.js');

// Create a backup of the original file
const backupPath = `${handlerPath}.bak`;
console.log(`Creating backup at ${backupPath}`);
fs.copyFileSync(handlerPath, backupPath);

// Read the current file content
const fileContent = fs.readFileSync(handlerPath, 'utf8');

// Find the start and end of the mapProductData function
const functionStartPattern = /async\s+function\s+mapProductData\s*\(\s*csvData\s*,\s*fieldMapping\s*,\s*requiredFields\s*=\s*\[.*?\]\s*\)\s*\{/;
const functionStart = fileContent.match(functionStartPattern);

if (!functionStart) {
  console.error('❌ Could not find mapProductData function in uploadHandler.js');
  process.exit(1);
}

// Find the start index
const startIndex = fileContent.indexOf(functionStart[0]);

// Find the end of the function (the closing brace that matches the opening one)
let braceCount = 1;
let endIndex = startIndex + functionStart[0].length;

while (braceCount > 0 && endIndex < fileContent.length) {
  const char = fileContent[endIndex];
  if (char === '{') braceCount++;
  if (char === '}') braceCount--;
  endIndex++;
}

if (braceCount !== 0) {
  console.error('❌ Could not find the end of mapProductData function');
  process.exit(1);
}

// Replace the function with the fixed version
const newContent = 
  fileContent.substring(0, startIndex) + 
  fixedFunctionCode + 
  fileContent.substring(endIndex);

// Write the new content back to the file
fs.writeFileSync(handlerPath, newContent);

console.log('✅ Successfully replaced mapProductData function in uploadHandler.js');
console.log('Original file backed up at', backupPath);
console.log('Please redeploy your application to fix the issue.'); 