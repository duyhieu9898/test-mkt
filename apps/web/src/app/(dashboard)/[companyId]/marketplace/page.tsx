'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  useMarketplaceSkills,
  useSkillDetails,
  useSkillCategories,
  useAgentSkills,
  useAgents,
  useInstallSkill,
  useUninstallSkill,
  useCreateSkill,
  useSubmitReview,
  type Skill,
  type SkillFilters,
  type AgentSkill,
} from '@/lib/api/hooks';
import {
  Package,
  Search,
  Star,
  Download,
  Plus,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Code,
  Database,
  MessageSquare,
  Zap,
  Globe,
  Settings,
  Filter,
  X,
  Check,
  ExternalLink,
  Users,
  Clock,
  BookOpen,
  AlertTriangle,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function MarketplacePage() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [activeTab, setActiveTab] = useState<'browse' | 'installed' | 'create'>('browse');
  const [filters, setFilters] = useState<SkillFilters>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [selectedAgentForInstall, setSelectedAgentForInstall] = useState<string | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 12;

  // Data hooks
  const { data: skillsData, isLoading: loadingSkills, refetch } = useMarketplaceSkills(
    { ...filters, search: searchQuery || undefined },
    limit,
    page * limit
  );
  const { data: categories } = useSkillCategories();
  const { data: skillDetails, isLoading: loadingDetails } = useSkillDetails(selectedSkill || '');
  const { data: agents } = useAgents(companyId);
  const { data: installedSkills, isLoading: loadingInstalled } = useAgentSkills(selectedAgentForInstall || '');

  // Mutations
  const installSkill = useInstallSkill();
  const uninstallSkill = useUninstallSkill();
  const createSkill = useCreateSkill();
  const submitReview = useSubmitReview();

  const skills = skillsData?.data || [];
  const totalSkills = skillsData?.total || 0;
  const totalPages = Math.ceil(totalSkills / limit);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'ai':
        return <Sparkles className="w-4 h-4" />;
      case 'automation':
        return <Zap className="w-4 h-4" />;
      case 'data':
        return <Database className="w-4 h-4" />;
      case 'communication':
        return <MessageSquare className="w-4 h-4" />;
      case 'integration':
        return <Globe className="w-4 h-4" />;
      case 'development':
        return <Code className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  const getPricingBadge = (pricing: Skill['pricing']) => {
    if (pricing.model === 'free') {
      return <Badge variant="secondary">Free</Badge>;
    }
    if (pricing.model === 'per_use') {
      return <Badge className="bg-blue-500">${pricing.price}/use</Badge>;
    }
    if (pricing.model === 'subscription') {
      return <Badge className="bg-purple-500">${pricing.price}/mo</Badge>;
    }
    return <Badge variant="outline">{pricing.model}</Badge>;
  };

  const handleInstall = async (skillId: string) => {
    if (!selectedAgentForInstall) return;
    await installSkill.mutateAsync({
      agentId: selectedAgentForInstall,
      skillId,
    });
    setShowInstallModal(false);
  };

  const handleUninstall = async (agentId: string, skillId: string) => {
    await uninstallSkill.mutateAsync({ agentId, skillId });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Skill Marketplace</h1>
          <p className="text-muted-foreground">Discover and install skills for your agents</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setActiveTab('create')}>
            <Plus className="w-4 h-4 mr-2" />
            Create Skill
          </Button>
        </div>
      </div>

      {/* Category Stats */}
      {categories && categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Button
              key={cat.category}
              variant={filters.category === cat.category ? 'default' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => {
                setFilters({ ...filters, category: filters.category === cat.category ? undefined : cat.category });
                setPage(0);
              }}
            >
              {getCategoryIcon(cat.category)}
              <span className="capitalize">{cat.category}</span>
              <Badge variant="secondary" className="ml-1">{cat.count}</Badge>
            </Button>
          ))}
        </div>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="browse" className="gap-2">
            <Package className="w-4 h-4" />
            Browse
          </TabsTrigger>
          <TabsTrigger value="installed" className="gap-2">
            <Download className="w-4 h-4" />
            Installed
          </TabsTrigger>
          <TabsTrigger value="create" className="gap-2">
            <Plus className="w-4 h-4" />
            Create
          </TabsTrigger>
        </TabsList>

        {/* Browse Tab */}
        <TabsContent value="browse" className="space-y-6 mt-6">
          {/* Search & Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search skills..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(0);
                }}
                className="pl-10"
              />
            </div>
            <Select
              value={String(filters.minRating || 'all')}
              onValueChange={(v: string) => {
                setFilters({ ...filters, minRating: v === 'all' ? undefined : parseInt(v) });
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Min Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ratings</SelectItem>
                <SelectItem value="4">4+ Stars</SelectItem>
                <SelectItem value="3">3+ Stars</SelectItem>
                <SelectItem value="2">2+ Stars</SelectItem>
              </SelectContent>
            </Select>
            {(filters.category || filters.minRating || searchQuery) && (
              <Button variant="outline" onClick={() => { setFilters({}); setSearchQuery(''); setPage(0); }}>
                <X className="w-4 h-4 mr-2" />
                Clear
              </Button>
            )}
          </div>

          {/* Skills Grid */}
          {loadingSkills ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : skills.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {skills.map((skill) => (
                <Card
                  key={skill.id}
                  className={cn(
                    'cursor-pointer hover:border-primary transition-colors',
                    selectedSkill === skill.id && 'border-primary'
                  )}
                  onClick={() => setSelectedSkill(skill.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10">
                          {getCategoryIcon(skill.category)}
                        </div>
                        <div>
                          <CardTitle className="text-base">{skill.name}</CardTitle>
                          <p className="text-xs text-muted-foreground">v{skill.version}</p>
                        </div>
                      </div>
                      {getPricingBadge(skill.pricing)}
                    </div>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {skill.description || 'No description available'}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {skill.capabilities?.slice(0, 3).map((cap) => (
                        <Badge key={cap} variant="outline" className="text-xs">
                          {cap}
                        </Badge>
                      ))}
                      {(skill.capabilities?.length || 0) > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{skill.capabilities!.length - 3}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter className="pt-2 border-t">
                    <div className="flex items-center justify-between w-full text-sm">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <span>{skill.averageRating.toFixed(1)}</span>
                        <span className="text-muted-foreground">({skill.totalReviews})</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Download className="w-4 h-4" />
                        <span>{skill.totalInstalls.toLocaleString()}</span>
                      </div>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No skills found</p>
                  <p className="text-sm">Try adjusting your search or filters</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {page * limit + 1} - {Math.min((page + 1) * limit, totalSkills)} of {totalSkills}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm">Page {page + 1} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Skill Details Panel */}
          {selectedSkill && skillDetails && (
            <SkillDetailsPanel
              skill={skillDetails}
              agents={agents || []}
              onInstall={() => setShowInstallModal(true)}
              onClose={() => setSelectedSkill(null)}
              loading={loadingDetails}
            />
          )}
        </TabsContent>

        {/* Installed Tab */}
        <TabsContent value="installed" className="space-y-6 mt-6">
          <div className="flex items-center gap-4">
            <Select value={selectedAgentForInstall || ''} onValueChange={(v: string) => setSelectedAgentForInstall(v || null)}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select an agent to view skills" />
              </SelectTrigger>
              <SelectContent>
                {agents?.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: agent.color || '#6366f1' }}
                      />
                      {agent.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAgentForInstall ? (
            loadingInstalled ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : installedSkills && installedSkills.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {installedSkills.map((agentSkill) => (
                  <Card key={agentSkill.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-primary/10">
                            {getCategoryIcon(agentSkill.skill?.category || 'general')}
                          </div>
                          <div>
                            <CardTitle className="text-base">{agentSkill.skill?.name}</CardTitle>
                            <p className="text-xs text-muted-foreground">v{agentSkill.skill?.version}</p>
                          </div>
                        </div>
                        <Badge variant={agentSkill.status === 'active' ? 'default' : 'secondary'}>
                          {agentSkill.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Installed</span>
                          <span>{format(new Date(agentSkill.installedAt), 'MMM d, yyyy')}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Usage</span>
                          <span>{agentSkill.usageCount} times</span>
                        </div>
                        {agentSkill.lastUsedAt && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Last Used</span>
                            <span>{formatDistanceToNow(new Date(agentSkill.lastUsedAt), { addSuffix: true })}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleUninstall(agentSkill.agentId, agentSkill.skillId)}
                        disabled={uninstallSkill.isPending}
                      >
                        {uninstallSkill.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <X className="w-4 h-4 mr-2" />
                        )}
                        Uninstall
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No skills installed for this agent</p>
                    <Button variant="outline" className="mt-4" onClick={() => setActiveTab('browse')}>
                      Browse Skills
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Select an agent to view installed skills</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Create Tab */}
        <TabsContent value="create" className="space-y-6 mt-6">
          <CreateSkillForm
            onSuccess={() => {
              setActiveTab('browse');
              refetch();
            }}
            isLoading={createSkill.isPending}
            onSubmit={(data) => createSkill.mutateAsync(data)}
          />
        </TabsContent>
      </Tabs>

      {/* Install Modal */}
      {showInstallModal && selectedSkill && skillDetails && (
        <InstallModal
          skill={skillDetails}
          agents={agents || []}
          selectedAgent={selectedAgentForInstall}
          onSelectAgent={setSelectedAgentForInstall}
          onInstall={() => handleInstall(selectedSkill)}
          onClose={() => setShowInstallModal(false)}
          isLoading={installSkill.isPending}
        />
      )}
    </div>
  );
}

// Skill Details Panel
function SkillDetailsPanel({
  skill,
  agents,
  onInstall,
  onClose,
  loading,
}: {
  skill: Skill & { reviews?: Array<{ id: string; rating: number; title?: string; content?: string; createdAt: string; reviewer?: { name: string } }> };
  agents: Array<{ id: string; name: string; color?: string }>;
  onInstall: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card className="mt-6">
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <CardTitle>{skill.name}</CardTitle>
              <CardDescription>
                By {skill.author?.name || 'Unknown'} • v{skill.version}
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            <span className="font-semibold">{skill.averageRating.toFixed(1)}</span>
            <span className="text-muted-foreground">({skill.totalReviews} reviews)</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Download className="w-5 h-5" />
            <span>{skill.totalInstalls.toLocaleString()} installs</span>
          </div>
        </div>

        <p className="text-muted-foreground">{skill.description}</p>

        {/* Capabilities */}
        <div>
          <h4 className="font-medium mb-2">Capabilities</h4>
          <div className="flex flex-wrap gap-2">
            {skill.capabilities?.map((cap) => (
              <Badge key={cap} variant="outline">{cap}</Badge>
            ))}
          </div>
        </div>

        {/* Requirements */}
        {skill.requirements && (
          <div>
            <h4 className="font-medium mb-2">Requirements</h4>
            <div className="space-y-1 text-sm text-muted-foreground">
              {skill.requirements.minAgentLevel && (
                <p>Min Agent Level: {skill.requirements.minAgentLevel}</p>
              )}
              {skill.requirements.requiredTools && skill.requirements.requiredTools.length > 0 && (
                <p>Required Tools: {skill.requirements.requiredTools.join(', ')}</p>
              )}
              {skill.requirements.dependencies && skill.requirements.dependencies.length > 0 && (
                <p>Dependencies: {skill.requirements.dependencies.join(', ')}</p>
              )}
            </div>
          </div>
        )}

        {/* Documentation */}
        {skill.documentation && (
          <div>
            <h4 className="font-medium mb-2">Documentation</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{skill.documentation}</p>
          </div>
        )}

        {/* Example Usage */}
        {skill.exampleUsage && (
          <div>
            <h4 className="font-medium mb-2">Example Usage</h4>
            <pre className="bg-muted p-3 rounded-lg text-sm overflow-x-auto">
              {skill.exampleUsage}
            </pre>
          </div>
        )}

        {/* Reviews */}
        {skill.reviews && skill.reviews.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Recent Reviews</h4>
            <div className="space-y-3">
              {skill.reviews.slice(0, 3).map((review) => (
                <div key={review.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              'w-4 h-4',
                              i < review.rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'
                            )}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-medium">{review.reviewer?.name || 'Anonymous'}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(review.createdAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                  {review.title && <p className="font-medium text-sm">{review.title}</p>}
                  {review.content && <p className="text-sm text-muted-foreground">{review.content}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t pt-4">
        <Button className="w-full" onClick={onInstall}>
          <Download className="w-4 h-4 mr-2" />
          Install Skill
        </Button>
      </CardFooter>
    </Card>
  );
}

// Install Modal
function InstallModal({
  skill,
  agents,
  selectedAgent,
  onSelectAgent,
  onInstall,
  onClose,
  isLoading,
}: {
  skill: Skill;
  agents: Array<{ id: string; name: string; color?: string }>;
  selectedAgent: string | null;
  onSelectAgent: (id: string | null) => void;
  onInstall: () => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Install {skill.name}</CardTitle>
          <CardDescription>Select an agent to install this skill</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedAgent || ''} onValueChange={(v: string) => onSelectAgent(v || null)}>
            <SelectTrigger>
              <SelectValue placeholder="Select an agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: agent.color || '#6366f1' }}
                    />
                    {agent.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {skill.requirements && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                Requirements
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                {skill.requirements.minAgentLevel && (
                  <li>Min Agent Level: {skill.requirements.minAgentLevel}</li>
                )}
                {skill.requirements.requiredTools && skill.requirements.requiredTools.length > 0 && (
                  <li>Required Tools: {skill.requirements.requiredTools.join(', ')}</li>
                )}
              </ul>
            </div>
          )}
        </CardContent>
        <CardFooter className="gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={onInstall}
            disabled={!selectedAgent || isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Install
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// Create Skill Form
function CreateSkillForm({
  onSuccess,
  onSubmit,
  isLoading,
}: {
  onSuccess: () => void;
  onSubmit: (data: Partial<Skill>) => Promise<unknown>;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'general',
    version: '1.0.0',
    capabilities: '',
    documentation: '',
    exampleUsage: '',
    isPublic: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      name: formData.name,
      description: formData.description,
      category: formData.category,
      version: formData.version,
      capabilities: formData.capabilities.split(',').map((c) => c.trim()).filter(Boolean),
      documentation: formData.documentation,
      exampleUsage: formData.exampleUsage,
      isPublic: formData.isPublic,
      pricing: { model: 'free' },
    });
    onSuccess();
  };

  const categories = ['ai', 'automation', 'data', 'communication', 'integration', 'development', 'general'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Skill</CardTitle>
        <CardDescription>Define a custom skill for your agents</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Custom Skill"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Version</label>
              <Input
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                placeholder="1.0.0"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Category</label>
            <Select value={formData.category} onValueChange={(v: string) => setFormData({ ...formData, category: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    <span className="capitalize">{cat}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this skill does..."
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Capabilities (comma-separated)</label>
            <Input
              value={formData.capabilities}
              onChange={(e) => setFormData({ ...formData, capabilities: e.target.value })}
              placeholder="data analysis, report generation, forecasting"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Documentation</label>
            <Textarea
              value={formData.documentation}
              onChange={(e) => setFormData({ ...formData, documentation: e.target.value })}
              placeholder="How to use this skill..."
              rows={4}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Example Usage</label>
            <Textarea
              value={formData.exampleUsage}
              onChange={(e) => setFormData({ ...formData, exampleUsage: e.target.value })}
              placeholder="Show an example of how to invoke this skill..."
              rows={3}
            />
          </div>
        </CardContent>
        <CardFooter className="border-t pt-4">
          <Button type="submit" className="w-full" disabled={isLoading || !formData.name}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Create Skill
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
