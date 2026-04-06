'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Users, UserCheck, UserX, Clock, Search, Shield, RefreshCw } from 'lucide-react';
import { useAdminUsers, useAdminUserStats, useAdminChangeRole, useAdminChangeUserStatus } from '@/lib/api/admin-hooks';

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: statsData } = useAdminUserStats();
  const { data: usersData, isLoading, refetch } = useAdminUsers({ search, role: roleFilter, status: statusFilter, limit: 100 });
  const changeRole = useAdminChangeRole();
  const changeStatus = useAdminChangeUserStatus();

  const stats = statsData || { total: 0, active: 0, pending: 0, rejected: 0, admins: 0 };
  const users = usersData?.users || [];

  const handleApprove = async (userId: string) => {
    try {
      await changeStatus.mutateAsync({ userId, approvalStatus: 'approved', isActive: true });
      toast.success('User approved');
    } catch { toast.error('Failed'); }
  };

  const handleReject = async (userId: string) => {
    try {
      await changeStatus.mutateAsync({ userId, approvalStatus: 'rejected', isActive: false });
      toast.success('User rejected');
    } catch { toast.error('Failed'); }
  };

  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await changeRole.mutateAsync({ userId, role: newRole });
      toast.success(`Role changed to ${newRole}`);
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">User Management</h1>
        <p className="text-gray-500">Manage all registered users</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: stats.total, icon: Users, color: 'text-blue-600 bg-blue-50' },
          { label: 'Active', value: stats.active, icon: UserCheck, color: 'text-green-600 bg-green-50' },
          { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600 bg-amber-50' },
          { label: 'Admins', value: stats.admins, icon: Shield, color: 'text-purple-600 bg-purple-50' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                  <s.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">All Users</CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>
          <div className="flex gap-3 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-10 rounded-md border px-3 text-sm"
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-md border px-3 text-sm"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center py-12 text-gray-400">No users found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Email</th>
                    <th className="pb-3 font-medium">Role</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Registered</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: any) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-medium">{u.name}</td>
                      <td className="py-3 text-gray-600">{u.email}</td>
                      <td className="py-3">
                        <Badge variant={u.role === 'admin' ? 'default' : 'outline'} className="text-xs">
                          {u.role || 'user'}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            u.approvalStatus === 'approved' ? 'border-green-200 text-green-700 bg-green-50' :
                            u.approvalStatus === 'pending' ? 'border-amber-200 text-amber-700 bg-amber-50' :
                            'border-red-200 text-red-700 bg-red-50'
                          }`}
                        >
                          {u.approvalStatus || 'pending'}
                        </Badge>
                      </td>
                      <td className="py-3 text-gray-500">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {u.approvalStatus === 'pending' && (
                            <>
                              <Button size="sm" variant="outline" className="text-green-600 h-7 text-xs" onClick={() => handleApprove(u.id)}>
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 h-7 text-xs" onClick={() => handleReject(u.id)}>
                                Reject
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => handleToggleRole(u.id, u.role || 'user')}
                          >
                            {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
