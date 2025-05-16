import { supabase } from '../lib/supabase';
import { fixScientificNotation } from './csvImport';

export interface ProductData {
  title: string;
  ean: string;
  brand: string;
  sale_price: number;
  amazon_fee: number;
  buy_box_price: number;
  units_sold: number;
  category?: string | null;
  rating?: number | null;
  review_count?: number | null;
  custom_attributes?: Record<string, any>;
}

// Function to automatically map product CSV columns to system fields
export const autoMapProductColumns = (csvHeaders: string[]): { [key: string]: string } => {
  const fieldMappings: { [key: string]: string[] } = {
    'title': ['title', 'product_name', 'name', 'item_name', 'product_title'],
    'ean': ['ean', 'barcode', 'upc', 'product_id', 'sku', 'asin'],
    'brand': ['brand', 'brand_name', 'manufacturer'],
    'sale_price': ['sale_price', 'price', 'selling_price', 'amazon_price'],
    'amazon_fee': ['amazon_fee', 'fee', 'fees', 'fba_fee', 'referral_fee'],
    'buy_box_price': ['buy_box_price', 'buybox', 'buy_box', 'winning_price'],
    'units_sold': ['units_sold', 'sales', 'monthly_sales', 'quantity_sold', 'sold'],
    'category': ['category', 'product_category', 'department', 'niche'],
    'rating': ['rating', 'product_rating', 'star_rating', 'stars'],
    'review_count': ['review_count', 'reviews', 'review', 'num_reviews', 'number_of_reviews'],
    'mpn': ['mpn', 'manufacturer_part_number', 'part_number', 'model_number']
  };

  const mapping: { [key: string]: string } = {};
  const usedColumns = new Set<string>();

  // First pass: exact matches
  csvHeaders.forEach(header => {
    const normalizedHeader = normalizeColumnName(header);
    for (const [systemField, possibleMatches] of Object.entries(fieldMappings)) {
      if (possibleMatches.includes(normalizedHeader) && !usedColumns.has(header)) {
        mapping[systemField] = header;
        usedColumns.add(header);
        break;
      }
    }
  });

  // Second pass: partial matches for unmapped fields
  csvHeaders.forEach(header => {
    if (usedColumns.has(header)) return;

    const normalizedHeader = normalizeColumnName(header);
    for (const [systemField, possibleMatches] of Object.entries(fieldMappings)) {
      if (!mapping[systemField]) {
        // Check if any of the possible matches are contained within the header
        const matchFound = possibleMatches.some(match => 
          normalizedHeader.includes(match) || match.includes(normalizedHeader)
        );
        
        if (matchFound) {
          mapping[systemField] = header;
          usedColumns.add(header);
          break;
        }
      }
    }
  });

  return mapping;
};

// Helper to normalize column names
export const normalizeColumnName = (name: string): string => {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '_') // Replace non-alphanumeric with underscore
    .replace(/_+/g, '_')        // Replace multiple underscores with single
    .replace(/^_|_$/g, '')      // Remove leading/trailing underscores
    .trim();
};

export const validateProductData = async (data: any): Promise<boolean> => {
  try {
    // Only validate required fields
    if (!data.title || typeof data.title !== 'string') {
      throw new Error('Product title is required');
    }
    if (!data.ean || typeof data.ean !== 'string') {
      throw new Error('Product EAN is required');
    }
    if (!data.brand || typeof data.brand !== 'string') {
      throw new Error('Product brand is required');
    }
    if (typeof data.sale_price !== 'number' || data.sale_price < 0) {
      throw new Error('Sale price must be a positive number');
    }
    
    // Check for required custom attributes if specified
    if (data.custom_attributes) {
      // Fetch required custom attributes from database
      const { data: requiredAttributes, error } = await supabase
        .from('custom_attributes')
        .select('*')
        .eq('for_type', 'product')
        .eq('required', true);
        
      if (error) throw error;
      
      if (requiredAttributes && requiredAttributes.length > 0) {
        for (const attr of requiredAttributes) {
          const attributeName = attr.name;
          if (!data.custom_attributes[attributeName] && data.custom_attributes[attributeName] !== false) {
            throw new Error(`Required custom attribute '${attributeName}' is missing`);
          }
        }
      }
    }
    
    // Skip all validation for non-required fields
    
    return true;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Invalid product data');
  }
};

export const mapProductData = async (csvData: any[], fieldMapping: { [key: string]: string }): Promise<ProductData[]> => {
  // Get all custom attributes to map them
  const { data: customAttributes, error } = await supabase
    .from('custom_attributes')
    .select('*')
    .eq('for_type', 'product');
    
  if (error) {
    console.error('Error fetching custom attributes:', error);
    throw error;
  }
  
  const mappedData = csvData.map(row => {
    const productData: ProductData = {
      title: row[fieldMapping['title']]?.trim() || '',
      ean: fixScientificNotation(row[fieldMapping['ean']]),
      brand: row[fieldMapping['brand']]?.trim() || '',
      sale_price: parseFloat(row[fieldMapping['sale_price']]) || 0,
      amazon_fee: parseFloat(row[fieldMapping['amazon_fee']]) || 0,
      buy_box_price: parseFloat(row[fieldMapping['buy_box_price']]) || 0,
      units_sold: parseInt(row[fieldMapping['units_sold']]) || 0,
      category: row[fieldMapping['category']]?.trim() || null,
      rating: row[fieldMapping['rating']] ? parseFloat(row[fieldMapping['rating']]) : null,
      review_count: row[fieldMapping['review_count']] ? parseInt(row[fieldMapping['review_count']]) : null,
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
    
    return productData;
  });
  
  // Validate all mapped data items
  const validatedData: ProductData[] = [];
  for (const item of mappedData) {
    try {
      await validateProductData(item);
      validatedData.push(item);
    } catch (error) {
      console.warn(`Skipping invalid product data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // You could handle or report the error here
    }
  }
  
  return validatedData;
};

export const importProductData = async (mappedDataPromise: Promise<ProductData[]> | ProductData[]) => {
  try {
    // Ensure mappedData is resolved if it's a Promise
    const mappedData = Array.isArray(mappedDataPromise) ? mappedDataPromise : await mappedDataPromise;
    
    if (!mappedData || mappedData.length === 0) {
      throw new Error('No product data to import');
    }

    const batchSize = 25;
    const results = [];
    
    // Get all custom attributes
    const { error: customAttrError } = await supabase
      .from('custom_attributes')
      .select('*')
      .eq('for_type', 'product');
      
    if (customAttrError) throw customAttrError;

    // Process products in batches
    for (let i = 0; i < mappedData.length; i += batchSize) {
      const batch = mappedData.slice(i, i + batchSize).map(product => {
        const { custom_attributes, ...productData } = product;
        
        // Build the product record with both standard fields and custom fields
        const productRecord: any = {
          ...productData,
          updated_at: new Date().toISOString()
        };
        
        // If we have custom attributes, add them directly to the product record
        if (custom_attributes) {
          // Map known custom attributes to their respective columns
          if (custom_attributes['title'] !== undefined) productRecord.custom_title = custom_attributes['title'];
          if (custom_attributes['ean'] !== undefined) productRecord.custom_ean = custom_attributes['ean'];
          if (custom_attributes['mpn'] !== undefined) {
            productRecord.custom_mpn = custom_attributes['mpn'];
            // Also store in the regular mpn column
            productRecord.mpn = custom_attributes['mpn'];
          }
          if (custom_attributes['units_sold'] !== undefined) 
            productRecord.custom_units_sold = custom_attributes['units_sold'];
          if (custom_attributes['fba_fee'] !== undefined) 
            productRecord.custom_fba_fee = parseFloat(custom_attributes['fba_fee']) || 0;
        }
        
        return productRecord;
      });
      
      const { data: insertedProducts, error } = await supabase
        .from('products')
        .upsert(batch, {
          onConflict: 'ean',
          ignoreDuplicates: false
        })
        .select();
      
      if (error) throw error;
      if (insertedProducts) results.push(...insertedProducts);
      
      // Add a small delay between batches
      if (i + batchSize < mappedData.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return {
      results,
      processedCount: results.length
    };
  } catch (error) {
    console.error('Error importing product data:', error);
    throw error;
  }
}; 