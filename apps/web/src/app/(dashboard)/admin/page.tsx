'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Brain,
  Settings,
  Shield,
  Save,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  Zap,
  Activity,
} from 'lucide-react';

// AI performance levels — business-friendly, no technical jargon
const aiLevels = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Best mix of speed and quality. Works great for most tasks.',
    icon: Sparkles,
    recommended: true,
  },
  {
    id: 'quality',
    name: 'Maximum Quality',
    description: 'Best results for complex strategy and analysis. Takes a bit longer.',
    icon: Brain,
    recommended: false,
  },
  {
    id: 'fast',
    name: 'Fast',
    description: 'Quickest responses. Great for simple tasks and high-volume work.',
    icon: Zap,
    recommended: false,
  },
];

export default function AdminPage() {
  const [selectedLevel, setSelectedLevel] = useState('balanced');
  const [settings, setSettings] = useState({
    autoRestart: true,
    smartSaving: true,
    notifications: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast.success('Settings saved');
    setIsSaving(false);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6" />
          Admin Settings
        </h1>
        <p className="text-muted-foreground">Manage how your AI team works</p>
      </div>

      {/* System Health — simple status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="font-medium text-green-700">All systems running</span>
            <Badge variant="outline" className="ml-auto">Healthy</Badge>
          </div>
        </CardContent>
      </Card>

      {/* AI Performance Level */}
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
                  selectedLevel === level.id
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent bg-muted/50 hover:border-primary/30'
                }`}
                onClick={() => setSelectedLevel(level.id)}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${selectedLevel === level.id ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{level.name}</h3>
                      {level.recommended && (
                        <Badge className="bg-green-100 text-green-700 border-green-200">Recommended</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{level.description}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedLevel === level.id ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                  }`}>
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
            {
              key: 'autoRestart',
              label: 'Auto-recover from errors',
              desc: 'If an agent encounters a problem, it will automatically try again',
            },
            {
              key: 'smartSaving',
              label: 'Smart cost optimization',
              desc: 'Automatically use the most efficient approach for each task',
            },
            {
              key: 'notifications',
              label: 'Activity notifications',
              desc: 'Get notified when agents complete important tasks',
            },
          ].map((setting) => (
            <div key={setting.key} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{setting.label}</p>
                <p className="text-sm text-muted-foreground">{setting.desc}</p>
              </div>
              <Switch
                checked={settings[setting.key as keyof typeof settings]}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, [setting.key]: checked }))
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
