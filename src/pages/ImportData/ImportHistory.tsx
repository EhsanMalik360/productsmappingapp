import React, { useState } from 'react';
import { Eye, Trash2, AlertCircle, CheckCircle, Clock, Database, RefreshCcw } from 'lucide-react';
import Table from '../../components/UI/Table';
import { useImportHistory } from '../../hooks/useSupabase';
import Button from '../../components/UI/Button';
import Card from '../../components/UI/Card';

const ImportHistory: React.FC = () => {
  const { importHistory, loading, error, deleteImportRecord, refreshHistory } = useImportHistory();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await refreshHistory();
    } catch (error) {
      console.error('Failed to refresh import history:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (loading || isRefreshing) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Import History</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {isRefreshing ? "Refreshing data..." : "Loading data..."}
            </span>
            <div className="animate-spin h-5 w-5 text-blue-600">
              <RefreshCcw size={20} />
            </div>
          </div>
        </div>
        
        <Card>
          <div className="flex items-center justify-center p-12 text-center">
            <div className="animate-spin mr-3 h-6 w-6 text-blue-600">
              <RefreshCcw size={24} />
            </div>
            <div className="text-lg font-medium">
              {isRefreshing ? "Refreshing import history..." : "Loading import history..."}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this import record?')) {
      try {
        setIsDeleting(true);
        await deleteImportRecord(id);
      } catch (error) {
        console.error('Failed to delete import record:', error);
        alert('Failed to delete import record');
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle size={16} className="mr-1 text-green-600" />;
      case 'Failed':
        return <AlertCircle size={16} className="mr-1 text-red-600" />;
      case 'In Progress':
        return <Clock size={16} className="mr-1 text-blue-600" />;
      default:
        return null;
    }
  };

  const getStatusTextClass = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'text-green-600';
      case 'Failed':
        return 'text-red-600';
      case 'In Progress':
        return 'text-blue-600';
      default:
        return '';
    }
  };

  const renderNoDataMessage = () => {
    if (error) {
      return (
        <div className="text-center py-8">
          <Database className="h-12 w-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 mb-4">Error connecting to database. The import_history table may not exist.</p>
          <p className="text-gray-500 text-sm mb-4">Error: {error.message}</p>
          <Button onClick={handleRefresh} className="mx-auto">Retry</Button>
        </div>
      );
    }

    return (
      <div className="text-center py-8 text-gray-500">
        <Database className="h-12 w-12 mx-auto text-gray-400 mb-3" />
        <p>No import history available</p>
      </div>
    );
  };

  return (
    <div>
      {isDeleting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl flex items-center">
            <div className="animate-spin mr-3 h-6 w-6 text-blue-600">
              <RefreshCcw size={24} />
            </div>
            <div className="text-lg font-medium">Deleting record...</div>
          </div>
        </div>
      )}
      
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold">Import History</h3>
          <p className="text-gray-600">View all previous data imports and their status.</p>
        </div>
        <Button className="flex items-center" onClick={handleRefresh}>
          <Clock size={16} className="mr-1" /> Refresh
        </Button>
      </div>
      
      {(!importHistory || importHistory.length === 0) ? (
        renderNoDataMessage()
      ) : (
        <Table
          headers={['Date', 'Type', 'File Name', 'Status', 'Records', 'Success', 'Failed', 'Actions']}
        >
          {importHistory.map((item) => (
            <tr key={item.id} className="border-t">
              <td className="px-4 py-2">{new Date(item.created_at).toLocaleString()}</td>
              <td className="px-4 py-2">{item.type}</td>
              <td className="px-4 py-2">{item.file_name}</td>
              <td className="px-4 py-2">
                <span className={`flex items-center ${getStatusTextClass(item.status)}`}>
                  {getStatusIcon(item.status)} {item.status}
                </span>
              </td>
              <td className="px-4 py-2">{item.total_records.toLocaleString()}</td>
              <td className="px-4 py-2">{item.successful_records.toLocaleString()}</td>
              <td className="px-4 py-2">{item.failed_records.toLocaleString()}</td>
              <td className="px-4 py-2">
                {item.error_message && (
                  <button 
                    className="text-blue-600 hover:underline mr-2 flex items-center"
                    onClick={() => alert(`Error: ${item.error_message}`)}
                  >
                    <Eye size={16} className="mr-1" /> View Error
                  </button>
                )}
                <button 
                  className="text-red-600 hover:underline flex items-center"
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash2 size={16} className="mr-1" /> Delete
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
};

export default ImportHistory;