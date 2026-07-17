'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  MessageSquare, Send, Loader2, Settings2, Code2, MessagesSquare,
  Bot, User, Copy, Check, ExternalLink, Plus, Trash2, RefreshCw,
  AlertCircle, Globe, Building2, Lock, Shield, PhoneForwarded, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { TrustBanner } from '@/components/trust-banner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface QuickReply { label: string; value: string }
interface ChatMessage {
  role: string;
  content: string;
  status: 'sending' | 'sent' | 'error';
  id: string;
  quickReplies?: QuickReply[];
}

export default function ChatbotPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const qc = useQueryClient();

  // === CHATBOT LIST STATE ===
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [createDialog, setCreateDialog] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [newBotTags, setNewBotTags] = useState('');

  // === HANDOFF STATE ===
  const [handoffConvId, setHandoffConvId] = useState<string | null>(null);
  const [staffReply, setStaffReply] = useState('');
  const [isSendingStaff, setIsSendingStaff] = useState(false);

  // === CONFIG STATE ===
  const [name, setName] = useState('');
  const [greeting, setGreeting] = useState('');
  const [tone, setTone] = useState('friendly');
  const [mode, setMode] = useState('both');
  const [primaryColor, setPrimaryColor] = useState('#6366f1');
  const [accessLevel, setAccessLevel] = useState('internal');
  const [embedEnabled, setEmbedEnabled] = useState(false);
  const [embedAllowedDomains, setEmbedAllowedDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [poweredByVisible, setPoweredByVisible] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const [isSavingEmbed, setIsSavingEmbed] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  // === CHAT STATE ===
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // === EMBED STATE ===
  const [copied, setCopied] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

  // === DATA FETCHING ===

  // Fetch all chatbots
  const { data: botsData } = useQuery({
    queryKey: ['chatbots', companyId],
    queryFn: () => api.get<{ data: any[] }>(`/chatbot/company/${companyId}/chatbots`, { token: token! }),
    enabled: !!token,
  });
  const chatbots = botsData?.data || [];

  // Auto-select first chatbot
  useEffect(() => {
    if (chatbots.length > 0 && !selectedBotId) {
      setSelectedBotId(chatbots[0].id);
    }
  }, [chatbots, selectedBotId]);

  // Load selected bot config
  const selectedBot = chatbots.find((b: any) => b.id === selectedBotId);
  useEffect(() => {
    if (selectedBot) {
      setName(selectedBot.name || 'AI Assistant');
      setGreeting(selectedBot.greeting || 'Hi! How can I help you today?');
      setTone(selectedBot.tone || 'friendly');
      setMode(selectedBot.mode || 'both');
      setPrimaryColor(selectedBot.primaryColor || '#6366f1');
      setAccessLevel(selectedBot.accessLevel || 'internal');
      setEmbedEnabled(selectedBot.embedEnabled || false);
      setEmbedAllowedDomains(
        Array.isArray(selectedBot.embedAllowedDomains)
          ? selectedBot.embedAllowedDomains.filter(Boolean)
          : []
      );
      setDomainInput('');
      setLogoUrl(selectedBot.logoUrl || '');
      setAvatarUrl(selectedBot.avatarUrl || '');
      setPoweredByVisible(selectedBot.poweredByVisible !== false);
    }
  }, [selectedBot]);

  useEffect(() => {
    setMessages([]);
    setConversationId(null);
    setChatInput('');
  }, [selectedBotId]);

  // Fetch conversations
  const { data: convsData } = useQuery({
    queryKey: ['chatbot-conversations', companyId],
    queryFn: () => api.get<{ data: any[] }>(`/chatbot/company/${companyId}/conversations`, { token: token! }),
    enabled: !!token,
  });
  const conversations = convsData?.data || [];

  // Fetch handoff queue
  const { data: handoffData } = useQuery({
    queryKey: ['handoff-queue', companyId],
    queryFn: () => api.get<{ data: any[] }>(`/chatbot/company/${companyId}/handoff-queue`, { token: token! }),
    enabled: !!token,
    refetchInterval: 15000,
  });
  const handoffQueue = handoffData?.data || [];

  // Fetch handoff conversation detail
  const { data: handoffDetail } = useQuery({
    queryKey: ['chatbot-conversation', handoffConvId],
    queryFn: () => api.get<{ conversation: any; messages: any[] }>(`/chatbot/company/${companyId}/conversations/${handoffConvId}`, { token: token! }),
    enabled: !!token && !!handoffConvId,
  });

  // Fetch selected conversation
  const { data: convDetail } = useQuery({
    queryKey: ['chatbot-conversation', selectedConvId],
    queryFn: () => api.get<{ conversation: any; messages: any[] }>(`/chatbot/company/${companyId}/conversations/${selectedConvId}`, { token: token! }),
    enabled: !!token && !!selectedConvId,
  });

  // === HANDLERS ===

  const handleCreateBot = async () => {
    if (!token || !newBotName.trim()) return;
    try {
      const tags = newBotTags.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await api.post<any>(`/chatbot/company/${companyId}/chatbots`, { name: newBotName, knowledgeTags: tags.length > 0 ? tags : undefined }, { token });
      toast.success(`"${newBotName}" created!`);
      qc.setQueryData<{ data: any[] }>(['chatbots', companyId], (current) => ({
        data: [res, ...(current?.data || []).filter((bot: any) => bot.id !== res.id)],
      }));
      setSelectedBotId(res.id);
      setName(res.name || 'AI Assistant');
      setGreeting(res.greeting || 'Hi! How can I help you today?');
      setTone(res.tone || 'friendly');
      setMode(res.mode || 'both');
      setPrimaryColor(res.primaryColor || '#6366f1');
      setAccessLevel(res.accessLevel || 'internal');
      setEmbedEnabled(res.embedEnabled || false);
      setEmbedAllowedDomains(Array.isArray(res.embedAllowedDomains) ? res.embedAllowedDomains.filter(Boolean) : []);
      setDomainInput('');
      setLogoUrl(res.logoUrl || '');
      setAvatarUrl(res.avatarUrl || '');
      setPoweredByVisible(res.poweredByVisible !== false);
      setNewBotName('');
      setNewBotTags('');
      setCreateDialog(false);
      qc.invalidateQueries({ queryKey: ['chatbots', companyId] });
    } catch (err: any) {
      console.error('Create chatbot error:', err);
      toast.error('Could not create chatbot. Please try again.');
    }
  };

  const handleDeleteBot = async (botId: string) => {
    if (!token || !confirm('Delete this chatbot?')) return;
    try {
      await api.delete(`/chatbot/company/${companyId}/chatbots/${botId}`, { token });
      toast.success('Deleted');
      const remaining = chatbots.filter((bot: any) => bot.id !== botId);
      qc.setQueryData<{ data: any[] }>(['chatbots', companyId], { data: remaining });
      if (selectedBotId === botId) setSelectedBotId(remaining[0]?.id || null);
      qc.invalidateQueries({ queryKey: ['chatbots', companyId] });
    } catch (err: any) {
      console.error('Delete chatbot error:', err);
      toast.error('Could not delete chatbot. Please try again.');
    }
  };

  const handleSaveConfig = async () => {
    if (!token || !selectedBotId) return;
    setIsSaving(true);
    try {
      const updated = await api.post<any>(`/chatbot/company/${companyId}/chatbots/${selectedBotId}/config`, {
        name, greeting, tone, mode, primaryColor,
        logoUrl: logoUrl || null, avatarUrl: avatarUrl || null, poweredByVisible,
      }, { token });
      qc.setQueryData<{ data: any[] }>(['chatbots', companyId], (current) => current
        ? { data: current.data.map((bot: any) => (bot.id === updated.id ? { ...bot, ...updated } : bot)) }
        : current);
      toast.success('Saved!');
      qc.invalidateQueries({ queryKey: ['chatbots', companyId] });
    } catch (err: any) {
      console.error('Save chatbot config error:', err);
      toast.error('Could not save settings. Please try again.');
    }
    finally { setIsSaving(false); }
  };

  const handleSaveAccessLevel = async () => {
    if (!token || !selectedBotId) return;
    setIsSavingAccess(true);
    try {
      const updated = await api.post<any>(`/chatbot/company/${companyId}/chatbots/${selectedBotId}/config`, { accessLevel }, { token });
      qc.setQueryData<{ data: any[] }>(['chatbots', companyId], (current) => current
        ? { data: current.data.map((bot: any) => (bot.id === updated.id ? { ...bot, ...updated } : bot)) }
        : current);
      toast.success('Access level saved!');
      qc.invalidateQueries({ queryKey: ['chatbots', companyId] });
    } catch {
      toast.error('Could not save access level. Please try again.');
    } finally { setIsSavingAccess(false); }
  };

  const normalizeDomainInput = (value: string) => {
    const cleaned = value.trim().toLowerCase();
    if (!cleaned) return '';
    try {
      const parsed = new URL(cleaned.includes('://') ? cleaned : `https://${cleaned}`);
      return parsed.host.replace(/\.$/, '');
    } catch {
      return cleaned
        .replace(/^https?:\/\//, '')
        .replace(/^\/\//, '')
        .split(/[/?#]/)[0]
        ?.replace(/\.$/, '') || '';
    }
  };

  const handleAddAllowedDomain = () => {
    const domain = normalizeDomainInput(domainInput);
    if (!domain) return;
    const validDomain = /^(?:\*\.)?(?:localhost|127\.0\.0\.1|[a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::\d{2,5})?$/.test(domain);
    if (!validDomain) {
      toast.error('Enter a valid domain, e.g. mysite.com or app.mysite.com');
      return;
    }
    if (embedAllowedDomains.includes(domain)) {
      toast.info('This domain is already allowed.');
      setDomainInput('');
      return;
    }
    setEmbedAllowedDomains((prev) => [...prev, domain]);
    setDomainInput('');
  };

  const handleRemoveAllowedDomain = (domain: string) => {
    setEmbedAllowedDomains((prev) => prev.filter((item) => item !== domain));
  };

  const handleSaveEmbed = async () => {
    if (!token || !selectedBotId) return;
    setIsSavingEmbed(true);
    try {
      const domains = embedAllowedDomains.map((d) => normalizeDomainInput(d)).filter(Boolean);
      const updated = await api.post<any>(`/chatbot/company/${companyId}/chatbots/${selectedBotId}/config`, { embedEnabled, embedAllowedDomains: domains }, { token });
      qc.setQueryData<{ data: any[] }>(['chatbots', companyId], (current) => current
        ? { data: current.data.map((bot: any) => (bot.id === updated.id ? { ...bot, ...updated } : bot)) }
        : current);
      toast.success('Embed settings saved!');
      qc.invalidateQueries({ queryKey: ['chatbots', companyId] });
    } catch {
      toast.error('Could not save embed settings. Please try again.');
    } finally { setIsSavingEmbed(false); }
  };

  const handleSendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || chatInput).trim();
    if (!token || !selectedBotId || !text || isSending) return;
    const msgId = `msg_${Date.now()}`;

    setChatInput('');
    setMessages((prev) => [...prev, { role: 'visitor', content: text, status: 'sending', id: msgId }]);
    setIsSending(true);
    setIsTyping(true);

    try {
      const res = await api.post<{ conversationId: string; response: string; quickReplies?: QuickReply[] }>(
        `/chatbot/company/${companyId}/chat`, { conversationId, botId: selectedBotId, message: text }, { token }
      );
      setConversationId(res.conversationId);
      setMessages((prev) => [
        ...prev.map((m) => m.id === msgId ? { ...m, status: 'sent' as const } : m),
        { role: 'assistant', content: res.response, status: 'sent', id: `res_${Date.now()}`, quickReplies: res.quickReplies },
      ]);
    } catch {
      setMessages((prev) =>
        prev.map((m) => m.id === msgId ? { ...m, status: 'error' as const } : m)
      );
    } finally {
      setIsSending(false);
      setIsTyping(false);
      inputRef.current?.focus();
    }
  }, [token, chatInput, isSending, conversationId, companyId, selectedBotId]);

  const handleRetryMessage = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    setChatInput(msg.content);
    setTimeout(() => handleSendMessage(), 100);
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
    inputRef.current?.focus();
  };

  // === HANDOFF HANDLERS ===
  const handlePickup = async (convId: string) => {
    if (!token) return;
    try {
      await api.post(`/chatbot/company/${companyId}/conversations/${convId}/pickup`, {}, { token });
      setHandoffConvId(convId);
      toast.success('Conversation picked up');
      qc.invalidateQueries({ queryKey: ['handoff-queue'] });
      qc.invalidateQueries({ queryKey: ['chatbot-conversation', convId] });
    } catch { toast.error('Could not pick up conversation'); }
  };

  const handleStaffReply = async () => {
    if (!token || !handoffConvId || !staffReply.trim()) return;
    setIsSendingStaff(true);
    try {
      await api.post(`/chatbot/company/${companyId}/conversations/${handoffConvId}/staff-reply`, { message: staffReply }, { token });
      setStaffReply('');
      qc.invalidateQueries({ queryKey: ['chatbot-conversation', handoffConvId] });
    } catch { toast.error('Could not send reply'); }
    finally { setIsSendingStaff(false); }
  };

  const handleCloseHandoff = async () => {
    if (!token || !handoffConvId) return;
    try {
      await api.post(`/chatbot/company/${companyId}/conversations/${handoffConvId}/close`, {}, { token });
      toast.success('Conversation closed');
      setHandoffConvId(null);
      qc.invalidateQueries({ queryKey: ['handoff-queue'] });
    } catch { toast.error('Could not close conversation'); }
  };

  // Embed code
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
  const embedUsesLocalApi = /localhost|127\.0\.0\.1/.test(apiUrl);
  const embedCode = `<script>\n(function(){var s=document.createElement('script');s.src='${apiUrl.replace('/api/v1', '')}/widget.js';s.dataset.companyId='${companyId}';s.dataset.botId='${selectedBotId || ''}';s.dataset.apiUrl='${apiUrl}';s.async=true;document.body.appendChild(s);})();\n</script>`;
  const previewName = name.trim() || 'AI Assistant';
  const previewGreeting = greeting.trim() || 'Hi! How can I help you today?';
  const previewAvatarUrl = avatarUrl.trim();
  const previewMessages: ChatMessage[] = [
    { role: 'assistant', content: previewGreeting, status: 'sent', id: 'preview_greeting' },
    ...messages,
  ];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chatbot</h1>
          <p className="text-muted-foreground">Train, test, and deploy AI chatbots</p>
          <TrustBanner variant="inline" />
        </div>
        <Button className="gap-2" onClick={() => setCreateDialog(true)}>
          <Plus className="w-4 h-4" /> New Chatbot
        </Button>
      </div>

      {/* Chatbot selector */}
      {chatbots.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {chatbots.map((bot: any) => (
            <Button
              key={bot.id}
              variant={selectedBotId === bot.id ? 'default' : 'outline'}
              size="sm"
              className="gap-1"
              onClick={() => setSelectedBotId(bot.id)}
            >
              <Bot className="w-3 h-3" />
              {bot.name}
              {bot.isActive && <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />}
            </Button>
          ))}
        </div>
      )}

      <Tabs defaultValue="training">
        <TabsList>
          <TabsTrigger value="training" className="gap-1"><Settings2 className="w-3.5 h-3.5" /> Training</TabsTrigger>
          <TabsTrigger value="conversations" className="gap-1"><MessagesSquare className="w-3.5 h-3.5" /> Conversations {conversations.length > 0 && `(${conversations.length})`}</TabsTrigger>
          <TabsTrigger value="handoff" className="gap-1"><PhoneForwarded className="w-3.5 h-3.5" /> Handoff {handoffQueue.length > 0 && <Badge variant="destructive" className="ml-1 text-[10px] px-1">{handoffQueue.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="deploy" className="gap-1"><Code2 className="w-3.5 h-3.5" /> Deploy</TabsTrigger>
        </TabsList>

        {/* === TRAINING TAB === */}
        <TabsContent value="training" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Config */}
            <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between">
                <CardTitle className="text-base">Configuration</CardTitle>
                {selectedBot && (
                  <Button variant="ghost" size="sm" className="text-red-500 gap-1" onClick={() => handleDeleteBot(selectedBot.id)}>
                    <Trash2 className="w-3 h-3" /> Delete
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Bot Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" /></div>
                <div><Label>Greeting</Label><Textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} className="mt-1" rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tone</Label>
                    <Select value={tone} onValueChange={setTone}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="professional">Professional</SelectItem><SelectItem value="friendly">Friendly</SelectItem><SelectItem value="bold">Bold</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>Mode</Label>
                    <Select value={mode} onValueChange={setMode}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="sales">Sales</SelectItem><SelectItem value="support">Support</SelectItem><SelectItem value="both">Sales + Support</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Color</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border" />
                    {['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'].map((c) => (
                      <button key={c} onClick={() => setPrimaryColor(c)}
                        className={`w-6 h-6 rounded-full border-2 ${primaryColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Logo URL</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" className="flex-1" />
                    {logoUrl && <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded border" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                  </div>
                </div>
                <div>
                  <Label>Avatar URL</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://example.com/avatar.png" className="flex-1" />
                    {avatarUrl && <img src={avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover border" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show "Powered by 1Person"</Label>
                    <p className="text-xs text-muted-foreground">Display branding in widget footer</p>
                  </div>
                  <Switch checked={poweredByVisible} onCheckedChange={setPoweredByVisible} />
                </div>
                <Button onClick={handleSaveConfig} disabled={isSaving} className="w-full gap-2">
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />} Save
                </Button>
              </CardContent>
            </Card>

            {/* Test Chat */}
            <Card className="flex flex-col">
              <CardHeader className="flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">Widget preview & test</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Matches the chatbox visitors see on your website.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={handleNewChat} className="gap-1"><RefreshCw className="w-3 h-3" /> New</Button>
              </CardHeader>
              <CardContent className="flex flex-1 justify-center p-4 pt-0">
                <div className="flex w-full max-w-[390px] flex-col overflow-hidden rounded-[18px] border bg-white shadow-lg">
                  <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: primaryColor }}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20 font-bold">
                      {previewAvatarUrl ? (
                        <img src={previewAvatarUrl} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      ) : (
                        previewName.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold leading-tight">{previewName}</p>
                      <p className="text-xs text-white/80">Usually replies instantly</p>
                    </div>
                    <div className="ml-auto h-8 w-8 rounded-full bg-white/15" />
                  </div>

                  <div className="flex min-h-[360px] max-h-[430px] flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 p-4">
                    {previewMessages.map((msg) => (
                      <div key={msg.id} className={`flex flex-col ${msg.role === 'visitor' ? 'items-end' : 'items-start'}`}>
                        <div className={`flex max-w-[88%] gap-2 ${msg.role === 'visitor' ? 'justify-end' : ''}`}>
                          {msg.role === 'assistant' && (
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white border">
                              {previewAvatarUrl ? (
                                <img src={previewAvatarUrl} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                              ) : (
                                <Bot className="h-3.5 w-3.5" style={{ color: primaryColor }} />
                              )}
                            </div>
                          )}
                          <div
                            className={`rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                              msg.role === 'visitor'
                                ? 'rounded-tr-md text-white'
                                : 'rounded-tl-md border bg-white text-slate-900'
                            }`}
                            style={msg.role === 'visitor' ? { backgroundColor: primaryColor } : undefined}
                          >
                            {msg.content}
                            {msg.role === 'visitor' && msg.status === 'sending' && (
                              <span className="mt-0.5 block text-[10px] opacity-70">Sending...</span>
                            )}
                            {msg.status === 'error' && (
                              <div className="mt-1 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3 text-red-400" />
                                <span className="text-[10px] text-red-400">Failed</span>
                                <button onClick={() => handleRetryMessage(msg.id)} className="ml-1 text-[10px] text-red-400 underline">Retry</button>
                              </div>
                            )}
                          </div>
                        </div>
                        {msg.role === 'assistant' && msg.quickReplies && msg.quickReplies.length > 0 && (
                          <div className="ml-9 mt-1 flex max-w-[88%] flex-wrap gap-1">
                            {msg.quickReplies.map((qr, i) => (
                              <button
                                key={i}
                                onClick={() => handleSendMessage(qr.value)}
                                className="rounded-full border bg-white px-2 py-1 text-xs font-semibold transition-colors hover:bg-slate-50"
                                style={{ borderColor: `${primaryColor}55`, color: primaryColor }}
                              >
                                {qr.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {isTyping && (
                      <div className="flex gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white border">
                          {previewAvatarUrl ? (
                            <img src={previewAvatarUrl} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                          ) : (
                            <Bot className="h-3.5 w-3.5" style={{ color: primaryColor }} />
                          )}
                        </div>
                        <div className="flex gap-1 rounded-2xl rounded-tl-md border bg-white px-3 py-3 shadow-sm">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    )}
                  </div>

                  <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-1.5 border-t bg-white p-[10px]">
                    <Input ref={inputRef} value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type your message..." disabled={isSending} className="h-[42px] min-w-0 flex-1 rounded-full px-4 text-sm" />
                    <Button type="submit" disabled={isSending || !chatInput.trim()} className="h-[42px] w-[42px] shrink-0 rounded-full p-0 text-sm font-bold text-white" style={{ backgroundColor: primaryColor }}>
                      {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : '→'}
                    </Button>
                  </form>
                  {poweredByVisible && (
                    <div className="bg-white pb-3 text-center text-[11px] font-medium text-slate-400">Powered by 1Person</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Access Level */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4" /> Knowledge Access Level
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Controls the dashboard test chat. Website widgets always use Public knowledge for visitor safety.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { value: 'public', icon: Globe, label: 'Public', desc: 'Only uses Public knowledge. This is always used by website visitors.', color: 'text-green-700' },
                { value: 'internal', icon: Building2, label: 'Internal', desc: 'Dashboard chat uses Public + Internal knowledge. Website visitors still stay Public.', color: 'text-slate-700' },
                { value: 'admin', icon: Lock, label: 'Admin', desc: 'Dashboard chat uses all knowledge, including Confidential. Never used by website visitors.', color: 'text-red-700' },
              ].map((opt) => (
                <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${accessLevel === opt.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                  <input
                    type="radio"
                    name="accessLevel"
                    value={opt.value}
                    checked={accessLevel === opt.value}
                    onChange={() => setAccessLevel(opt.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <span className={`flex items-center gap-1.5 font-medium text-sm ${opt.color}`}>
                      <opt.icon className="w-3.5 h-3.5" /> {opt.label}
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
              <Button onClick={handleSaveAccessLevel} disabled={isSavingAccess} className="w-full gap-2">
                {isSavingAccess && <Loader2 className="w-4 h-4 animate-spin" />} Save Access Level
              </Button>
            </CardContent>
          </Card>

          {/* Embed Widget */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Code2 className="w-4 h-4" /> Website Widget
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Show this AI chatbot on landing pages you publish from 1Person, including WordPress pages.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Enable embed widget</Label>
                  <p className="text-xs text-muted-foreground">When enabled, new hosted and WordPress landing page publishes include the chatbox automatically.</p>
                </div>
                <Switch checked={embedEnabled} onCheckedChange={setEmbedEnabled} />
              </div>

              {embedEnabled && (
                <>
                  <div>
                    <Label>Allowed domains</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Add the websites where this chatbox may run. Leave empty to allow any domain.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={domainInput}
                        onChange={(e) => setDomainInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            handleAddAllowedDomain();
                          }
                        }}
                        placeholder="mysite.com"
                        className="font-mono text-sm"
                      />
                      <Button type="button" variant="outline" className="gap-1 shrink-0" onClick={handleAddAllowedDomain}>
                        <Plus className="w-3.5 h-3.5" /> Add
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {embedAllowedDomains.length === 0 ? (
                        <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                          No restriction yet. The widget can run anywhere with the embed code.
                        </div>
                      ) : (
                        embedAllowedDomains.map((domain) => (
                          <Badge key={domain} variant="secondary" className="gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs">
                            {domain}
                            <button
                              type="button"
                              className="rounded-full p-0.5 hover:bg-background/80"
                              aria-label={`Remove ${domain}`}
                              onClick={() => handleRemoveAllowedDomain(domain)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <Label>Embed code</Label>
                    <p className="text-xs text-muted-foreground mb-1">For a developer or another website builder. Landing pages published by 1Person install it automatically.</p>
                    <div className="relative mt-1">
                      <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto font-mono whitespace-pre-wrap">
{embedCode}
                      </pre>
                      <Button
                        variant="outline"
                        size="sm"
                        className="absolute top-2 right-2 gap-1"
                        onClick={() => {
                          navigator.clipboard.writeText(embedCode);
                          setEmbedCopied(true);
                          toast.success('Embed code copied!');
                          setTimeout(() => setEmbedCopied(false), 2000);
                        }}
                      >
                        {embedCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {embedCopied ? 'Copied' : 'Copy code'}
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground bg-amber-50 p-2 rounded border border-amber-200">
                    Customer-facing widgets only use Public knowledge. Mark documents as Public before expecting the chatbot to use them on a live page.
                  </p>
                  {embedUsesLocalApi && (
                    <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                      This embed code is using localhost. Published websites need a public HTTPS API URL, then the landing page must be published again.
                    </p>
                  )}
                </>
              )}

              <Button onClick={handleSaveEmbed} disabled={isSavingEmbed} className="w-full gap-2">
                {isSavingEmbed && <Loader2 className="w-4 h-4 animate-spin" />} Save Embed Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === CONVERSATIONS TAB === */}
        <TabsContent value="conversations" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              {conversations.length === 0 ? (
                <Card className="p-8 text-center"><MessagesSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">No conversations yet</p><p className="text-xs text-muted-foreground mt-1">Test your chatbot or deploy the widget to start getting conversations</p></Card>
              ) : conversations.map((conv: any) => (
                <Card key={conv.id} className={`cursor-pointer hover:bg-muted/50 ${selectedConvId === conv.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedConvId(conv.id)}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium truncate">{conv.visitorName || conv.visitorEmail || 'Visitor'}</p>
                      <Badge variant={conv.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{conv.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{conv.channel} · {new Date(conv.createdAt).toLocaleDateString()}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="lg:col-span-2">
              {!selectedConvId ? (
                <Card className="p-12 text-center"><MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Select a conversation</p></Card>
              ) : convDetail ? (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{convDetail.conversation.visitorName || convDetail.conversation.visitorEmail || 'Visitor'}</CardTitle>
                      <Badge variant="outline">{convDetail.conversation.channel}</Badge>
                    </div>
                    {convDetail.conversation.visitorEmail && <p className="text-xs text-muted-foreground">{convDetail.conversation.visitorEmail}</p>}
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
                    {convDetail.messages.map((msg: any) => (
                      <div key={msg.id} className={`flex gap-2 ${msg.role === 'visitor' ? 'justify-end' : ''}`}>
                        {msg.role !== 'visitor' && <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"><Bot className="w-3 h-3 text-primary" /></div>}
                        <div className={`rounded-lg px-3 py-2 max-w-[75%] text-sm ${msg.role === 'visitor' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                          {msg.content}
                          <p className="text-[10px] opacity-50 mt-1">{new Date(msg.createdAt).toLocaleTimeString()}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>}
            </div>
          </div>
        </TabsContent>

        {/* === HANDOFF TAB === */}
        <TabsContent value="handoff" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground mb-2">Waiting for staff ({handoffQueue.length})</p>
              {handoffQueue.length === 0 ? (
                <Card className="p-8 text-center"><PhoneForwarded className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">No conversations waiting</p></Card>
              ) : handoffQueue.map((conv: any) => (
                <Card key={conv.id} className={`cursor-pointer hover:bg-muted/50 ${handoffConvId === conv.id ? 'ring-2 ring-primary' : ''}`} onClick={() => handlePickup(conv.id)}>
                  <CardContent className="p-3">
                    <p className="text-sm font-medium truncate">{conv.visitorName || conv.visitorEmail || 'Visitor'}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Waiting since {conv.handoffAt ? new Date(conv.handoffAt).toLocaleTimeString() : '...'}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="lg:col-span-2">
              {!handoffConvId ? (
                <Card className="p-12 text-center"><PhoneForwarded className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Click a conversation to pick it up</p></Card>
              ) : handoffDetail ? (
                <Card className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{handoffDetail.conversation.visitorName || 'Visitor'}</CardTitle>
                      <Button variant="outline" size="sm" className="gap-1 text-red-500" onClick={handleCloseHandoff}><X className="w-3 h-3" /> Close</Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
                    {handoffDetail.messages.map((msg: any) => (
                      <div key={msg.id} className={`flex gap-2 ${msg.role === 'visitor' ? 'justify-end' : ''}`}>
                        {msg.role !== 'visitor' && <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${msg.metadata?.staffReply ? 'bg-blue-100' : 'bg-primary/10'}`}>{msg.metadata?.staffReply ? <User className="w-3 h-3 text-blue-600" /> : <Bot className="w-3 h-3 text-primary" />}</div>}
                        <div className={`rounded-lg px-3 py-2 max-w-[75%] text-sm ${msg.role === 'visitor' ? 'bg-primary text-primary-foreground' : msg.metadata?.staffReply ? 'bg-blue-50 border border-blue-200' : 'bg-muted'}`}>
                          {msg.metadata?.staffReply && <p className="text-[10px] font-medium text-blue-600 mb-0.5">Staff</p>}
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                  <div className="p-3 border-t">
                    <form onSubmit={(e) => { e.preventDefault(); handleStaffReply(); }} className="flex gap-2">
                      <Input value={staffReply} onChange={(e) => setStaffReply(e.target.value)} placeholder="Type a reply as staff..." className="flex-1" />
                      <Button type="submit" size="icon" disabled={isSendingStaff || !staffReply.trim()}>
                        {isSendingStaff ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </Button>
                    </form>
                  </div>
                </Card>
              ) : <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>}
            </div>
          </div>
        </TabsContent>

        {/* === DEPLOY TAB === */}
        <TabsContent value="deploy" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base gap-2 flex items-center"><Code2 className="w-4 h-4" /> Embed Code</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Add this before <code className="bg-muted px-1 rounded">&lt;/body&gt;</code> on your website.</p>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">{embedCode}</pre>
                <Button variant="outline" size="sm" className="absolute top-2 right-2 gap-1" onClick={() => { navigator.clipboard.writeText(embedCode); setCopied(true); toast.success('Copied!'); setTimeout(() => setCopied(false), 2000); }}>
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </CardContent>
          </Card>
          {/* Widget Preview */}
          <Card>
            <CardHeader><CardTitle className="text-base">Widget Preview</CardTitle></CardHeader>
            <CardContent>
              <div className="mx-auto max-w-xs overflow-hidden rounded-[18px] border bg-white shadow-lg">
                <div className="flex items-center gap-2 px-4 py-3 text-white" style={{ backgroundColor: primaryColor }}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20 font-bold">
                    {previewAvatarUrl ? (
                      <img src={previewAvatarUrl} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    ) : (
                      previewName.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium">{previewName}</span>
                    <span className="block text-xs text-white/80">Usually replies instantly</span>
                  </div>
                </div>
                <div className="min-h-[180px] bg-slate-50 p-4">
                  <div className="flex gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white">
                      {previewAvatarUrl ? (
                        <img src={previewAvatarUrl} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      ) : (
                        <Bot className="h-3.5 w-3.5" style={{ color: primaryColor }} />
                      )}
                    </div>
                    <div className="rounded-2xl rounded-tl-md border bg-white px-3 py-2 text-sm">{previewGreeting}</div>
                  </div>
                </div>
                <div className="flex gap-1.5 border-t p-[10px]">
                  <Input placeholder="Type your message..." disabled className="h-[42px] min-w-0 flex-1 rounded-full px-4 text-sm" />
                  <Button disabled className="h-[42px] w-[42px] shrink-0 rounded-full p-0 text-sm font-bold text-white" style={{ backgroundColor: primaryColor }}>→</Button>
                </div>
                {poweredByVisible && <div className="bg-white pb-3 text-center text-[11px] font-medium text-slate-400">Powered by 1Person</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Chatbot Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create New Chatbot</DialogTitle></DialogHeader>
          <div className="py-3 space-y-3">
            <div><Label>Chatbot Name</Label><Input value={newBotName} onChange={(e) => setNewBotName(e.target.value)} placeholder="e.g. Sales Bot, Support Bot" className="mt-1" /></div>
            <div><Label>Knowledge Tags</Label><Input value={newBotTags} onChange={(e) => setNewBotTags(e.target.value)} placeholder="faq, product, sales (comma-separated)" className="mt-1" /><p className="text-xs text-muted-foreground mt-1">Leave empty to use all knowledge. Tags filter which knowledge entries this bot can access.</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateBot} disabled={!newBotName.trim()} className="gap-2"><Plus className="w-4 h-4" /> Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
