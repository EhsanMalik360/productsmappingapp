import { supabase } from '../lib/supabase';
import { fixScientificNotation } from './csvImport';


export enum MatchMethod {
  EAN = 'ean',
  MPN = 'mpn',
  NAME = 'name'
}

export interface MatchOptions {
  useEan: boolean;
  useMpn: boolean;
  useName: boolean;
  priority: MatchMethod[];
}

export interface SupplierData {
  supplier_name: string;
  ean?: string;
  mpn?: string;
  product_name?: string;
  cost: number;
  moq?: number;
  lead_time?: string;
  payment_terms?: string;
  custom_attributes?: Record<string, any>;
}

// Helper function to normalize column names for comparison
const normalizeColumnName = (name: string): string => {
  // First, convert to lowercase
  const lowercased = name.toLowerCase();
  
  // Remove common prefixes that might cause confusion
  const withoutPrefixes = lowercased
    .replace(/^supplier\s+/, '')
    .replace(/^product\s+/, '');
  
  // Handle special cases
  if (lowercased.includes('brand') || lowercased.includes('make') || lowercased.includes('manufacturer')) {
    if (!lowercased.includes('name') && !lowercased.includes('number')) {
      return 'brand';
    }
  }
  if (lowercased.includes('supplier') && lowercased.includes('stock')) {
    return 'supplier_stock';
  }
  if (lowercased.includes('stock') && lowercased.includes('level')) {
    return 'supplier_stock';
  }
  if (lowercased.includes('inventory') && !lowercased.includes('date')) {
    return 'supplier_stock';
  }
  
  // Replace non-alphanumeric with underscore but keep spaces
  return withoutPrefixes
    .replace(/[^a-z0-9\s]/g, '_') // Replace non-alphanumeric (except spaces) with underscores
    .replace(/\s+/g, '_')        // Replace spaces with underscores
    .replace(/_+/g, '_')         // Replace multiple underscores with single
    .replace(/^_|_$/g, '')       // Remove leading/trailing underscores
    .trim();
};

// Function to process cost values with currency symbols
export const processCostValue = (value: string): { cost: number; currencyWarning: boolean } => {
  if (!value) return { cost: 0, currencyWarning: false };
  
  // Remove whitespace
  const trimmedValue = value.trim();
  
  // Check for currency symbols
  if (/^[$]/.test(trimmedValue)) {
    // USD symbol - remove it and parse the number
    const numericValue = trimmedValue.replace(/[$]/g, '').trim();
    return { 
      cost: parseFloat(numericValue) || 0, 
      currencyWarning: false 
    };
  } else if (/^[€£¥₹₽₩₺₴₦₱₲₪₸₼₾₿]/.test(trimmedValue) || /[^\d.-]/.test(trimmedValue)) {
    // Other currency symbol or non-numeric character detected
    // Try to parse it anyway to get some value
    const numericValue = trimmedValue.replace(/[^\d.-]/g, '').trim();
    return { 
      cost: parseFloat(numericValue) || 0, 
      currencyWarning: true 
    };
  }
  
  // No currency symbol detected
  return { 
    cost: parseFloat(trimmedValue) || 0, 
    currencyWarning: false 
  };
};

// Function to automatically map supplier CSV columns to system fields
export const autoMapSupplierColumns = async (csvHeaders: string[]): Promise<{ [key: string]: string }> => {
  const fieldMappings: { [key: string]: string[] } = {
    'Supplier Name': ['supplier_name', 'supplier', 'vendor_name', 'vendor', 'company_name', 'company', 'seller', 'supplier_company'],
    'EAN': ['ean', 'barcode', 'upc', 'product_id', 'sku', 'asin', 'gtin', 'ean_code', 'barcode_number', 'scan_code'],
    'MPN': ['mpn', 'manufacturer_part_number', 'part_number', 'part_no', 'manufacturer_number', 'mfr_part_no', 'supplier_part_number'],
    'Product Name': ['product_name', 'title', 'item_name', 'product_title', 'product', 'item', 'description', 'item_title', 'product_description'],
    'Cost': ['cost', 'unit_cost', 'price', 'supplier_cost', 'wholesale_price', 'wholesale_cost', 'net_price', 'cost_price', 'purchase_price'],
    'MOQ': ['moq', 'minimum_order_quantity', 'min_order', 'minimum_qty', 'min_quantity', 'minimum', 'min_order_qty', 'minimum_purchase'],
    'Lead Time': ['lead_time', 'leadtime', 'delivery_time', 'processing_time', 'delivery_days', 'lead_days', 'shipping_time', 'despatch_time'],
    'Payment Terms': ['payment_terms', 'terms', 'payment', 'payment_conditions', 'credit_terms', 'payment_days', 'payment_period', 'payment_method'],
    'Brand': ['brand', 'make', 'manufacturer', 'brand_name', 'manufacturer_name', 'producer', 'make_name'],
    'Supplier Stock': ['supplier_stock', 'stock', 'inventory', 'stock_level', 'quantity', 'qty', 'stock_qty', 'available_stock', 'on_hand', 'availability', 'in_stock']
  };

  // Get custom attributes from database
  const { data: customAttributes, error } = await supabase
    .from('custom_attributes')
    .select('*')
    .eq('for_type', 'supplier');
  
  if (error) {
    console.error('Error fetching custom attributes:', error);
  } else if (customAttributes) {
    // Add custom attributes to field mappings
    customAttributes.forEach(attr => {
      const normalizedName = normalizeColumnName(attr.name);
      fieldMappings[attr.name] = [normalizedName, ...normalizedName.split('_')];
    });
  }

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
    
    // Special handling for Brand field
    if ((lowerHeader.includes('brand') || lowerHeader.includes('make') || lowerHeader.includes('manufacturer')) && !lowerHeader.includes('name')) {
      mapping['Brand'] = header;
      usedColumns.add(header);
    }
    
    // Special handling for Supplier Stock field
    else if (lowerHeader.includes('stock') || lowerHeader.includes('qty') || lowerHeader.includes('quantity') || lowerHeader.includes('available')) {
      mapping['Supplier Stock'] = header;
      usedColumns.add(header);
    }
  });

  // Log the mapping results for debugging
  console.log('Final automated column mapping result:', mapping);
  
  // Check for unmapped required fields
  const requiredFields = ['Supplier Name', 'Cost'];
  const unmappedRequired = requiredFields.filter(field => !mapping[field]);
  if (unmappedRequired.length > 0) {
    console.warn('Warning: Some required fields could not be auto-mapped:', unmappedRequired);
  }

  return mapping;
};

// Function to allow users to manually override column mappings
export const manualMapSupplierColumn = (
  fieldMapping: { [key: string]: string },
  systemField: string,
  csvHeader: string
): { [key: string]: string } => {
  // Clone the current mapping to avoid mutating the original
  const updatedMapping = { ...fieldMapping };
  
  // Update the mapping for the specified system field
  updatedMapping[systemField] = csvHeader;
  
  // Return the updated mapping
  return updatedMapping;
};

export const validateSupplierData = async (data: any): Promise<boolean> => {
  try {
    console.log('🔍 VALIDATION: Validating supplier data:', JSON.stringify(data));
    
    // Only validate required fields
    if (!data.supplier_name || typeof data.supplier_name !== 'string') {
      console.error('❌ VALIDATION FAILED: Supplier name is missing or not a string', data.supplier_name);
      throw new Error('Supplier name is required');
    }
    
    // Ensure supplier_name is not empty after trimming
    if (data.supplier_name.trim() === '') {
      console.error('❌ VALIDATION FAILED: Supplier name is empty after trimming');
      throw new Error('Supplier name cannot be empty');
    }
    
    console.log('✅ VALIDATION: Supplier name is valid:', data.supplier_name);
    
    if (data.ean !== undefined && typeof data.ean !== 'string') {
      console.error('❌ VALIDATION FAILED: EAN is not a string:', data.ean);
      throw new Error('Product EAN must be a string if provided');
    }
    
    console.log('✅ VALIDATION: EAN is valid or not provided');
    
    if (typeof data.cost !== 'number' || data.cost <= 0) {
      console.error('❌ VALIDATION FAILED: Cost is not a positive number:', data.cost, 'type:', typeof data.cost);
      throw new Error('Cost must be a positive number');
    }
    
    console.log('✅ VALIDATION: Cost is valid:', data.cost);
      
    // Check for required custom attributes if specified
    if (data.custom_attributes) {
      // Fetch required custom attributes from database
      console.log('🔍 VALIDATION: Checking required custom attributes');
      const { data: requiredAttributes, error } = await supabase
        .from('custom_attributes')
        .select('*')
        .eq('for_type', 'supplier')
        .eq('required', true);
        
      if (error) {
        console.error('❌ VALIDATION FAILED: Error fetching required custom attributes:', error);
        throw error;
      }
      
      console.log('🔍 VALIDATION: Required custom attributes:', requiredAttributes);
      
      if (requiredAttributes && requiredAttributes.length > 0) {
        for (const attr of requiredAttributes) {
          const attributeName = attr.name;
          console.log(`🔍 VALIDATION: Checking for required attribute: ${attributeName}`, 
            'Value:', data.custom_attributes[attributeName]);
            
          if (!data.custom_attributes[attributeName] && data.custom_attributes[attributeName] !== false) {
            console.error(`❌ VALIDATION FAILED: Required custom attribute '${attributeName}' is missing`);
            throw new Error(`Required custom attribute '${attributeName}' is missing`);
          }
        }
      }
      
      console.log('✅ VALIDATION: All required custom attributes are present');
    }
    
    // Skip all validation for non-required fields (moq, lead_time, payment_terms, etc.)
    console.log('✅ VALIDATION: Supplier data validation successful');
    return true;
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ VALIDATION FAILED:', error.message);
      throw error;
    }
    console.error('❌ VALIDATION FAILED: Unknown error');
    throw new Error('Invalid supplier data');
  }
};

// Helper function to generate a unique placeholder EAN for suppliers with missing EANs

export const mapSupplierData = async (csvData: any[], fieldMapping: { [key: string]: string }): Promise<{ 
  data: SupplierData[]; 
  warnings: { 
    currencyWarning: boolean; 
    message: string; 
  }
}> => {
  console.log('🔄 MAPPING: Starting supplier data mapping');
  console.log('🔄 MAPPING: Field mapping configuration:', fieldMapping);
  console.log('🔄 MAPPING: First row of CSV data:', csvData[0]);
  
  const mappedData: SupplierData[] = [];
  let currencyWarning = false;
  
  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];
    
    // Skip empty rows
    if (!row || Object.keys(row).length === 0) {
      console.log(`🔄 MAPPING: Skipping empty row at index ${i}`);
      continue;
    }
    
    try {
      const supplierName = row[fieldMapping['Supplier Name']] || '';
      const ean = row[fieldMapping['EAN']] || '';
      const mpn = row[fieldMapping['MPN']] || '';
      const productName = row[fieldMapping['Product Name']] || '';
      
      console.log(`🔄 MAPPING: Processing row ${i+1}:`, {
        supplierName,
        ean,
        mpn,
        productName
      });
      
      // Process cost with additional logging
      const costField = fieldMapping['Cost'];
      const costValue = row[costField];
      console.log(`🔄 MAPPING: Cost field "${costField}" has value:`, costValue, 'type:', typeof costValue);
      
      const { cost, currencyWarning: hasCurrencyWarning } = processCostValue(costValue);
      
      if (hasCurrencyWarning) {
        console.warn(`⚠️ MAPPING: Currency symbol detected in cost value: ${costValue}, parsed as: ${cost}`);
        currencyWarning = true;
      }
      
      // Map custom attributes with logging
      const customAttributes: Record<string, any> = {};
      for (const [systemField, csvField] of Object.entries(fieldMapping)) {
        // Skip standard fields
        if (['Supplier Name', 'EAN', 'MPN', 'Product Name', 'Cost', 'MOQ', 'Lead Time', 'Payment Terms'].includes(systemField)) {
          continue;
        }
        
        console.log(`🔄 MAPPING: Mapping custom attribute: ${systemField} from CSV column: ${csvField}`);
        if (row[csvField] !== undefined && row[csvField] !== null) {
          customAttributes[systemField] = row[csvField];
        }
      }
      
      // Build the supplier data object
      const supplierData: SupplierData = {
        supplier_name: supplierName,
        cost: cost,
        custom_attributes: customAttributes
      };
      
      if (ean) supplierData.ean = ean;
      if (mpn) supplierData.mpn = mpn;
      if (productName) supplierData.product_name = productName;
      
      // Optional fields
      if (fieldMapping['MOQ'] && row[fieldMapping['MOQ']]) {
        supplierData.moq = parseInt(row[fieldMapping['MOQ']]) || 0;
      }
      
      if (fieldMapping['Lead Time'] && row[fieldMapping['Lead Time']]) {
        supplierData.lead_time = row[fieldMapping['Lead Time']];
      }
      
      if (fieldMapping['Payment Terms'] && row[fieldMapping['Payment Terms']]) {
        supplierData.payment_terms = row[fieldMapping['Payment Terms']];
      }
      
      console.log(`🔄 MAPPING: Mapped supplier data for row ${i+1}:`, supplierData);
      
      // Run validation
      try {
        await validateSupplierData(supplierData);
        mappedData.push(supplierData);
        console.log(`✅ MAPPING: Row ${i+1} passed validation`);
      } catch (validationError) {
        console.error(`❌ MAPPING: Row ${i+1} failed validation:`, validationError);
        // We continue processing other rows even if some fail validation
      }
    } catch (error) {
      console.error(`❌ MAPPING: Error mapping row ${i+1}:`, error);
      // We continue processing other rows even if some fail mapping
    }
  }
  
  console.log(`🔄 MAPPING: Completed mapping ${mappedData.length} out of ${csvData.length} rows`);
  
  return {
    data: mappedData,
    warnings: {
      currencyWarning,
      message: currencyWarning ? 'Currency symbols detected in cost values' : ''
    }
  };
};

// Function to configure product matching options
export const configureProductMatching = (
  options: {
    useEan?: boolean;
    useMpn?: boolean;
    useName?: boolean;
    priority?: MatchMethod[];
  }
): MatchOptions => {
  // Start with default options
  const matchOptions: MatchOptions = {
    useEan: true,
    useMpn: true,
    useName: false,
    priority: [MatchMethod.EAN, MatchMethod.MPN, MatchMethod.NAME]
  };
  
  // Override with provided options
  if (options.useEan !== undefined) matchOptions.useEan = options.useEan;
  if (options.useMpn !== undefined) matchOptions.useMpn = options.useMpn;
  if (options.useName !== undefined) matchOptions.useName = options.useName;
  if (options.priority) matchOptions.priority = options.priority;

  // Ensure priority only includes enabled methods
  matchOptions.priority = matchOptions.priority.filter(method => {
    if (method === MatchMethod.EAN) return matchOptions.useEan;
    if (method === MatchMethod.MPN) return matchOptions.useMpn;
    if (method === MatchMethod.NAME) return matchOptions.useName;
    return false;
  });
  
  // If priority is empty after filtering, add enabled methods in default order
  if (matchOptions.priority.length === 0) {
    if (matchOptions.useEan) matchOptions.priority.push(MatchMethod.EAN);
    if (matchOptions.useMpn) matchOptions.priority.push(MatchMethod.MPN);
    if (matchOptions.useName) matchOptions.priority.push(MatchMethod.NAME);
  }
  
  return matchOptions;
};

// Main function to import supplier data with matching options
export const importSupplierData = async (
  mappedDataPromise: Promise<{ data: SupplierData[]; warnings: { currencyWarning: boolean; message: string; } }> | SupplierData[],
  matchOptions: MatchOptions = {
    useEan: true,
    useMpn: true,
    useName: false,
    priority: [MatchMethod.EAN, MatchMethod.MPN, MatchMethod.NAME]
  },
  progressCallback?: (current: number, total: number) => void,
  customBatchSize?: number,
  matchColumns?: MatchColumnMapping
) => {
  try {
    // Handle both old and new return types for backward compatibility
    let mappedData: SupplierData[];
    let warnings = { currencyWarning: false, message: '' };
    
    if (Array.isArray(mappedDataPromise)) {
      // Old format - just an array of data
      mappedData = mappedDataPromise;
    } else {
      // New format - object with data and warnings
      const result = await mappedDataPromise;
      if ('data' in result && Array.isArray(result.data)) {
        mappedData = result.data;
        warnings = result.warnings;
        
        // If non-USD currency symbols were detected, block the import
        if (warnings.currencyWarning) {
          throw new Error('Non-USD currency symbols detected. Please convert all prices to USD before uploading.');
        }
      } else {
        // Fallback in case the structure is unexpected
        mappedData = result as unknown as SupplierData[];
      }
    }
    
    if (!mappedData || mappedData.length === 0) {
      throw new Error('No supplier data to import');
    }

    // Report initial progress
    if (progressCallback) {
      progressCallback(0, mappedData.length);
    }

    // Server-side processing
    // First, validate data exists and we have match options
    console.log(`Starting server-side import with ${mappedData.length} rows`);
    console.log('Match options:', matchOptions);
    
    // Log custom match columns if provided
    if (matchColumns) {
      console.log('Custom match columns:', matchColumns);
    }
    
    // Debug sample data for logging
    if (mappedData.length > 0) {
      console.log('Sample data row:', mappedData[0]);
    }
    
    // Use API for server-side processing
    console.log('Using server-side processing through API...');
    
    // Create structure for server API
    const serverData = {
      data: mappedData,
      matchOptions: matchOptions,
      batchSize: customBatchSize || 100,
      matchColumns: matchColumns // Pass custom match columns to the server
    };
    
    try {
      const apiUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/suppliers/import`;
      console.log(`Sending request to ${apiUrl}`);
      
      // Send the request to server
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(serverData)
      });
      
      // Handle errors
      if (!response.ok) {
        // Try to get error details
        let errorMessage = `Server returned status ${response.status}`;
        try {
          const errorBody = await response.json();
          if (errorBody && errorBody.error) {
            errorMessage = `Server error: ${errorBody.error}`;
          }
        } catch (e) {
          // Couldn't parse error JSON, use status text
          errorMessage = `Server error: ${response.statusText}`;
        }
        
        console.error('Import failed:', errorMessage);
        throw new Error(errorMessage);
      }
      
      // Parse successful response
      const result = await response.json();
      console.log('Server import completed successfully:', result);
      
      return {
        processedCount: result.processedCount || 0,
        supplierCount: result.supplierCount || 0,
        matchStats: result.matchStats || {
          totalMatched: 0,
          byMethod: {
            [MatchMethod.EAN]: 0,
            [MatchMethod.MPN]: 0,
            [MatchMethod.NAME]: 0
          },
          unmatchedCount: 0
        }
      };
    } catch (error) {
      console.error('Error during server API call:', error);
      
      // Fallback to client-side import if server fails and the data is small enough
      if (mappedData.length <= 100) {
        console.log('Falling back to client-side import for small dataset');
        return performClientSideImport(mappedData);
      } else {
        throw error; // Re-throw for larger datasets
      }
    }
  } catch (error) {
    console.error('Error importing supplier data:', error);
    throw error;
  }
};

// Helper function for client-side import (fallback only)
const performClientSideImport = async (
  mappedData: SupplierData[]) => {
  console.warn('Using client-side import as fallback. This is not recommended for large datasets.');
  
  // Implement a simplified version of the server-side import logic
  // This is just a fallback and won't handle all cases
  
  // Group by supplier
  const supplierGroups: Record<string, { name: string, products: any[] }> = {};
  
  mappedData.forEach(row => {
    const { supplier_name, ...productData } = row;
    if (!supplierGroups[supplier_name]) {
      supplierGroups[supplier_name] = { name: supplier_name, products: [] };
    }
    supplierGroups[supplier_name].products.push(productData);
  });
  
  console.log(`Grouped ${mappedData.length} rows into ${Object.keys(supplierGroups).length} suppliers`);
  
  // Simulate results for client-side fallback
  const results = {
    processedCount: mappedData.length,
    supplierCount: Object.keys(supplierGroups).length,
    matchStats: {
      totalMatched: 0,
      byMethod: { 
        [MatchMethod.EAN]: 0,
        [MatchMethod.MPN]: 0,
        [MatchMethod.NAME]: 0
      },
      unmatchedCount: mappedData.length
    }
  };
  
  return results;
};

// Interface for custom matching column configuration
export interface MatchColumnMapping {
  ean?: string;  // CSV column to use for EAN matching
  mpn?: string;  // CSV column to use for MPN matching
  name?: string; // CSV column to use for product name matching
}

// Function to set custom column mappings for product matching
export const setMatchingColumns = (
  fieldMapping: { [key: string]: string },
  matchColumnMapping: MatchColumnMapping
): { 
  fieldMapping: { [key: string]: string },
  matchColumns: MatchColumnMapping
} => {
  // Clone the field mapping to avoid mutations
  const updatedFieldMapping = { ...fieldMapping };
  
  // Create a standardized match column mapping
  const matchColumns: MatchColumnMapping = {};

  // Set EAN column if provided
  if (matchColumnMapping.ean) {
    matchColumns.ean = matchColumnMapping.ean;
    // Update main field mapping if it's not already set
    if (!updatedFieldMapping['EAN']) {
      updatedFieldMapping['EAN'] = matchColumnMapping.ean;
    }
  }
  
  // Set MPN column if provided
  if (matchColumnMapping.mpn) {
    matchColumns.mpn = matchColumnMapping.mpn;
    // Update main field mapping if it's not already set
    if (!updatedFieldMapping['MPN']) {
      updatedFieldMapping['MPN'] = matchColumnMapping.mpn;
    }
  }
  
  // Set product name column if provided
  if (matchColumnMapping.name) {
    matchColumns.name = matchColumnMapping.name;
    // Update main field mapping if it's not already set
    if (!updatedFieldMapping['Product Name']) {
      updatedFieldMapping['Product Name'] = matchColumnMapping.name;
    }
  }
  
  return { fieldMapping: updatedFieldMapping, matchColumns };
};

// Updated function that accepts custom match column mapping
export const mapSupplierDataWithMatchColumns = async (
  csvData: any[], 
  fieldMapping: { [key: string]: string },
  matchColumns?: MatchColumnMapping
): Promise<{ 
  data: SupplierData[]; 
  warnings: { 
    currencyWarning: boolean; 
    message: string; 
  }
}> => {
  // Get all custom attributes to map them - only once for all data
  const { data: customAttributes, error } = await supabase
    .from('custom_attributes')
    .select('*')
    .eq('for_type', 'supplier');
    
  if (error) {
    console.error('Error fetching custom attributes:', error);
    throw error;
  }
  
  let hasCurrencyWarning = false;
  let missingSupplierNameCount = 0;
  
  // Pre-process all data in a single loop to avoid multiple iterations
  const mappedData = csvData.map(row => {
    // Process cost value and check for currency warnings
    const { cost, currencyWarning } = processCostValue(row[fieldMapping['Cost']]?.trim());
    if (currencyWarning) {
      hasCurrencyWarning = true;
    }
    
    // Get supplier name and ensure it's valid
    let supplierName = row[fieldMapping['Supplier Name']]?.trim() || '';
    
    // If supplier name is empty, try to use a different field or generate a placeholder
    if (!supplierName) {
      // Try to use another field as fallback
      supplierName = row[fieldMapping['Product Name']]?.trim() || 'Unknown Supplier';
      missingSupplierNameCount++;
    }
    
    // Normalize supplier name to avoid issues with case or whitespace
    supplierName = supplierName.replace(/\s+/g, ' ').trim();
    
    // Use custom match columns if provided, otherwise fallback to standard mapping
    const eanCol = matchColumns?.ean ? matchColumns.ean : fieldMapping['EAN'];
    const mpnCol = matchColumns?.mpn ? matchColumns.mpn : fieldMapping['MPN'];
    const nameCol = matchColumns?.name ? matchColumns.name : fieldMapping['Product Name'];
    
    const supplierData: SupplierData = {
      supplier_name: supplierName,
      ean: row[eanCol]?.trim() || '',
      mpn: row[mpnCol]?.trim() || '',
      product_name: row[nameCol]?.trim() || '',
      cost: cost,
      moq: row[fieldMapping['MOQ']] ? parseInt(row[fieldMapping['MOQ']]) : undefined,
      lead_time: row[fieldMapping['Lead Time']]?.trim(),
      payment_terms: row[fieldMapping['Payment Terms']]?.trim()
    };
    
    // Map custom attributes in a single pass
    if (customAttributes && customAttributes.length > 0) {
      const customAttrs: Record<string, any> = {};
      let hasCustomAttrs = false;
      
      for (const attr of customAttributes) {
        let value = null;
        
        if (fieldMapping[attr.name] && row[fieldMapping[attr.name]]) {
          value = row[fieldMapping[attr.name]];
          
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
          
          customAttrs[attr.name] = value;
          hasCustomAttrs = true;
        } else if (attr.required) {
          // For required attributes, use default value if available
          customAttrs[attr.name] = attr.default_value;
          hasCustomAttrs = true;
        }
      }
      
      if (hasCustomAttrs) {
        supplierData.custom_attributes = customAttrs;
      }
    }
    
    return supplierData;
  });
  
  if (missingSupplierNameCount > 0) {
    console.warn(`Found ${missingSupplierNameCount} rows with missing supplier names that were replaced with fallbacks.`);
  }
  
  // Check if all data has valid supplier_name
  const validSupplierNameCount = mappedData.filter(item => item.supplier_name && item.supplier_name.trim() !== '').length;
  console.log(`Mapped ${mappedData.length} rows, ${validSupplierNameCount} with valid supplier names.`);
  
  // Validate all mapped data items in parallel for better performance
  const validationPromises = mappedData.map(validateSupplierData);
  const validationResults = await Promise.allSettled(validationPromises);
  
  // Filter out failed validations
  const validatedData: SupplierData[] = mappedData.filter((_, index) => {
    const result = validationResults[index];
    if (result.status === 'rejected') {
      console.warn(`Skipping invalid supplier data: ${result.reason instanceof Error ? result.reason.message : 'Unknown error'}`);
      return false;
    }
    return true;
  });
  
  return {
    data: validatedData,
    warnings: {
      currencyWarning: hasCurrencyWarning,
      message: hasCurrencyWarning ? 'Non-USD currency symbols detected. Please convert all prices to USD before uploading.' : ''
    }
  };
};

// Helper function to find column names in field mappings
export const findColumn = (
  fieldMapping: { [key: string]: string },
  possibleNames: string[]
): string => {
  // First check if any of the possible names are directly in the mapping
  for (const name of possibleNames) {
    if (fieldMapping[name]) {
      return fieldMapping[name];
    }
  }
  
  // Then check if any mapping keys contain any of the possible names
  const keys = Object.keys(fieldMapping);
  for (const name of possibleNames) {
    const key = keys.find(k => k.toLowerCase().includes(name.toLowerCase()));
    if (key) {
      return fieldMapping[key];
    }
  }
  
  // Return the first possible name as a fallback
  return possibleNames[0] || '';
};

// Look for any place EAN is processed and update it

// For example, if there's a function that processes supplier products
export const mapSupplierProductsData = (
  csvData: any[], 
  fieldMapping: { [key: string]: string }, 
  supplierId: string
): any[] => {
  return csvData.map(row => {
    // Find the EAN column in the mapping
    const eanCol = findColumn(fieldMapping, ['ean', 'barcode', 'upc', 'product_id', 'sku']);
    
    // Process the supplier product data
    return {
      supplier_id: supplierId,
      // Use the fixScientificNotation helper function for EAN codes
      ean: fixScientificNotation(row[eanCol]),
      cost: parseFloat(row[fieldMapping['cost']]) || 0,
      moq: parseInt(row[fieldMapping['moq']]) || null,
      lead_time: row[fieldMapping['lead_time']]?.trim() || null,
      payment_terms: row[fieldMapping['payment_terms']]?.trim() || null,
      product_name: row[fieldMapping['product_name']]?.trim() || null,
      mpn: row[fieldMapping['mpn']]?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });
};