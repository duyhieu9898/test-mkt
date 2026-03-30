'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Plus,
  Loader2,
  TrendingUp,
  Target,
  Trophy,
  Mail,
  Phone,
  Building2,
  MessageSquare,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const scoreColor = (score: number) => {
  if (score >= 70) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (score >= 40) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
};

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-cyan-100 text-cyan-700',
  engaged: 'bg-indigo-100 text-indigo-700',
  qualified: 'bg-purple-100 text-purple-700',
  meeting_scheduled: 'bg-amber-100 text-amber-700',
  proposal_sent: 'bg-orange-100 text-orange-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
  unsubscribed: 'bg-gray-100 text-gray-600',
};

export default function LeadsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [addDialog, setAddDialog] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newSource, setNewSource] = useState('organic');
  const [isCreating, setIsCreating] = useState(false);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Fetch leads
  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads', companyId],
    queryFn: () =>
      api.get<{ data: any[]; stats: any }>(`/leads/company/${companyId}`, { token: token! }),
    enabled: !!token,
  });

  // Fetch lead detail
  const { data: leadDetail } = useQuery({
    queryKey: ['lead-detail', selectedLeadId],
    queryFn: () =>
      api.get<{ lead: any; conversations: any[] }>(
        `/leads/company/${companyId}/${selectedLeadId}`,
        { token: token! }
      ),
    enabled: !!token && !!selectedLeadId,
  });

  const leadsList = leadsData?.data || [];
  const stats = leadsData?.stats || { total: 0, qualified: 0, converted: 0, avgScore: 0 };

  // Create lead
  const handleCreateLead = async () => {
    if (!token || !newEmail.trim()) return;
    setIsCreating(true);
    try {
      await api.post(
        `/leads/company/${companyId}`,
        {
          email: newEmail,
          firstName: newFirstName || undefined,
          lastName: newLastName || undefined,
          company: newCompany || undefined,
          phone: newPhone || undefined,
          source: newSource,
        },
        { token }
      );
      toast.success('Lead created!');
      setAddDialog(false);
      setNewEmail('');
      setNewFirstName('');
      setNewLastName('');
      setNewCompany('');
      setNewPhone('');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to create lead');
    } finally {
      setIsCreating(false);
    }
  };

  // Update lead status
  const handleStatusChange = async (leadId: string, status: string) => {
    if (!token) return;
    try {
      await api.patch(`/leads/company/${companyId}/${leadId}/status`, { status }, { token });
      toast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-detail'] });
    } catch {
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads & Sales</h1>
          <p className="text-muted-foreground">Track and manage your sales pipeline</p>
        </div>
        <Button className="gap-2" onClick={() => setAddDialog(true)}>
          <Plus className="w-4 h-4" /> Add Lead
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Leads</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Target className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.qualified}</p>
              <p className="text-xs text-muted-foreground">Qualified</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Trophy className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.converted}</p>
              <p className="text-xs text-muted-foreground">Won</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{Math.round(Number(stats.avgScore))}</p>
              <p className="text-xs text-muted-foreground">Avg Score</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leads List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* List */}
        <div className="lg:col-span-2 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : leadsList.length === 0 ? (
            <Card className="p-12 text-center">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <h3 className="font-semibold mb-2">No leads yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Leads are captured automatically when visitors interact with your chatbot
              </p>
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">How to get leads:</p>
                <p>1. Deploy your chatbot on your website</p>
                <p>2. Visitors chat → share email → become leads</p>
                <p>3. Or run marketing campaigns to drive traffic</p>
              </div>
              <div className="flex gap-3 justify-center mt-4">
                <Button size="sm" variant="outline" onClick={() => router.push(`/${companyId}/chatbot`)}>
                  Set up Chatbot
                </Button>
                <Button size="sm" variant="outline" onClick={() => router.push(`/${companyId}/marketing`)}>
                  Create Campaign
                </Button>
              </div>
            </Card>
          ) : (
            leadsList.map((lead: any) => (
              <Card
                key={lead.id}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                  selectedLeadId === lead.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setSelectedLeadId(lead.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm">
                          {lead.firstName || lead.lastName
                            ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim()
                            : lead.email}
                        </p>
                        <Badge className={`text-[10px] ${scoreColor(lead.score)}`}>
                          Score: {lead.score}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${statusColors[lead.status] || ''}`}
                        >
                          {lead.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {lead.email}
                        </span>
                        {lead.company && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> {lead.company}
                          </span>
                        )}
                        <span>{lead.source}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Detail */}
        <div>
          {!selectedLeadId ? (
            <Card className="p-8 text-center">
              <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Select a lead to view details</p>
            </Card>
          ) : leadDetail ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {leadDetail.lead.firstName || leadDetail.lead.lastName
                    ? `${leadDetail.lead.firstName || ''} ${leadDetail.lead.lastName || ''}`.trim()
                    : leadDetail.lead.email}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Contact info */}
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{leadDetail.lead.email}</span>
                  </div>
                  {leadDetail.lead.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{leadDetail.lead.phone}</span>
                    </div>
                  )}
                  {leadDetail.lead.company && (
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{leadDetail.lead.company}</span>
                    </div>
                  )}
                </div>

                {/* Score */}
                <div>
                  <Label className="text-xs">Lead Score</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          leadDetail.lead.score >= 70
                            ? 'bg-green-500'
                            : leadDetail.lead.score >= 40
                            ? 'bg-amber-500'
                            : 'bg-gray-400'
                        }`}
                        style={{ width: `${leadDetail.lead.score}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8">{leadDetail.lead.score}</span>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={leadDetail.lead.status}
                    onValueChange={(v) => handleStatusChange(leadDetail.lead.id, v)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="engaged">Engaged</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="meeting_scheduled">Meeting Scheduled</SelectItem>
                      <SelectItem value="proposal_sent">Proposal Sent</SelectItem>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Source & dates */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Source: {leadDetail.lead.source}</p>
                  <p>Created: {new Date(leadDetail.lead.createdAt).toLocaleDateString()}</p>
                  {leadDetail.lead.notes && <p>Notes: {leadDetail.lead.notes}</p>}
                </div>

                {/* Chatbot conversations */}
                {leadDetail.conversations.length > 0 && (
                  <div>
                    <Label className="text-xs">Chatbot Conversations</Label>
                    <div className="mt-2 space-y-2">
                      {leadDetail.conversations.map((conv: any) => (
                        <div
                          key={conv.id}
                          className="p-2 bg-muted/50 rounded text-xs flex items-center gap-2"
                        >
                          <MessageSquare className="w-3 h-3 text-primary" />
                          <span>{conv.channel}</span>
                          <span className="text-muted-foreground">
                            {new Date(conv.createdAt).toLocaleDateString()}
                          </span>
                          <Badge variant="outline" className="text-[10px] ml-auto">
                            {conv.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Add Lead Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
            <DialogDescription>Create a new lead manually</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="lead@example.com"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name</Label>
                <Input
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label>Company</Label>
              <Input
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Source</Label>
              <Select value={newSource} onValueChange={setNewSource}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organic">Organic</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="landing_page">Landing Page</SelectItem>
                  <SelectItem value="cold_outreach">Cold Outreach</SelectItem>
                  <SelectItem value="ad_campaign">Ad Campaign</SelectItem>
                  <SelectItem value="import">Import</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateLead} disabled={!newEmail.trim() || isCreating} className="gap-2">
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
