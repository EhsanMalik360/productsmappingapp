import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
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
  buyBoxPrice: number;
  category?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
}

export interface Supplier {
  id: string;
  name: string;
}

export interface SupplierProduct {
  id: string;
  supplier_id: string;
  product_id: string;
  cost: number;
  ean: string;
  moq?: number | null;
  lead_time?: string | null;
  payment_terms?: string | null;
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
  error: Error | null;
  addProduct: (product: Omit<Product, 'id'>) => Promise<Product>;
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
}

// Create context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider component
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { 
    products: dbProducts, 
    loading: productsLoading, 
    error: productsError,
    addProduct: addProductToDb,
    refreshProducts 
  } = useProducts();

  const { 
    suppliers: dbSuppliers, 
    loading: suppliersLoading, 
    error: suppliersError,
    addSupplier: addSupplierToDb,
    updateSupplier: updateSupplierInDb,
    deleteSupplier: deleteSupplierFromDb,
    refreshSuppliers 
  } = useSuppliers();

  // Convert DB products to app format
  const products = useMemo(() => dbProducts.map(dbProduct => ({
    id: dbProduct.id,
    title: dbProduct.title,
    ean: dbProduct.ean,
    brand: dbProduct.brand,
    salePrice: dbProduct.sale_price,
    unitsSold: dbProduct.units_sold,
    amazonFee: dbProduct.amazon_fee,
    buyBoxPrice: dbProduct.buy_box_price,
    category: dbProduct.category,
    rating: dbProduct.rating,
    reviewCount: dbProduct.review_count
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
          forType: attr.for_type as 'product' | 'supplier'
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
      amazon_fee: product.amazonFee,
      buy_box_price: product.buyBoxPrice,
      category: product.category,
      rating: product.rating,
      review_count: product.reviewCount
    });

    return {
      ...newProduct,
      salePrice: newProduct.sale_price,
      unitsSold: newProduct.units_sold,
      amazonFee: newProduct.amazon_fee,
      buyBoxPrice: newProduct.buy_box_price,
      reviewCount: newProduct.review_count
    };
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
          updated_at: now
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
        forType: data.for_type as 'product' | 'supplier'
      };

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
        forType: data.for_type as 'product' | 'supplier'
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
    const attributeValue = attributeValues.find(
      av => av.attributeId === attributeId && av.entityId === entityId
    );
    
    if (attributeValue) {
      return attributeValue.value;
    }
    
    // Return default value if no value set
    const attribute = customAttributes.find(attr => attr.id === attributeId);
    return attribute ? attribute.defaultValue : null;
  };

  // Set attribute value
  const setAttributeValue = async (attributeId: string, entityId: string, value: any) => {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('custom_attribute_values')
        .upsert({
          attribute_id: attributeId,
          entity_id: entityId,
          value,
          created_at: now,
          updated_at: now
        }, {
          onConflict: 'attribute_id,entity_id'
        })
        .select();

      if (error) throw error;

      // Update local state
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

  // Refresh all data
  const refreshData = async () => {
    try {
    await Promise.all([
      refreshProducts(),
      refreshSuppliers()
    ]);
    
    // Refresh supplier products
      const { data: supplierProductsData, error: supplierProductsError } = await supabase
        .from('supplier_products')
        .select(`
          *,
          suppliers (
            id,
            name
          )
        `);

      if (supplierProductsError) throw supplierProductsError;
      setSupplierProducts(supplierProductsData || []);
      
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
        forType: attr.for_type as 'product' | 'supplier'
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
      throw err;
    }
  };

  return (
    <AppContext.Provider
      value={{
        products,
        suppliers,
        customAttributes,
        supplierProducts,
        loading,
        error,
        addProduct,
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
        refreshData
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