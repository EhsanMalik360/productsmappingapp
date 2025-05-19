import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../contexts/AppContext';
import { FilterOption, SortField, SortOrder } from '../../types';

const SupplierProducts: React.FC<SupplierProductsProps> = ({ supplierId }) => {
  const navigate = useNavigate();
  const { products, fetchSupplierProducts } = useAppContext();
  const [filterOption, setFilterOption] = useState<FilterOption>('all');
  const [selectedUnmatchedProduct, setSelectedUnmatchedProduct] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [costRange, setCostRange] = useState<{min: number, max: number}>({min: 0, max: 1000});
  const [matchMethodFilter, setMatchMethodFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [isLoading, setIsLoading] = useState(false);
  const [supplierProductsData, setSupplierProductsData] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [costStats, setCostStats] = useState<{min: number, max: number}>({min: 0, max: 1000});
  const [matchMethods, setMatchMethods] = useState<string[]>([]);
  const [matchStats, setMatchStats] = useState<{ total: number, matched: number, unmatched: number }>({
    total: 0,
    matched: 0,
    unmatched: 0
  });
  const [hasInitializedFilters, setHasInitializedFilters] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  
  const loadData = useCallback(async () => {
    if (!supplierId) return;
    
    try {
      if (initialLoadComplete) {
        setIsLoading(true);
      }

      const result = await fetchSupplierProducts(
        supplierId,
        currentPage,
        itemsPerPage,
        {
          searchTerm,
          filterOption,
          costRange,
          matchMethodFilter,
          sortField,
          sortOrder
        }
      );
      
      setSupplierProductsData(result.data);
      setTotalCount(result.count);
    
      if (!hasInitializedFilters) {
        await loadFilterStats();
      }
      
      setInitialLoadComplete(true);
      
    } catch (error) {
      console.error('Error loading supplier products:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supplierId, currentPage, itemsPerPage, searchTerm, filterOption, costRange, matchMethodFilter, sortField, sortOrder, fetchSupplierProducts, hasInitializedFilters, initialLoadComplete]);

  return (
    <div>
      {/* Render your component content here */}
    </div>
  );
};

export default SupplierProducts; 