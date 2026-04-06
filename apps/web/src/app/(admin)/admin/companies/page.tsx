'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Building2, Play, Pause, Archive, RefreshCw } from 'lucide-react';
import { useAdminCompanies, useAdminCompanyStats, useAdminChangeCompanyStatus } from '@/lib/api/admin-hooks';

export default function AdminCompaniesPage() {
  const { data: statsData } = useAdminCompanyStats();
  const { data: companiesData, isLoading, refetch } = useAdminCompanies({ limit: 100 });
  const changeStatus = useAdminChangeCompanyStatus();

  const stats = statsData || { total: 0, active: 0, paused: 0, archived: 0 };
  const companies = companiesData?.companies || [];

  const handleStatusChange = async (companyId: string, status: string) => {
    try {
      await changeStatus.mutateAsync({ companyId, status });
      toast.success(`Company ${status}`);
    } catch { toast.error('Failed'); }
  };

  const statusColor = (s: string) => {
    if (s === 'active') return 'border-green-200 text-green-700 bg-green-50';
    if (s === 'paused') return 'border-amber-200 text-amber-700 bg-amber-50';
    if (s === 'archived') return 'border-gray-200 text-gray-500 bg-gray-50';
    return 'border-blue-200 text-blue-700 bg-blue-50';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Company Management</h1>
        <p className="text-gray-500">Manage all companies on the platform</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-blue-600 bg-blue-50' },
          { label: 'Active', value: stats.active, color: 'text-green-600 bg-green-50' },
          { label: 'Paused', value: stats.paused, color: 'text-amber-600 bg-amber-50' },
          { label: 'Archived', value: stats.archived, color: 'text-gray-600 bg-gray-50' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                  <Building2 className="w-5 h-5" />
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

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">All Companies</CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : companies.length === 0 ? (
            <p className="text-center py-12 text-gray-400">No companies found</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">Company</th>
                  <th className="pb-3 font-medium">Owner</th>
                  <th className="pb-3 font-medium">Industry</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c: any) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-medium">{c.name}</td>
                    <td className="py-3 text-gray-600">{c.ownerEmail || c.ownerId}</td>
                    <td className="py-3 text-gray-600">{c.industry || '-'}</td>
                    <td className="py-3">
                      <Badge variant="outline" className={`text-xs ${statusColor(c.status)}`}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-gray-500">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {c.status !== 'active' && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600" onClick={() => handleStatusChange(c.id, 'active')}>
                            <Play className="w-3 h-3 mr-1" /> Activate
                          </Button>
                        )}
                        {c.status === 'active' && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-600" onClick={() => handleStatusChange(c.id, 'paused')}>
                            <Pause className="w-3 h-3 mr-1" /> Pause
                          </Button>
                        )}
                        {c.status !== 'archived' && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500" onClick={() => handleStatusChange(c.id, 'archived')}>
                            <Archive className="w-3 h-3 mr-1" /> Archive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
