/**
 * Fix script for uploadHandler.js syntax error
 * This script will replace the problematic mapProductData function
 * with a fixed version to resolve the deployment issue.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Starting uploadHandler.js fix script...');

// Load the fixed mapProductData function
let fixedFunction;
try {
  fixedFunction = fs.readFileSync(path.join(__dirname, 'src/server/fix-product-mapping.js'), 'utf8');
} catch (err) {
  // If the file doesn't exist, create it with the clean function
  console.log('Creating clean mapProductData function...');
  fixedFunction = `// Fixed mapProductData function for use in uploadHandler.js

/**
 * Maps CSV data to product objects, with proper batching and memory management.
 * This is a fixed version to replace the broken function in uploadHandler.js.
 */
async function mapProductData(csvData, fieldMapping, requiredFields = ['Title', 'Brand', 'Sale Price']) {
  try {
    console.log(\`Mapping \${csvData.length} product rows with field mapping:\`, fieldMapping);
    console.log('Using required fields:', requiredFields);
    
    // Get all custom attributes to map them
    const { data: customAttributes, error } = await supabase
      .from('custom_attributes')
      .select('*')
      .eq('for_type', 'product');
      
    if (error) {
      console.error('Error fetching custom attributes:', error);
      throw error;
    }
    
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
      for (const row of batch) {
        try {
          const productData = {
            title: row[fieldMapping['Title']]?.trim() || '',
            ean: row[fieldMapping['EAN']]?.trim() || '',
            brand: row[fieldMapping['Brand']]?.trim() || '',
            sale_price: parseFloat(row[fieldMapping['Sale Price']]) || 0,
            amazon_fee: parseFloat(row[fieldMapping['Amazon Fee']]) || 0,
            buy_box_price: parseFloat(row[fieldMapping['Buy Box Price']]) || 0,
            units_sold: parseInt(row[fieldMapping['Units Sold']]) || 0,
            category: row[fieldMapping['Category']]?.trim() || null,
            rating: row[fieldMapping['Rating']] ? parseFloat(row[fieldMapping['Rating']]) : null,
            review_count: row[fieldMapping['Review Count']] ? parseInt(row[fieldMapping['Review Count']]) : null,
            custom_attributes: {}
          };
          
          // Map any custom attributes found in the CSV
          if (customAttributes) {
            customAttributes.forEach(attr => {
              if (fieldMapping[attr.name] && row[fieldMapping[attr.name]]) {
                if (!productData.custom_attributes) {
                  productData.custom_attributes = {};
                }
                
                let value = row[fieldMapping[attr.name]];
                
                // Convert value based on attribute type
                switch (attr.type) {
                  case 'Number':
                    value = parseFloat(value) || 0;
                    break;
                  case 'Date':
                    // Attempt to parse as date, keep as string
                    break;
                  case 'Yes/No':
                    value = value.toLowerCase() === 'yes' || 
                           value.toLowerCase() === 'true' || 
                           value === '1';
                    break;
                  default:
                    // Keep as string for text and selection
                    value = value.trim();
                }
                
                productData.custom_attributes[attr.name] = value;
              } else if (attr.required) {
                // For required attributes, use default value if available
                if (!productData.custom_attributes) {
                  productData.custom_attributes = {};
                }
                productData.custom_attributes[attr.name] = attr.default_value;
              }
            });
          }
          
          // Validate product data using required fields from config
          let skipProduct = false;
          
          // Check each required field
          for (const requiredField of requiredFields) {
            // Map system field names to data properties
            let fieldProperty;
            switch (requiredField) {
              case 'Title':
                fieldProperty = 'title';
                break;
              case 'Brand':
                fieldProperty = 'brand';
                break;
              case 'Sale Price':
                fieldProperty = 'sale_price';
                break;
              case 'EAN':
                fieldProperty = 'ean';
                break;
              default:
                // For custom fields, check in custom attributes
                fieldProperty = requiredField.toLowerCase().replace(/\\s+/g, '_');
            }
            
            // Check if the field has a value
            if (!productData[fieldProperty] && 
                (productData[fieldProperty] !== 0 || fieldProperty !== 'sale_price')) {
              console.warn(\`Skipping product data: \${requiredField} is required\`);
              skipProduct = true;
              break;
            }
          }
          
          if (skipProduct) {
            continue;
          }
          
          // If EAN is not provided, generate a placeholder
          if (!productData.ean || productData.ean.trim() === '') {
            // Generate a placeholder EAN based on brand and title
            const brandPart = productData.brand ? productData.brand.substring(0, 5).replace(/\\W/g, '') : 'brand';
            const titlePart = productData.title ? productData.title.substring(0, 10).replace(/\\W/g, '') : 'title';
            const timestamp = Date.now().toString().substring(6);
            productData.ean = \`GEN\${brandPart}\${titlePart}\${timestamp}\`.substring(0, 30);
            console.log(\`Generated placeholder EAN for product: \${productData.title} -> \${productData.ean}\`);
          }
          
          mappedData.push(productData);
        } catch (error) {
          console.warn(\`Skipping invalid product data: \${error instanceof Error ? error.message : 'Unknown error'}\`);
        }
      }
      
      // Allow event loop to continue before next batch
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(\`Mapping complete. \${mappedData.length} valid products of \${csvData.length} total\`);
    return mappedData;
  } catch (error) {
    console.error('Error mapping product data:', error);
    throw error;
  }
}

module.exports = mapProductData;`;

  // Save the function for reference
  try {
    fs.writeFileSync(path.join(__dirname, 'src/server/fix-product-mapping.js'), fixedFunction);
    console.log('Created fix-product-mapping.js');
  } catch (e) {
    console.log('Note: Could not create fix-product-mapping.js file, but will proceed with fix');
  }
}

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

// Look for the problematic area directly 
const problemLine = 'for (const row of batch) {';
const problemLineIndex = fileContent.indexOf(problemLine, fileContent.indexOf('// Generate a placeholder EAN based on brand and title'));

if (problemLineIndex === -1) {
  console.error('❌ Could not find the problematic code to fix');
  // Try regexp approach instead
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
} else {
  // Found the problem line, now find the whole problematic structure
  // Let's do a simple replacement of the duplicated loop
  const problematicSection = fileContent.substring(problemLineIndex - 200, problemLineIndex + 1000);
  
  // Create a replacement with the corrected structure
  let fixedContent = fileContent;
  
  // Replace the duplicated for loop and other malformed code
  const duplicatedPattern = /if \(!productData\.ean \|\| productData\.ean\.trim\(\) === ''\) \{\s*\/\/ Generate a placeholder EAN based on brand and title\s*for \(const row of batch\) \{[\s\S]*?for \(const row of batch\) \{[\s\S]*?mappedData\.push\(productData\);/g;
  
  fixedContent = fixedContent.replace(duplicatedPattern, 
    `if (!productData.ean || productData.ean.trim() === '') {
            // Generate a placeholder EAN based on brand and title
            const brandPart = productData.brand ? productData.brand.substring(0, 5).replace(/\\W/g, '') : 'brand';
            const titlePart = productData.title ? productData.title.substring(0, 10).replace(/\\W/g, '') : 'title';
            const timestamp = Date.now().toString().substring(6);
            productData.ean = \`GEN\${brandPart}\${titlePart}\${timestamp}\`.substring(0, 30);
            console.log(\`Generated placeholder EAN for product: \${productData.title} -> \${productData.ean}\`);
          }
          
          mappedData.push(productData);`);
  
  // Also fix the misplaced event loop continuation
  const loopClosingPattern = /\}\s*\}\s*\/\/ Allow event loop to continue before next batch\s*if \(batchIndex < totalBatches - 1\) \{\s*await new Promise\(resolve => setTimeout\(resolve, 100\)\);\s*\}\s*\}console\.log/g;
  
  fixedContent = fixedContent.replace(loopClosingPattern, 
    `      }
    }
    
    // Allow event loop to continue before next batch
    if (batchIndex < totalBatches - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log`);
  
  // Fix any other structural issues
  fs.writeFileSync(handlerPath, fixedContent);
  
  console.log('✅ Successfully fixed the problematic code in uploadHandler.js');
}

console.log('Original file backed up at', backupPath);
console.log('Please redeploy your application to fix the issue.'); 