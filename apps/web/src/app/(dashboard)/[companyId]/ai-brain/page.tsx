'use client';

import { useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Search,
  Trash2,
  Send,
  Brain,
  Settings,
  Clock,
  Copy,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  MessageSquare,
  Lock,
  Eye,
  File,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ─── Types ──────────────────────────────────────────────────────────
interface TenantDocument {
  id: string;
  name: string;
  file_size: number;
  mime_type: string;
  content_hash: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TenantAgent {
  id: string;
  name: string;
  system_prompt: string;
  tone: string;
  top_k: number;
}

interface QueryHistoryItem {
  id: string;
  question: string;
  answer: string;
  sources: Array<{ documentId: string; name: string; relevanceScore: number }>;
  trace_id: string;
  created_at: string;
}

interface AuditEntry {
  id: string;
  action: string;
  details: string;
  data_hash: string | null;
  chain_hash: string;
  created_at: string;
}

interface IntegrityResult {
  valid: boolean;
  auditChainValid: boolean;
  documentsValid: boolean;
  entriesChecked: number;
  documentsChecked: number;
  modifiedDocuments?: string[];
  verifiedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateHash(hash: string | null): string {
  if (!hash) return '--';
  return hash.substring(0, 8) + '...' + hash.substring(hash.length - 6);
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    document_uploaded: 'Document uploaded',
    document_deleted: 'Document removed',
    query_made: 'Question asked',
    agent_created: 'AI agent created',
    agent_updated: 'AI settings updated',
    tenant_initialized: 'System initialized',
  };
  return labels[action] || action;
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function AIBrainPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState('knowledge');
  const [isUploading, setIsUploading] = useState(false);
  const [question, setQuestion] = useState('');
  const [currentAnswer, setCurrentAnswer] = useState<{
    answer: string;
    sources: Array<{ documentId: string; name: string; relevanceScore: number }>;
    traceId: string;
  } | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [auditFilter, setAuditFilter] = useState('all');
  const [selectedDocProof, setSelectedDocProof] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Agent settings local state
  const [agentName, setAgentName] = useState('');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentTone, setAgentTone] = useState('professional');
  const [agentTopK, setAgentTopK] = useState(5);
  const [agentId, setAgentId] = useState<string | null>(null);

  // ─── Initialize tenant on mount ───────────────────────────────────
  useQuery({
    queryKey: ['tenant-ai-init', companyId],
    queryFn: () => api.post(`/tenant-ai/company/${companyId}/init`, {}, { token: token! }),
    enabled: !!token,
    staleTime: Infinity,
    retry: 1,
  });

  // ─── Data Queries ─────────────────────────────────────────────────
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['tenant-ai-docs', companyId],
    queryFn: () =>
      api.get<{ data: TenantDocument[]; totalDocuments: number; totalStorageBytes: number }>(
        `/tenant-ai/company/${companyId}/documents`,
        { token: token! }
      ),
    enabled: !!token,
    refetchInterval: 5000,
  });

  const { data: agentsData } = useQuery({
    queryKey: ['tenant-ai-agents', companyId],
    queryFn: async () => {
      const res = await api.get<{ data: TenantAgent[] }>(
        `/tenant-ai/company/${companyId}/agents`,
        { token: token! }
      );
      // Initialize local state from first agent
      if (res.data?.length > 0) {
        const a = res.data[0];
        setAgentId(a.id);
        setAgentName(a.name);
        setAgentPrompt(a.system_prompt);
        setAgentTone(a.tone);
        setAgentTopK(a.top_k);
      }
      return res;
    },
    enabled: !!token,
  });

  const { data: historyData } = useQuery({
    queryKey: ['tenant-ai-history', companyId],
    queryFn: () =>
      api.get<{ data: QueryHistoryItem[] }>(
        `/tenant-ai/company/${companyId}/query-history`,
        { token: token! }
      ),
    enabled: !!token && activeTab === 'ask',
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['tenant-ai-audit', companyId, auditFilter],
    queryFn: () => {
      const filterParam = auditFilter !== 'all' ? `?action=${auditFilter}` : '';
      return api.get<{ data: AuditEntry[] }>(
        `/tenant-ai/company/${companyId}/audit-log${filterParam}`,
        { token: token! }
      );
    },
    enabled: !!token && activeTab === 'transparency',
  });

  const { data: docProofData, isLoading: proofLoading } = useQuery({
    queryKey: ['tenant-ai-doc-proof', companyId, selectedDocProof],
    queryFn: () =>
      api.get<any>(
        `/tenant-ai/company/${companyId}/documents/${selectedDocProof}/proof`,
        { token: token! }
      ),
    enabled: !!token && !!selectedDocProof,
  });

  // ─── Integrity verification ───────────────────────────────────────
  const [integrityResult, setIntegrityResult] = useState<IntegrityResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const verifyIntegrity = async () => {
    if (!token) return;
    setIsVerifying(true);
    try {
      const result = await api.get<IntegrityResult>(
        `/tenant-ai/company/${companyId}/verify-integrity`,
        { token }
      );
      setIntegrityResult(result);
      if (result.valid) {
        toast.success('All data verified successfully');
      } else {
        toast.error('Data integrity issue detected');
      }
    } catch {
      toast.error('Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const documents = docsData?.data || [];
  const totalStorage = docsData?.totalStorageBytes || 0;
  const queryHistory = historyData?.data || [];
  const auditEntries = auditData?.data || [];

  // ─── Handlers ─────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (!token) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(`File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum is 10MB.`);
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1'}/tenant-ai/company/${companyId}/documents/upload`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || `Upload failed (${res.status})`);
        return;
      }

      const data = await res.json();
      if (data.duplicate) {
        toast.info('This file was already uploaded');
      } else {
        toast.success(`"${file.name}" added to your AI knowledge base`);
      }
      qc.invalidateQueries({ queryKey: ['tenant-ai-docs'] });
      qc.invalidateQueries({ queryKey: ['tenant-ai-audit'] });
    } catch {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!token) return;
    try {
      await api.delete(`/tenant-ai/company/${companyId}/documents/${docId}`, { token });
      toast.success('Document removed');
      qc.invalidateQueries({ queryKey: ['tenant-ai-docs'] });
      qc.invalidateQueries({ queryKey: ['tenant-ai-audit'] });
    } catch {
      toast.error('Failed to remove document');
    }
  };

  const handleAskQuestion = async () => {
    if (!token || !question.trim() || isAsking) return;
    setIsAsking(true);
    setCurrentAnswer(null);
    try {
      const res = await api.post<{
        answer: string;
        sources: Array<{ documentId: string; name: string; relevanceScore: number }>;
        traceId: string;
      }>(`/tenant-ai/company/${companyId}/query`, { question }, { token });
      setCurrentAnswer(res);
      qc.invalidateQueries({ queryKey: ['tenant-ai-history'] });
      qc.invalidateQueries({ queryKey: ['tenant-ai-audit'] });
    } catch {
      toast.error('Failed to get answer');
    } finally {
      setIsAsking(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!token || !agentId) return;
    setIsSavingSettings(true);
    try {
      await api.patch(
        `/tenant-ai/company/${companyId}/agents/${agentId}`,
        {
          name: agentName,
          systemPrompt: agentPrompt,
          tone: agentTone,
          topK: agentTopK,
        },
        { token }
      );
      toast.success('AI settings saved');
      qc.invalidateQueries({ queryKey: ['tenant-ai-agents'] });
      qc.invalidateQueries({ queryKey: ['tenant-ai-audit'] });
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileUpload(file);
    },
    [token, companyId]
  );

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" /> AI Brain
        </h1>
        <p className="text-muted-foreground">
          Your company's private AI — data is stored separately and every action is logged
        </p>
      </div>

      {/* Trust Banner */}
      <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
        <CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-full">
            <Lock className="w-4 h-4 text-green-700" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-green-900">Your data is stored separately from all other companies</p>
            <p className="text-xs text-green-700">Every action is logged and verifiable in the Transparency tab</p>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="knowledge" className="gap-1.5">
            <FileText className="w-4 h-4" /> Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="ask" className="gap-1.5">
            <MessageSquare className="w-4 h-4" /> Ask AI
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings className="w-4 h-4" /> Agent Settings
          </TabsTrigger>
          <TabsTrigger value="transparency" className="gap-1.5">
            <Shield className="w-4 h-4" /> Transparency
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: Knowledge Base ═══════════════════════════════════ */}
        <TabsContent value="knowledge" className="space-y-4 mt-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{documents.length}</p>
                  <p className="text-xs text-muted-foreground">Documents</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <Brain className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{formatFileSize(totalStorage)}</p>
                  <p className="text-xs text-muted-foreground">Total Storage</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Upload Area */}
          <Card
            className="border-dashed border-2 hover:border-primary/30 transition-colors cursor-pointer"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <CardContent className="pt-6 pb-6">
              <div className="text-center">
                <Upload className="w-10 h-10 text-primary/40 mx-auto mb-3" />
                <p className="font-medium mb-1">Drop files here or click to upload</p>
                <p className="text-sm text-muted-foreground mb-4">
                  PDF, TXT, DOC, MD files up to 10MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.txt,.doc,.docx,.md"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="gap-2"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {isUploading ? 'Uploading...' : 'Choose File'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Document List */}
          {docsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : documents.length === 0 ? (
            <Card className="p-12 text-center">
              <FileText className="w-14 h-14 text-muted-foreground/20 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Upload your first document to give your AI knowledge about your business.
                The AI will use these documents to answer questions accurately.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <Card key={doc.id} className="transition-all hover:shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {/* Icon */}
                      <div className="p-2.5 rounded-lg bg-green-50 shrink-0">
                        {doc.status === 'ready' ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : doc.status === 'processing' ? (
                          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                        ) : (
                          <File className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-medium text-sm truncate">{doc.name}</p>
                          <Badge
                            variant={doc.status === 'ready' ? 'default' : 'secondary'}
                            className="text-[10px] shrink-0"
                          >
                            {doc.status === 'ready' ? 'Ready' : doc.status === 'processing' ? 'Processing' : doc.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span>{formatDate(doc.created_at)}</span>
                          <span
                            className="font-mono cursor-pointer hover:text-foreground"
                            title="Click to copy verification code"
                            onClick={() => copyToClipboard(doc.content_hash)}
                          >
                            {truncateHash(doc.content_hash)}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs gap-1"
                          onClick={() => {
                            setSelectedDocProof(doc.id);
                            setActiveTab('transparency');
                          }}
                        >
                          <Eye className="w-3 h-3" /> Proof
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() => handleDeleteDoc(doc.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══ TAB 2: Ask AI ═══════════════════════════════════════════ */}
        <TabsContent value="ask" className="space-y-4 mt-4">
          {/* Chat Input */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex gap-2">
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask your AI agent..."
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAskQuestion();
                    }
                  }}
                  disabled={isAsking}
                />
                <Button
                  onClick={handleAskQuestion}
                  disabled={isAsking || !question.trim()}
                  className="gap-2"
                >
                  {isAsking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isAsking ? 'Thinking...' : 'Ask'}
                </Button>
              </div>
              {documents.length === 0 && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Upload documents first so your AI has knowledge to draw from
                </p>
              )}
            </CardContent>
          </Card>

          {/* Current Answer */}
          {currentAnswer && (
            <Card className="border-primary/20">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-full shrink-0">
                    <Brain className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm whitespace-pre-wrap">{currentAnswer.answer}</p>

                    {/* Sources */}
                    {currentAnswer.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Sources used:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {currentAnswer.sources.map((s, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] gap-1">
                              <FileText className="w-2.5 h-2.5" />
                              {s.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Trace ID */}
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className="text-[10px] font-mono text-muted-foreground cursor-pointer hover:text-foreground"
                        title="Click to copy trace ID — use this in the Transparency tab"
                        onClick={() => {
                          copyToClipboard(currentAnswer.traceId);
                          toast.success('Trace ID copied — find it in the Transparency tab');
                        }}
                      >
                        Trace: {currentAnswer.traceId}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Query History */}
          {queryHistory.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Previous Questions
              </h3>
              {queryHistory.map((item) => (
                <Card key={item.id} className="hover:shadow-sm transition-all">
                  <CardContent className="p-3">
                    <p className="text-sm font-medium">{item.question}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.answer}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(item.created_at)}
                      </span>
                      {item.sources?.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {item.sources.length} source{item.sources.length > 1 ? 's' : ''}
                        </span>
                      )}
                      <span
                        className="text-[10px] font-mono text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => copyToClipboard(item.trace_id)}
                      >
                        {item.trace_id}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══ TAB 3: Agent Settings ═══════════════════════════════════ */}
        <TabsContent value="settings" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6 space-y-5">
              {/* Agent Name */}
              <div className="space-y-1.5">
                <Label>Agent Name</Label>
                <Input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. Company Assistant"
                />
                <p className="text-xs text-muted-foreground">
                  Give your AI a name that fits your brand
                </p>
              </div>

              {/* System Prompt */}
              <div className="space-y-1.5">
                <Label>Instructions for your AI</Label>
                <Textarea
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  placeholder="Tell your AI how to behave, what to focus on, and any rules to follow..."
                  className="min-h-[120px]"
                />
                <p className="text-xs text-muted-foreground">
                  These instructions guide how your AI answers questions and interacts with your data
                </p>
              </div>

              {/* Tone */}
              <div className="space-y-1.5">
                <Label>Communication Tone</Label>
                <Select value={agentTone} onValueChange={setAgentTone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  How your AI communicates — choose what matches your brand
                </p>
              </div>

              {/* Top K */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Documents to search per question</Label>
                  <span className="text-sm font-medium">{agentTopK}</span>
                </div>
                <Slider
                  value={[agentTopK]}
                  onValueChange={([v]) => setAgentTopK(v)}
                  min={3}
                  max={10}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  More documents = more thorough answers but slightly slower. 5 is a good default.
                </p>
              </div>

              {/* Save */}
              <div className="pt-2">
                <Button
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings || !agentId}
                  className="gap-2"
                >
                  {isSavingSettings ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {isSavingSettings ? 'Saving...' : 'Save Settings'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB 4: Transparency Explorer ════════════════════════════ */}
        <TabsContent value="transparency" className="space-y-4 mt-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-600" /> Data Transparency
              </h2>
              <p className="text-sm text-muted-foreground">
                Every action is recorded and verifiable
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="gap-2 text-xs"
                onClick={() => {
                  const proofUrl = `${window.location.origin}/proof/${companyId}`;
                  navigator.clipboard.writeText(proofUrl);
                  toast.success('Proof link copied! Share it with anyone to verify your data integrity.');
                }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Share Proof Link
              </Button>
              <Button
                onClick={verifyIntegrity}
                disabled={isVerifying}
                variant="outline"
                className="gap-2"
              >
                {isVerifying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                {isVerifying ? 'Verifying...' : 'Verify My Data'}
              </Button>
            </div>
          </div>

          {/* Integrity Result */}
          {integrityResult && (
            <Card
              className={
                integrityResult.valid
                  ? 'border-green-200 bg-green-50/50'
                  : 'border-red-200 bg-red-50/50'
              }
            >
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                {integrityResult.valid ? (
                  <ShieldCheck className="w-8 h-8 text-green-600 shrink-0" />
                ) : (
                  <ShieldAlert className="w-8 h-8 text-red-600 shrink-0" />
                )}
                <div className="flex-1">
                  <p
                    className={`font-semibold ${
                      integrityResult.valid ? 'text-green-900' : 'text-red-900'
                    }`}
                  >
                    {integrityResult.valid
                      ? 'All data verified successfully'
                      : 'Data integrity issue detected'}
                  </p>
                  <p
                    className={`text-xs ${
                      integrityResult.valid ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {integrityResult.entriesChecked} activity records checked
                    {' / '}
                    {integrityResult.documentsChecked} documents verified
                    {' / '}
                    Checked at {formatDate(integrityResult.verifiedAt)}
                  </p>
                  {integrityResult.modifiedDocuments &&
                    integrityResult.modifiedDocuments.length > 0 && (
                      <p className="text-xs text-red-700 mt-1">
                        Modified documents: {integrityResult.modifiedDocuments.join(', ')}
                      </p>
                    )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Document Proof */}
          {selectedDocProof && docProofData && (
            <Card className="border-blue-200">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-600" /> Document Proof
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedDocProof(null)}
                  >
                    Close
                  </Button>
                </div>

                {proofLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Document Name</p>
                        <p className="font-medium">{docProofData.document?.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Size</p>
                        <p className="font-medium">
                          {formatFileSize(docProofData.document?.fileSize || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Uploaded</p>
                        <p className="font-medium">
                          {docProofData.document?.uploadedAt
                            ? formatDate(docProofData.document.uploadedAt)
                            : '--'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">File Status</p>
                        <div className="flex items-center gap-1">
                          {docProofData.integrity?.fileIntact ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                              <span className="font-medium text-green-700">
                                Not modified
                              </span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5 text-red-500" />
                              <span className="font-medium text-red-700">Modified</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Verification Code</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 truncate">
                          {docProofData.document?.verificationCode}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            copyToClipboard(docProofData.document?.verificationCode || '')
                          }
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Audit trail for this document */}
                    {docProofData.auditTrail?.length > 0 && (
                      <div className="pt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">
                          Activity for this document
                        </p>
                        <div className="space-y-1">
                          {docProofData.auditTrail.map((entry: any, i: number) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-xs text-muted-foreground"
                            >
                              <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                              <span>{actionLabel(entry.action)}</span>
                              <span className="text-muted-foreground/60">
                                {formatDate(entry.created_at)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Audit Filter */}
          <div className="flex items-center gap-2">
            <Select value={auditFilter} onValueChange={setAuditFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="document_uploaded">Document Uploaded</SelectItem>
                <SelectItem value="document_deleted">Document Removed</SelectItem>
                <SelectItem value="query_made">Questions Asked</SelectItem>
                <SelectItem value="agent_updated">Settings Updated</SelectItem>
                <SelectItem value="tenant_initialized">System Initialized</SelectItem>
              </SelectContent>
            </Select>
            {documents.length > 0 && (
              <Select
                value={selectedDocProof || ''}
                onValueChange={(v) => setSelectedDocProof(v || null)}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="View document proof..." />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Audit Log Table */}
          {auditLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : auditEntries.length === 0 ? (
            <Card className="p-8 text-center">
              <Shield className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground">No activity recorded yet</p>
            </Card>
          ) : (
            <>
            {/* Visual Chain Explanation */}
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Each action is linked to the previous one using a unique verification code.
                  If any record is changed, the chain breaks — making tampering detectable.
                  <span className="text-green-600 font-medium"> Green links = verified, unmodified.</span>
                </p>
              </CardContent>
            </Card>

            {/* Visual Chain Timeline */}
            <div className="relative">
              {/* Vertical chain line */}
              <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-green-200" />

              <div className="space-y-0">
                {auditEntries.map((entry, idx) => (
                  <div key={entry.id} className="relative flex items-start gap-3 py-2">
                    {/* Chain node */}
                    <div className="relative z-10 shrink-0 mt-1">
                      <div className="w-[10px] h-[10px] rounded-full bg-green-500 ring-2 ring-green-100 ring-offset-1 ring-offset-background" />
                    </div>
                    {/* Chain link arrow between nodes */}
                    {idx < auditEntries.length - 1 && (
                      <div className="absolute left-[14px] top-[20px] text-green-400 text-[8px]">🔗</div>
                    )}

                    {/* Content */}
                    <Card className="flex-1 hover:shadow-sm transition-all">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className="text-[10px]">
                                {actionLabel(entry.action)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(entry.created_at)}
                              </span>
                            </div>
                            <p className="text-sm mt-0.5">{entry.details}</p>
                          </div>

                          {/* Verification codes */}
                          <div className="shrink-0 text-right space-y-0.5">
                            {entry.data_hash && (
                              <div
                                className="flex items-center gap-1 cursor-pointer group"
                                title="Data verification code — proves this specific data hasn't changed"
                                onClick={() => copyToClipboard(entry.data_hash!)}
                              >
                                <span className="text-[9px] text-muted-foreground/60 group-hover:text-foreground">data</span>
                                <code className="text-[10px] font-mono text-muted-foreground group-hover:text-foreground">
                                  {truncateHash(entry.data_hash)}
                                </code>
                              </div>
                            )}
                            <div
                              className="flex items-center gap-1 cursor-pointer group"
                              title="Chain code — links this action to the previous one. If this doesn't match, the chain was broken."
                              onClick={() => copyToClipboard(entry.chain_hash)}
                            >
                              <span className="text-[9px] text-green-600/60 group-hover:text-green-800">chain</span>
                              <code className="text-[10px] font-mono text-green-600 group-hover:text-green-800">
                                {truncateHash(entry.chain_hash)}
                              </code>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
