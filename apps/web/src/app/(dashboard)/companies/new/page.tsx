'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Check,
  Bot,
  DollarSign,
  Target,
  Loader2,
} from 'lucide-react';

const steps = [
  { id: 'idea', title: 'Your Idea', icon: Sparkles },
  { id: 'details', title: 'Company Details', icon: Building2 },
  { id: 'agents', title: 'AI Agents', icon: Bot },
  { id: 'review', title: 'Review', icon: Check },
];

const ideaSchema = z.object({
  prompt: z.string().min(20, 'Please describe your business idea in more detail'),
});

const detailsSchema = z.object({
  name: z.string().min(2, 'Company name is required'),
  industry: z.string().min(1, 'Please select an industry'),
  budget: z.number().min(100, 'Minimum budget is $100'),
});

const industries = [
  'E-commerce',
  'SaaS',
  'Marketing Agency',
  'Content Creator',
  'Consulting',
  'Other',
];

const suggestedAgents = [
  {
    role: 'ceo',
    name: 'CEO Agent',
    description: 'Strategic planning, budget allocation, team coordination',
    avatar: '👔',
    selected: true,
  },
  {
    role: 'marketing_manager',
    name: 'Marketing Manager',
    description: 'Campaign strategy, brand management, growth initiatives',
    avatar: '📈',
    selected: true,
  },
  {
    role: 'content_creator',
    name: 'Content Creator',
    description: 'Blog posts, social media, marketing copy',
    avatar: '✍️',
    selected: true,
  },
  {
    role: 'ads_specialist',
    name: 'Ads Specialist',
    description: 'Ad campaigns, performance optimization, A/B testing',
    avatar: '🎯',
    selected: false,
  },
];

export default function NewCompanyPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState(
    suggestedAgents.filter((a) => a.selected).map((a) => a.role)
  );
  const [formData, setFormData] = useState({
    prompt: '',
    name: '',
    industry: '',
    budget: 5000,
  });

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsGenerating(false);
    handleNext();
  };

  const handleCreate = async () => {
    setIsGenerating(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    toast.success('Company created successfully!');
    router.push('/comp-1'); // Replace with actual company ID
  };

  const toggleAgent = (role: string) => {
    setSelectedAgents((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  return (
    <div className="max-w-3xl mx-auto py-8">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                  i <= currentStep
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/30 text-muted-foreground'
                }`}
              >
                {i < currentStep ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <step.icon className="w-5 h-5" />
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`w-full h-0.5 mx-2 ${
                    i < currentStep ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                  style={{ width: '80px' }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold">{steps[currentStep].title}</h2>
        </div>
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {/* Step 1: Business Idea */}
          {currentStep === 0 && (
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium">Describe Your Business Idea</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    Tell us what you want to build. Our AI will create a business plan and suggest
                    the right team.
                  </p>
                </div>

                <textarea
                  value={formData.prompt}
                  onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                  placeholder="Example: I want to launch an online skincare brand targeting women aged 25-40. We'll sell through our website and social media, with a focus on natural ingredients..."
                  className="w-full h-40 p-4 rounded-lg border bg-background resize-none focus:ring-2 focus:ring-primary focus:border-primary"
                />

                <div className="flex flex-wrap gap-2">
                  {[
                    'E-commerce skincare brand',
                    'SaaS for creators',
                    'Marketing agency',
                    'Newsletter business',
                  ].map((example) => (
                    <button
                      key={example}
                      onClick={() => setFormData({ ...formData, prompt: example })}
                      className="px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-full transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>

                <Button
                  onClick={handleGeneratePlan}
                  className="w-full"
                  size="lg"
                  disabled={formData.prompt.length < 20 || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating Business Plan...
                    </>
                  ) : (
                    <>
                      Generate with AI
                      <Sparkles className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Company Details */}
          {currentStep === 1 && (
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Company Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="My AI Company"
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Industry</label>
                    <div className="grid grid-cols-3 gap-2 mt-1.5">
                      {industries.map((industry) => (
                        <button
                          key={industry}
                          onClick={() => setFormData({ ...formData, industry })}
                          className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                            formData.industry === industry
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-input hover:border-primary/50'
                          }`}
                        >
                          {industry}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Monthly Budget</label>
                    <div className="flex items-center gap-4 mt-1.5">
                      <div className="relative flex-1">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="number"
                          value={formData.budget}
                          onChange={(e) =>
                            setFormData({ ...formData, budget: parseInt(e.target.value) || 0 })
                          }
                          className="pl-9"
                        />
                      </div>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      This includes AI API costs and agent operations
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleBack} className="flex-1">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    onClick={handleNext}
                    className="flex-1"
                    disabled={!formData.name || !formData.industry}
                  >
                    Continue
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Select Agents */}
          {currentStep === 2 && (
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-medium">Select Your AI Team</h3>
                  <p className="text-muted-foreground text-sm">
                    Choose the agents that will run your company
                  </p>
                </div>

                <div className="space-y-3">
                  {suggestedAgents.map((agent) => (
                    <button
                      key={agent.role}
                      onClick={() => toggleAgent(agent.role)}
                      className={`w-full p-4 rounded-xl border text-left transition-all ${
                        selectedAgents.includes(agent.role)
                          ? 'border-primary bg-primary/5'
                          : 'border-input hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-3xl">{agent.avatar}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{agent.name}</span>
                            {selectedAgents.includes(agent.role) && (
                              <Badge variant="success">Selected</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {agent.description}
                          </p>
                        </div>
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            selectedAgents.includes(agent.role)
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground/30'
                          }`}
                        >
                          {selectedAgents.includes(agent.role) && (
                            <Check className="w-4 h-4 text-white" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleBack} className="flex-1">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    onClick={handleNext}
                    className="flex-1"
                    disabled={selectedAgents.length === 0}
                  >
                    Continue
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Review */}
          {currentStep === 3 && (
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="text-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-lg font-medium">Ready to Launch!</h3>
                  <p className="text-muted-foreground text-sm">
                    Review your company setup before creating
                  </p>
                </div>

                <div className="space-y-4 p-4 rounded-lg bg-muted/50">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Company Name</span>
                    <span className="font-medium">{formData.name || 'My AI Company'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Industry</span>
                    <span className="font-medium">{formData.industry}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monthly Budget</span>
                    <span className="font-medium">${formData.budget.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">AI Agents</span>
                    <span className="font-medium">{selectedAgents.length} agents</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {suggestedAgents
                    .filter((a) => selectedAgents.includes(a.role))
                    .map((agent) => (
                      <Badge key={agent.role} variant="secondary" className="gap-1">
                        <span>{agent.avatar}</span>
                        {agent.name}
                      </Badge>
                    ))}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleBack} className="flex-1">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    onClick={handleCreate}
                    className="flex-1"
                    variant="gradient"
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Launch Company
                        <Sparkles className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
