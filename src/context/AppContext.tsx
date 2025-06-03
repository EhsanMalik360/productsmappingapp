import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSuppliers } from '../hooks/useSupabase';
import { useProducts } from '../hooks/useProducts';
import { supabase } from '../lib/supabase';

// Define types
export interface Product {
  id: string;
  title: string;
  ean: string;
  brand: string;
  salePrice: number;
  unitsSold: number;
  amazonFee: number;
  referralFee: number;
  buyBoxPrice: number;
  category?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  mpn?: string | null;
}

export interface Supplier {
  id: string;
  name: string;
}

export interface SupplierProduct {
  id: string;
  supplier_id: string;
  product_id: string | null;
  cost: number;
  ean: string;
  brand?: string | null;
  moq?: number | null;
  lead_time?: string | null;
  payment_terms?: string | null;
  match_method?: string;
  mpn?: string | null;
  product_name?: string | null;
  suppliers?: Supplier | any;
}

export interface CustomAttribute {
  id: string;
  name: string;
  type: 'Text' | 'Number' | 'Date' | 'Yes/No' | 'Selection';
  defaultValue: string | number | boolean | null;
  required: boolean;
  forType: 'product' | 'supplier';
  hasColumnMapping?: boolean;
}

export interface CustomAttributeValue {
  attributeId: string;
  entityId: string;
  value: any;
}

// Context type
interface AppContextType {
  products: Product[];
  suppliers: Supplier[];
  customAttributes: CustomAttribute[];
  supplierProducts: SupplierProduct[];
  loading: boolean;
  initialLoading: boolean;
  error: Error | null;
  totalProductCount: number;
  addProduct: (product: Omit<Product, 'id'>) => Promise<Product>;
  updateProduct: (product: Product) => Promise<Product>;
  addSupplier: (supplier: Omit<Supplier, 'id'>) => Promise<Supplier>;
  updateSupplier: (id: string, updates: Partial<Supplier>) => Promise<Supplier>;
  deleteSupplier: (id: string) => Promise<void>;
  addCustomAttribute: (attribute: Omit<CustomAttribute, 'id'>) => Promise<CustomAttribute>;
  updateCustomAttribute: (id: string, updates: Partial<CustomAttribute>) => Promise<CustomAttribute>;
  deleteCustomAttribute: (id: string) => Promise<void>;
  getAttributeValue: (attributeId: string, entityId: string) => any;
  setAttributeValue: (attributeId: string, entityId: string, value: any) => Promise<void>;
  getEntityAttributes: (entityId: string, forType: 'product' | 'supplier') => Array<{attribute: CustomAttribute, value: any}>;
  getRequiredAttributes: (forType: 'product' | 'supplier') => CustomAttribute[];
  validateRequiredAttributes: (entityId: string, forType: 'product' | 'supplier') => {valid: boolean, missingAttributes: CustomAttribute[]};
  getProductById: (id: string) => Product | undefined;
  getSuppliersForProduct: (productId: string) => SupplierProduct[];
  getBestSupplierForProduct: (productId: string) => SupplierProduct | undefined;
  fetchLinkedSuppliersForProduct: (productId: string) => Promise<SupplierProduct[]>;
  refreshData: () => Promise<void>;
  fetchProducts: (
    page?: number, 
    pageSize?: number, 
    filters?: {
      searchTerm?: string,
      brand?: string,
      category?: string,
      priceRange?: { min: number, max: number },
      hasSuppliers?: boolean | null,
      sortField?: string,
      sortOrder?: 'asc' | 'desc'
    }
  ) => Promise<{ data: any[], count: number }>;
  fetchSupplierProducts: (
    supplierId: string,
    page?: number,
    pageSize?: number,
    filters?: {
      searchTerm?: string,
      filterOption?: 'all' | 'matched' | 'unmatched',
      costRange?: { min: number, max: number },
      matchMethodFilter?: string | null,
      selectedBrand?: string,
      sortField?: string,
      sortOrder?: 'asc' | 'desc'
    }
  ) => Promise<{ data: SupplierProduct[], count: number }>;
  getBrands: () => Promise<string[]>;
  getCategories: () => Promise<string[]>;
  getPriceRange: () => Promise<{min: number, max: number}>;
  cacheSupplierById: (id: string) => Supplier | undefined;
  supplierCache: Record<string, {
    supplier: Supplier | undefined,
    products: SupplierProduct[],
    count: number,
    timestamp: number
  }>;
}

// Create context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider component
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Add a state to keep track of whether initial data has been loaded
  const [dataInitialized, setDataInitialized] = useState<boolean>(false);
  
  // Use our new enhanced products hook
  const {
    products: enhancedProducts,
    totalCount: enhancedTotalCount,
    isLoading: enhancedLoading,
    isInitialLoad: enhancedInitialLoading,
    error: enhancedError,
    getProducts,
    getBrands: getProductBrands,
    getCategories: getProductCategories,
    getPriceRange: getProductPriceRange
  } = useProducts();

  const {
    suppliers: dbSuppliers, 
    loading: suppliersLoading, 
    initialLoading: suppliersInitialLoading,
    error: suppliersError,
    addSupplier: addSupplierToDb,
    updateSupplier: updateSupplierInDb,
    deleteSupplier: deleteSupplierFromDb,
    refreshSuppliers 
  } = useSuppliers(dataInitialized);

  // Convert DB products to app format
  const products = useMemo(() => enhancedProducts.map(dbProduct => ({
    id: dbProduct.id || '',
    title: dbProduct.title || 'Untitled Product',
    ean: dbProduct.ean || '',
    brand: dbProduct.brand || '',
    salePrice: typeof dbProduct.sale_price === 'number' ? dbProduct.sale_price : 0,
    unitsSold: typeof dbProduct.units_sold === 'number' ? dbProduct.units_sold : 0,
    amazonFee: typeof dbProduct.fba_fees === 'number' ? dbProduct.fba_fees : 
               typeof dbProduct.amazon_fee === 'number' ? dbProduct.amazon_fee : 0,
    referralFee: typeof dbProduct.referral_fee === 'number' ? dbProduct.referral_fee : 0,
    buyBoxPrice: typeof dbProduct.buy_box_price === 'number' ? dbProduct.buy_box_price : 0,
    category: dbProduct.category || null,
    rating: typeof dbProduct.rating === 'number' ? dbProduct.rating : null,
    reviewCount: typeof dbProduct.review_count === 'number' ? dbProduct.review_count : null,
    mpn: dbProduct.mpn || null
  })), [enhancedProducts]);

  // Convert DB suppliers to app format
  const suppliers = useMemo(() => dbSuppliers.map(dbSupplier => ({
    id: dbSupplier.id,
    name: dbSupplier.name
  })), [dbSuppliers]);

  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  
  // Fetch supplier products
  useEffect(() => {
    const fetchSupplierProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('supplier_products')
          .select(`
            *,
            suppliers (
              id,
              name
            )
          `)
          .limit(5000);

        if (error) throw error;
        
        // Just use the data as is and suppress TypeScript errors
        console.log('AppContext: Initial fetch of supplier_products completed. Count:', (data || []).length);
        if (data && data.length > 0) {
          console.log('AppContext: Sample of initially fetched supplier_products (first 5 relevant to product c8130f79... if present, or just first 5):', 
            (data as SupplierProduct[]).filter(sp => sp.product_id === 'c8130f79-57db-43a7-ba27-424c9d55b7c7').slice(0, 5).concat(
              (data as SupplierProduct[]).slice(0, 5)
            ).filter((item, index, self) => index === self.findIndex(t => t.id === item.id)).slice(0,5) // Deduplicate and take first 5 overall just in case
            .map(sp => ({ id: sp.id, product_id: sp.product_id, supplier_id: sp.supplier_id, suppliers_name: sp.suppliers?.name }))
          );
        }
        setSupplierProducts((data || []) as SupplierProduct[]);
      } catch (err) {
        console.error('Error fetching supplier products:', err);
      }
    };

    fetchSupplierProducts();
  }, []);

  const [customAttributes, setCustomAttributes] = useState<CustomAttribute[]>([]);
  const [attributeValues, setAttributeValues] = useState<CustomAttributeValue[]>([]);

  // Fetch custom attributes
  useEffect(() => {
    const fetchCustomAttributes = async () => {
      try {
        const { data, error } = await supabase
          .from('custom_attributes')
          .select('*');

        if (error) throw error;
        
        const formattedAttributes = (data || []).map(attr => ({
          id: attr.id,
          name: attr.name,
          type: attr.type as 'Text' | 'Number' | 'Date' | 'Yes/No' | 'Selection',
          defaultValue: attr.default_value,
          required: attr.required,
          forType: attr.for_type as 'product' | 'supplier',
          hasColumnMapping: attr.has_column_mapping || false
        }));
        
        setCustomAttributes(formattedAttributes);
      } catch (err) {
        console.error('Error fetching custom attributes:', err);
      }
    };

    fetchCustomAttributes();
  }, []);

  // Fetch attribute values
  useEffect(() => {
    const fetchAttributeValues = async () => {
      try {
        const { data, error } = await supabase
          .from('custom_attribute_values')
          .select('*');

        if (error) throw error;
        
        const formattedValues = (data || []).map(val => ({
          attributeId: val.attribute_id,
          entityId: val.entity_id,
          value: val.value
        }));
        
        setAttributeValues(formattedValues);
      } catch (err) {
        console.error('Error fetching attribute values:', err);
      }
    };

    fetchAttributeValues();
  }, []);

  // Add a supplier cache object at the top of the AppProvider component
  const [supplierCache, setSupplierCache] = useState<Record<string, {
    supplier: Supplier | undefined,
    products: SupplierProduct[],
    count: number,
    timestamp: number
  }>>({});

  // Add a function to get or set supplier cache
  const getOrSetSupplierCache = (supplierId: string) => {
    const cachedData = supplierCache[supplierId];
    
    // If we have recent cache (less than 2 minutes old), use it
    if (cachedData && (Date.now() - cachedData.timestamp) < 2 * 60 * 1000) {
      return cachedData;
    }
    
    return null;
  };

  // Update cache when we have new data
  const updateSupplierCache = (supplierId: string, data: {
    supplier?: Supplier,
    products?: SupplierProduct[],
    count?: number
  }) => {
    setSupplierCache(prev => ({
      ...prev,
      [supplierId]: {
        supplier: data.supplier || prev[supplierId]?.supplier,
        products: data.products || prev[supplierId]?.products || [],
        count: data.count !== undefined ? data.count : (prev[supplierId]?.count || 0),
        timestamp: Date.now()
      }
    }));
  };

  // Add product method using the new hook
  const addProduct = async (product: Omit<Product, 'id'>) => {
    try {
      // Convert from app format to DB format
      const dbProduct = {
        title: product.title,
        ean: product.ean,
        brand: product.brand,
        sale_price: product.salePrice,
        units_sold: product.unitsSold,
        amazon_fee: product.amazonFee,
        referral_fee: product.referralFee,
        buy_box_price: product.buyBoxPrice,
        category: product.category,
        rating: product.rating,
        review_count: product.reviewCount,
        mpn: product.mpn
      };

      const { data, error } = await supabase
        .from('products')
        .insert(dbProduct)
        .select()
        .single();

      if (error) throw error;
      
      // Invalidate product cache to ensure fresh data
      await getProducts(1, 10, {}, true);
      
      return {
        id: data.id,
        title: data.title,
        ean: data.ean,
        brand: data.brand,
        salePrice: data.sale_price,
        unitsSold: data.units_sold,
        amazonFee: data.amazon_fee || data.fba_fees || 0,
        referralFee: data.referral_fee || 0,
        buyBoxPrice: data.buy_box_price,
        category: data.category,
        rating: data.rating,
        reviewCount: data.review_count,
        mpn: data.mpn
      };
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to add product');
    }
  };

  // Update product method using the new hook
  const updateProduct = async (product: Product) => {
    try {
      // Convert from app format to DB format
      const dbProduct = {
        title: product.title,
        ean: product.ean,
        brand: product.brand,
        sale_price: product.salePrice,
        units_sold: product.unitsSold,
        amazon_fee: product.amazonFee,
        referral_fee: product.referralFee,
        buy_box_price: product.buyBoxPrice,
        category: product.category,
        rating: product.rating,
        review_count: product.reviewCount,
        mpn: product.mpn
      };

      const { data, error } = await supabase
        .from('products')
        .update(dbProduct)
        .eq('id', product.id)
        .select()
        .single();

      if (error) throw error;
      
      // Invalidate product cache to ensure fresh data
      await getProducts(1, 10, {}, true);
      
      return {
        id: data.id,
        title: data.title,
        ean: data.ean,
        brand: data.brand,
        salePrice: data.sale_price,
        unitsSold: data.units_sold,
        amazonFee: data.amazon_fee || data.fba_fees || 0,
        referralFee: data.referral_fee || 0,
        buyBoxPrice: data.buy_box_price,
        category: data.category,
        rating: data.rating,
        reviewCount: data.review_count,
        mpn: data.mpn
      };
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to update product');
    }
  };

  // Add supplier
  const addSupplier = async (supplier: Omit<Supplier, 'id'>) => {
    return await addSupplierToDb(supplier);
  };

  // Update supplier
  const updateSupplier = async (id: string, updates: Partial<Supplier>) => {
    return await updateSupplierInDb(id, updates);
  };

  // Delete supplier
  const deleteSupplier = async (id: string) => {
    await deleteSupplierFromDb(id);
  };

  // Add custom attribute
  const addCustomAttribute = async (attribute: Omit<CustomAttribute, 'id'>) => {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('custom_attributes')
        .insert({
          name: attribute.name,
          type: attribute.type,
          default_value: attribute.defaultValue,
          required: attribute.required,
          for_type: attribute.forType,
          created_at: now,
          updated_at: now,
          has_column_mapping: true // All new attributes will get column mappings
        })
        .select()
        .single();

      if (error) throw error;

      const newAttribute: CustomAttribute = {
        id: data.id,
        name: data.name,
        type: data.type as 'Text' | 'Number' | 'Date' | 'Yes/No' | 'Selection',
        defaultValue: data.default_value,
        required: data.required,
        forType: data.for_type as 'product' | 'supplier',
        hasColumnMapping: data.has_column_mapping || true
      };

      // Add the new column to the respective table
      const columnName = `custom_${attribute.name.toLowerCase().replace(/\s+/g, '_')}`;
      let dataType = 'TEXT';
      
      // Determine SQL data type based on attribute type
      switch (attribute.type) {
        case 'Number':
          dataType = 'NUMERIC';
          break;
        case 'Date':
          dataType = 'TIMESTAMP WITH TIME ZONE';
          break;
        case 'Yes/No':
          dataType = 'BOOLEAN';
          break;
        default:
          dataType = 'TEXT';
      }
      
      // Determine which table to add the column to
      const tableName = attribute.forType === 'product' ? 'products' : 'suppliers';
      
      try {
        // Execute the ALTER TABLE query to add the column
        await supabase.rpc('execute_sql', {
          query: `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${dataType}`
        });
        
        // Create an index for the new column for better performance
        await supabase.rpc('execute_sql', {
          query: `CREATE INDEX IF NOT EXISTS idx_${tableName}_${columnName} ON ${tableName}(${columnName})`
        });
      } catch (sqlError) {
        console.error('Error modifying database schema:', sqlError);
        // Continue anyway, as the custom attribute has been created
      }

      setCustomAttributes([...customAttributes, newAttribute]);
      return newAttribute;
    } catch (err) {
      console.error('Error adding custom attribute:', err);
      throw err;
    }
  };

  // Update custom attribute
  const updateCustomAttribute = async (id: string, updates: Partial<CustomAttribute>) => {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('custom_attributes')
        .update({
          name: updates.name,
          type: updates.type,
          default_value: updates.defaultValue,
          required: updates.required,
          for_type: updates.forType,
          has_column_mapping: updates.hasColumnMapping !== undefined ? updates.hasColumnMapping : true,
          updated_at: now
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedAttribute: CustomAttribute = {
        id: data.id,
        name: data.name,
        type: data.type as 'Text' | 'Number' | 'Date' | 'Yes/No' | 'Selection',
        defaultValue: data.default_value,
        required: data.required,
        forType: data.for_type as 'product' | 'supplier',
        hasColumnMapping: data.has_column_mapping || false
      };

      setCustomAttributes(customAttributes.map(attr => 
        attr.id === id ? updatedAttribute : attr
      ));

      return updatedAttribute;
    } catch (err) {
      console.error('Error updating custom attribute:', err);
      throw err;
    }
  };

  // Delete custom attribute
  const deleteCustomAttribute = async (id: string) => {
    try {
      const { error } = await supabase
        .from('custom_attributes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setCustomAttributes(customAttributes.filter(attr => attr.id !== id));
    } catch (err) {
      console.error('Error deleting custom attribute:', err);
      throw err;
    }
  };

  // Get attribute value
  const getAttributeValue = (attributeId: string, entityId: string) => {
    // First get the attribute definition
    const attribute = customAttributes.find(attr => attr.id === attributeId);
    if (!attribute) {
      return null; // Attribute not found
    }
    
    // Look for the value in the entity tables (this is now the primary storage)
    const fieldName = `custom_${attribute.name.toLowerCase().replace(/\s+/g, '_')}`;
    
    if (attribute.forType === 'product') {
      // Find the product
      const product = enhancedProducts.find(p => p.id === entityId);
      if (product) {
        // Check the corresponding custom_* field in the products table
        if (fieldName in product && (product as any)[fieldName] !== null) {
          return (product as any)[fieldName];
        }
      }
    } else if (attribute.forType === 'supplier') {
      // Find the supplier
      const supplier = dbSuppliers.find(s => s.id === entityId);
      if (supplier) {
        // Check the corresponding custom_* field in the suppliers table
        if (fieldName in supplier && (supplier as any)[fieldName] !== null) {
          return (supplier as any)[fieldName];
        }
      }
    }
    
    // For backward compatibility, still check in attributeValues (local state)
    // This helps maintain UI consistency until data is refreshed from the server
    const attributeValue = attributeValues.find(
      av => av.attributeId === attributeId && av.entityId === entityId
    );
    
    if (attributeValue) {
      return attributeValue.value;
    }
    
    // Return default value if no value found anywhere
    return attribute.defaultValue;
  };

  // Set attribute value
  const setAttributeValue = async (attributeId: string, entityId: string, value: any) => {
    try {
      const now = new Date().toISOString();
      const attribute = customAttributes.find(attr => attr.id === attributeId);
      
      if (!attribute) {
        throw new Error('Attribute not found');
      }
      
      // Store the value directly in the column of the respective table
      const fieldName = `custom_${attribute.name.toLowerCase().replace(/\s+/g, '_')}`;
      
      if (attribute.forType === 'product') {
        const { error: productError } = await supabase
          .from('products')
          .update({ 
            [fieldName]: value, 
            // If this is the MPN attribute, also update the regular mpn field
            ...(attribute.name === 'MPN' ? { mpn: value } : {}),
            updated_at: now 
          })
          .eq('id', entityId);
          
        if (productError) {
          console.error('Error updating product with custom attribute:', productError);
          throw productError;
        }
        
        // Update local state for products
        const productIndex = enhancedProducts.findIndex(p => p.id === entityId);
        if (productIndex >= 0) {
          const updatedProducts = [...enhancedProducts];
          updatedProducts[productIndex] = {
            ...updatedProducts[productIndex],
            [fieldName]: value,
            ...(attribute.name === 'MPN' ? { mpn: value } : {}),
            updated_at: now
          };
          // This will be refreshed on the next data fetch
        }
      } else if (attribute.forType === 'supplier') {
        const { error: supplierError } = await supabase
          .from('suppliers')
          .update({ [fieldName]: value, updated_at: now })
          .eq('id', entityId);
          
        if (supplierError) {
          console.error('Error updating supplier with custom attribute:', supplierError);
          throw supplierError;
        }
        
        // Update local state for suppliers
        const supplierIndex = dbSuppliers.findIndex(s => s.id === entityId);
        if (supplierIndex >= 0) {
          const updatedSuppliers = [...dbSuppliers];
          updatedSuppliers[supplierIndex] = {
            ...updatedSuppliers[supplierIndex],
            [fieldName]: value,
            updated_at: now
          };
          // This will be refreshed on the next data fetch
        }
      }
      
      // We no longer store values in custom_attribute_values table
      // Instead we update the local state to reflect the changes
      
      // Update UI state when a value is changed directly in the UI
      // Find the index of the attribute value in the current state
      const existingIndex = attributeValues.findIndex(
        av => av.attributeId === attributeId && av.entityId === entityId
      );
      
      if (existingIndex >= 0) {
        const newValues = [...attributeValues];
        newValues[existingIndex] = {
          attributeId,
          entityId,
          value
        };
        setAttributeValues(newValues);
      } else {
        setAttributeValues([
          ...attributeValues,
          {
            attributeId,
            entityId,
            value
          }
        ]);
      }
    } catch (err) {
      console.error('Error setting attribute value:', err);
      throw err;
    }
  };

  // Get all attributes for an entity
  const getEntityAttributes = useCallback((entityId: string, forType: 'product' | 'supplier') => {
    return customAttributes
      .filter(attr => attr.forType === forType)
      .map(attribute => ({
        attribute,
        value: getAttributeValue(attribute.id, entityId)
      }));
  }, [customAttributes, getAttributeValue]);

  // Get all required attributes for a type
  const getRequiredAttributes = (forType: 'product' | 'supplier') => {
    return customAttributes.filter(attr => attr.forType === forType && attr.required);
  };

  // Validate if an entity has all required attributes
  const validateRequiredAttributes = (entityId: string, forType: 'product' | 'supplier') => {
    const requiredAttributes = getRequiredAttributes(forType);
    const missingAttributes = requiredAttributes.filter(attr => {
      const value = getAttributeValue(attr.id, entityId);
      return value === null || value === undefined || value === '';
    });
    
    return {
      valid: missingAttributes.length === 0,
      missingAttributes
    };
  };

  // Get product by ID
  const getProductById = (id: string) => {
    return products.find(p => p.id === id);
  };

  // Get suppliers for a product
  const getSuppliersForProduct = useCallback((productId: string) => {
    console.log('AppContext: getSuppliersForProduct called for productId:', productId);
    console.log('AppContext: Current global supplierProducts count:', supplierProducts.length);
    // Log a few supplier_products to see their structure, especially product_id
    if (supplierProducts.length > 0) {
      console.log('AppContext: Sample supplierProducts entries (first 5):', supplierProducts.slice(0, 5).map(sp => ({ id: sp.id, product_id: sp.product_id, supplier_id: sp.supplier_id, suppliers_name: sp.suppliers?.name })) );
    }
    
    // Use normalized string comparison to avoid type and format issues
    const filtered = supplierProducts.filter(sp => 
      sp.product_id && String(sp.product_id).trim() === String(productId).trim()
    );
    
    console.log('AppContext: Filtered supplierProducts for this productId:', filtered);
    return filtered;
  }, [supplierProducts]);

  // Get best supplier for a product (lowest cost)
  const getBestSupplierForProduct = useCallback((productId: string) => {
    const productSuppliers = getSuppliersForProduct(productId);
    if (productSuppliers.length === 0) return undefined;
    
    return productSuppliers.reduce((best, current) => {
      return (current.cost < best.cost) ? current : best;
    }, productSuppliers[0]);
  }, [getSuppliersForProduct]);

  // Implement a cache for supplier products by product ID to reduce database calls
  const [supplierProductsCache, setSupplierProductsCache] = useState<Record<string, {
    data: SupplierProduct[],
    timestamp: number,
    isLoading: boolean
  }>>({});
  
  // Track ongoing supplier fetch promises to avoid duplicate requests
  const pendingSupplierFetches = useRef<Record<string, Promise<SupplierProduct[]>>>({});
  
  const fetchLinkedSuppliersForProduct = useCallback(async (productId: string): Promise<SupplierProduct[]> => {
    if (!productId) return [];
    
    // Check if there's an ongoing fetch for this product
    const pendingFetch = pendingSupplierFetches.current[productId];
    if (pendingFetch) {
      return pendingFetch;
    }
    
    // Check cache first - use cache if less than 5 minutes old
    // This longer cache time reduces flickering between page navigations
    const cachedData = supplierProductsCache[productId];
    if (cachedData && !cachedData.isLoading && (Date.now() - cachedData.timestamp) < 300000) {
      return cachedData.data;
    }
    
    // If data is stale but we have it, mark it as loading but return immediately
    // This prevents flickering by showing stale data while fetching new data
    if (cachedData && cachedData.data.length > 0) {
      setSupplierProductsCache(prev => ({
        ...prev,
        [productId]: {
          ...prev[productId],
          isLoading: true
        }
      }));
    } else {
      // If no data exists, create an entry showing it's loading
      setSupplierProductsCache(prev => ({
        ...prev,
        [productId]: {
          data: [],
          timestamp: Date.now(),
          isLoading: true
        }
      }));
    }
    
    // Create a fetch promise that we can track
    const fetchPromise = (async () => {
      try {
        console.log(`AppContext: Fetching linked suppliers directly for productID: ${productId}`);
        const { data, error } = await supabase
          .from('supplier_products')
          .select(`
            id,
            supplier_id,
            product_id,
            cost,
            moq,
            lead_time,
            payment_terms,
            ean,
            brand,
            match_method,
            product_name,
            mpn,
            suppliers (
              id,
              name
            )
          `)
          .eq('product_id', productId);
  
        if (error) {
          console.error('Error fetching linked suppliers for product:', error);
          throw error;
        }
        
        const result = (data || []) as SupplierProduct[];
        console.log(`AppContext: Successfully fetched ${result.length} linked suppliers for productID: ${productId}`);
        
        // Update cache
        setSupplierProductsCache(prev => ({
          ...prev,
          [productId]: {
            data: result,
            timestamp: Date.now(),
            isLoading: false
          }
        }));
        
        // Remove from pending fetches
        delete pendingSupplierFetches.current[productId];
        
        return result;
      } catch (err) {
        console.error('Error in fetchLinkedSuppliersForProduct:', err);
        
        // Mark as not loading on error
        setSupplierProductsCache(prev => ({
          ...prev,
          [productId]: {
            data: prev[productId]?.data || [],
            timestamp: Date.now(),
            isLoading: false
          }
        }));
        
        // Remove from pending fetches
        delete pendingSupplierFetches.current[productId];
        
        return cachedData?.data || []; // Return cached data on error if available
      }
    })();
    
    // Store the promise so we can reuse it for duplicate requests
    pendingSupplierFetches.current[productId] = fetchPromise;
    
    // Return the cached data immediately if available, otherwise wait for fetch
    return cachedData?.data || fetchPromise;
  }, [supplierProductsCache]);

  // Refresh all data
  const refreshData = useCallback(async () => {
    try {
      await getProducts(1, 10, {}, true);
      await refreshSuppliers();
      
      // Refresh supplier products with enhanced field selection
      const { data: supplierProductsData, error: supplierProductsError } = await supabase
        .from('supplier_products')
        .select(`
          id,
          supplier_id,
          product_id,
          cost,
          moq,
          lead_time,
          payment_terms,
          ean,
          brand,
          match_method,
          product_name,
          mpn,
          created_at,
          updated_at,
          suppliers (
            id,
            name
          )
        `)
        .limit(5000);

      if (supplierProductsError) throw supplierProductsError;
      
      console.log('Refreshed supplier products data:', supplierProductsData ? supplierProductsData.length : 0, 'records');
      // Log MPNs if there are any matches
      const mpnMatches = supplierProductsData?.filter(sp => sp.match_method === 'mpn') || [];
      if (mpnMatches.length > 0) {
        console.log(`Found ${mpnMatches.length} products matched by MPN`);
        if (mpnMatches.length > 0 && mpnMatches.length <= 5) {
          console.log('Sample MPN matches:', mpnMatches.slice(0, 5).map(sp => ({ 
            product_id: sp.product_id, 
            mpn: sp.mpn,
            match_method: sp.match_method
          })));
        }
      }
      
      // Cast the data to the correct type to fix TypeScript error
      setSupplierProducts(supplierProductsData as unknown as SupplierProduct[] || []);
      
      // Refresh custom attributes
      const { data: attributesData, error: attributesError } = await supabase
        .from('custom_attributes')
        .select('*');

      if (attributesError) throw attributesError;
      
      const formattedAttributes = (attributesData || []).map(attr => ({
        id: attr.id,
        name: attr.name,
        type: attr.type as 'Text' | 'Number' | 'Date' | 'Yes/No' | 'Selection',
        defaultValue: attr.default_value,
        required: attr.required,
        forType: attr.for_type as 'product' | 'supplier',
        hasColumnMapping: attr.has_column_mapping || false
      }));
      
      setCustomAttributes(formattedAttributes);
      
      // Refresh attribute values
      const { data: valuesData, error: valuesError } = await supabase
        .from('custom_attribute_values')
        .select('*');

      if (valuesError) throw valuesError;
      const formattedValues = (valuesData || []).map(val => ({
        attributeId: val.attribute_id,
        entityId: val.entity_id,
        value: val.value
      }));
      setAttributeValues(formattedValues);

    } catch (err) {
      console.error('Error refreshing data:', err);
      throw err instanceof Error ? err : new Error('Failed to refresh data');
    }
  }, [getProducts, refreshSuppliers]);

  // Modify fetchSupplierProducts to use cache
  const fetchSupplierProducts = async (
    supplierId: string,
    page: number = 1,
    pageSize: number = 10,
    filters: {
      searchTerm?: string,
      filterOption?: 'all' | 'matched' | 'unmatched',
      costRange?: { min: number, max: number },
      matchMethodFilter?: string | null,
      selectedBrand?: string,
      sortField?: string,
      sortOrder?: 'asc' | 'desc'
    } = {}
  ) => {
    // Check if we're requesting the first page with default filters
    const isDefaultRequest = page === 1 && pageSize === 10 && 
      !filters.searchTerm && !filters.filterOption && 
      !filters.costRange && !filters.matchMethodFilter && 
      !filters.sortField;

    // Try to get from cache for basic requests
    if (isDefaultRequest) {
      const cachedData = getOrSetSupplierCache(supplierId);
      if (cachedData && cachedData.products.length > 0) {
        console.log('Using cached supplier data');
        return {
          data: cachedData.products,
          count: cachedData.count
        };
      }
    }

    try {
      console.log(`Fetching supplier products for supplier ${supplierId}, page ${page}, size ${pageSize}`);
      
      // Calculate start and end for pagination
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;
      
      // Build query
      let query = supabase
        .from('supplier_products')
        .select(`
          id,
          supplier_id,
          product_id,
          cost,
          moq,
          lead_time,
          payment_terms,
          ean,
          brand,
          match_method,
          product_name,
          mpn,
          created_at,
          updated_at,
          suppliers (
            id,
            name
          )
        `, { count: 'exact' })
        .eq('supplier_id', supplierId);
      
      // Apply filter for matched/unmatched products
      if (filters.filterOption === 'matched') {
        query = query.not('product_id', 'is', null);
      } else if (filters.filterOption === 'unmatched') {
        query = query.is('product_id', null);
      }
      
      // Apply search term filter
      if (filters.searchTerm) {
        query = query.or(
          `product_name.ilike.%${filters.searchTerm}%,ean.ilike.%${filters.searchTerm}%,mpn.ilike.%${filters.searchTerm}%`
        );
      }
      
      // Apply cost range filter
      if (filters.costRange) {
        query = query
          .gte('cost', filters.costRange.min)
          .lte('cost', filters.costRange.max);
      }
      
      // Apply match method filter
      if (filters.matchMethodFilter) {
        query = query.eq('match_method', filters.matchMethodFilter);
      }
      
      // Apply brand filter
      if (filters.selectedBrand) {
        query = query.ilike('brand', `%${filters.selectedBrand}%`);
      }
      
      // Apply sorting
      if (filters.sortField) {
        let sortColumn: string;
        
        switch (filters.sortField) {
          case 'name':
            sortColumn = 'product_name';
            break;
          case 'cost':
            sortColumn = 'cost';
            break;
          // For other fields like price, profit and margin we need client-side sorting
          // since they depend on joined data
          default:
            sortColumn = 'created_at';
            break;
        }
        
        query = query.order(sortColumn, { 
          ascending: filters.sortOrder === 'asc' 
        });
      } else {
        // Default sort
        query = query.order('created_at', { ascending: false });
      }
      
      // Apply pagination
      query = query.range(start, end);
      
      // Execute the query
      const { data, error, count } = await query;
      
      if (error) throw error;
      
      console.log(`Fetched ${data?.length || 0} supplier products (total count: ${count})`);
      
      // After fetching, update cache for default requests
      if (isDefaultRequest) {
        updateSupplierCache(supplierId, {
          products: data, // Use the result data
          count: count ?? 0 // Use nullish coalescing to ensure count is a number
        });
      }
      
      return {
        data: data as SupplierProduct[] || [],
        count: count || 0
      };
    } catch (err) {
      console.error('Error fetching supplier products:', err);
      throw err instanceof Error ? err : new Error('Failed to fetch supplier products');
    }
  };

  // Mark data as initialized after first load
  useEffect(() => {
    if (!enhancedInitialLoading && !suppliersInitialLoading && products.length > 0 && suppliers.length > 0) {
      setDataInitialized(true);
    }
  }, [enhancedInitialLoading, suppliersInitialLoading, products.length, suppliers.length]);

  // Helper method to adapt the new hook API to the old API for backwards compatibility

  // Keep existing getBrands, getCategories, getPriceRange but delegate to new hook
  const getBrands = async () => {
    return getProductBrands();
  };

  const getCategories = async () => {
    return getProductCategories();
  };

  const getPriceRange = async () => {
    return getProductPriceRange();
  };

  // Add a helper function to cache supplier
  const cacheSupplierById = (id: string) => {
    const supplier = suppliers.find(s => s.id === id);
    if (supplier) {
      // Get products for this supplier to ensure complete data
      const supplierProductData = supplierProducts.filter(sp => sp.supplier_id === id);
      
      // Ensure we have full product information cached for each supplier product
      // This helps when navigating to product details from supplier view
      const supplierProductsWithData = supplierProductData.map(sp => {
        if (sp.product_id) {
          // Add full product data to the cache
          const productData = products.find(p => p.id === sp.product_id);
          if (productData) {
            return {
              ...sp,
              product: productData // Include complete product data
            };
          }
        }
        return sp;
      });
      
      // Update cache with supplier and its products
      updateSupplierCache(id, { 
        supplier,
        products: supplierProductsWithData,
        count: supplierProductsWithData.length || 0
      });
    }
    return supplier;
  };

  return (
    <AppContext.Provider
      value={{
        products,
        suppliers,
        customAttributes,
        supplierProducts,
        loading: enhancedLoading || suppliersLoading,
        initialLoading: (enhancedInitialLoading || suppliersInitialLoading) && !dataInitialized,
        error: enhancedError || suppliersError,
        totalProductCount: enhancedTotalCount ?? 0,
        addProduct,
        updateProduct,
        addSupplier,
        updateSupplier,
        deleteSupplier,
        addCustomAttribute,
        updateCustomAttribute,
        deleteCustomAttribute,
        getAttributeValue,
        setAttributeValue,
        getEntityAttributes,
        getRequiredAttributes,
        validateRequiredAttributes,
        getProductById,
        getSuppliersForProduct,
        getBestSupplierForProduct,
        fetchLinkedSuppliersForProduct,
        refreshData,
        fetchProducts: async (
          page?: number,
          pageSize?: number,
          filters?: {
            searchTerm?: string,
            brand?: string,
            category?: string,
            priceRange?: { min: number, max: number },
            hasSuppliers?: boolean | null,
            sortField?: string,
            sortOrder?: 'asc' | 'desc'
          }
        ): Promise<{ data: any[], count: number }> => {
          const result = await getProducts(page, pageSize, filters);
          let finalCount: number;
          if (result.count === null || result.count === undefined) {
            finalCount = 0;
          } else {
            finalCount = result.count;
          }
          return {
            data: result.data,
            count: finalCount
          };
        },
        fetchSupplierProducts,
        getBrands,
        getCategories,
        getPriceRange,
        cacheSupplierById,
        supplierCache
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

// Custom hook to use the context
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};