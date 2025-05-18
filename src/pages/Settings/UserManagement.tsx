import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import Card from '../../components/UI/Card';
import toast from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

const UserManagement: React.FC = () => {
  const { isAdmin, createUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  
  // Load all users (for admins only)
  useEffect(() => {
    const fetchUsers = async () => {
      if (!isAdmin) return;
      
      try {
        setLoading(true);
        
        // Get all users with their profiles - join with auth.users
        const { data, error } = await supabase
          .from('profiles')
          .select('id, role, created_at')
          .order('created_at', { ascending: false });
          
        if (error) throw error;
        
        // Get user emails from auth in a separate query
        const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
        
        if (usersError) throw usersError;
        
        // Create a map of user IDs to emails
        const userEmailMap = new Map();
        usersData.users.forEach((user: any) => {
          userEmailMap.set(user.id, user.email);
        });
        
        // Format the data for display
        const formattedUsers = data.map((item: any) => ({
          id: item.id,
          email: userEmailMap.get(item.id) || 'Unknown',
          role: item.role,
          created_at: new Date(item.created_at).toLocaleDateString()
        }));
        
        setUsers(formattedUsers);
      } catch (err) {
        console.error('Error fetching users:', err);
        toast.error('Failed to load users');
      } finally {
        setLoading(false);
      }
    };
    
    fetchUsers();
  }, [isAdmin]);
  
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
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, role, created_at')
        .order('created_at', { ascending: false });
        
      if (fetchError) throw fetchError;
      
      // Get user emails from auth again
      const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
      
      if (usersError) throw usersError;
      
      // Create a map of user IDs to emails
      const userEmailMap = new Map();
      usersData.users.forEach((user: any) => {
        userEmailMap.set(user.id, user.email);
      });
      
      const formattedUsers = data.map((item: any) => ({
        id: item.id,
        email: userEmailMap.get(item.id) || 'Unknown',
        role: item.role,
        created_at: new Date(item.created_at).toLocaleDateString()
      }));
      
      setUsers(formattedUsers);
    } catch (err: any) {
      console.error('Error creating user:', err);
      toast.error(err.message || 'Failed to create user');
    } finally {
      setCreatingUser(false);
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
        <h3 className="text-lg font-medium mb-4">Existing Users</h3>
        
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
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id}>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
};

export default UserManagement; 