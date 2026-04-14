'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Brain, Upload, Globe, FileText, Loader2, CheckCircle2, XCircle,
  Search, Plus, Trash2, Eye, BookOpen, MessageSquare, Sparkles,
  File, Zap, Target, HelpCircle, Lock, Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { TrustBanner } from '@/components/trust-banner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { friendlyError } from '@/lib/friendly-errors';
import { KnowledgeTabs } from '@/components/knowledge/knowledge-tabs';

export default function KnowledgePage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [addTextDialog, setAddTextDialog] = useState(false);
  const [addUrlDialog, setAddUrlDialog] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Data
  const { data: docsData, isLoading } = useQuery({
    queryKey: ['knowledge-docs', companyId],
    queryFn: () => api.get<{ data: any[] }>(`/knowledge/company/${companyId}/documents`, { token: token! }),
    enabled: !!token,
    refetchInterval: 5000,
  });

  const { data: knowledgeData } = useQuery({
    queryKey: ['knowledge-entries', companyId, searchQuery],
    queryFn: () => api.get<{ data: any[] }>(`/knowledge/company/${companyId}/search?q=${encodeURIComponent(searchQuery)}`, { token: token! }),
    enabled: !!token,
  });

  const documents = docsData?.data || [];
  const knowledgeEntries = knowledgeData?.data || [];
  const readyDocs = documents.filter((d: any) => d.status === 'approved' || d.status === 'extracted');
  const processingDocs = documents.filter((d: any) => d.status === 'processing' || d.status === 'uploading');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['knowledge-docs', 'knowledge-entries'] });

  // Handlers
  const handleFileUpload = async (file: File) => {
    if (!token) return;

    // Client-side file size check
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      toast.error(`That file is too big (${Math.round(file.size / 1024 / 1024)} MB). Please upload a file under 10 MB.`);
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1'}/knowledge/company/${companyId}/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(
          friendlyError(
            new Error(err.error?.message || err.error || err.message || String(res.status)),
            "We couldn't upload that file. Please try again.",
          ),
        );
        return;
      }

      const data = await res.json();
      if (data.message === 'This file was already uploaded') {
        toast.info('This file was already uploaded');
      } else {
        toast.success(`AI is reading "${file.name}"...`);
      }
      invalidate();
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't reach the server. Check your connection and try again."));
    }
    finally { setIsUploading(false); }
  };

  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const handleAddUrl = async () => {
    if (!token || !urlInput.trim() || isAddingUrl) return;
    setIsAddingUrl(true);
    try {
      const res = await api.post<any>(`/knowledge/company/${companyId}/ingest-url`, { url: urlInput }, { token });
      if (res.message === 'This URL was already added') {
        toast.info('This website was already added');
      } else {
        toast.success('AI is reading this website...');
      }
      setUrlInput(''); setAddUrlDialog(false); invalidate();
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't read that website. Double-check the URL and try again."));
    }
    finally { setIsAddingUrl(false); }
  };

  const handleAddText = async () => {
    if (!token || !textTitle.trim() || !textContent.trim()) return;
    try {
      await api.post(`/knowledge/company/${companyId}/add-text`, { title: textTitle, content: textContent }, { token });
      toast.success('Knowledge added — AI is now smarter!');
      setTextTitle(''); setTextContent(''); setAddTextDialog(false); invalidate();
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't save that knowledge. Please try again."));
    }
  };

  const handleApprove = async (docId: string) => {
    if (!token) return;
    try {
      const r = await api.patch<{ knowledgeEntriesSaved: number }>(`/knowledge/company/${companyId}/documents/${docId}/approve`, {}, { token });
      toast.success(`AI learned ${r.knowledgeEntriesSaved} new things!`);
      invalidate();
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't approve that yet. Please try again."));
    }
  };

  const handleDelete = async (docId: string) => {
    if (!token) return;
    await api.delete(`/knowledge/company/${companyId}/documents/${docId}`, { token });
    toast.success('Removed'); invalidate();
  };

  const handleVisibilityChange = async (docId: string, visibility: string) => {
    if (!token) return;
    try {
      await api.patch(`/knowledge/company/${companyId}/documents/${docId}`, { visibility }, { token });
      toast.success(
        visibility === 'public' ? 'Document is now visible to website visitors' :
        visibility === 'confidential' ? 'Document restricted to owner only' :
        'Document visibility set to internal'
      );
      invalidate();
    } catch (err) {
      toast.error(friendlyError(err, "Could not update visibility. Please try again."));
    }
  };

  // Generate summary from extracted entries
  const getSummary = (doc: any) => {
    const entries = (doc.extractedContent as any[]) || [];
    if (entries.length === 0) return null;
    const categories = Array.from(new Set(entries.map((e: any) => e.category)));
    const topTitle = entries[0]?.title || '';
    return { categories, topTitle, count: entries.length };
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <KnowledgeTabs />
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="w-6 h-6 text-primary" /> Teach Your AI
        </h1>
        <p className="text-muted-foreground">
          The more your AI knows, the better it answers, writes, and sells
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg"><CheckCircle2 className="w-4 h-4 text-green-600" /></div>
          <div><p className="text-xl font-bold">{readyDocs.length}</p><p className="text-xs text-muted-foreground">Active Knowledge</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg"><BookOpen className="w-4 h-4 text-blue-600" /></div>
          <div><p className="text-xl font-bold">{knowledgeEntries.length}</p><p className="text-xs text-muted-foreground">Facts Learned</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className="p-2 bg-purple-50 rounded-lg"><MessageSquare className="w-4 h-4 text-purple-600" /></div>
          <div><p className="text-xl font-bold">{readyDocs.length > 0 ? 'Active' : 'Empty'}</p><p className="text-xs text-muted-foreground">Chatbot Brain</p></div>
        </CardContent></Card>
      </div>

      {/* Visibility Summary */}
      {documents.length > 0 && (() => {
        const publicCount = documents.filter((d: any) => d.visibility === 'public').length;
        const internalCount = documents.filter((d: any) => !d.visibility || d.visibility === 'internal').length;
        const confidentialCount = documents.filter((d: any) => d.visibility === 'confidential').length;
        return (
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm font-medium mb-1">
                Your knowledge: {documents.length} document{documents.length !== 1 ? 's' : ''} total
                {' '}&middot; {publicCount} public &middot; {internalCount} internal &middot; {confidentialCount} confidential
              </p>
              <p className="text-xs text-muted-foreground">
                Only Public documents are used by the website chatbot widget.
              </p>
            </CardContent>
          </Card>
        );
      })()}

      {/* Data Protection Notice */}
      <TrustBanner variant="compact" />

      {/* Upload Area */}
      <Card className="border-dashed border-2 hover:border-primary/30 transition-colors">
        <CardContent className="pt-6 pb-6">
          <div className="text-center">
            <Sparkles className="w-10 h-10 text-primary/40 mx-auto mb-3" />
            <p className="font-medium mb-1">Teach your AI about your business</p>
            <p className="text-sm text-muted-foreground mb-4">
              Upload documents, paste your website, or type what you know
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 sm:gap-3">
              <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.txt,.doc,.docx"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
              <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="gap-2 w-full sm:w-auto">
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Upload File
              </Button>
              <Button variant="outline" className="gap-2 w-full sm:w-auto" onClick={() => setAddUrlDialog(true)}>
                <Globe className="w-4 h-4" /> Add Website
              </Button>
              <Button variant="outline" className="gap-2 w-full sm:w-auto" onClick={() => setAddTextDialog(true)}>
                <FileText className="w-4 h-4" /> Type Knowledge
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Processing indicator */}
      {processingDocs.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-amber-900 text-sm">AI is reading your files...</p>
              <p className="text-xs text-amber-700">{processingDocs.length} file(s) being processed</p>
            </div>
            <Progress value={60} className="w-24 h-2" />
          </CardContent>
        </Card>
      )}

      {/* Knowledge Cards */}
      {isLoading ? (
        <div className="space-y-3">
          <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
          <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
        </div>
      ) : documents.length === 0 ? (
        /* Empty State */
        <Card className="p-12 text-center">
          <Brain className="w-14 h-14 text-muted-foreground/20 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Make your AI smarter</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-2">
            Upload your business documents, brochures, pricing sheets, or FAQs.
            AI will learn from them to:
          </p>
          <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground mb-6">
            <span className="flex items-center gap-2"><MessageSquare className="w-3 h-3 text-purple-500" /> Answer customer questions accurately</span>
            <span className="flex items-center gap-2"><FileText className="w-3 h-3 text-blue-500" /> Generate better landing page content</span>
            <span className="flex items-center gap-2"><Target className="w-3 h-3 text-green-500" /> Improve marketing campaigns</span>
          </div>
          <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
            <Upload className="w-4 h-4" /> Upload Your First Document
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((doc: any) => {
            const summary = getSummary(doc);
            const isProcessing = doc.status === 'processing' || doc.status === 'uploading';
            const isReady = doc.status === 'approved';
            const needsReview = doc.status === 'extracted';

            return (
              <Card key={doc.id} className={`transition-all ${needsReview ? 'border-amber-200 bg-amber-50/30' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`p-2.5 rounded-lg shrink-0 ${
                      isReady ? 'bg-green-50' : isProcessing ? 'bg-blue-50' : needsReview ? 'bg-amber-50' : 'bg-muted'
                    }`}>
                      {isProcessing ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin" /> :
                       isReady ? <CheckCircle2 className="w-5 h-5 text-green-500" /> :
                       needsReview ? <Eye className="w-5 h-5 text-amber-500" /> :
                       doc.status === 'failed' ? <XCircle className="w-5 h-5 text-red-500" /> :
                       <File className="w-5 h-5 text-muted-foreground" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm truncate">{doc.name}</p>
                        <Badge variant={isReady ? 'success' : needsReview ? 'outline' : 'secondary'} className="text-[10px] shrink-0">
                          {isProcessing ? 'AI Reading...' : isReady ? 'Active' : needsReview ? 'Review' : doc.status}
                        </Badge>
                      </div>

                      {/* Summary — the key UX improvement */}
                      {isProcessing && (
                        <p className="text-xs text-blue-600">AI is extracting knowledge from this file...</p>
                      )}

                      {summary && !isProcessing && (
                        <div className="mt-1.5">
                          <p className="text-xs text-muted-foreground">
                            <Zap className="w-3 h-3 inline mr-1 text-primary" />
                            {summary.count} facts extracted · Topics: {summary.categories.slice(0, 3).join(', ')}
                          </p>
                        </div>
                      )}

                      {isReady && (
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> Used by Chatbot & AI
                        </p>
                      )}

                      {doc.errorMessage && (
                        <p className="text-xs text-red-500 mt-1">{doc.errorMessage}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {summary && (
                        <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => setPreviewDoc(doc)}>
                          <Eye className="w-3 h-3" /> Preview
                        </Button>
                      )}
                      {needsReview && (
                        <Button size="sm" className="gap-1 text-xs bg-green-600 hover:bg-green-700" onClick={() => handleApprove(doc.id)}>
                          <CheckCircle2 className="w-3 h-3" /> Approve
                        </Button>
                      )}
                      <Select
                        value={doc.visibility || 'internal'}
                        onValueChange={(val) => handleVisibilityChange(doc.id, val)}
                      >
                        <SelectTrigger className={`w-[130px] h-8 text-xs ${
                          (doc.visibility || 'internal') === 'public' ? 'text-green-700' :
                          doc.visibility === 'confidential' ? 'text-red-700' :
                          'text-slate-600'
                        }`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">
                            <span className="flex items-center gap-1.5 text-green-700">
                              <Globe className="w-3 h-3" /> Public
                            </span>
                          </SelectItem>
                          <SelectItem value="internal">
                            <span className="flex items-center gap-1.5 text-slate-600">
                              <Building2 className="w-3 h-3" /> Internal
                            </span>
                          </SelectItem>
                          <SelectItem value="confidential">
                            <span className="flex items-center gap-1.5 text-red-700">
                              <Lock className="w-3 h-3" /> Confidential
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => handleDelete(doc.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Knowledge Search */}
      {knowledgeEntries.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h3 className="font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> What AI Knows
            </h3>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="pl-9 h-8 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {knowledgeEntries.slice(0, 8).map((entry: any) => (
              <Card key={entry.id}>
                <CardContent className="p-3">
                  <Badge variant="secondary" className="text-[10px] mb-1">{entry.category}</Badge>
                  <p className="font-medium text-sm">{entry.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              {previewDoc?.name}
            </DialogTitle>
          </DialogHeader>
          {previewDoc && (
            <Tabs defaultValue="extracted" className="flex-1 flex flex-col min-h-0">
              <TabsList>
                <TabsTrigger value="extracted" className="gap-1"><Zap className="w-3 h-3" /> AI Extracted</TabsTrigger>
                <TabsTrigger value="raw" className="gap-1"><FileText className="w-3 h-3" /> Raw Content</TabsTrigger>
                <TabsTrigger value="usage" className="gap-1"><Target className="w-3 h-3" /> How AI Uses This</TabsTrigger>
              </TabsList>

              {/* Tab: AI Extracted Knowledge */}
              <TabsContent value="extracted" className="flex-1 overflow-y-auto mt-3 space-y-3">
                {((previewDoc.extractedContent as any[]) || []).map((entry: any, i: number) => (
                  <Card key={i}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-[10px]">{entry.category}</Badge>
                        <span className="text-xs text-muted-foreground">Confidence: {Math.round((entry.confidence || 0.7) * 100)}%</span>
                      </div>
                      <p className="font-medium text-sm">{entry.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{entry.content}</p>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              {/* Tab: Raw Content */}
              <TabsContent value="raw" className="flex-1 overflow-y-auto mt-3">
                <Card>
                  <CardContent className="p-4">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-[400px] overflow-y-auto">
                      {previewDoc.rawContent || 'No raw content available'}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab: How AI Uses This */}
              <TabsContent value="usage" className="mt-3">
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <p className="text-sm font-medium">This knowledge helps your AI to:</p>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <MessageSquare className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Answer customer questions</p>
                          <p className="text-xs text-muted-foreground">Chatbot uses this to give accurate, specific answers about your business</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Generate landing page content</p>
                          <p className="text-xs text-muted-foreground">Pages will use real facts from this document, not generic text</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Target className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Improve marketing campaigns</p>
                          <p className="text-xs text-muted-foreground">Ad copy and social posts will be more relevant and specific</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <HelpCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Handle objections in sales</p>
                          <p className="text-xs text-muted-foreground">Chatbot can address pricing, comparison, and trust questions</p>
                        </div>
                      </div>
                    </div>
                    <div className="pt-3 border-t">
                      <Badge variant={previewDoc.status === 'approved' ? 'success' : 'secondary'} className="gap-1">
                        {previewDoc.status === 'approved' ? <CheckCircle2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {previewDoc.status === 'approved' ? 'Active — AI is using this' : 'Pending — Approve to activate'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <Dialog open={addUrlDialog} onOpenChange={setAddUrlDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a Website</DialogTitle>
            <DialogDescription>AI will read this website and learn about your business</DialogDescription>
          </DialogHeader>
          <div className="py-3"><Label>Website URL</Label><Input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://yourwebsite.com" className="mt-1" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUrlDialog(false)}>Cancel</Button>
            <Button onClick={handleAddUrl} disabled={!urlInput.trim() || isAddingUrl} className="gap-2">
              {isAddingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />} {isAddingUrl ? 'Reading...' : 'Teach AI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addTextDialog} onOpenChange={setAddTextDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Teach Your AI</DialogTitle>
            <DialogDescription>Type or paste information you want AI to know</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div><Label>What is this about?</Label><Input value={textTitle} onChange={(e) => setTextTitle(e.target.value)} placeholder="e.g. Our pricing, Return policy, Services" className="mt-1" /></div>
            <div><Label>Details</Label><Textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Type everything AI should know about this topic..." className="mt-1 min-h-[120px]" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTextDialog(false)}>Cancel</Button>
            <Button onClick={handleAddText} disabled={!textTitle.trim() || !textContent.trim()} className="gap-2"><Sparkles className="w-4 h-4" /> Teach AI</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
