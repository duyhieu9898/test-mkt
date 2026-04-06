'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Brain, Sparkles, Zap, Activity, Save, RefreshCw, CheckCircle2 } from 'lucide-react';

const aiLevels = [
  { id: 'balanced', name: 'Balanced', description: 'Best mix of speed and quality. Works great for most tasks.', icon: Sparkles, recommended: true },
  { id: 'quality', name: 'Maximum Quality', description: 'Best results for complex strategy and analysis.', icon: Brain, recommended: false },
  { id: 'fast', name: 'Fast', description: 'Quickest responses. Great for high-volume work.', icon: Zap, recommended: false },
];

export default function AdminSettingsPage() {
  const [selectedLevel, setSelectedLevel] = useState('balanced');
  const [settings, setSettings] = useState({ autoRestart: true, smartSaving: true, notifications: true });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    toast.success('Settings saved');
    setIsSaving(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-gray-500">Configure AI performance and agent behavior</p>
      </div>

      {/* System Health */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5" /> System Status</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="font-medium text-green-700">All systems running</span>
            <Badge variant="outline" className="ml-auto">Healthy</Badge>
          </div>
        </CardContent>
      </Card>

      {/* AI Level */}
      <Card>
        <CardHeader>
          <CardTitle>AI Performance Level</CardTitle>
          <CardDescription>Choose how your AI agents work</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {aiLevels.map((level) => {
            const Icon = level.icon;
            return (
              <div
                key={level.id}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedLevel === level.id ? 'border-emerald-500 bg-emerald-50/50' : 'border-transparent bg-gray-50 hover:border-gray-200'
                }`}
                onClick={() => setSelectedLevel(level.id)}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${selectedLevel === level.id ? 'text-emerald-600' : 'text-gray-400'}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{level.name}</h3>
                      {level.recommended && <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">Recommended</Badge>}
                    </div>
                    <p className="text-sm text-gray-500">{level.description}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedLevel === level.id ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'}`}>
                    {selectedLevel === level.id && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Agent Behavior */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Behavior</CardTitle>
          <CardDescription>Control how your AI team operates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'autoRestart', label: 'Auto-recover from errors', desc: 'Agents automatically retry on problems' },
            { key: 'smartSaving', label: 'Smart cost optimization', desc: 'Use the most efficient approach for each task' },
            { key: 'notifications', label: 'Activity notifications', desc: 'Get notified on important completions' },
          ].map((s) => (
            <div key={s.key} className="flex items-center justify-between">
              <div><p className="font-medium">{s.label}</p><p className="text-sm text-gray-500">{s.desc}</p></div>
              <Switch checked={settings[s.key as keyof typeof settings]} onCheckedChange={(v) => setSettings((p) => ({ ...p, [s.key]: v }))} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700">
          {isSaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
