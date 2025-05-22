import React, { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

// Card component with smooth transitions to prevent flickering
const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  const baseClasses = 'bg-white shadow-sm rounded-lg p-6 relative';
  const transitionClasses = 'transition-all duration-300 ease-in-out';
  
  return (
    <div className={`${baseClasses} ${transitionClasses} ${className}`}>
      {children}
    </div>
  );
};

export default Card;