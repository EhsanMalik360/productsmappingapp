import { supabase } from '../lib/supabase';
import { fixScientificNotation } from './csvImport';

export interface ProductData {
  title: string;
  ean: string;
  brand: string;
  buy_box_price: number;
  sale_price?: number;
  amazon_fee?: number;
  units_sold?: number;
  category?: string | null;
  rating?: number | null;
  review_count?: number | null;
  custom_attributes?: Record<string, any>;
}

// Helper to normalize column names
export const normalizeColumnName = (name: string): string => {
  // First, convert to lowercase
  const lowercased = name.toLowerCase();
  
  // Remove common prefixes that might cause confusion
  const withoutPrefixes = lowercased
    .replace(/^amazon\s+/, '')
    .replace(/^product\s+/, '');
  
  // Handle special cases
  if (lowercased.includes('dominant') && lowercased.includes('seller') && lowercased.includes('%')) {
    return 'dominant_seller_percentage';
  }
  if (lowercased.includes('buy box') && lowercased.includes('seller')) {
    return 'buy_box_seller_name';
  }
  if (lowercased.includes('buy box') && lowercased.includes('price')) {
    return 'buy_box_price';
  }
  if (lowercased.includes('amazon') && lowercased.includes('fee')) {
    return 'amazon_fee';
  }
  if (lowercased.includes('fba') && lowercased.includes('fee')) {
    return 'fba_fees';
  }
  if (lowercased.includes('instock') && lowercased.includes('rate')) {
    return 'amazon_instock_rate';
  }
  
  // Replace non-alphanumeric with underscore but keep spaces
  return withoutPrefixes
    .replace(/[^a-z0-9\s]/g, '_') // Replace non-alphanumeric (except spaces) with underscores
    .replace(/\s+/g, '_')        // Replace spaces with underscores
    .replace(/_+/g, '_')         // Replace multiple underscores with single
    .replace(/^_|_$/g, '')       // Remove leading/trailing underscores
    .trim();
};

// Function to automatically map product CSV columns to system fields
export const autoMapProductColumns = (csvHeaders: string[]): { [key: string]: string } => {
  const fieldMappings: { [key: string]: string[] } = {
    'title': ['title', 'product_name', 'name', 'item_name', 'product_title', 'product', 'item', 'name_title'],
    'ean': ['ean', 'barcode', 'upc', 'product_id', 'sku', 'gtin', 'ean_code', 'barcode_number'],
    'brand': ['brand', 'brand_name', 'manufacturer', 'producer', 'make', 'vendor'],
    'sale_price': ['sale_price', 'price', 'selling_price', 'amazon_price', 'retail_price', 'msrp', 'current_price'],
    'amazon_fee': ['amazon_fee', 'fee', 'fees', 'amazon_fees', 'marketplace_fee', 'platform_fee'],
    'buy_box_price': ['buy_box_price', 'buybox', 'buy_box', 'winning_price', 'current_buy_box', 'bb_price'],
    'units_sold': ['units_sold', 'sales', 'monthly_sales', 'quantity_sold', 'sold', 'units', 'volume', 'monthly_units'],
    'category': ['category', 'product_category', 'department', 'niche', 'product_type', 'item_category'],
    'rating': ['rating', 'product_rating', 'star_rating', 'stars', 'average_rating', 'avg_rating', 'review_rating'],
    'review_count': ['review_count', 'reviews', 'review', 'num_reviews', 'number_of_reviews', 'total_reviews', 'review_number'],
    'mpn': ['mpn', 'manufacturer_part_number', 'part_number', 'model_number', 'model', 'part_no', 'mfr_part_no'],
    // Added missing optional fields with expanded matches
    'asin': ['asin', 'amazon_id', 'amazon_identifier', 'amazon_asin', 'product_asin'],
    'upc': ['upc', 'universal_product_code', 'upc_code', 'universal_code'],
    'fba_fees': ['fba_fees', 'fba_fee', 'fulfillment_fee', 'fulfillment_by_amazon_fee', 'amazon_fulfillment_fee', 'fulfillment_fees'],
    'referral_fee': ['referral_fee', 'amazon_referral', 'referral', 'ref_fee', 'referral_fees', 'amazon_referral_fee'],
    'bought_past_month': ['bought_past_month', 'bought_last_month', 'purchases_past_month', 'monthly_purchases', 'units_purchased', 'monthly_bought'],
    'estimated_monthly_revenue': ['estimated_monthly_revenue', 'monthly_revenue', 'est_revenue', 'revenue_monthly', 'est_monthly_revenue', 'monthly_sales_value'],
    'fba_sellers': ['fba_sellers', 'fba_seller_count', 'seller_count', 'num_sellers', 'total_sellers', 'fba_count', 'number_of_sellers'],
    'amazon_instock_rate': ['amazon_instock_rate', 'instock_rate', 'in_stock_rate', 'stock_rate', 'inventory_rate', 'availability_rate'],
    'dominant_seller_percentage': ['dominant_seller_percentage', 'dominant_seller', 'main_seller_percentage', 'primary_seller', 'top_seller_percentage', 'dominant_seller_percent'],
    'buy_box_seller_name': ['buy_box_seller_name', 'buy_box_seller', 'seller_name', 'winning_seller', 'current_seller', 'seller', 'bb_seller'],
    'live_offers_count': ['live_offers_count', 'live_offers', 'offer_count', 'offers', 'active_offers', 'total_offers', 'number_of_offers']
  };

  const mapping: { [key: string]: string } = {};
  const usedColumns = new Set<string>();
  
  // Debug information about headers
  console.log('Original CSV Headers:', csvHeaders);
  const normalizedHeaders = csvHeaders.map(h => ({ 
    original: h, 
    normalized: normalizeColumnName(h) 
  }));
  console.log('Normalized CSV Headers:', normalizedHeaders);

  // First pass: exact matches with normalized column names
  csvHeaders.forEach(header => {
    const normalizedHeader = normalizeColumnName(header);
    for (const [systemField, possibleMatches] of Object.entries(fieldMappings)) {
      if (possibleMatches.includes(normalizedHeader) && !usedColumns.has(header)) {
        mapping[systemField] = header;
        usedColumns.add(header);
        console.log(`Exact match found: "${header}" → "${systemField}"`);
        break;
      }
    }
  });

  // Second pass: check if the column name contains keywords
  csvHeaders.forEach(header => {
    if (usedColumns.has(header)) return;

    const originalLower = header.toLowerCase();
    const normalizedHeader = normalizeColumnName(header);
    
    for (const [systemField, possibleMatches] of Object.entries(fieldMappings)) {
      if (!mapping[systemField]) {
        // Check if any of the possible matches are contained within the header
        // Prioritize exact word matches over partial matches
        let matchStrength = 0;
        let bestMatch = '';
        
        for (const match of possibleMatches) {
          // Check for exact word match (surrounded by spaces, start or end of string)
          const wordRegex = new RegExp(`(^|\\s)${match}(\\s|$)`, 'i');
          if (originalLower.match(wordRegex)) {
            if (match.length > matchStrength) {
              matchStrength = match.length;
              bestMatch = match;
            }
          }
          // Check for included match (less priority)
          else if (originalLower.includes(match) || normalizedHeader.includes(match)) {
            if (match.length > matchStrength && match.length >= 3) { // Minimum 3 chars for partial matches
              matchStrength = match.length * 0.8; // Lower priority for partial matches
              bestMatch = match;
            }
          }
          // Check if the match includes the header (lowest priority)
          else if (match.includes(normalizedHeader) && normalizedHeader.length >= 3) {
            if (normalizedHeader.length > matchStrength) {
              matchStrength = normalizedHeader.length * 0.6; // Even lower priority
              bestMatch = match;
            }
          }
        }
        
        if (matchStrength > 0) {
          mapping[systemField] = header;
          usedColumns.add(header);
          console.log(`Partial match found: "${header}" → "${systemField}" (matched: "${bestMatch}", strength: ${matchStrength})`);
          break;
        }
      }
    }
  });

  // Special case for column names with very specific patterns
  csvHeaders.forEach(header => {
    if (usedColumns.has(header)) return;
    
    const lowerHeader = header.toLowerCase();
    
    // Handle common patterns not caught by the regular matching
    if (lowerHeader.includes('dominant') && lowerHeader.includes('seller')) {
      mapping['dominant_seller_percentage'] = header;
      usedColumns.add(header);
    }
    else if (lowerHeader.includes('buy') && lowerHeader.includes('box') && lowerHeader.includes('price')) {
      mapping['buy_box_price'] = header;
      usedColumns.add(header);
    }
    else if (lowerHeader.includes('buy') && lowerHeader.includes('box') && lowerHeader.includes('seller')) {
      mapping['buy_box_seller_name'] = header;
      usedColumns.add(header);
    }
    else if (lowerHeader.includes('amazon') && lowerHeader.includes('fee')) {
      mapping['amazon_fee'] = header;
      usedColumns.add(header);
    }
    else if (lowerHeader.includes('fba') && lowerHeader.includes('fee')) {
      mapping['fba_fees'] = header;
      usedColumns.add(header);
    }
    else if ((lowerHeader.includes('monthly') || lowerHeader.includes('revenue')) && 
              (lowerHeader.includes('est') || lowerHeader.includes('estimated'))) {
      mapping['estimated_monthly_revenue'] = header;
      usedColumns.add(header);
    }
    else if (lowerHeader.includes('instock') || (lowerHeader.includes('in') && lowerHeader.includes('stock'))) {
      mapping['amazon_instock_rate'] = header;
      usedColumns.add(header);
    }
  });

  // Log the mapping results for debugging
  console.log('Final automated column mapping result:', mapping);
  
  // Check for unmapped required fields
  const requiredFields = ['title', 'ean', 'brand', 'buy_box_price'];
  const unmappedRequired = requiredFields.filter(field => !mapping[field]);
  if (unmappedRequired.length > 0) {
    console.warn('Warning: Some required fields could not be auto-mapped:', unmappedRequired);
  }

  return mapping;
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
    if (typeof data.buy_box_price !== 'number' || data.buy_box_price < 0) {
      throw new Error('Buy Box Price must be a positive number');
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
      buy_box_price: parseFloat(row[fieldMapping['buy_box_price']]) || 0,
      custom_attributes: {}
    };
    
    // Add optional fields if they exist in the mapping
    if (fieldMapping['sale_price']) {
      productData.sale_price = parseFloat(row[fieldMapping['sale_price']]) || 0;
    }
    
    if (fieldMapping['amazon_fee']) {
      productData.amazon_fee = parseFloat(row[fieldMapping['amazon_fee']]) || 0;
    }
    
    if (fieldMapping['units_sold']) {
      productData.units_sold = parseInt(row[fieldMapping['units_sold']]) || 0;
    }
    
    if (fieldMapping['category']) {
      productData.category = row[fieldMapping['category']]?.trim() || null;
    }
    
    if (fieldMapping['rating']) {
      productData.rating = row[fieldMapping['rating']] ? parseFloat(row[fieldMapping['rating']]) : null;
    }
    
    if (fieldMapping['review_count']) {
      productData.review_count = row[fieldMapping['review_count']] ? parseInt(row[fieldMapping['review_count']]) : null;
    }
    
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