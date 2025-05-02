import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

// Import app context to access required attributes

type Tables = Database['public']['Tables'];
type SupplierInsert = Tables['suppliers']['Insert'];
type SupplierProductInsert = Tables['supplier_products']['Insert'];

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
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
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
    'Supplier Name': ['supplier_name', 'supplier', 'vendor_name', 'vendor', 'company_name', 'company'],
    'EAN': ['ean', 'barcode', 'upc', 'product_id', 'sku', 'asin', 'gtin'],
    'MPN': ['mpn', 'manufacturer_part_number', 'part_number', 'part_no', 'manufacturer_number'],
    'Product Name': ['product_name', 'title', 'item_name', 'product_title', 'product', 'item'],
    'Cost': ['cost', 'unit_cost', 'price', 'supplier_cost', 'wholesale_price'],
    'MOQ': ['moq', 'minimum_order_quantity', 'min_order', 'minimum_qty'],
    'Lead Time': ['lead_time', 'leadtime', 'delivery_time', 'processing_time'],
    'Payment Terms': ['payment_terms', 'terms', 'payment', 'payment_conditions']
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

export const validateSupplierData = async (data: any): Promise<boolean> => {
  try {
    // Only validate required fields
    if (!data.supplier_name || typeof data.supplier_name !== 'string') {
      throw new Error('Supplier name is required');
    }
    if (data.ean !== undefined && typeof data.ean !== 'string') {
      throw new Error('Product EAN must be a string if provided');
    }
    if (typeof data.cost !== 'number' || data.cost <= 0) {
      throw new Error('Cost must be a positive number');
    }
      
    // Check for required custom attributes if specified
    if (data.custom_attributes) {
      // Fetch required custom attributes from database
      const { data: requiredAttributes, error } = await supabase
        .from('custom_attributes')
        .select('*')
        .eq('for_type', 'supplier')
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
    
    // Skip all validation for non-required fields (moq, lead_time, payment_terms, etc.)
    
    return true;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Invalid supplier data');
  }
};

export const mapSupplierData = async (csvData: any[], fieldMapping: { [key: string]: string }): Promise<{ 
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
  
  // Pre-process all data in a single loop to avoid multiple iterations
  const mappedData = csvData.map(row => {
    // Process cost value and check for currency warnings
    const { cost, currencyWarning } = processCostValue(row[fieldMapping['Cost']]?.trim());
    if (currencyWarning) {
      hasCurrencyWarning = true;
    }
    
    const supplierData: SupplierData = {
      supplier_name: row[fieldMapping['Supplier Name']]?.trim() || '',
      ean: row[fieldMapping['EAN']]?.trim() || '',
      mpn: row[fieldMapping['MPN']]?.trim() || '',
      product_name: row[fieldMapping['Product Name']]?.trim() || '',
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

export const importSupplierData = async (
  mappedDataPromise: Promise<{ data: SupplierData[]; warnings: { currencyWarning: boolean; message: string; } }> | SupplierData[],
  matchOptions: MatchOptions = {
    useEan: true,
    useMpn: true,
    useName: false,
    priority: [MatchMethod.EAN, MatchMethod.MPN, MatchMethod.NAME]
  },
  progressCallback?: (current: number, total: number) => void,
  customBatchSize?: number
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

    // OPTIMIZATION: Preprocess all data before doing any database operations
    // Group data by supplier - this reduces the number of upsert operations
    const supplierGroups = mappedData.reduce((acc, row) => {
      const { supplier_name, custom_attributes, ...productData } = row;
      if (!acc[supplier_name]) {
        acc[supplier_name] = {
          name: supplier_name,
          custom_attributes: custom_attributes || {},
          products: []
        };
      }
      acc[supplier_name].products.push(productData);
      return acc;
    }, {} as { [key: string]: { name: string; custom_attributes: Record<string, any>; products: Omit<SupplierData, 'supplier_name' | 'custom_attributes'>[] } });

    const results = [];
    let processedCount = 0;
    // Allow custom batch size to be passed in
    const batchSize = customBatchSize || 100; // Default to 100 instead of 50 for better performance

    // OPTIMIZATION: Get all custom attributes in a single query at the start
    const { data: customAttributes, error: customAttrError } = await supabase
      .from('custom_attributes')
      .select('*')
      .eq('for_type', 'supplier');
      
    if (customAttrError) throw customAttrError;

    // OPTIMIZATION: Prepare all supplier upserts at once
    const supplierNames = Object.keys(supplierGroups);
    const supplierUpsertData = supplierNames.map(name => ({ name }));

    // OPTIMIZATION: Upsert all suppliers in a single batch operation
    const { data: upsertedSuppliers, error: suppliersError } = await supabase
      .from('suppliers')
      .upsert(supplierUpsertData as SupplierInsert[], { 
        onConflict: 'name',
        ignoreDuplicates: false 
      })
      .select('id,name');
      
    if (suppliersError) throw suppliersError;
    if (!upsertedSuppliers) throw new Error('Failed to upsert suppliers');

    // Create a lookup map for supplier IDs by name for quick access
    const supplierIdsByName: Record<string, string> = {};
    upsertedSuppliers.forEach(s => {
      supplierIdsByName[s.name] = s.id;
    });

    // Add progress reporting in the supplier processing loop
    let currentProcessed = 0;
    
    // OPTIMIZATION: Collect all identifiers up front
    const eans = new Set<string>();
    const mpns = new Set<string>();
    const productNames = new Set<string>();
    
    // Collect all possible identifiers for a single database query
    for (const supplierData of Object.values(supplierGroups)) {
      supplierData.products.forEach(p => {
        if (matchOptions.useEan && p.ean) eans.add(p.ean);
        if (matchOptions.useMpn && p.mpn) mpns.add(p.mpn);
        if (matchOptions.useName && p.product_name) productNames.add(p.product_name);
      });
    }
    
    // OPTIMIZATION: Fetch all products that could match in a single query
    let filter = [];
    
    if (matchOptions.useEan && eans.size > 0) {
      // Split large IN clauses into chunks to avoid query limits
      const eanChunks = Array.from(eans).reduce((chunks, ean, index) => {
        const chunkIndex = Math.floor(index / 500); // Max 500 items per IN clause
        if (!chunks[chunkIndex]) chunks[chunkIndex] = [];
        chunks[chunkIndex].push(ean);
        return chunks;
      }, [] as string[][]);
      
      for (const chunk of eanChunks) {
        filter.push(`ean.in.(${chunk.map(ean => `"${ean}"`).join(',')})`);
      }
    }
    
    if (matchOptions.useMpn && mpns.size > 0) {
      const mpnChunks = Array.from(mpns).reduce((chunks, mpn, index) => {
        const chunkIndex = Math.floor(index / 500);
        if (!chunks[chunkIndex]) chunks[chunkIndex] = [];
        chunks[chunkIndex].push(mpn);
        return chunks;
      }, [] as string[][]);
      
      for (const chunk of mpnChunks) {
        filter.push(`mpn.in.(${chunk.map(mpn => `"${mpn}"`).join(',')})`);
      }
    }
    
    if (matchOptions.useName && productNames.size > 0) {
      const nameChunks = Array.from(productNames).reduce((chunks, name, index) => {
        const chunkIndex = Math.floor(index / 500);
        if (!chunks[chunkIndex]) chunks[chunkIndex] = [];
        chunks[chunkIndex].push(name);
        return chunks;
      }, [] as string[][]);
      
      for (const chunk of nameChunks) {
        filter.push(`title.in.(${chunk.map(name => `"${name}"`).join(',')})`);
      }
    }
    
    // Only query if we have filters
    let allProducts: { id: string; ean?: string; mpn?: string; title?: string }[] = [];
    
    // OPTIMIZATION: Execute multiple queries in parallel if we have large filter sets
    if (filter.length > 0) {
      const productQueries = filter.map(f => 
        supabase
          .from('products')
          .select('id, ean, mpn, title')
          .or(f)
      );
      
      const productResults = await Promise.all(productQueries);
      
      // Combine all results
      for (const result of productResults) {
        if (result.error) throw result.error;
        if (result.data) {
          allProducts = [...allProducts, ...result.data];
        }
      }
    }
    
    // OPTIMIZATION: Create a map for faster product lookup
    const productsByEan: Record<string, any> = {};
    const productsByMpn: Record<string, any> = {};
    const productsByName: Record<string, any> = {};
    
    allProducts.forEach(product => {
      if (product.ean) productsByEan[product.ean] = product;
      if (product.mpn) productsByMpn[product.mpn] = product;
      if (product.title) productsByName[product.title] = product;
    });
    
    // OPTIMIZATION: Prepare custom attribute values for all suppliers at once
    const allAttributeValues = [];
    
    if (customAttributes && customAttributes.length > 0) {
      for (const [supplierName, supplierData] of Object.entries(supplierGroups)) {
        const supplierId = supplierIdsByName[supplierName];
        if (!supplierId) continue;
        
        for (const attr of customAttributes) {
          if (supplierData.custom_attributes && supplierData.custom_attributes[attr.name] !== undefined) {
            allAttributeValues.push({
              attribute_id: attr.id,
              entity_id: supplierId,
              value: supplierData.custom_attributes[attr.name]
            });
          }
        }
      }
      
      // OPTIMIZATION: Upsert all custom attribute values in a single batch
      if (allAttributeValues.length > 0) {
        const { error: valuesError } = await supabase
          .from('custom_attribute_values')
          .upsert(allAttributeValues, {
            onConflict: 'attribute_id,entity_id',
            ignoreDuplicates: false
          });
          
        if (valuesError) throw valuesError;
      }
    }
    
    // Now process all suppliers and their products
    const allSupplierProducts = [];
    
    for (const [supplierName, supplierData] of Object.entries(supplierGroups)) {
      const supplierId = supplierIdsByName[supplierName];
      if (!supplierId) continue;
      
      // Match products in priority order
      const matchedProducts: Array<{
        supplierProduct: Omit<SupplierData, 'supplier_name' | 'custom_attributes'>;
        product: { id: string; [key: string]: any };
        matchMethod: MatchMethod;
      }> = [];
      
      // Track which supplier products have been matched already
      const matchedSupplierProductIndices = new Set<number>();
      
      // Perform matching in priority order, but using product maps for faster lookup
      for (const method of matchOptions.priority) {
        // Skip methods that are disabled
        if (
          (method === MatchMethod.EAN && !matchOptions.useEan) ||
          (method === MatchMethod.MPN && !matchOptions.useMpn) ||
          (method === MatchMethod.NAME && !matchOptions.useName)
        ) {
          continue;
        }
        
        // Match supplier products to the fetched products using maps for O(1) lookup
        supplierData.products.forEach((supplierProduct, index) => {
          // Skip if this supplier product has already been matched
          if (matchedSupplierProductIndices.has(index)) {
            return;
          }
          
          let match = null;
          
          // Find matching product using maps instead of looping through all products
          if (method === MatchMethod.EAN && supplierProduct.ean) {
            match = productsByEan[supplierProduct.ean];
          } else if (method === MatchMethod.MPN && supplierProduct.mpn) {
            match = productsByMpn[supplierProduct.mpn];
          } else if (method === MatchMethod.NAME && supplierProduct.product_name) {
            match = productsByName[supplierProduct.product_name];
          }
          
          if (match) {
            matchedProducts.push({
              supplierProduct,
              product: match,
              matchMethod: method
            });
            matchedSupplierProductIndices.add(index);
          }
        });
      }
      
      // Create supplier-product relationships for matched products
      const supplierProductsForThisSupplier = matchedProducts.map(match => {
        return {
          supplier_id: supplierId,
          product_id: match.product.id,
          ean: match.supplierProduct.ean || '',
          cost: match.supplierProduct.cost,
          moq: match.supplierProduct.moq || 1,
          lead_time: match.supplierProduct.lead_time || '3 days',
          payment_terms: match.supplierProduct.payment_terms || 'Net 30',
          match_method: match.matchMethod,
          updated_at: new Date().toISOString()
        } as SupplierProductInsert;
      });
      
      // Add to the collection of all supplier products
      allSupplierProducts.push(...supplierProductsForThisSupplier);
      
      // Update progress after processing each supplier
      currentProcessed += supplierData.products.length;
      if (progressCallback) {
        progressCallback(Math.min(currentProcessed, mappedData.length), mappedData.length);
      }
    }
    
    // OPTIMIZATION: Process all supplier products in larger batches for better throughput
    for (let i = 0; i < allSupplierProducts.length; i += batchSize) {
      const batch = allSupplierProducts.slice(i, i + batchSize);
      
      if (batch.length > 0) {
        const { data: insertedData, error: relationError } = await supabase
          .from('supplier_products')
          .upsert(batch, {
            onConflict: 'supplier_id,product_id',
            ignoreDuplicates: false
          })
          .select();

        if (relationError) throw relationError;
        if (insertedData) results.push(...insertedData);

        processedCount += batch.length;
      }
    }

    // Calculate match method statistics
    const matchMethodStats = results.reduce((acc: {[key: string]: number}, item) => {
      const method = item.match_method || MatchMethod.EAN;
      acc[method] = (acc[method] || 0) + 1;
      return acc;
    }, {});

    return {
      results,
      processedCount,
      supplierCount: Object.keys(supplierGroups).length,
      warnings,
      matchStats: {
        totalMatched: processedCount,
        byMethod: matchMethodStats
      }
    };
  } catch (error) {
    console.error('Error importing supplier data:', error);
    throw error;
  }
};