import React, { ReactNode } from 'react';

interface TableProps {
  headers: string[];
  children: ReactNode;
  className?: string;
  columnWidths?: string[]; // Optional array of width percentages or CSS width values
}

const Table: React.FC<TableProps> = ({ headers, children, className = '', columnWidths }) => {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full table-fixed">
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th
                key={index}
                className="px-4 py-3 text-left font-semibold text-gray-700 bg-gray-50 border-b"
                style={columnWidths && columnWidths[index] ? { width: columnWidths[index] } : undefined}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
};

export default Table;