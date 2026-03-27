'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useCreateCompany } from '@/lib/api/hooks';
import { toast } from 'sonner';
import {
  Building2,
  Users,
  Target,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Briefcase,
  ShoppingBag,
  Code,
  Megaphone,
  HeartPulse,
  GraduationCap,
  Utensils,
  Plane,
} from 'lucide-react';

const industries = [
  { id: 'marketing', name: 'Marketing & Advertising', icon: Megaphone, color: '#3b82f6' },
  { id: 'ecommerce', name: 'E-commerce & Retail', icon: ShoppingBag, color: '#10b981' },
  { id: 'technology', name: 'Technology & SaaS', icon: Code, color: '#8b5cf6' },
  { id: 'consulting', name: 'Consulting & Services', icon: Briefcase, color: '#f59e0b' },
  { id: 'healthcare', name: 'Healthcare & Wellness', icon: HeartPulse, color: '#ef4444' },
  { id: 'education', name: 'Education & Training', icon: GraduationCap, color: '#06b6d4' },
  { id: 'food', name: 'Food & Hospitality', icon: Utensils, color: '#ec4899' },
  { id: 'travel', name: 'Travel & Tourism', icon: Plane, color: '#14b8a6' },
];

const teamSizes = [
  { id: 'solo', name: 'Just me', description: 'Solopreneur or freelancer' },
  { id: 'small', name: '2-10 people', description: 'Small team' },
  { id: 'medium', name: '11-50 people', description: 'Growing company' },
  { id: 'large', name: '50+ people', description: 'Established business' },
];

const goals = [
  { id: 'marketing', name: 'Automate Marketing', description: 'Content, social media, ads' },
  { id: 'sales', name: 'Boost Sales', description: 'Lead generation, outreach' },
  { id: 'support', name: 'Customer Support', description: '24/7 AI assistance' },
  { id: 'operations', name: 'Streamline Operations', description: 'Internal processes' },
  { id: 'analytics', name: 'Data & Analytics', description: 'Insights and reporting' },
  { id: 'content', name: 'Content Creation', description: 'Blogs, videos, copy' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const createCompany = useCreateCompany();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    companyName: '',
    industry: '',
    teamSize: '',
    goals: [] as string[],
    monthlyBudget: 500,
  });

  const totalSteps = 4;

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

  const handleComplete = async () => {
    try {
      const company = await createCompany.mutateAsync({
        name: formData.companyName,
        industry: formData.industry,
        description: `${formData.teamSize} team focused on ${formData.goals.join(', ')}`,
      });

      toast.success('Company created! Setting up your AI team...');
      router.push(`/${company.id}/dashboard`);
    } catch (error) {
      toast.error('Failed to create company');
    }
  };

  const toggleGoal = (goalId: string) => {
    setFormData((prev) => ({
      ...prev,
      goals: prev.goals.includes(goalId)
        ? prev.goals.filter((g) => g !== goalId)
        : [...prev.goals, goalId],
    }));
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.companyName.length >= 2;
      case 2:
        return formData.industry !== '';
      case 3:
        return formData.teamSize !== '';
      case 4:
        return formData.goals.length > 0;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
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

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Step 1: Company Name */}
            {step === 1 && (
              <Card className="border-0 shadow-xl">
                <CardContent className="p-8">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Building2 className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">What's your company name?</h1>
                    <p className="text-muted-foreground">This is how your AI team will identify your business</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="companyName">Company Name</Label>
                      <Input
                        id="companyName"
                        placeholder="e.g., Acme Corp"
                        value={formData.companyName}
                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                        className="mt-2 h-12 text-lg"
                        autoFocus
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Industry */}
            {step === 2 && (
              <Card className="border-0 shadow-xl">
                <CardContent className="p-8">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Briefcase className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">What industry are you in?</h1>
                    <p className="text-muted-foreground">We'll customize your AI agents based on your industry</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {industries.map((industry) => {
                      const Icon = industry.icon;
                      const isSelected = formData.industry === industry.id;
                      return (
                        <button
                          key={industry.id}
                          onClick={() => setFormData({ ...formData, industry: industry.id })}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <Icon
                            className="w-6 h-6 mb-2"
                            style={{ color: isSelected ? industry.color : undefined }}
                          />
                          <p className="font-medium">{industry.name}</p>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Team Size */}
            {step === 3 && (
              <Card className="border-0 shadow-xl">
                <CardContent className="p-8">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Users className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">How big is your team?</h1>
                    <p className="text-muted-foreground">This helps us recommend the right AI workforce</p>
                  </div>

                  <div className="space-y-3">
                    {teamSizes.map((size) => {
                      const isSelected = formData.teamSize === size.id;
                      return (
                        <button
                          key={size.id}
                          onClick={() => setFormData({ ...formData, teamSize: size.id })}
                          className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center justify-between ${
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <div>
                            <p className="font-medium">{size.name}</p>
                            <p className="text-sm text-muted-foreground">{size.description}</p>
                          </div>
                          {isSelected && <Check className="w-5 h-5 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Goals */}
            {step === 4 && (
              <Card className="border-0 shadow-xl">
                <CardContent className="p-8">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Target className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">What do you want to achieve?</h1>
                    <p className="text-muted-foreground">Select all that apply - we'll build your perfect AI team</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {goals.map((goal) => {
                      const isSelected = formData.goals.includes(goal.id);
                      return (
                        <button
                          key={goal.id}
                          onClick={() => toggleGoal(goal.id)}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">{goal.name}</p>
                              <p className="text-sm text-muted-foreground">{goal.description}</p>
                            </div>
                            {isSelected && <Check className="w-5 h-5 text-primary flex-shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
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
              onClick={handleComplete}
              disabled={!canProceed() || createCompany.isPending}
              className="gap-2 bg-gradient-to-r from-primary to-purple-500"
            >
              {createCompany.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Launch My AI Company
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
