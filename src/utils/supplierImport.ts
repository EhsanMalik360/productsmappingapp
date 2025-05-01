import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

// Import app context to access required attributes
import { CustomAttribute } from '../context/AppContext';

type Tables = Database['public']['Tables'];
type SupplierInsert = Tables['suppliers']['Insert'];
type SupplierProductInsert = Tables['supplier_products']['Insert'];

export interface SupplierData {
  supplier_name: string;
  ean: string;
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

// Function to automatically map supplier CSV columns to system fields
export const autoMapSupplierColumns = async (csvHeaders: string[]): Promise<{ [key: string]: string }> => {
  const fieldMappings: { [key: string]: string[] } = {
    'Supplier Name': ['supplier_name', 'supplier', 'vendor_name', 'vendor', 'company_name', 'company'],
    'EAN': ['ean', 'barcode', 'upc', 'product_id', 'sku'],
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
    if (!data.ean || typeof data.ean !== 'string') {
      throw new Error('Product EAN is required');
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

export const mapSupplierData = async (csvData: any[], fieldMapping: { [key: string]: string }): Promise<SupplierData[]> => {
  // Get all custom attributes to map them
  const { data: customAttributes, error } = await supabase
    .from('custom_attributes')
    .select('*')
    .eq('for_type', 'supplier');
    
  if (error) {
    console.error('Error fetching custom attributes:', error);
    throw error;
  }
  
  const mappedData = csvData.map(row => {
    const supplierData: SupplierData = {
      supplier_name: row[fieldMapping['Supplier Name']]?.trim() || '',
      ean: row[fieldMapping['EAN']]?.trim() || '',
      cost: parseFloat(row[fieldMapping['Cost']]) || 0,
      moq: parseInt(row[fieldMapping['MOQ']]) || 1,
      lead_time: row[fieldMapping['Lead Time']]?.trim() || '3 days',
      payment_terms: row[fieldMapping['Payment Terms']]?.trim() || 'Net 30',
      custom_attributes: {}
    };
    
    // Map any custom attributes found in the CSV
    if (customAttributes) {
      customAttributes.forEach(attr => {
        if (fieldMapping[attr.name] && row[fieldMapping[attr.name]]) {
          if (!supplierData.custom_attributes) {
            supplierData.custom_attributes = {};
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
          
          supplierData.custom_attributes[attr.name] = value;
        } else if (attr.required) {
          // For required attributes, use default value if available
          if (!supplierData.custom_attributes) {
            supplierData.custom_attributes = {};
          }
          supplierData.custom_attributes[attr.name] = attr.default_value;
        }
      });
    }
    
    return supplierData;
  });
  
  // Validate all mapped data items
  const validatedData: SupplierData[] = [];
  for (const item of mappedData) {
    try {
      await validateSupplierData(item);
      validatedData.push(item);
    } catch (error) {
      console.warn(`Skipping invalid supplier data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // You could handle or report the error here
    }
  }
  
  return validatedData;
};

export const importSupplierData = async (mappedDataPromise: Promise<SupplierData[]> | SupplierData[]) => {
  try {
    // Ensure mappedData is resolved if it's a Promise
    const mappedData = Array.isArray(mappedDataPromise) ? mappedDataPromise : await mappedDataPromise;
    
    if (!mappedData || mappedData.length === 0) {
      throw new Error('No supplier data to import');
    }

    // Group data by supplier
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
    const batchSize = 25;

    // Get all custom attributes
    const { data: customAttributes, error: customAttrError } = await supabase
      .from('custom_attributes')
      .select('*')
      .eq('for_type', 'supplier');
      
    if (customAttrError) throw customAttrError;

    // Process each supplier
    for (const [supplierName, supplierData] of Object.entries(supplierGroups)) {
      // Insert or update supplier
      const { data: supplier, error: supplierError } = await supabase
        .from('suppliers')
        .upsert({ name: supplierName } as SupplierInsert, { 
          onConflict: 'name',
          ignoreDuplicates: false 
        })
        .select()
        .single();

      if (supplierError) throw supplierError;

      // Save custom attribute values if any
      if (customAttributes && customAttributes.length > 0 && supplierData.custom_attributes) {
        const attributeValues = [];
        
        for (const attr of customAttributes) {
          if (supplierData.custom_attributes[attr.name] !== undefined) {
            attributeValues.push({
              attribute_id: attr.id,
              entity_id: supplier.id,
              value: supplierData.custom_attributes[attr.name]
            });
          }
        }
        
        if (attributeValues.length > 0) {
          const { error: valuesError } = await supabase
            .from('custom_attribute_values')
            .upsert(attributeValues, {
              onConflict: 'attribute_id,entity_id',
              ignoreDuplicates: false
            });
            
          if (valuesError) throw valuesError;
        }
      }

      // Get all products for this supplier's EANs
      const eans = supplierData.products.map(p => p.ean);
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, ean')
        .in('ean', eans);

      if (productsError) throw productsError;
      if (!products || products.length === 0) continue;

      // Create supplier-product relationships
      const supplierProducts = supplierData.products
        .map(p => {
          const product = products.find(prod => prod.ean === p.ean);
          if (!product) return null;

          return {
            supplier_id: supplier.id,
            product_id: product.id,
            ean: p.ean, // Add EAN to supplier_products
            cost: p.cost,
            moq: p.moq,
            lead_time: p.lead_time,
            payment_terms: p.payment_terms,
            updated_at: new Date().toISOString()
          } as SupplierProductInsert;
        })
        .filter((p): p is SupplierProductInsert => p !== null);

      // Process supplier products in batches
      for (let i = 0; i < supplierProducts.length; i += batchSize) {
        const batch = supplierProducts.slice(i, i + batchSize);
        
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

        // Add a small delay between batches
        if (i + batchSize < supplierProducts.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }

    return {
      results,
      processedCount,
      supplierCount: Object.keys(supplierGroups).length
    };
  } catch (error) {
    console.error('Error importing supplier data:', error);
    throw error;
  }
};