import React from 'react';

interface ProductMatchBadgeProps {
  matchMethod: string | null | undefined;
  className?: string;
}

const ProductMatchBadge: React.FC<ProductMatchBadgeProps> = ({ matchMethod, className }) => {
  if (!matchMethod || matchMethod === 'none') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 ${className}`}>
        No Match
      </span>
    );
  }

  if (matchMethod === 'ean') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 ${className}`}>
        EAN Match
      </span>
    );
  }

  if (matchMethod === 'mpn') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 ${className}`}>
        MPN Match
      </span>
    );
  }

  if (matchMethod === 'name') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 ${className}`}>
        Name Match
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ${className}`}>
      {matchMethod}
    </span>
  );
};

export default ProductMatchBadge; 