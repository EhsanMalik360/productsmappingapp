import Papa from 'papaparse';
import { supabase } from '../lib/supabase';

export interface CSVRow {
  [key: string]: string;
}

export const parseCSV = (file: File): Promise<CSVRow[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data as CSVRow[]);
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};

export const validateRequiredFields = (data: CSVRow[]): boolean => {
  return data.length > 0 && Object.keys(data[0]).length > 0;
};

// Helper function to normalize column names for comparison
const normalizeColumnName = (name: string): string => {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};

// Function to automatically map CSV columns to system fields
export const autoMapColumns = (csvHeaders: string[]): { [key: string]: string } => {
  const fieldMappings: { [key: string]: string[] } = {
    'Title': ['title', 'product_name', 'name', 'product_title'],
    'EAN': ['ean', 'barcode', 'upc', 'product_id', 'sku'],
    'Brand': ['brand', 'manufacturer', 'vendor'],
    'Sale Price': ['sale_price', 'price', 'selling_price', 'retail_price'],
    'Units Sold': ['units_sold', 'quantity_sold', 'sales_quantity', 'sold'],
    'Amazon Fee': ['amazon_fee', 'fee', 'fba_fee', 'marketplace_fee'],
    'Buy Box Price': ['buy_box_price', 'buybox_price', 'competitive_price', 'market_price'],
    'Category': ['category', 'product_category', 'department', 'product_type'],
    'Rating': ['rating', 'product_rating', 'avg_rating', 'average_rating'],
    'Review Count': ['review_count', 'reviews', 'number_of_reviews', 'total_reviews']
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

export const mapCSVData = (data: CSVRow[], fieldMapping: { [key: string]: string }) => {
  // Create a reverse mapping for easier lookup
  const reverseMapping: { [key: string]: string } = {};
  for (const [systemField, csvField] of Object.entries(fieldMapping)) {
    reverseMapping[csvField] = systemField;
  }

  return data.map(row => {
    const mappedRow: { [key: string]: any } = {
      title: '',
      ean: '',
      brand: '',
      sale_price: 0,
      units_sold: 0,
      amazon_fee: 0,
      buy_box_price: 0,
      category: null,
      rating: null,
      review_count: 0,
      updated_at: new Date().toISOString()
    };

    // First, try to map all CSV columns to database fields
    for (const [csvColumn, value] of Object.entries(row)) {
      const trimmedValue = value?.trim();
      if (!trimmedValue) continue;

      // Try to find a matching system field from the mapping
      const systemField = reverseMapping[csvColumn];
      
      if (systemField) {
        // Handle mapped fields
        switch (systemField) {
          case 'Title':
            mappedRow.title = trimmedValue;
            break;
          case 'EAN':
            mappedRow.ean = trimmedValue;
            break;
          case 'Brand':
            mappedRow.brand = trimmedValue;
            break;
          case 'Sale Price':
            mappedRow.sale_price = parseFloat(trimmedValue) || 0;
            break;
          case 'Units Sold':
            mappedRow.units_sold = parseInt(trimmedValue) || 0;
            break;
          case 'Amazon Fee':
            mappedRow.amazon_fee = parseFloat(trimmedValue) || 0;
            break;
          case 'Buy Box Price':
            mappedRow.buy_box_price = parseFloat(trimmedValue) || 0;
            break;
          case 'Category':
            mappedRow.category = trimmedValue;
            break;
          case 'Rating':
            const rating = parseFloat(trimmedValue);
            mappedRow.rating = !isNaN(rating) ? Math.min(Math.max(rating, 0), 5) : null;
            break;
          case 'Review Count':
            mappedRow.review_count = parseInt(trimmedValue) || 0;
            break;
        }
      }
    }

    // Validate required fields
    if (!mappedRow.title) throw new Error('Product title is required');
    if (!mappedRow.ean) throw new Error('Product EAN is required');
    if (!mappedRow.brand) throw new Error('Product brand is required');
    if (mappedRow.sale_price <= 0) throw new Error('Sale price must be greater than 0');

    return mappedRow;
  });
};

export const importAmazonProducts = async (mappedData: any[]) => {
  try {
    if (!mappedData || mappedData.length === 0) {
      throw new Error('No data to import');
    }

    // Process in batches
    const batchSize = 25;
    const results = [];
    let processedCount = 0;

    for (let i = 0; i < mappedData.length; i += batchSize) {
      const batch = mappedData.slice(i, i + batchSize);
      
      // First, get existing products by EAN
      const eans = batch.map(item => item.ean);
      const { data: existingProducts } = await supabase
        .from('products')
        .select('id, ean')
        .in('ean', eans);

      // Separate updates and inserts
      const updates = [];
      const inserts = [];

      batch.forEach(item => {
        const existing = existingProducts?.find(p => p.ean === item.ean);
        if (existing) {
          updates.push({ ...item, id: existing.id });
        } else {
          inserts.push(item);
        }
      });

      // Handle updates
      if (updates.length > 0) {
        const { data: updatedData, error: updateError } = await supabase
          .from('products')
          .upsert(updates)
          .select();

        if (updateError) throw updateError;
        if (updatedData) results.push(...updatedData);
      }

      // Handle inserts
      if (inserts.length > 0) {
        const { data: insertedData, error: insertError } = await supabase
          .from('products')
          .insert(inserts)
          .select();

        if (insertError) throw insertError;
        if (insertedData) results.push(...insertedData);
      }

      processedCount += batch.length;

      // Add a small delay between batches
      if (i + batchSize < mappedData.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return results;
  } catch (error) {
    console.error('Error importing products:', error);
    throw error;
  }
};

export const importSupplierData = async (mappedData: any[]) => {
  try {
    if (!mappedData || mappedData.length === 0) {
      throw new Error('No supplier data to import');
    }

    // Group data by supplier
    const supplierGroups = mappedData.reduce((acc: any, row) => {
      const supplierName = row['Supplier Name'];
      if (!acc[supplierName]) {
        acc[supplierName] = {
          name: supplierName,
          products: []
        };
      }
      
      acc[supplierName].products.push({
        ean: row['EAN'],
        cost: Math.max(parseFloat(row['Cost']) || 0, 0),
        moq: Math.max(parseInt(row['MOQ'] || '1'), 1),
        lead_time: row['Lead Time'] || '3 days',
        payment_terms: row['Payment Terms'] || 'Net 30'
      });
      
      return acc;
    }, {});

    const results = [];

    // Process each supplier
    for (const [supplierName, supplierData] of Object.entries(supplierGroups)) {
      // Insert or update supplier
      const { data: supplier, error: supplierError } = await supabase
        .from('suppliers')
        .upsert({ name: supplierName }, { returning: true })
        .select()
        .single();

      if (supplierError) throw supplierError;

      // Get all products for this supplier's EANs
      const eans = (supplierData as any).products.map((p: any) => p.ean);
      
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, ean')
        .in('ean', eans);

      if (productsError) throw productsError;
      if (!products || products.length === 0) continue;

      // Create supplier-product relationships
      const supplierProducts = (supplierData as any).products
        .map((p: any) => {
          const product = products.find(prod => prod.ean === p.ean);
          if (!product) return null;

          return {
            supplier_id: supplier.id,
            product_id: product.id,
            cost: p.cost,
            moq: p.moq,
            lead_time: p.lead_time,
            payment_terms: p.payment_terms,
            updated_at: new Date().toISOString()
          };
        })
        .filter(Boolean);

      if (supplierProducts.length > 0) {
        // Process supplier products in smaller batches
        const batchSize = 25;
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

          // Add a small delay between batches
          if (i + batchSize < supplierProducts.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Error importing supplier data:', error);
    throw error;
  }
};