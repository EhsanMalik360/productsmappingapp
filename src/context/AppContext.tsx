import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useProducts, useSuppliers } from '../hooks/useSupabase';
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
  moq?: number | null;
  lead_time?: string | null;
  payment_terms?: string | null;
  match_method?: string;
  mpn?: string | null;
  product_name?: string | null;
  suppliers?: {
    id: string;
    name: string;
  };
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
      sortField?: string,
      sortOrder?: 'asc' | 'desc'
    }
  ) => Promise<{ data: SupplierProduct[], count: number }>;
  getBrands: () => Promise<string[]>;
  getCategories: () => Promise<string[]>;
  getPriceRange: () => Promise<{min: number, max: number}>;
}

// Create context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider component
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Add a state to track if a major data refresh is in progress
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Add a state to keep track of whether initial data has been loaded
  const [dataInitialized, setDataInitialized] = useState<boolean>(false);
  
  const { 
    products: dbProducts, 
    loading: productsLoading, 
    initialLoading: productsInitialLoading,
    error: productsError,
    addProduct: addProductToDb,
    fetchProducts: fetchProductsFromDb,
    getBrands: getBrandsFromDb,
    getCategories: getCategoriesFromDb,
    getPriceRange: getPriceRangeFromDb,
    totalProductCount 
  } = useProducts(dataInitialized);

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

  // Add a global cache for supplier product data
  const supplierProductsCache = useRef<{[key: string]: {data: any, timestamp: number, count: number}}>({});
  
  // Track active API requests to prevent multiple simultaneous calls
  const [pendingRequests, setPendingRequests] = useState<{[key: string]: boolean}>({});

  // Throttle API calls to prevent overloading
  const throttleApiCall = useCallback(async (key: string, apiCallFn: () => Promise<any>) => {
    // If this specific API call is already in progress, return empty result
    if (pendingRequests[key]) {
      console.log(`Skipping duplicate API call: ${key}`);
      return null;
    }
    
    try {
      // Mark this API call as in progress
      setPendingRequests(prev => ({...prev, [key]: true}));
      
      // Execute the API call
      return await apiCallFn();
    } finally {
      // Mark this API call as complete
      setPendingRequests(prev => ({...prev, [key]: false}));
    }
  }, [pendingRequests]);

  // Store supplier stats to avoid repeated API calls
  const supplierStatsMap = useRef<{[supplierId: string]: {
    min: number, 
    max: number, 
    matchMethods: string[], 
    total: number, 
    matched: number, 
    unmatched: number,
    timestamp: number
  }}>({});

  // Convert DB products to app format
  const products = useMemo(() => dbProducts.map(dbProduct => ({
    id: dbProduct.id,
    title: dbProduct.title,
    ean: dbProduct.ean,
    brand: dbProduct.brand,
    salePrice: dbProduct.sale_price,
    unitsSold: dbProduct.units_sold,
    amazonFee: dbProduct.fba_fees || dbProduct.amazon_fee || 0,
    referralFee: dbProduct.referral_fee || 0,
    buyBoxPrice: dbProduct.buy_box_price,
    category: dbProduct.category,
    rating: dbProduct.rating,
    reviewCount: dbProduct.review_count,
    mpn: dbProduct.mpn
  })), [dbProducts]);

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
          `);

        if (error) throw error;
        setSupplierProducts(data || []);
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

  const loading = productsLoading || suppliersLoading;
  const error = productsError || suppliersError;

  // Add product
  const addProduct = async (product: Omit<Product, 'id'>) => {
    const newProduct = await addProductToDb({
      title: product.title,
      ean: product.ean,
      brand: product.brand,
      sale_price: product.salePrice,
      units_sold: product.unitsSold,
      amazon_fee: 0,
      fba_fees: product.amazonFee,
      referral_fee: product.referralFee,
      buy_box_price: product.buyBoxPrice,
      category: product.category,
      rating: product.rating,
      review_count: product.reviewCount,
      mpn: product.mpn
    });

    return {
      ...newProduct,
      salePrice: newProduct.sale_price,
      unitsSold: newProduct.units_sold,
      amazonFee: newProduct.fba_fees || newProduct.amazon_fee || 0,
      referralFee: newProduct.referral_fee || 0,
      buyBoxPrice: newProduct.buy_box_price,
      reviewCount: newProduct.review_count,
      mpn: newProduct.mpn
    };
  };

  // Update product
  const updateProduct = async (product: Product) => {
    try {
      // Convert from frontend format to database format
      const dbProduct = {
        id: product.id,
        title: product.title,
        ean: product.ean,
        brand: product.brand,
        sale_price: product.salePrice,
        units_sold: product.unitsSold,
        amazon_fee: 0,
        fba_fees: product.amazonFee,
        referral_fee: product.referralFee,
        buy_box_price: product.buyBoxPrice,
        category: product.category,
        rating: product.rating,
        review_count: product.reviewCount,
        mpn: product.mpn,
        updated_at: new Date().toISOString()
      };
      
      // Update the product in the database
      const { data, error } = await supabase
        .from('products')
        .update(dbProduct)
        .eq('id', product.id)
        .select()
        .single();
      
      if (error) throw error;
      
      if (!data) {
        throw new Error('Product update failed');
      }
      
      // Convert back to frontend format
      return {
        id: data.id,
        title: data.title,
        ean: data.ean,
        brand: data.brand,
        salePrice: data.sale_price,
        unitsSold: data.units_sold,
        amazonFee: data.fba_fees || data.amazon_fee || 0,
        referralFee: data.referral_fee || 0,
        buyBoxPrice: data.buy_box_price,
        category: data.category,
        rating: data.rating,
        reviewCount: data.review_count,
        mpn: data.mpn
      };
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
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
      const product = dbProducts.find(p => p.id === entityId);
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
        const productIndex = dbProducts.findIndex(p => p.id === entityId);
        if (productIndex >= 0) {
          const updatedProducts = [...dbProducts];
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
  const getEntityAttributes = (entityId: string, forType: 'product' | 'supplier') => {
    const relevantAttributes = customAttributes.filter(attr => attr.forType === forType);
    
    return relevantAttributes.map(attribute => {
      const value = getAttributeValue(attribute.id, entityId);
      return {
        attribute,
        value
      };
    });
  };

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
    return products.find(product => product.id === id);
  };

  // Get suppliers for a product
  const getSuppliersForProduct = (productId: string) => {
    return supplierProducts.filter(sp => sp.product_id === productId);
  };

  // Get best supplier for a product (lowest cost)
  const getBestSupplierForProduct = (productId: string) => {
    const productSuppliers = getSuppliersForProduct(productId);
    if (productSuppliers.length === 0) return undefined;
    
    return productSuppliers.reduce((best, current) => {
      return (current.cost < best.cost) ? current : best;
    }, productSuppliers[0]);
  };

  // Add improved refreshData function with debouncing and error handling
  const refreshData = useCallback(async () => {
    // If already refreshing, don't start another refresh
    if (isRefreshing) {
      console.log('Data refresh already in progress, skipping...');
      return;
    }
    
    console.log('Starting data refresh...');
    setIsRefreshing(true);
    
    try {
      const refreshPromises = [];
      
      // Add promises for products and suppliers
      if (fetchProductsFromDb) {
        refreshPromises.push(fetchProductsFromDb());
      }
      
      if (refreshSuppliers) {
        refreshPromises.push(refreshSuppliers());
      }
      
      // Wait for all refresh promises to complete
      await Promise.all(refreshPromises);
      
      // Refresh supplier products
      try {
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
            match_method,
            ean,
            mpn,
            product_name,
            supplier_stock,
            created_at,
            updated_at,
            suppliers (
              id,
              name
            )
          `);

        if (supplierProductsError) throw supplierProductsError;
        
        console.log('Refreshed supplier products data:', supplierProductsData ? supplierProductsData.length : 0, 'records');
        
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
        
        // We don't need to refresh attribute values from custom_attribute_values table anymore
        // since we're storing them directly in their respective tables
        // This just maintains the local state for UI consistency
        setAttributeValues([]);
      } catch (err) {
        console.error('Error refreshing supplier products data:', err);
        // Continue execution even if this part fails
      }
      
      console.log('Data refresh completed successfully.');
    } catch (err) {
      console.error('Error refreshing data:', err);
      throw err;
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, fetchProductsFromDb, refreshSuppliers]);

  // Add optimized fetchSupplierProducts function with request deduplication
  const fetchSupplierProducts = useCallback(async (
    supplierId: string,
    page: number = 1,
    pageSize: number = 10,
    filters: {
      searchTerm?: string,
      filterOption?: 'all' | 'matched' | 'unmatched',
      costRange?: { min: number, max: number },
      matchMethodFilter?: string | null,
      sortField?: string,
      sortOrder?: 'asc' | 'desc'
    } = {}
  ) => {
    try {
      // Ensure supplierId is a string to avoid UUID type errors in database queries
      const safeSupplierIdString = String(supplierId);
      
      // Generate a unique key for this specific API call to deduplicate
      const requestKey = `supplier_products_${safeSupplierIdString}_${page}_${pageSize}_${JSON.stringify(filters)}`;
      
      // Check if we have a valid cached response
      const now = Date.now();
      const CACHE_TTL = 30 * 1000; // 30 seconds cache TTL
      
      if (supplierProductsCache.current[requestKey] && 
          (now - supplierProductsCache.current[requestKey].timestamp) < CACHE_TTL) {
        console.log(`Using cached data for: ${requestKey}`);
        return {
          data: supplierProductsCache.current[requestKey].data,
          count: supplierProductsCache.current[requestKey].count
        };
      }
      
      // For supplier stats requests (low page/pageSize), check if we have supplier stats cached
      if (page === 1 && pageSize === 1) {
        const statsKey = `stats_${safeSupplierIdString}`;
        const STATS_TTL = 60 * 1000; // 1 minute cache for stats
        
        // If this is a filtered query for matched/unmatched products & we have stats
        if (filters.filterOption && 
            supplierStatsMap.current[safeSupplierIdString] && 
            (now - supplierStatsMap.current[safeSupplierIdString].timestamp) < STATS_TTL) {
          
          const stats = supplierStatsMap.current[safeSupplierIdString];
          
          // Return cached stats counts based on filter
          if (filters.filterOption === 'matched') {
            console.log(`Using cached stats for matched products of supplier ${safeSupplierIdString}`);
            
            // Cache the result for this specific query too
            supplierProductsCache.current[requestKey] = {
              data: [],
              count: stats.matched,
              timestamp: now
            };
            
            return { data: [], count: stats.matched };
          } 
          else if (filters.filterOption === 'unmatched') {
            console.log(`Using cached stats for unmatched products of supplier ${safeSupplierIdString}`);
            
            // Cache the result for this specific query too
            supplierProductsCache.current[requestKey] = {
              data: [],
              count: stats.unmatched,
              timestamp: now
            };
            
            return { data: [], count: stats.unmatched };
          }
          else {
            console.log(`Using cached stats for all products of supplier ${safeSupplierIdString}`);
            
            // Cache the result for this specific query too
            supplierProductsCache.current[requestKey] = {
              data: [],
              count: stats.total,
              timestamp: now
            };
            
            return { data: [], count: stats.total };
          }
        }
      }
      
      // Use throttling to prevent multiple identical calls
      const result = await throttleApiCall(requestKey, async () => {
        console.log(`Fetching supplier products for supplier ${safeSupplierIdString}, page ${page}, size ${pageSize}`);
        
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
          .eq('supplier_id', safeSupplierIdString);
        
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
          const { min, max } = filters.costRange;
          if (min > 0) {
            query = query.gte('cost', min);
          }
          if (max < 1000000) {  // Arbitrary high number to avoid filtering out all high-cost items
            query = query.lte('cost', max);
          }
        }
        
        // Apply match method filter
        if (filters.matchMethodFilter) {
          query = query.eq('match_method', filters.matchMethodFilter);
        }
        
        // Apply sorting
        if (filters.sortField) {
          // Map frontend sort fields to database column names
          const sortFieldMap: {[key: string]: string} = {
            'name': 'product_name',
            'cost': 'cost',
            'price': 'price',
            'profit': 'profit',
            'margin': 'margin'
          };
          
          const dbSortField = sortFieldMap[filters.sortField] || filters.sortField;
          const sortOrder = filters.sortOrder || 'asc';
          
          query = query.order(dbSortField, { ascending: sortOrder === 'asc' });
        } else {
          // Default sorting by product_name
          query = query.order('product_name', { ascending: true });
        }
        
        // Apply pagination
        query = query.range(start, end);
        
        // Execute query with error handling
        const { data, error, count } = await query;
        
        if (error) {
          console.error('Supabase query error:', error);
          throw error;
        }
        
        // If this is a stats query (page=1, pageSize=1), cache the stats
        if (page === 1 && pageSize === 1) {
          if (!filters.filterOption) {
            // This is the "all" products query
            if (!supplierStatsMap.current[safeSupplierIdString]) {
              supplierStatsMap.current[safeSupplierIdString] = {
                min: 0,
                max: 1000,
                matchMethods: [],
                total: count || 0,
                matched: 0,
                unmatched: 0,
                timestamp: now
              };
            } else {
              // Update only the total count and timestamp
              supplierStatsMap.current[safeSupplierIdString] = {
                ...supplierStatsMap.current[safeSupplierIdString],
                total: count || 0,
                timestamp: now
              };
            }
          } 
          else if (filters.filterOption === 'matched') {
            // Update matched count in the cache
            if (supplierStatsMap.current[safeSupplierIdString]) {
              supplierStatsMap.current[safeSupplierIdString].matched = count || 0;
              supplierStatsMap.current[safeSupplierIdString].timestamp = now;
            } else {
              supplierStatsMap.current[safeSupplierIdString] = {
                min: 0,
                max: 1000,
                matchMethods: [],
                total: 0,
                matched: count || 0,
                unmatched: 0,
                timestamp: now
              };
            }
          }
          else if (filters.filterOption === 'unmatched') {
            // Update unmatched count in the cache
            if (supplierStatsMap.current[safeSupplierIdString]) {
              supplierStatsMap.current[safeSupplierIdString].unmatched = count || 0;
              supplierStatsMap.current[safeSupplierIdString].timestamp = now;
            } else {
              supplierStatsMap.current[safeSupplierIdString] = {
                min: 0,
                max: 1000,
                matchMethods: [],
                total: 0,
                matched: 0,
                unmatched: count || 0,
                timestamp: now
              };
            }
          }
        }
        
        return { 
          data: data || [], 
          count: count || 0
        };
      });
      
      // If throttled (already in progress), return empty results
      if (!result) {
        return {
          data: [] as SupplierProduct[],
          count: 0
        };
      }
      
      // Store in cache before returning
      supplierProductsCache.current[requestKey] = {
        data: result.data,
        count: result.count,
        timestamp: now
      };
      
      return {
        data: result.data as SupplierProduct[],
        count: result.count || 0
      };
    } catch (err) {
      console.error('Error fetching supplier products:', err);
      // Always return a predictable response structure, even on error
      return {
        data: [] as SupplierProduct[],
        count: 0,
        error: err instanceof Error ? err : new Error('Failed to fetch supplier products')
      };
    }
  }, [throttleApiCall]);

  // Mark data as initialized after first load
  useEffect(() => {
    if (!productsInitialLoading && !suppliersInitialLoading && products.length > 0 && suppliers.length > 0) {
      setDataInitialized(true);
    }
  }, [productsInitialLoading, suppliersInitialLoading, products.length, suppliers.length]);

  return (
    <AppContext.Provider
      value={{
        products,
        suppliers,
        customAttributes,
        supplierProducts,
        loading: productsLoading || suppliersLoading || isRefreshing,
        initialLoading: (productsInitialLoading || suppliersInitialLoading) && !dataInitialized,
        error: productsError || suppliersError,
        totalProductCount,
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
        refreshData,
        fetchProducts: fetchProductsFromDb,
        fetchSupplierProducts,
        getBrands: getBrandsFromDb,
        getCategories: getCategoriesFromDb,
        getPriceRange: getPriceRangeFromDb
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