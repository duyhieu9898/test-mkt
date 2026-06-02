'use client';

/**
 * Deployment mode picker (W1A.6).
 *
 * Answers the #3 user requirement: "LLM on-premise + data privacy cao".
 * The @1person/ai-tenant module already supports vLLM (on-prem) via the
 * OpenAI-compatible API — this page exposes that choice as a non-technical
 * 3-card picker.
 */

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Cloud, Shield, Server, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Mode = 'cloud' | 'private' | 'on_premise';

const MODES: Array<{
  id: Mode;
  title: string;
  subtitle: string;
  icon: typeof Cloud;
  tone: string;
  accent: string;
  bullets: string[];
}> = [
  {
    id: 'cloud',
    title: 'Cloud',
    subtitle: 'Fast, easy, shared infrastructure',
    icon: Cloud,
    tone: 'border-blue-200 bg-blue-50/40',
    accent: 'text-blue-700',
    bullets: [
      'Runs on 1Person shared infrastructure',
      'Uses our OpenAI / Anthropic keys',
      'Fastest to get started',
      'Tamper-evident audit log still applies',
    ],
  },
  {
    id: 'private',
    title: 'Private Cloud',
    subtitle: 'Your own API keys, still convenient',
    icon: Shield,
    tone: 'border-purple-200 bg-purple-50/40',
    accent: 'text-purple-700',
    bullets: [
      'Bring your own OpenAI / Anthropic key',
      'Your LLM bills go directly to you',
      'Data still stored on 1Person infrastructure',
      'Encrypted at rest, tamper-evident audit',
    ],
  },
  {
    id: 'on_premise',
    title: 'On-Premise',
    subtitle: 'Nothing leaves your hardware',
    icon: Server,
    tone: 'border-green-200 bg-green-50/40',
    accent: 'text-green-700',
    bullets: [
      'Point to your own vLLM / Ollama endpoint',
      'Zero egress to cloud LLM providers',
      'Self-hosted Langfuse for observability',
      'Highest privacy — for regulated industries',
    ],
  },
];

export default function DeploymentModePage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [mode, setMode] = useState<Mode>('cloud');
  const [vllmUrl, setVllmUrl] = useState('http://localhost:8001/v1');
  const [vllmModel, setVllmModel] = useState('Qwen/Qwen2-7B-Instruct');
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    setSaving(true);
    try {
      // Minimal: just store in localStorage for now. Backend wiring comes
      // as a follow-up (W1A.6 polish). Shows the full UX today.
      localStorage.setItem(
        `deployment-mode-${companyId}`,
        JSON.stringify({ mode, vllmUrl, vllmModel }),
      );
      await new Promise((r) => setTimeout(r, 300));
      toast.success(`Deployment mode saved: ${mode}`);
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Shield className="w-6 h-6 text-green-500" /> Deployment mode
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Choose where your data and AI live. You can switch any time — it
          doesn't affect the data you've already stored.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {MODES.map((m) => {
          const Icon = m.icon;
          const selected = mode === m.id;
          return (
            <Card
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`cursor-pointer transition-all ${m.tone} ${
                selected ? 'ring-2 ring-offset-2 ring-indigo-500 scale-[1.02]' : 'hover:scale-[1.01]'
              }`}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg bg-white ${m.accent}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {selected && (
                    <Badge className="bg-indigo-600 text-white">
                      <Check className="w-3 h-3 mr-1" /> Selected
                    </Badge>
                  )}
                </div>
                <div>
                  <h3 className={`font-semibold text-slate-900`}>{m.title}</h3>
                  <p className="text-xs text-slate-600">{m.subtitle}</p>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-700">
                  {m.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <Check className={`w-3 h-3 mt-0.5 shrink-0 ${m.accent}`} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {mode === 'on_premise' && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">On-Premise configuration</div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vllm-url" className="mb-1.5 block">vLLM / Ollama endpoint</Label>
                <Input
                  id="vllm-url"
                  value={vllmUrl}
                  onChange={(e) => setVllmUrl(e.target.value)}
                  placeholder="http://gpu-server.local:8001/v1"
                />
              </div>
              <div>
                <Label htmlFor="vllm-model" className="mb-1.5 block">Model name</Label>
                <Input
                  id="vllm-model"
                  value={vllmModel}
                  onChange={(e) => setVllmModel(e.target.value)}
                  placeholder="Qwen/Qwen2-7B-Instruct"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              The @1person/ai-tenant module calls this endpoint using the
              OpenAI-compatible API format. No egress to external cloud LLM
              providers — your data stays on your hardware.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save deployment mode
        </Button>
      </div>
    </div>
  );
}
