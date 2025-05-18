import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import Card from '../../components/UI/Card';
import toast from 'react-hot-toast';
import { UserMinus, Edit2, CheckCircle, XCircle, RefreshCw, User, Lock, ToggleLeft, ToggleRight } from 'lucide-react';

interface User {
  id: string;
  email: string;
  role: string;
  created_at: string;
  email_confirmed_at?: string | null;
  is_active?: boolean;
}

const UserManagement: React.FC = () => {
  const { isAdmin, createUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [updatingUser, setUpdatingUser] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [updatingActive, setUpdatingActive] = useState(false);
  
  // Load all users (for admins only)
  useEffect(() => {
    fetchUsers();
  }, [isAdmin]);
  
  const fetchUsers = async () => {
    if (!isAdmin) return;
    
    try {
      setLoading(true);
      
      // Get all users with their profiles
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, created_at, is_active')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      // Query for user emails via a view instead of using admin API
      const { data: userData, error: userDataError } = await supabase
        .from('users_view')
        .select('id, email, email_confirmed_at, is_active');
      
      if (userDataError) {
        console.warn('Could not fetch user emails:', userDataError);
        // Continue anyway - we'll just show "Unknown" for emails
      }
      
      // Create maps for user data
      const userEmailMap = new Map();
      const userConfirmationMap = new Map();
      const userActiveMap = new Map();
      
      if (userData) {
        userData.forEach((user: any) => {
          userEmailMap.set(user.id, user.email);
          userConfirmationMap.set(user.id, user.email_confirmed_at);
          userActiveMap.set(user.id, user.is_active);
        });
      }
      
      // Format the data for display
      const formattedUsers = data.map((item: any) => ({
        id: item.id,
        email: userEmailMap.get(item.id) || 'Unknown',
        role: item.role,
        created_at: new Date(item.created_at).toLocaleDateString(),
        email_confirmed_at: userConfirmationMap.get(item.id),
        is_active: item.is_active ?? true // Default to true if no value
      }));
      
      setUsers(formattedUsers);
    } catch (err) {
      console.error('Error fetching users:', err);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle creating a new user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isAdmin) {
      toast.error('Only administrators can create users');
      return;
    }
    
    if (!newUserEmail || !newUserPassword) {
      toast.error('Please provide both email and password');
      return;
    }
    
    try {
      setCreatingUser(true);
      
      const { success, error } = await createUser(newUserEmail, newUserPassword);
      
      if (!success) {
        throw new Error(error);
      }
      
      toast.success(`User created: ${newUserEmail}`);
      setNewUserEmail('');
      setNewUserPassword('');
      
      // Refresh the user list
      fetchUsers();
    } catch (err: any) {
      console.error('Error creating user:', err);
      toast.error(err.message || 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };
  
  // Handle updating a user
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingUser) return;
    
    try {
      setUpdatingUser(true);
      
      // Update user role in profiles table
      const { error } = await supabase
        .from('profiles')
        .update({ 
          role: editingUser.role,
          is_active: editingUser.is_active 
        })
        .eq('id', editingUser.id);
        
      if (error) throw error;
      
      // If a new password is provided, update it
      if (showPasswordField && newPassword) {
        // Use the auth.resetPasswordForEmail API and then manually set it
        // This is a workaround since we don't have direct password update from client
        const { error: passwordError } = await supabase.rpc('admin_update_user_password', {
          user_id: editingUser.id,
          new_password: newPassword
        });
        
        if (passwordError) {
          throw passwordError;
        }
        
        toast.success(`Password updated for: ${editingUser.email}`);
      }
      
      toast.success(`User updated: ${editingUser.email}`);
      setEditingUser(null);
      setNewPassword('');
      setShowPasswordField(false);
      
      // Refresh the user list
      fetchUsers();
    } catch (err: any) {
      console.error('Error updating user:', err);
      toast.error(err.message || 'Failed to update user');
    } finally {
      setUpdatingUser(false);
    }
  };
  
  // Toggle user active status
  const toggleUserActive = async (userId: string, currentValue: boolean) => {
    try {
      setUpdatingActive(true);
      
      // Update is_active status
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !currentValue })
        .eq('id', userId);
        
      if (error) throw error;
      
      toast.success(`User status updated`);
      
      // Refresh the user list
      fetchUsers();
    } catch (err: any) {
      console.error('Error updating user status:', err);
      toast.error(err.message || 'Failed to update user status');
    } finally {
      setUpdatingActive(false);
    }
  };
  
  // Handle deleting a user
  const handleDeleteUser = async (userId: string) => {
    try {
      setIsDeleting(true);
      
      // Attempt to delete the user using a server-less approach
      // This will only work with the proper permissions
      const { error } = await supabase.rpc('delete_user', {
        user_id: userId
      });
      
      if (error) {
        throw error;
      }
      
      toast.success('User deleted successfully');
      setUserToDelete(null);
      
      // Refresh the user list
      fetchUsers();
    } catch (err: any) {
      console.error('Error deleting user:', err);
      toast.error(err.message || 'Failed to delete user. You may need admin privileges.');
    } finally {
      setIsDeleting(false);
    }
  };
  
  // If not admin, don't show this page
  if (!isAdmin) {
    return (
      <Card>
        <h2 className="text-xl font-semibold mb-4">User Management</h2>
        <p className="text-red-500">You don't have permission to view this page.</p>
      </Card>
    );
  }
  
  return (
    <Card>
      <h2 className="text-xl font-semibold mb-6">User Management</h2>
      
      {/* Create user form */}
      <div className="mb-10 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium mb-4">Create New User</h3>
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label htmlFor="userEmail" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              id="userEmail"
              type="email"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="user@example.com"
              required
            />
          </div>
          
          <div>
            <label htmlFor="userPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="userPassword"
              type="password"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Create a secure password"
              required
            />
          </div>
          
          <div>
            <button
              type="submit"
              disabled={creatingUser}
              className={`
                w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
                ${creatingUser ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'} 
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
              `}
            >
              {creatingUser ? 'Creating User...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
      
      {/* User list */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Existing Users</h3>
          <button 
            onClick={fetchUsers}
            className="flex items-center text-sm text-blue-600 hover:text-blue-800"
          >
            <RefreshCw size={14} className="mr-1" />
            Refresh
          </button>
        </div>
        
        {loading ? (
          <div className="text-center py-4">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email Verified
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className={!user.is_active ? 'bg-gray-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.created_at}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.email_confirmed_at ? (
                        <CheckCircle size={18} className="text-green-500" />
                      ) : (
                        <XCircle size={18} className="text-red-500" />
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button 
                        onClick={() => toggleUserActive(user.id, user.is_active ?? true)}
                        disabled={updatingActive}
                        className="focus:outline-none"
                        title={user.is_active ? "Click to deactivate" : "Click to activate"}
                      >
                        {user.is_active ? (
                          <span className="flex items-center text-green-600">
                            <ToggleRight size={18} className="mr-1" />
                            Active
                          </span>
                        ) : (
                          <span className="flex items-center text-red-600">
                            <ToggleLeft size={18} className="mr-1" />
                            Inactive
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Edit user"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => setUserToDelete(user.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete user"
                        >
                          <UserMinus size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Edit User</h3>
            <form onSubmit={handleUpdateUser}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="flex items-center">
                    <User size={14} className="mr-2" />
                    Email
                  </span>
                </label>
                <input
                  type="text"
                  value={editingUser.email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100"
                />
                <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="regular">Regular</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={editingUser.is_active ? 'active' : 'inactive'}
                  onChange={(e) => setEditingUser({
                    ...editingUser, 
                    is_active: e.target.value === 'active'
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <span className="flex items-center">
                      <Lock size={14} className="mr-2" />
                      Password
                    </span>
                  </label>
                  <button 
                    type="button"
                    onClick={() => setShowPasswordField(!showPasswordField)}
                    className="text-sm text-blue-500 hover:text-blue-700"
                  >
                    {showPasswordField ? 'Cancel' : 'Change Password'}
                  </button>
                </div>
                
                {showPasswordField && (
                  <>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter new password"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Leave blank to keep current password
                    </p>
                  </>
                )}
              </div>
              
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setNewPassword('');
                    setShowPasswordField(false);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingUser}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {updatingUser ? 'Updating...' : 'Update User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-xl font-bold text-red-600 mb-4">Confirm Deletion</h3>
            <p className="mb-6">Are you sure you want to delete this user? This action cannot be undone.</p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={() => userToDelete && handleDeleteUser(userToDelete)}
                disabled={isDeleting}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default UserManagement; 