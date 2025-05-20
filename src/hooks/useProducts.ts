import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface ProductFilters {
  searchTerm?: string;
  brand?: string;
  category?: string;
  priceRange?: { min: number; max: number };
  hasSuppliers?: boolean | null;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PageData<T> {
  data: T[];
  timestamp: number;
  isStale: boolean;
}

export function useProducts() {
  // Cache structure to store pages of data
  const [productsCache, setProductsCache] = useState<Map<string, PageData<any>>>(new Map());
  const [currentData, setCurrentData] = useState<any[]>([]);
  
  // Split count state - internalCount for processing, displayCount for UI (only shows accurate values)
  const [internalCount, setInternalCount] = useState<number | null>(null);
  const [displayCount, setDisplayCount] = useState<number | null>(null);
  
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Add explicit state to track if count is ready from database
  const [isCountReady, setIsCountReady] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const countQueryRunningRef = useRef<boolean>(false);
  const hasAccurateCountRef = useRef<boolean>(false);
  // Store last filter state used for count
  const lastCountFilterRef = useRef<string>('');
  
  // Metadata caches
  const [brandsCache, setBrandsCache] = useState<string[]>([]);
  const [categoriesCache, setCategoriesCache] = useState<string[]>([]);
  const [priceRangeCache, setPriceRangeCache] = useState<{min: number, max: number}>({min: 0, max: 1000});
  
  // Helper function to transform DB data to UI format (snake_case to camelCase)
  const transformProductData = useCallback((items: any[]) => {
    return items.map(item => ({
      id: item.id,
      title: item.title,
      ean: item.ean,
      brand: item.brand,
      salePrice: item.sale_price,
      unitsSold: item.units_sold,
      amazonFee: item.amazon_fee || item.fba_fees,
      referralFee: item.referral_fee,
      buyBoxPrice: item.buy_box_price,
      category: item.category,
      rating: item.rating,
      reviewCount: item.review_count,
      mpn: item.mpn,
      // Keep original fields too for completeness
      ...item
    }));
  }, []);
  
  // Function to generate a unique cache key based on pagination and filters
  const getCacheKey = useCallback((page: number, pageSize: number, filters: ProductFilters) => {
    return `${page}-${pageSize}-${JSON.stringify(filters)}`;
  }, []);

  // Helper function to apply filters to any query
  const applyFiltersToQuery = useCallback((query: any, filters: ProductFilters) => {
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
    
    // Handle hasSuppliers filter if needed
    if (filters.hasSuppliers !== null) {
      // Implement based on your data structure
      // For example, if you have a suppliers_count column:
      // query = filters.hasSuppliers 
      //   ? query.gt('suppliers_count', 0)
      //   : query.eq('suppliers_count', 0);
    }
    
    return query;
  }, []);
  
  // Modify getAccurateCount to update display count only when genuinely accurate
  const getAccurateCount = useCallback(async (filters: ProductFilters) => {
    const filterHash = JSON.stringify(filters);
    
    // If we're already running a count query with the same filters, don't start another
    if (countQueryRunningRef.current && lastCountFilterRef.current === filterHash) {
      return internalCount;
    }
    
    // Set flag to indicate we're running a count query
    countQueryRunningRef.current = true;
    lastCountFilterRef.current = filterHash;
    setIsCountReady(false); // Reset count ready status
    
    try {
      // Run count query
      const countQuery = supabase
        .from('products')
        .select('id', { count: 'exact', head: true });
      
      // Apply filters to count query
      applyFiltersToQuery(countQuery, filters);
      
      // Execute count query  
      const { count, error } = await countQuery;
      
      if (!error && count !== null && count !== undefined) {
        // Update internal count (for calculations) immediately
        setInternalCount(count);
        
        // Add a small delay before updating the display count for a smoother transition
        setTimeout(() => {
          // Only update display count when it comes directly from the database
          setDisplayCount(count);
          setIsCountReady(true);
        }, 300); // 300ms delay for a smoother transition
        
        hasAccurateCountRef.current = true;
        return count;
      }
      
      return internalCount;
    } catch (err) {
      console.error('Error getting accurate count:', err);
      return internalCount;
    } finally {
      countQueryRunningRef.current = false;
    }
  }, [internalCount, applyFiltersToQuery]);
  
  // In getProducts, make sure we never update display count from cache
  const getProducts = useCallback(async (
    page: number = 1,
    pageSize: number = 20,
    filters: ProductFilters = {},
    forceFetch: boolean = false
  ) => {
    const cacheKey = getCacheKey(page, pageSize, filters);
    
    // Cancel any in-flight requests to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create a new abort controller for this request
    abortControllerRef.current = new AbortController();
    
    try {
      // ALWAYS get accurate count first, even for cached requests
      // This ensures we never show incorrect counts
      if (forceFetch || !isCountReady) {
        await getAccurateCount(filters);
      }
      
      // Check if we have valid cached data
      const cachedData = productsCache.get(cacheKey);
      const now = Date.now();
      const cacheMaxAge = 5 * 60 * 1000; // 5 minutes cache validity
      
      // Always use cached data first if available, even if stale
      // This ensures we show something immediately while fetching fresh data
      if (cachedData) {
        setCurrentData(cachedData.data);
        
        // If data is fresh, we can stop here unless forced refresh
        if (
          !forceFetch && 
          !cachedData.isStale && 
          now - cachedData.timestamp < cacheMaxAge
        ) {
          return {
            data: cachedData.data,
            fromCache: true,
            count: displayCount
          };
        }
      }
      
      // Set loading only for initial load with no cached data
      // This prevents showing a loading indicator when we already have data to display
      if (isInitialLoad && !cachedData) {
        setIsLoading(true);
      }
      
      // Calculate start and end for pagination
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;
      
      // Build query for data
      let query = supabase
        .from('products')
        .select('*'); // Remove count: 'exact' from main query, we already get it separately
        
      // Apply filters to main query
      query = applyFiltersToQuery(query, filters);
      
      // Apply sort
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
          case 'profit':
            sortColumn = 'profit_margin';
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
      query = query.range(start, end);
      
      // Execute the query
      const { data, error: fetchError } = await query;
      
      if (fetchError) throw fetchError;
      
      // Update cache with new data
      if (data) {
        // Transform the data to have consistent property names (camelCase)
        const transformedData = transformProductData(data);
        
        setCurrentData(transformedData);
        
        // Update the cache with the new data
        setProductsCache(prevCache => {
          const newCache = new Map(prevCache);
          newCache.set(cacheKey, {
            data: transformedData,
            timestamp: Date.now(),
            isStale: false
          });
          return newCache;
        });
        
        // Prefetch next page in background if not last page
        if (displayCount && (page * pageSize) < displayCount) {
          prefetchProducts(page + 1, pageSize, filters);
        }
      }
      
      setIsInitialLoad(false);
      setIsLoading(false);
      
      return {
        data: data || [],
        fromCache: false,
        count: displayCount || 0
      };
    } catch (err) {
      // Only set error if not aborted
      if (!(err instanceof Error) || err.name !== 'AbortError') {
        console.error('Error fetching products:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch products'));
      }
      
      setIsLoading(false);
      // Get latest cached data from the cache in case it changed during the fetch
      const latestCachedData = productsCache.get(cacheKey);
      
      // The cached data is already transformed, so we can use it directly
      return { 
        data: latestCachedData?.data || [], 
        fromCache: true,
        error: err,
        count: displayCount
      };
    }
  }, [productsCache, internalCount, isInitialLoad, getCacheKey, transformProductData, getAccurateCount, applyFiltersToQuery, isCountReady]);

  // Prefetch data for a page without updating current view
  const prefetchProducts = useCallback(async (
    page: number,
    pageSize: number,
    filters: ProductFilters
  ) => {
    const cacheKey = getCacheKey(page, pageSize, filters);
    
    // Skip if already in cache
    if (productsCache.has(cacheKey)) {
      return;
    }
    
    try {
      // Calculate start and end for pagination
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;
      
      // Build query quietly in background
      let query = supabase
        .from('products')
        .select('*');
      
      // Apply same filters as main query
      query = applyFiltersToQuery(query, filters);
      
      // Apply sort
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
          case 'profit':
            sortColumn = 'profit_margin';
            break;
          default:
            sortColumn = 'created_at';
            break;
        }
        
        query = query.order(sortColumn, { 
          ascending: filters.sortOrder === 'asc' 
        });
      } else {
        query = query.order('created_at', { ascending: false });
      }
      
      // Apply pagination
      query = query.range(start, end);
      
      // Execute the query
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Update cache with prefetched data
      if (data) {
        // Transform the data to have consistent property names (camelCase)
        const transformedData = transformProductData(data);
        
        setProductsCache(prevCache => {
          const newCache = new Map(prevCache);
          newCache.set(cacheKey, {
            data: transformedData,
            timestamp: Date.now(),
            isStale: false
          });
          return newCache;
        });
      }
    } catch (err) {
      // Silently handle prefetch errors
      console.warn('Error prefetching products:', err);
    }
  }, [productsCache, getCacheKey, transformProductData, applyFiltersToQuery]);

  // Mark all cache entries as stale
  const invalidateCache = useCallback(() => {
    // Reset accurate count flag to force refresh
    hasAccurateCountRef.current = false;
    setIsCountReady(false);
    // Don't clear displayCount here - leave it showing until we have a new accurate count
    setProductsCache(prevCache => {
      const newCache = new Map(prevCache);
      for (const [key, pageData] of newCache.entries()) {
        newCache.set(key, { ...pageData, isStale: true });
      }
      return newCache;
    });
  }, []);

  // Clear specific cache entries or all cache
  const clearCache = useCallback((specificKey?: string) => {
    // Reset accurate count flag when clearing cache
    hasAccurateCountRef.current = false;
    setIsCountReady(false);
    if (specificKey) {
      setProductsCache(prevCache => {
        const newCache = new Map(prevCache);
        newCache.delete(specificKey);
        return newCache;
      });
    } else {
      setProductsCache(new Map());
    }
  }, []);

  // Get unique brands with caching
  const getBrands = useCallback(async () => {
    // Return cached brands if available
    if (brandsCache.length > 0) {
      return brandsCache;
    }
    
    try {
      const { data, error } = await supabase
        .from('products')
        .select('brand')
        .order('brand');
      
      if (error) throw error;
      
      // Extract unique brands
      const brands = [...new Set(data?.map(p => p.brand))].filter(Boolean);
      setBrandsCache(brands);
      return brands;
    } catch (err) {
      console.error('Error fetching brands:', err);
      return [];
    }
  }, [brandsCache]);
  
  // Get unique categories with caching
  const getCategories = useCallback(async () => {
    // Return cached categories if available
    if (categoriesCache.length > 0) {
      return categoriesCache;
    }
    
    try {
      const { data, error } = await supabase
        .from('products')
        .select('category')
        .order('category');
      
      if (error) throw error;
      
      // Extract unique categories
      const categories = [...new Set(data?.map(p => p.category))].filter(Boolean);
      setCategoriesCache(categories);
      return categories;
    } catch (err) {
      console.error('Error fetching categories:', err);
      return [];
    }
  }, [categoriesCache]);
  
  // Get price range with caching
  const getPriceRange = useCallback(async () => {
    // Return cached price range if available
    if (priceRangeCache.min !== 0 || priceRangeCache.max !== 1000) {
      return priceRangeCache;
    }
    
    try {
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
      
      const priceRange = {
        min: Math.floor(minData?.buy_box_price || 0),
        max: Math.ceil(maxData?.buy_box_price || 1000)
      };
      
      setPriceRangeCache(priceRange);
      return priceRange;
    } catch (err) {
      console.error('Error fetching price range:', err);
      return { min: 0, max: 1000 };
    }
  }, [priceRangeCache]);

  // Cleanup function for abort controller
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Function to check if we have accurate count
  const getHasAccurateCount = useCallback(() => {
    return isCountReady && displayCount !== null && displayCount !== undefined;
  }, [displayCount, isCountReady]);

  return {
    products: currentData,
    totalCount: displayCount, // Only expose the display count to UI components
    isLoading,
    isInitialLoad,
    hasAccurateCount: getHasAccurateCount(),
    error,
    getProducts,
    prefetchProducts,
    invalidateCache,
    clearCache,
    getBrands,
    getCategories,
    getPriceRange
  };
} 