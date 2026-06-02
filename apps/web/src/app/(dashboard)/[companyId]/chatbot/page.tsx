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
  const [embedAllowedDomains, setEmbedAllowedDomains] = useState('');
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
  const chatEndRef = useRef<HTMLDivElement>(null);
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
          ? selectedBot.embedAllowedDomains.join('\n')
          : ''
      );
      setLogoUrl(selectedBot.logoUrl || '');
      setAvatarUrl(selectedBot.avatarUrl || '');
      setPoweredByVisible(selectedBot.poweredByVisible !== false);
    }
  }, [selectedBot]);

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

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // === HANDLERS ===

  const handleCreateBot = async () => {
    if (!token || !newBotName.trim()) return;
    try {
      const tags = newBotTags.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await api.post<any>(`/chatbot/company/${companyId}/chatbots`, { name: newBotName, knowledgeTags: tags.length > 0 ? tags : undefined }, { token });
      toast.success(`"${newBotName}" created!`);
      setSelectedBotId(res.id);
      setNewBotName('');
      setNewBotTags('');
      setCreateDialog(false);
      qc.invalidateQueries({ queryKey: ['chatbots'] });
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
      if (selectedBotId === botId) setSelectedBotId(null);
      qc.invalidateQueries({ queryKey: ['chatbots'] });
    } catch (err: any) {
      console.error('Delete chatbot error:', err);
      toast.error('Could not delete chatbot. Please try again.');
    }
  };

  const handleSaveConfig = async () => {
    if (!token) return;
    setIsSaving(true);
    try {
      await api.post(`/chatbot/company/${companyId}/config`, {
        name, greeting, tone, mode, primaryColor,
        logoUrl: logoUrl || null, avatarUrl: avatarUrl || null, poweredByVisible,
      }, { token });
      toast.success('Saved!');
      qc.invalidateQueries({ queryKey: ['chatbots'] });
    } catch (err: any) {
      console.error('Save chatbot config error:', err);
      toast.error('Could not save settings. Please try again.');
    }
    finally { setIsSaving(false); }
  };

  const handleSaveAccessLevel = async () => {
    if (!token) return;
    setIsSavingAccess(true);
    try {
      await api.post(`/chatbot/company/${companyId}/config`, { accessLevel }, { token });
      toast.success('Access level saved!');
      qc.invalidateQueries({ queryKey: ['chatbots'] });
    } catch {
      toast.error('Could not save access level. Please try again.');
    } finally { setIsSavingAccess(false); }
  };

  const handleSaveEmbed = async () => {
    if (!token) return;
    setIsSavingEmbed(true);
    try {
      const domains = embedAllowedDomains.split('\n').map((d) => d.trim()).filter(Boolean);
      await api.post(`/chatbot/company/${companyId}/config`, { embedEnabled, embedAllowedDomains: domains }, { token });
      toast.success('Embed settings saved!');
      qc.invalidateQueries({ queryKey: ['chatbots'] });
    } catch {
      toast.error('Could not save embed settings. Please try again.');
    } finally { setIsSavingEmbed(false); }
  };

  const handleSendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || chatInput).trim();
    if (!token || !text || isSending) return;
    const msgId = `msg_${Date.now()}`;

    setChatInput('');
    setMessages((prev) => [...prev, { role: 'visitor', content: text, status: 'sending', id: msgId }]);
    setIsSending(true);
    setIsTyping(true);

    try {
      const res = await api.post<{ conversationId: string; response: string; quickReplies?: QuickReply[] }>(
        `/chatbot/company/${companyId}/chat`, { conversationId, message: text }, { token }
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
  }, [token, chatInput, isSending, conversationId, companyId]);

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
  const embedCode = `<script>\n(function(){var s=document.createElement('script');s.src='${apiUrl.replace('/api/v1', '')}/widget.js';s.dataset.companyId='${companyId}';s.dataset.apiUrl='${apiUrl}';s.async=true;document.body.appendChild(s);})();\n</script>`;

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
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Test Chat</CardTitle>
                <Button variant="ghost" size="sm" onClick={handleNewChat} className="gap-1"><RefreshCw className="w-3 h-3" /> New</Button>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 p-0">
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-[320px] max-h-[420px]">
                  {messages.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-12">
                      <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>Test your chatbot here</p>
                      <p className="text-xs mt-1">Uses your Knowledge Base for answers</p>
                    </div>
                  )}
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-2 ${msg.role === 'visitor' ? 'justify-end' : ''}`}>
                      {msg.role === 'assistant' && (
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="w-3 h-3 text-primary" />
                        </div>
                      )}
                      <div className={`rounded-lg px-3 py-2 max-w-[80%] text-sm ${
                        msg.role === 'visitor' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}>
                        {msg.content}
                        {/* Status indicator */}
                        {msg.role === 'visitor' && msg.status === 'sending' && (
                          <span className="text-[10px] opacity-60 block mt-0.5">Sending...</span>
                        )}
                        {msg.status === 'error' && (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertCircle className="w-3 h-3 text-red-400" />
                            <span className="text-[10px] text-red-400">Failed</span>
                            <button onClick={() => handleRetryMessage(msg.id)} className="text-[10px] underline text-red-400 ml-1">Retry</button>
                          </div>
                        )}
                      </div>
                      {msg.role === 'assistant' && msg.quickReplies && msg.quickReplies.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 ml-8">
                          {msg.quickReplies.map((qr, i) => (
                            <button key={i} onClick={() => handleSendMessage(qr.value)}
                              className="text-xs px-2 py-1 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition-colors">
                              {qr.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Typing indicator */}
                  {isTyping && (
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center"><Bot className="w-3 h-3 text-primary" /></div>
                      <div className="bg-muted rounded-lg px-3 py-2 flex gap-1">
                        <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-3 border-t">
                  <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2">
                    <Input ref={inputRef} value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type a message..." disabled={isSending} className="flex-1" />
                    <Button type="submit" size="icon" disabled={isSending || !chatInput.trim()}>
                      {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </form>
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
                Controls which of your uploaded documents the chatbot can use when answering questions.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { value: 'public', icon: Globe, label: 'Public', desc: 'Only uses documents marked as Public. Safe for customer-facing widget.', color: 'text-green-700' },
                { value: 'internal', icon: Building2, label: 'Internal', desc: 'Uses Public + Internal documents. For your team\'s dashboard chat.', color: 'text-slate-700' },
                { value: 'admin', icon: Lock, label: 'Admin', desc: 'Uses all documents including Confidential. For owner/admin only.', color: 'text-red-700' },
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
                Add this AI chatbot to your website. It only answers using your Public documents — internal data is never exposed.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Enable embed widget</Label>
                  <p className="text-xs text-muted-foreground">Allow the chatbot to be embedded on external websites</p>
                </div>
                <Switch checked={embedEnabled} onCheckedChange={setEmbedEnabled} />
              </div>

              {embedEnabled && (
                <>
                  <div>
                    <Label>Allowed domains</Label>
                    <p className="text-xs text-muted-foreground mb-1">One domain per line, e.g. mysite.com</p>
                    <Textarea
                      value={embedAllowedDomains}
                      onChange={(e) => setEmbedAllowedDomains(e.target.value)}
                      placeholder={"mysite.com\napp.mysite.com"}
                      className="mt-1 font-mono text-sm"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label>Embed code</Label>
                    <div className="relative mt-1">
                      <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto font-mono whitespace-pre-wrap">
{`<script src="https://1person.ai/widget.js"
  data-company-id="${companyId}"
  data-color="${primaryColor}">
</script>`}
                      </pre>
                      <Button
                        variant="outline"
                        size="sm"
                        className="absolute top-2 right-2 gap-1"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `<script src="https://1person.ai/widget.js" data-company-id="${companyId}" data-color="${primaryColor}"></script>`
                          );
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
                    The widget always runs in Public mode. Only documents you have marked as Public will be used.
                  </p>
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
              <div className="border rounded-lg overflow-hidden max-w-xs mx-auto shadow-lg">
                <div className="px-4 py-3 text-white flex items-center gap-2" style={{ backgroundColor: primaryColor }}>
                  <Bot className="w-5 h-5" /><span className="font-medium text-sm">{name}</span>
                  <span className="w-2 h-2 bg-green-300 rounded-full ml-auto" />
                </div>
                <div className="bg-background p-4 min-h-[180px]">
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${primaryColor}20` }}>
                      <Bot className="w-3 h-3" style={{ color: primaryColor }} />
                    </div>
                    <div className="bg-muted rounded-lg px-3 py-2 text-sm">{greeting}</div>
                  </div>
                </div>
                <div className="border-t p-3 flex gap-2">
                  <Input placeholder="Type a message..." disabled className="text-xs" />
                  <Button size="icon" disabled style={{ backgroundColor: primaryColor }}><Send className="w-3 h-3 text-white" /></Button>
                </div>
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
