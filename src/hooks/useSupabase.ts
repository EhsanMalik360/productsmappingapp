import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

type Tables = Database['public']['Tables'];
type Product = Tables['products']['Row'];
type Supplier = Tables['suppliers']['Row'];
type SupplierProduct = Tables['supplier_products']['Row'];
type ImportHistoryItem = Tables['import_history']['Row'];
type ImportHistoryInsert = Tables['import_history']['Insert'];

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred'));
    } finally {
      setLoading(false);
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
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to delete product');
    }
  }

  return {
    products,
    loading,
    error,
    addProduct,
    updateProduct,
    deleteProduct,
    refreshProducts: fetchProducts
  };
}

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  async function fetchSuppliers() {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name');

      if (error) throw error;
      setSuppliers(data || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred'));
    } finally {
      setLoading(false);
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
      setSuppliers(prev => 
        prev.map(s => s.id === id ? data : s)
           .sort((a, b) => a.name.localeCompare(b.name))
      );
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
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to delete supplier');
    }
  }

  return {
    suppliers,
    loading,
    error,
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