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
import {
  MessageSquare, Send, Loader2, Settings2, Code2, MessagesSquare,
  Bot, User, Copy, Check, ExternalLink, Plus, Trash2, RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { TrustBanner } from '@/components/trust-banner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface ChatMessage {
  role: string;
  content: string;
  status: 'sending' | 'sent' | 'error';
  id: string;
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

  // === CONFIG STATE ===
  const [name, setName] = useState('');
  const [greeting, setGreeting] = useState('');
  const [tone, setTone] = useState('friendly');
  const [mode, setMode] = useState('both');
  const [primaryColor, setPrimaryColor] = useState('#6366f1');
  const [isSaving, setIsSaving] = useState(false);

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
    }
  }, [selectedBot]);

  // Fetch conversations
  const { data: convsData } = useQuery({
    queryKey: ['chatbot-conversations', companyId],
    queryFn: () => api.get<{ data: any[] }>(`/chatbot/company/${companyId}/conversations`, { token: token! }),
    enabled: !!token,
  });
  const conversations = convsData?.data || [];

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
      const res = await api.post<any>(`/chatbot/company/${companyId}/chatbots`, { name: newBotName }, { token });
      toast.success(`"${newBotName}" created!`);
      setSelectedBotId(res.id);
      setNewBotName('');
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
      await api.post(`/chatbot/company/${companyId}/config`, { name, greeting, tone, mode, primaryColor }, { token });
      toast.success('Saved!');
      qc.invalidateQueries({ queryKey: ['chatbots'] });
    } catch (err: any) {
      console.error('Save chatbot config error:', err);
      toast.error('Could not save settings. Please try again.');
    }
    finally { setIsSaving(false); }
  };

  const handleSendMessage = useCallback(async () => {
    if (!token || !chatInput.trim() || isSending) return;
    const text = chatInput.trim();
    const msgId = `msg_${Date.now()}`;

    setChatInput('');
    setMessages((prev) => [...prev, { role: 'visitor', content: text, status: 'sending', id: msgId }]);
    setIsSending(true);
    setIsTyping(true);

    try {
      const res = await api.post<{ conversationId: string; response: string }>(
        `/chatbot/company/${companyId}/chat`, { conversationId, message: text }, { token }
      );
      setConversationId(res.conversationId);
      setMessages((prev) => [
        ...prev.map((m) => m.id === msgId ? { ...m, status: 'sent' as const } : m),
        { role: 'assistant', content: res.response, status: 'sent', id: `res_${Date.now()}` },
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
          <div className="py-3"><Label>Chatbot Name</Label><Input value={newBotName} onChange={(e) => setNewBotName(e.target.value)} placeholder="e.g. Sales Bot, Support Bot" className="mt-1" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateBot} disabled={!newBotName.trim()} className="gap-2"><Plus className="w-4 h-4" /> Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
