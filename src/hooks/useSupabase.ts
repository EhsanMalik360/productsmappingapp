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
  const [initialProducts, setInitialProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!dataInitialized);
  const [initialLoading, setInitialLoading] = useState(!dataInitialized);
  const [error, setError] = useState<Error | null>(null);
  const [totalProductCount, setTotalProductCount] = useState<number>(0);
  const [hasLoadedInitial, setHasLoadedInitial] = useState<boolean>(dataInitialized);

  // Load initial data when component mounts or when switching back to the tab
  useEffect(() => {
    // If we already have data and dataInitialized is true, don't reload
    if (dataInitialized && products.length > 0) {
      setLoading(false);
      setInitialLoading(false);
      return;
    }

    // Otherwise, fetch initial data
    if (!hasLoadedInitial) {
      fetchInitialProducts();
    }
  }, [dataInitialized]);
  
  // Effect to update initial products only when background loading is FULLY complete
  useEffect(() => {
    if (!loading && initialProducts.length > 0 && products.length > initialProducts.length) {
      // Only update initialProducts when background loading is completely finished
      // This prevents partial updates from affecting the UI during loading
      
      // Create a map of all products by ID for efficient lookup
      const productsMap = new Map<string, Product>();
      
      // First add initial products (they take precedence)
      initialProducts.forEach(product => {
        productsMap.set(product.id, product);
      });
      
      // Then add all background loaded products
      products.forEach(product => {
        if (!productsMap.has(product.id)) {
          productsMap.set(product.id, product);
        }
      });
      
      // Convert map back to array
      const mergedProducts = Array.from(productsMap.values());
      
      // Only update once at the end of loading
      console.log(`Background loading complete. Merging ${products.length - initialProducts.length} additional products into view.`);
      setInitialProducts(mergedProducts);
    }
  }, [loading]); // Only trigger when loading state changes to false

  // Function to fetch just the first page of products for immediate display
  async function fetchInitialProducts() {
    try {
      setInitialLoading(true);
      setError(null);
      
      // First, get the total count of products
      const { count, error: countError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });
      
      if (countError) throw countError;
      
      const totalCount = count || 0;
      setTotalProductCount(totalCount);
      console.log(`Total products in database: ${totalCount}`);
      
      // Only fetch first 20 products for immediate display
      const { data, error: productsError } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .range(0, 19); // Fetch first 20 products
      
      if (productsError) throw productsError;
      
      // Set both products and initialProducts to maintain consistency
      setProducts(data || []);
      setInitialProducts(data || []);
      setHasLoadedInitial(true);
      console.log(`Fetched initial ${data?.length} products for immediate display`);
      
      // After loading initial data, fetch remaining data in the background
      setInitialLoading(false);
      fetchRemainingProducts(totalCount, data?.length || 0);
      
    } catch (err) {
      console.error('Error fetching initial products:', err);
      setError(err instanceof Error ? err : new Error('An error occurred fetching initial products'));
      setInitialLoading(false);
    }
  }

  // Function to fetch remaining products in the background
  async function fetchRemainingProducts(totalCount: number, initialCount: number) {
    try {
      if (initialCount >= totalCount) {
        // No more products to load
        setLoading(false);
        return;
      }
      
      // Fetch products in batches of 1000 (Supabase limit)
      const batchSize = 1000;
      const remainingProducts = totalCount - initialCount;
      const batches = Math.ceil(remainingProducts / batchSize);
      let backgroundProducts = [...products]; // Start with initial products for background loading
      
      console.log(`Fetching remaining ${remainingProducts} products in ${batches} batches (background)`);
      
      for (let i = 0; i < batches; i++) {
        const from = initialCount + (i * batchSize);
        const to = Math.min(from + batchSize - 1, totalCount - 1);
        
        const { data, error: batchError } = await supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, to);
        
        if (batchError) throw batchError;
        
        backgroundProducts = [...backgroundProducts, ...(data || [])];
        
        // Log progress but don't update UI
        console.log(`Fetched batch ${i+1}/${batches} (${data?.length || 0} products)`);
      }
      
      // Update products only once at the end of all batches
      setProducts(backgroundProducts);
      console.log(`Successfully fetched all ${backgroundProducts.length} products in background`);
    } catch (err) {
      console.error('Error fetching remaining products:', err);
      setError(err instanceof Error ? err : new Error('An error occurred fetching remaining products'));
    } finally {
      setLoading(false);
    }
  }

  // Original full fetch function - now with option to skip initial load
  async function fetchProducts(skipInitial = false) {
    try {
      setLoading(true);
      if (!skipInitial) {
        setInitialLoading(true);
      }
      setError(null);
      
      // First, get the total count of products
      const { count, error: countError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });
      
      if (countError) throw countError;
      
      const totalCount = count || 0;
      setTotalProductCount(totalCount);
      console.log(`Total products in database: ${totalCount}`);
      
      // If not skipping initial, fetch first 20 immediately
      if (!skipInitial) {
        const { data: initialData, error: initialError } = await supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false })
          .range(0, 19);
        
        if (initialError) throw initialError;
        setProducts(initialData || []);
        setInitialProducts(initialData || []);
        setInitialLoading(false);
        
        // If we already have all products, we're done
        if ((initialData?.length || 0) >= totalCount) {
          setLoading(false);
          return;
        }
      }
      
      // Fetch remaining products in batches
      const batchSize = 1000;
      const initialCount = skipInitial ? 0 : Math.min(20, totalCount);
      const batches = Math.ceil((totalCount - initialCount) / batchSize);
      let backgroundProducts = skipInitial ? [] : [...products];
      
      console.log(`Fetching ${totalCount - initialCount} products in ${batches} batches`);
      
      for (let i = 0; i < batches; i++) {
        const from = initialCount + (i * batchSize);
        const to = Math.min(from + batchSize - 1, totalCount - 1);
        
        console.log(`Fetching batch ${i + 1} of ${batches} (range ${from}-${to})...`);
        
        const { data, error: batchError } = await supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, to);
        
        if (batchError) throw batchError;
        
        backgroundProducts = [...backgroundProducts, ...(data || [])];
        setProducts(backgroundProducts);
      }
      
      console.log(`Successfully fetched all ${backgroundProducts.length} products`);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(err instanceof Error ? err : new Error('An error occurred fetching products'));
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }

  async function addProduct(product: Tables['products']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single();

      if (error) throw error;
      setProducts(prev => [data, ...prev]);
      setInitialProducts(prev => [data, ...prev]);
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
      setInitialProducts(prev => prev.map(p => p.id === id ? data : p));
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
      setInitialProducts(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to delete product');
    }
  }

  return {
    products: initialProducts, // Return initialProducts instead of products
    loading,
    initialLoading,
    error,
    totalProductCount,
    addProduct,
    updateProduct,
    deleteProduct,
    refreshProducts: fetchProducts
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
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to delete supplier');
    }
  }

  return {
    suppliers: initialSuppliers, // Return initialSuppliers instead of suppliers
    loading,
    initialLoading,
    error,
    totalSupplierCount,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    refreshSuppliers: fetchSuppliers
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