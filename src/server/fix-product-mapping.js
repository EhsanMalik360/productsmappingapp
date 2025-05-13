// Fixed mapProductData function for use in uploadHandler.js

/**
 * Maps CSV data to product objects, with proper batching and memory management.
 * This is a fixed version to replace the broken function in uploadHandler.js.
 */
async function mapProductData(csvData, fieldMapping, requiredFields = ['Title', 'Brand', 'Sale Price']) {
  try {
    console.log(`Mapping ${csvData.length} product rows with field mapping:`, fieldMapping);
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
    console.log(`Map product data called with ${csvData.length} rows`);
    
    // In low memory mode, process in very small batches
    const batchSize = config.lowMemoryMode ? 50 : 500;
    const totalBatches = Math.ceil(csvData.length / batchSize);
    
    if (csvData.length > batchSize) {
      console.log(`Breaking data mapping into ${totalBatches} batches of ${batchSize} rows each`);
    }
    
    const mappedData = [];
    
    // Process in batches
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, csvData.length);
      const batch = csvData.slice(start, end);
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} rows)`);
      
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
                fieldProperty = requiredField.toLowerCase().replace(/\s+/g, '_');
            }
            
            // Check if the field has a value
            if (!productData[fieldProperty] && 
                (productData[fieldProperty] !== 0 || fieldProperty !== 'sale_price')) {
              console.warn(`Skipping product data: ${requiredField} is required`);
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
            const brandPart = productData.brand ? productData.brand.substring(0, 5).replace(/\W/g, '') : 'brand';
            const titlePart = productData.title ? productData.title.substring(0, 10).replace(/\W/g, '') : 'title';
            const timestamp = Date.now().toString().substring(6);
            productData.ean = `GEN${brandPart}${titlePart}${timestamp}`.substring(0, 30);
            console.log(`Generated placeholder EAN for product: ${productData.title} -> ${productData.ean}`);
          }
          
          mappedData.push(productData);
        } catch (error) {
          console.warn(`Skipping invalid product data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Allow event loop to continue before next batch
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`Mapping complete. ${mappedData.length} valid products of ${csvData.length} total`);
    return mappedData;
  } catch (error) {
    console.error('Error mapping product data:', error);
    throw error;
  }
}

module.exports = mapProductData; 