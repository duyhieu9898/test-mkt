'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { useCreateAgent } from '@/lib/api/hooks';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Briefcase,
  Megaphone,
  Code,
  HeartPulse,
  Users,
  LineChart,
  PenTool,
  Target,
  Headphones,
  Sparkles,
  Palette,
} from 'lucide-react';

// Available roles with their configurations
const agentRoles = [
  {
    id: 'ceo',
    name: 'CEO Agent',
    emoji: '👔',
    color: '#8b5cf6',
    description: 'Strategic leadership and team coordination',
    capabilities: ['strategic_planning', 'decision_making', 'team_coordination'],
    icon: Briefcase,
  },
  {
    id: 'marketing_manager',
    name: 'Marketing Manager',
    emoji: '📈',
    color: '#3b82f6',
    description: 'Campaign planning and brand strategy',
    capabilities: ['campaign_management', 'brand_strategy', 'market_analysis'],
    icon: Megaphone,
  },
  {
    id: 'content_creator',
    name: 'Content Creator',
    emoji: '✍️',
    color: '#10b981',
    description: 'Blog posts, social media, and copywriting',
    capabilities: ['content_writing', 'social_media', 'copywriting'],
    icon: PenTool,
  },
  {
    id: 'sales_manager',
    name: 'Sales Manager',
    emoji: '💼',
    color: '#f59e0b',
    description: 'Lead generation and sales outreach',
    capabilities: ['lead_generation', 'sales_outreach', 'crm_management'],
    icon: Target,
  },
  {
    id: 'analyst',
    name: 'Data Analyst',
    emoji: '📊',
    color: '#06b6d4',
    description: 'Data analysis and business intelligence',
    capabilities: ['data_analysis', 'reporting', 'insights'],
    icon: LineChart,
  },
  {
    id: 'support',
    name: 'Customer Support',
    emoji: '🎧',
    color: '#ec4899',
    description: '24/7 customer assistance and issue resolution',
    capabilities: ['customer_support', 'ticket_management', 'knowledge_base'],
    icon: Headphones,
  },
  {
    id: 'developer',
    name: 'Developer Agent',
    emoji: '💻',
    color: '#14b8a6',
    description: 'Code generation and technical tasks',
    capabilities: ['code_generation', 'debugging', 'documentation'],
    icon: Code,
  },
  {
    id: 'hr_manager',
    name: 'HR Manager',
    emoji: '👥',
    color: '#f97316',
    description: 'Team management and employee relations',
    capabilities: ['recruitment', 'onboarding', 'team_management'],
    icon: Users,
  },
];

// Capability levels
const capabilityLevels = ['beginner', 'intermediate', 'advanced', 'expert'];

// Available colors
const agentColors = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#14b8a6',
  '#6366f1', '#84cc16', '#f97316', '#a855f7',
];

export default function NewAgentPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  const createAgent = useCreateAgent();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    role: '',
    name: '',
    description: '',
    color: '#8b5cf6',
    budgetLimit: 100,
    capabilities: [] as Array<{ name: string; level: string; description: string }>,
  });

  const totalSteps = 3;

  const selectedRole = agentRoles.find((r) => r.id === formData.role);

  const handleRoleSelect = (roleId: string) => {
    const role = agentRoles.find((r) => r.id === roleId);
    if (role) {
      setFormData({
        ...formData,
        role: roleId,
        name: role.name,
        description: role.description,
        color: role.color,
        capabilities: role.capabilities.map((cap) => ({
          name: cap,
          level: 'intermediate',
          description: cap.replace(/_/g, ' '),
        })),
      });
    }
  };

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.role !== '';
      case 2:
        return formData.name.length >= 2;
      case 3:
        return true;
      default:
        return false;
    }
  };

  const handleCreate = async () => {
    try {
      const agent = await createAgent.mutateAsync({
        companyId,
        name: formData.name,
        role: formData.role,
        description: formData.description,
        capabilities: formData.capabilities,
      });

      toast.success(`${formData.name} created successfully!`);
      router.push(`/${companyId}/agents/${agent.id}`);
    } catch {
      toast.error('Failed to create agent');
    }
  };

  const updateCapabilityLevel = (capName: string, level: string) => {
    setFormData({
      ...formData,
      capabilities: formData.capabilities.map((cap) =>
        cap.name === capName ? { ...cap, level } : cap
      ),
    });
  };

  return (
    <div className="max-w-3xl mx-auto py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href={`/${companyId}/agents`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Create New Agent</h1>
          <p className="text-muted-foreground">Add an AI team member to your company</p>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Step {step} of {totalSteps}</span>
          <span className="text-sm text-muted-foreground">{Math.round((step / totalSteps) * 100)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-purple-500"
            initial={{ width: 0 }}
            animate={{ width: `${(step / totalSteps) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Step Content */}
      <motion.div
        key={step}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Step 1: Select Role */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Choose Agent Role
              </CardTitle>
              <CardDescription>
                Select a role that best fits your needs. You can customize capabilities later.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {agentRoles.map((role) => {
                  const Icon = role.icon;
                  const isSelected = formData.role === role.id;
                  return (
                    <button
                      key={role.id}
                      onClick={() => handleRoleSelect(role.id)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-md'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                          style={{ backgroundColor: `${role.color}20` }}
                        >
                          {role.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{role.name}</p>
                            {isSelected && <Check className="w-4 h-4 text-primary" />}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{role.description}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {role.capabilities.slice(0, 2).map((cap) => (
                              <Badge key={cap} variant="secondary" className="text-xs capitalize">
                                {cap.replace(/_/g, ' ')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Customize Agent */}
        {step === 2 && selectedRole && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-primary" />
                Customize Your Agent
              </CardTitle>
              <CardDescription>
                Personalize your agent's name, description, and appearance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Preview */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ backgroundColor: `${formData.color}20` }}
                >
                  {selectedRole.emoji}
                </div>
                <div>
                  <p className="font-semibold text-lg">{formData.name || 'Agent Name'}</p>
                  <p className="text-sm text-muted-foreground">{formData.description || 'Description'}</p>
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Agent Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Marketing Maven"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What does this agent do?"
                  rows={3}
                />
              </div>

              {/* Color */}
              <div className="space-y-2">
                <Label>Agent Color</Label>
                <div className="flex flex-wrap gap-2">
                  {agentColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-8 h-8 rounded-full transition-all ${
                        formData.color === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Budget */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Monthly Budget Limit</Label>
                  <span className="font-semibold">${formData.budgetLimit}/month</span>
                </div>
                <Slider
                  value={[formData.budgetLimit]}
                  onValueChange={([value]) => setFormData({ ...formData, budgetLimit: value })}
                  min={10}
                  max={1000}
                  step={10}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>$10</span>
                  <span>$500</span>
                  <span>$1000</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Configure Capabilities */}
        {step === 3 && selectedRole && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Configure Capabilities
              </CardTitle>
              <CardDescription>
                Set the expertise level for each capability. Higher levels mean better performance but may cost more.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {formData.capabilities.map((cap) => (
                <div key={cap.name} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="capitalize">{cap.name.replace(/_/g, ' ')}</Label>
                    <Badge variant="outline" className="capitalize">
                      {cap.level}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    {capabilityLevels.map((level) => (
                      <button
                        key={level}
                        onClick={() => updateCapabilityLevel(cap.name, level)}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                          cap.level === level
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted hover:bg-muted/80'
                        }`}
                      >
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Summary */}
              <div className="mt-8 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-purple-500/10 border">
                <h4 className="font-semibold mb-3">Agent Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name:</span>
                    <span className="ml-2 font-medium">{formData.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Role:</span>
                    <span className="ml-2 font-medium capitalize">{formData.role.replace(/_/g, ' ')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Budget:</span>
                    <span className="ml-2 font-medium">${formData.budgetLimit}/mo</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Capabilities:</span>
                    <span className="ml-2 font-medium">{formData.capabilities.length}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8">
        <Button
          variant="ghost"
          onClick={handleBack}
          disabled={step === 1}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        {step < totalSteps ? (
          <Button onClick={handleNext} disabled={!canProceed()} className="gap-2">
            Continue
            <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            disabled={!canProceed() || createAgent.isPending}
            className="gap-2 bg-gradient-to-r from-primary to-purple-500"
          >
            {createAgent.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Create Agent
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
