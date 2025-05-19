import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

type Tables = Database['public']['Tables'];
type Product = Tables['products']['Row'];
type Supplier = Tables['suppliers']['Row'];
type SupplierProduct = Tables['supplier_products']['Row'];
type ImportHistoryItem = Tables['import_history']['Row'];
type ImportHistoryInsert = Tables['import_history']['Insert'];

export function useProducts(dataInitialized: boolean = false) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!dataInitialized);
  const [initialLoading, setInitialLoading] = useState(!dataInitialized);
  const [error, setError] = useState<Error | null>(null);
  const [totalProductCount, setTotalProductCount] = useState<number>(0);
  const [hasLoadedInitial, setHasLoadedInitial] = useState<boolean>(dataInitialized);

  // Cache for API responses to prevent duplicate fetches
  const responseCache = new Map();

  // Load initial data when component mounts or when switching back to the tab
  useEffect(() => {
    if (dataInitialized && products.length > 0) {
      setLoading(false);
      setInitialLoading(false);
      return;
    }

    if (!hasLoadedInitial) {
      fetchProducts(1, 20);
    }
  }, [dataInitialized]);

  // Fetch products with pagination and filtering
  const fetchProducts = useCallback(async (
    page: number = 1, 
    pageSize: number = 20,
    filters: {
      searchTerm?: string,
      brand?: string,
      category?: string,
      priceRange?: { min: number, max: number },
      hasSuppliers?: boolean | null,
      sortField?: string,
      sortOrder?: 'asc' | 'desc'
    } = {}
  ) => {
    try {
      // Generate cache key based on request parameters
      const cacheKey = `products_${page}_${pageSize}_${JSON.stringify(filters)}`;
      
      // Return cached response if available
      if (responseCache.has(cacheKey)) {
        return responseCache.get(cacheKey);
      }
      
      setLoading(true);
      if (page === 1) {
        setInitialLoading(true);
      }
      setError(null);
      
      // Calculate pagination range
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      // Start building query
      let query = supabase
        .from('products')
        .select('*', { count: 'exact' });
      
      // Apply filters
      if (filters.searchTerm) {
        query = query.or(
          `title.ilike.%${filters.searchTerm}%,ean.ilike.%${filters.searchTerm}%,brand.ilike.%${filters.searchTerm}%,mpn.ilike.%${filters.searchTerm}%`
        );
      }
      
      if (filters.brand) {
        query = query.eq('brand', filters.brand);
      }
      
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      
      if (filters.priceRange) {
        query = query
          .gte('buy_box_price', filters.priceRange.min)
          .lte('buy_box_price', filters.priceRange.max);
      }
      
      // Apply sorting
      if (filters.sortField) {
        let sortColumn: string;
        
        switch (filters.sortField) {
          case 'price':
            sortColumn = 'buy_box_price';
            break;
          case 'units':
            sortColumn = 'units_sold';
            break;
          case 'brand':
            sortColumn = 'brand';
            break;
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
      query = query.range(from, to);
      
      // Execute query
      const { data, error: fetchError, count } = await query;
      
      if (fetchError) throw fetchError;
      
      // Process results
      const result = {
        data: data || [],
        count: count || 0
      };
      
      // Cache the result
      responseCache.set(cacheKey, result);
      
      // Update state
      if (page === 1) {
        setProducts(result.data);
      }
      
      if (count !== undefined && count !== null) {
        setTotalProductCount(count);
        console.log(`Total filtered products: ${count}`);
      }
      
      setLoading(false);
      setInitialLoading(false);
      setHasLoadedInitial(true);
      
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch products');
      console.error('Error fetching products:', error);
      setError(error);
      setLoading(false);
      setInitialLoading(false);
      setHasLoadedInitial(true);
      
      return {
        data: [],
        count: 0,
        error
      };
    }
  }, []);

  async function addProduct(product: Tables['products']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single();

      if (error) throw error;
      setProducts(prev => [data, ...prev]);
      setTotalProductCount(prev => prev + 1);
      
      // Clear cache as data has changed
      responseCache.clear();
      
      return data;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to add product');
    }
  }

  async function updateProduct(id: string, updates: Tables['products']['Update']) {
    try {
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setProducts(prev => prev.map(p => p.id === id ? data : p));
      
      // Clear cache as data has changed
      responseCache.clear();
      
      return data;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to update product');
    }
  }

  async function deleteProduct(id: string) {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setProducts(prev => prev.filter(p => p.id !== id));
      
      // Clear cache as data has changed
      responseCache.clear();
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to delete product');
    }
  }

  // Get unique brands
  const getBrands = useCallback(async () => {
    try {
      // Check cache
      if (responseCache.has('brands')) {
        return responseCache.get('brands');
      }
      
      const { data, error } = await supabase
        .from('products')
        .select('brand')
        .order('brand');
      
      if (error) throw error;
      
      // Extract unique brands
      const brands = [...new Set(data?.map(p => p.brand))].filter(Boolean).sort();
      
      // Cache result
      responseCache.set('brands', brands);
      
      return brands;
    } catch (err) {
      console.error('Error fetching brands:', err);
      return [];
    }
  }, []);
  
  // Get unique categories
  const getCategories = useCallback(async () => {
    try {
      // Check cache
      if (responseCache.has('categories')) {
        return responseCache.get('categories');
      }
      
      const { data, error } = await supabase
        .from('products')
        .select('category')
        .order('category');
      
      if (error) throw error;
      
      // Extract unique categories
      const categories = [...new Set(data?.map(p => p.category))].filter(Boolean).sort();
      
      // Cache result
      responseCache.set('categories', categories);
      
      return categories;
    } catch (err) {
      console.error('Error fetching categories:', err);
      return [];
    }
  }, []);
  
  // Get price range
  const getPriceRange = useCallback(async () => {
    try {
      // Check cache
      if (responseCache.has('priceRange')) {
        return responseCache.get('priceRange');
      }
      
      const { data: minData, error: minError } = await supabase
        .from('products')
        .select('buy_box_price')
        .order('buy_box_price', { ascending: true })
        .limit(1)
        .single();
      
      const { data: maxData, error: maxError } = await supabase
        .from('products')
        .select('buy_box_price')
        .order('buy_box_price', { ascending: false })
        .limit(1)
        .single();
      
      if (minError || maxError) throw minError || maxError;
      
      const min = Math.floor(minData?.buy_box_price || 0);
      const max = Math.ceil(maxData?.buy_box_price || 1000);
      
      const priceRange = { min, max };
      
      // Cache result
      responseCache.set('priceRange', priceRange);
      
      return priceRange;
    } catch (err) {
      console.error('Error fetching price range:', err);
      return { min: 0, max: 1000 };
    }
  }, []);

  return {
    products,
    loading,
    initialLoading,
    error,
    totalProductCount,
    addProduct,
    updateProduct,
    deleteProduct,
    fetchProducts,
    getBrands,
    getCategories,
    getPriceRange
  };
}

export function useSuppliers(dataInitialized: boolean = false) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [initialSuppliers, setInitialSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(!dataInitialized);
  const [initialLoading, setInitialLoading] = useState(!dataInitialized);
  const [error, setError] = useState<Error | null>(null);
  const [totalSupplierCount, setTotalSupplierCount] = useState<number>(0);
  const [hasLoadedInitial, setHasLoadedInitial] = useState<boolean>(dataInitialized);

  // Cache for API responses
  const responseCache = new Map();

  useEffect(() => {
    // If we already have data and dataInitialized is true, don't reload
    if (dataInitialized && suppliers.length > 0) {
      setLoading(false);
      setInitialLoading(false);
      return;
    }

    // Otherwise, fetch initial data
    if (!hasLoadedInitial) {
      fetchInitialSuppliers();
    }
  }, [dataInitialized]);
  
  // Effect to update initial suppliers only when background loading is FULLY complete
  useEffect(() => {
    if (!loading && initialSuppliers.length > 0 && suppliers.length > initialSuppliers.length) {
      // Only update initialSuppliers when background loading is completely finished
      // This prevents partial updates from affecting the UI during loading
      
      // Create a map of all suppliers by ID for efficient lookup
      const suppliersMap = new Map<string, Supplier>();
      
      // First add initial suppliers (they take precedence)
      initialSuppliers.forEach(supplier => {
        suppliersMap.set(supplier.id, supplier);
      });
      
      // Then add all background loaded suppliers
      suppliers.forEach(supplier => {
        if (!suppliersMap.has(supplier.id)) {
          suppliersMap.set(supplier.id, supplier);
        }
      });
      
      // Convert map back to array and sort by name
      const mergedSuppliers = Array.from(suppliersMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));
      
      // Only update once at the end of loading
      console.log(`Background loading complete. Merging ${suppliers.length - initialSuppliers.length} additional suppliers into view.`);
      setInitialSuppliers(mergedSuppliers);
    }
  }, [loading]); // Only trigger when loading state changes to false

  async function fetchInitialSuppliers() {
    try {
      setInitialLoading(true);
      setError(null);
      
      // Get total count
      const { count, error: countError } = await supabase
        .from('suppliers')
        .select('*', { count: 'exact', head: true });
      
      if (countError) throw countError;
      
      const totalCount = count || 0;
      setTotalSupplierCount(totalCount);
      
      // Fetch first 20 suppliers
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name')
        .range(0, 19);

      if (error) throw error;
      setSuppliers(data || []);
      setInitialSuppliers(data || []);
      setHasLoadedInitial(true);
      
      // After loading initial data, fetch the rest in background
      setInitialLoading(false);
      fetchRemainingSuppliers(totalCount, data?.length || 0);
      
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred'));
      setInitialLoading(false);
    }
  }

  async function fetchRemainingSuppliers(totalCount: number, initialCount: number) {
    try {
      if (initialCount >= totalCount) {
        // No more suppliers to load
        setLoading(false);
        return;
      }
      
      // Fetch remaining suppliers in batches
      const batchSize = 1000;
      const batches = Math.ceil((totalCount - initialCount) / batchSize);
      let backgroundSuppliers = [...suppliers];
      
      console.log(`Fetching remaining ${totalCount - initialCount} suppliers in background`);
      
      for (let i = 0; i < batches; i++) {
        const from = initialCount + (i * batchSize);
        const to = Math.min(from + batchSize - 1, totalCount - 1);
        
        const { data, error: batchError } = await supabase
          .from('suppliers')
          .select('*')
          .order('name')
          .range(from, to);
        
        if (batchError) throw batchError;
        
        backgroundSuppliers = [...backgroundSuppliers, ...(data || [])];
        
        // Log progress but don't update UI
        console.log(`Fetched batch ${i+1}/${batches} (${data?.length || 0} suppliers)`);
      }
      
      // Update suppliers only once at the end of all batches
      setSuppliers(backgroundSuppliers);
      console.log(`Successfully fetched all ${backgroundSuppliers.length} suppliers in background`);
    } catch (err) {
      console.error('Error fetching remaining suppliers:', err);
      setError(err instanceof Error ? err : new Error('An error occurred fetching remaining suppliers'));
    } finally {
      setLoading(false);
    }
  }

  async function fetchSuppliers() {
    try {
      setLoading(true);
      setInitialLoading(true);
      setError(null);
      
      // Get total count
      const { count, error: countError } = await supabase
        .from('suppliers')
        .select('*', { count: 'exact', head: true });
      
      if (countError) throw countError;
      
      const totalCount = count || 0;
      setTotalSupplierCount(totalCount);
      
      // Fetch first 20 suppliers
      const { data: initialData, error: initialError } = await supabase
        .from('suppliers')
        .select('*')
        .order('name')
        .range(0, 19);

      if (initialError) throw initialError;
      setSuppliers(initialData || []);
      setInitialSuppliers(initialData || []);
      setInitialLoading(false);
      
      // If already loaded all suppliers, exit
      if ((initialData?.length || 0) >= totalCount) {
        setLoading(false);
        return;
      }
      
      // Fetch remaining suppliers in batches
      const batchSize = 1000;
      const batches = Math.ceil((totalCount - 20) / batchSize);
      let backgroundSuppliers = [...initialData || []];
      
      for (let i = 0; i < batches; i++) {
        const from = 20 + (i * batchSize);
        const to = Math.min(from + batchSize - 1, totalCount - 1);
        
        const { data, error: batchError } = await supabase
          .from('suppliers')
          .select('*')
          .order('name')
          .range(from, to);
        
        if (batchError) throw batchError;
        
        backgroundSuppliers = [...backgroundSuppliers, ...(data || [])];
        setSuppliers(backgroundSuppliers);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred'));
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }

  async function addSupplier(supplier: Tables['suppliers']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert(supplier)
        .select()
        .single();

      if (error) throw error;
      setSuppliers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setInitialSuppliers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      
      // Clear cache
      responseCache.clear();
      
      return data;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to add supplier');
    }
  }

  async function updateSupplier(id: string, updates: Tables['suppliers']['Update']) {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setSuppliers(prev => prev.map(s => s.id === id ? data : s));
      setInitialSuppliers(prev => prev.map(s => s.id === id ? data : s));
      
      // Clear cache
      responseCache.clear();
      
      return data;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to update supplier');
    }
  }

  async function deleteSupplier(id: string) {
    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setSuppliers(prev => prev.filter(s => s.id !== id));
      setInitialSuppliers(prev => prev.filter(s => s.id !== id));
      
      // Clear cache
      responseCache.clear();
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to delete supplier');
    }
  }

  // Function to refresh supplier data
  const refreshSuppliers = useCallback(async () => {
    return await fetchSuppliers();
  }, [fetchSuppliers]);

  return {
    suppliers: initialSuppliers, // Return initialSuppliers instead of suppliers
    loading,
    initialLoading,
    error,
    totalSupplierCount,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    refreshSuppliers
  };
}

export function useSupplierProducts(productId?: string) {
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (productId) {
      fetchSupplierProducts();
    }
  }, [productId]);

  async function fetchSupplierProducts() {
    if (!productId) return;
    
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
        .eq('product_id', productId);

      if (error) throw error;
      setSupplierProducts(data || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  }

  async function addSupplierProduct(supplierProduct: Tables['supplier_products']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('supplier_products')
        .insert(supplierProduct)
        .select()
        .single();

      if (error) throw error;
      setSupplierProducts(prev => [...prev, data]);
      return data;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to add supplier product');
    }
  }

  async function updateSupplierProduct(id: string, updates: Tables['supplier_products']['Update']) {
    try {
      const { data, error } = await supabase
        .from('supplier_products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setSupplierProducts(prev => prev.map(sp => sp.id === id ? data : sp));
      return data;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to update supplier product');
    }
  }

  async function deleteSupplierProduct(id: string) {
    try {
      const { error } = await supabase
        .from('supplier_products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setSupplierProducts(prev => prev.filter(sp => sp.id !== id));
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to delete supplier product');
    }
  }

  return {
    supplierProducts,
    loading,
    error,
    addSupplierProduct,
    updateSupplierProduct,
    deleteSupplierProduct,
    refreshSupplierProducts: fetchSupplierProducts
  };
}

export function useImportHistory() {
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchImportHistory();
  }, []);

  async function fetchImportHistory() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('import_history')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setImportHistory(data || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  }

  async function addImportRecord(importRecord: ImportHistoryInsert) {
    try {
      let data;
      let error;

      // If an ID is provided, update the existing record
      if (importRecord.id) {
        ({ data, error } = await supabase
          .from('import_history')
          .update(importRecord)
          .eq('id', importRecord.id)
          .select()
          .single());
      } else {
        // Otherwise create a new record
        ({ data, error } = await supabase
          .from('import_history')
          .insert(importRecord)
          .select()
          .single());
      }

      if (error) throw error;
      
      // If we're updating an existing record, update it in the state
      if (importRecord.id) {
        setImportHistory(prev => prev.map(record => 
          record.id === data.id ? data : record
        ));
      } else {
        // Otherwise add the new record to the state
        setImportHistory(prev => [data, ...prev]);
      }
      
      return data;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to add import record');
    }
  }

  async function deleteImportRecord(id: string) {
    try {
      const { error } = await supabase
        .from('import_history')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setImportHistory(prev => prev.filter(record => record.id !== id));
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to delete import record');
    }
  }

  return {
    importHistory,
    loading,
    error,
    addImportRecord,
    deleteImportRecord,
    refreshHistory: fetchImportHistory
  };
}