'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
  Target,
  Palette,
  LayoutGrid,
  FileText,
  Zap,
  Upload,
  X,
  ImageIcon,
  Plus,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

interface PageGeneratorWizardProps {
  companyName?: string;
  companyIndustry?: string;
  onGenerate: (config: PageConfig) => void;
  onCancel: () => void;
  isGenerating: boolean;
}

export interface PageConfig {
  // Step 1: Business
  productDescription: string;
  targetAudience: string;
  valueProposition: string;
  // Step 2: Media (new)
  // (images passed separately via extra fields)
  // Step 3: Goal
  conversionGoal: string;
  // Step 4: Style
  tone: string;
  visualStyle: string;
  primaryColor: string;
  // Step 5: Sections
  sections: string[];
  // Step 6: Content
  contentLength: string;
  // New fields
  language: string;
  attachmentText?: string;
  images?: Array<{ url: string; role: string; alt: string }>;
}

const STEPS = [
  { id: 1, label: 'Business', icon: Target },
  { id: 2, label: 'Media', icon: ImageIcon },
  { id: 3, label: 'Goal', icon: Zap },
  { id: 4, label: 'Style', icon: Palette },
  { id: 5, label: 'Sections', icon: LayoutGrid },
  { id: 6, label: 'Content', icon: FileText },
];

const GOALS = [
  { value: 'leads', label: 'Collect Leads', desc: 'Email signup, contact form' },
  { value: 'sales', label: 'Sell Product', desc: 'Direct purchase, pricing page' },
  { value: 'booking', label: 'Book Calls', desc: 'Schedule meetings, consultations' },
  { value: 'signup', label: 'App Signup', desc: 'Free trial, SaaS registration' },
  { value: 'awareness', label: 'Brand Awareness', desc: 'Informational, trust building' },
];

const TONES = [
  { value: 'professional', label: 'Professional', emoji: '👔' },
  { value: 'friendly', label: 'Friendly', emoji: '😊' },
  { value: 'bold', label: 'Bold', emoji: '🔥' },
  { value: 'playful', label: 'Playful', emoji: '🎮' },
  { value: 'luxury', label: 'Luxury', emoji: '✨' },
];

const VISUAL_STYLES = [
  { value: 'modern', label: 'Modern' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'startup', label: 'Startup' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'creative', label: 'Creative' },
];

const SECTIONS = [
  { value: 'hero', label: 'Hero Banner', desc: 'Main headline + CTA', required: true },
  { value: 'problem', label: 'Problem', desc: 'Pain points your audience faces' },
  { value: 'solution', label: 'Solution', desc: 'How you solve the problem' },
  { value: 'features', label: 'Features', desc: 'Key features or benefits' },
  { value: 'testimonials', label: 'Testimonials', desc: 'Customer reviews and social proof' },
  { value: 'pricing', label: 'Pricing', desc: 'Plans and pricing table' },
  { value: 'faq', label: 'FAQ', desc: 'Common questions answered' },
  { value: 'cta', label: 'Final CTA', desc: 'Bottom call-to-action', required: true },
];

const CONTENT_LENGTHS = [
  { value: 'short', label: 'Short', desc: 'Quick and punchy — best for simple offers', lines: '~3 sections' },
  { value: 'medium', label: 'Medium', desc: 'Balanced — good for most businesses', lines: '~5 sections' },
  { value: 'long', label: 'Long', desc: 'Detailed — best for high-ticket or complex products', lines: '~7 sections' },
];

const TOTAL_STEPS = STEPS.length;

export function PageGeneratorWizard({
  companyName,
  companyIndustry,
  onGenerate,
  onCancel,
  isGenerating,
}: PageGeneratorWizardProps) {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);

  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<PageConfig>({
    productDescription: '',
    targetAudience: '',
    valueProposition: '',
    conversionGoal: 'leads',
    tone: 'professional',
    visualStyle: 'modern',
    primaryColor: '#3b82f6',
    sections: ['hero', 'problem', 'solution', 'features', 'cta'],
    contentLength: 'medium',
    language: 'en',
  });

  // Document attachment state
  const [attachedDoc, setAttachedDoc] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Language state
  const [language, setLanguage] = useState('en');

  // Image upload state
  const [heroImage, setHeroImage] = useState<{ url: string; role: string; alt: string } | null>(null);
  const [featureImages, setFeatureImages] = useState<Array<{ url: string; role: string; alt: string } | null>>([null, null, null]);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const featureInputRefs = useRef<Array<HTMLInputElement | null>>([null, null, null]);

  const updateConfig = (key: keyof PageConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSection = (section: string) => {
    const required = SECTIONS.find((s) => s.value === section)?.required;
    if (required) return;
    setConfig((prev) => ({
      ...prev,
      sections: prev.sections.includes(section)
        ? prev.sections.filter((s) => s !== section)
        : [...prev.sections, section],
    }));
  };

  const canProceed = () => {
    if (step === 1) return config.productDescription.length >= 10;
    return true;
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      // Build images array
      const images = [
        heroImage && { url: heroImage.url, role: 'hero', alt: heroImage.alt },
        ...featureImages.filter(Boolean).map(img => ({ url: img!.url, role: 'feature', alt: img!.alt })),
      ].filter(Boolean) as Array<{ url: string; role: string; alt: string }>;

      onGenerate({
        ...config,
        language,
        attachmentText: extractedText || undefined,
        images: images.length > 0 ? images : undefined,
      });
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setAttachedDoc(file);
    setIsExtracting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1'}/landing-pages/company/${companyId}/extract-document`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      const data = await res.json();
      if (data.text) {
        setExtractedText(data.text);
        toast.success(`Document read: ${data.charCount} characters extracted`);
      }
    } catch {
      toast.error('Could not read document');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, role: string, idx?: number) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name.replace(/\.[^/.]+$/, ''));

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1'}/assets-library/company/${companyId}/upload`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      const data = await res.json();
      if (data.url) {
        const imageData = { url: data.url, role, alt: file.name };
        if (role === 'hero') {
          setHeroImage(imageData);
        } else if (role === 'feature' && idx !== undefined) {
          setFeatureImages(prev => {
            const next = [...prev];
            next[idx] = imageData;
            return next;
          });
        }
        toast.success('Image uploaded');
      }
    } catch {
      toast.error('Upload failed');
    }
  };

  const removeFeatureImage = (idx: number) => {
    setFeatureImages(prev => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-between px-2">
        {STEPS.map((s, i) => {
          const StepIcon = s.icon;
          const isActive = step === s.id;
          const isDone = step > s.id;
          return (
            <div key={s.id} className="flex items-center gap-1.5">
              <button
                onClick={() => s.id < step && setStep(s.id)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all ${
                  isActive ? 'bg-primary text-primary-foreground' :
                  isDone ? 'bg-primary/10 text-primary cursor-pointer' :
                  'text-muted-foreground'
                }`}
              >
                {isDone ? <Check className="w-3 h-3" /> : <StepIcon className="w-3 h-3" />}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`w-6 h-px ${isDone ? 'bg-primary' : 'bg-border'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="min-h-[280px]"
        >
          {/* STEP 1: Business Basics */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-1">Tell us about your business</h3>
                <p className="text-sm text-muted-foreground">AI will craft content specifically for your audience</p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label>What do you offer?</Label>
                  <Textarea
                    value={config.productDescription}
                    onChange={(e) => updateConfig('productDescription', e.target.value)}
                    placeholder={companyIndustry ? `e.g. ${companyIndustry} services...` : 'e.g. Online coding courses for kids aged 6-15...'}
                    className="mt-1"
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Who is it for?</Label>
                  <Input
                    value={config.targetAudience}
                    onChange={(e) => updateConfig('targetAudience', e.target.value)}
                    placeholder="e.g. Parents with school-age children"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Why should they choose you?</Label>
                  <Input
                    value={config.valueProposition}
                    onChange={(e) => updateConfig('valueProposition', e.target.value)}
                    placeholder="e.g. Learn coding through fun projects, not boring lectures"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Document Attachment */}
              <div className="space-y-2 pt-3 border-t">
                <Label>Attach product document (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Upload a PDF, DOC, or text file — AI will use its content to create a better page
                </p>
                <div
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/30 transition-colors"
                  onClick={() => docInputRef.current?.click()}
                >
                  {attachedDoc ? (
                    <div className="flex items-center gap-2 justify-center">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">{attachedDoc.name}</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); setAttachedDoc(null); setExtractedText(''); }}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">Drop file here or click to browse</p>
                    </div>
                  )}
                </div>
                <input
                  ref={docInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.md"
                  className="hidden"
                  onChange={handleDocUpload}
                />
                {isExtracting && (
                  <p className="text-xs text-primary flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Reading document...
                  </p>
                )}
              </div>

              {/* Language Selector */}
              <div className="space-y-2">
                <Label>Page Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="vi">Tiếng Việt</SelectItem>
                    <SelectItem value="ja">日本語</SelectItem>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="ko">한국어</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* STEP 2: Media Upload */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-1">Add product images</h3>
                <p className="text-sm text-muted-foreground">
                  These will be placed in your page layout. You can skip this step.
                </p>
              </div>

              {/* Hero Image */}
              <div className="space-y-2">
                <Label>Main hero image</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/30 transition-colors aspect-video flex items-center justify-center"
                  onClick={() => heroInputRef.current?.click()}
                >
                  {heroImage ? (
                    <div className="relative w-full h-full">
                      <img src={heroImage.url} alt="Hero" className="w-full h-full object-cover rounded" />
                      <Button size="sm" variant="destructive" className="absolute top-1 right-1 h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); setHeroImage(null); }}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <ImageIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Click to upload hero image</p>
                    </div>
                  )}
                </div>
                <input ref={heroInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'hero')} />
              </div>

              {/* Feature Images */}
              <div className="space-y-2">
                <Label>Feature images (optional)</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((idx) => (
                    <div
                      key={idx}
                      className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary/30 transition-colors aspect-square flex items-center justify-center"
                      onClick={() => featureInputRefs.current[idx]?.click()}
                    >
                      {featureImages[idx] ? (
                        <div className="relative w-full h-full">
                          <img src={featureImages[idx]!.url} alt="" className="w-full h-full object-cover rounded" />
                          <Button size="sm" variant="destructive" className="absolute top-0 right-0 h-5 w-5 p-0" onClick={(e) => { e.stopPropagation(); removeFeatureImage(idx); }}>
                            <X className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      ) : (
                        <div>
                          <Plus className="w-5 h-5 text-muted-foreground mx-auto" />
                          <p className="text-[10px] text-muted-foreground mt-1">Feature {idx + 1}</p>
                        </div>
                      )}
                      <input ref={(el) => { featureInputRefs.current[idx] = el; }} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'feature', idx)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Conversion Goal */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-1">What's the page goal?</h3>
                <p className="text-sm text-muted-foreground">This shapes the CTA and page structure</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {GOALS.map((goal) => (
                  <button
                    key={goal.value}
                    onClick={() => updateConfig('conversionGoal', goal.value)}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                      config.conversionGoal === goal.value
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      config.conversionGoal === goal.value ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                    }`}>
                      {config.conversionGoal === goal.value && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{goal.label}</p>
                      <p className="text-xs text-muted-foreground">{goal.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: Brand Style */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-1">How should it look & feel?</h3>
                <p className="text-sm text-muted-foreground">Sets the tone and visual direction</p>
              </div>
              <div>
                <Label className="mb-2 block">Tone of voice</Label>
                <div className="flex flex-wrap gap-2">
                  {TONES.map((tone) => (
                    <button
                      key={tone.value}
                      onClick={() => updateConfig('tone', tone.value)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        config.tone === tone.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      {tone.emoji} {tone.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Visual style</Label>
                <div className="flex flex-wrap gap-2">
                  {VISUAL_STYLES.map((style) => (
                    <button
                      key={style.value}
                      onClick={() => updateConfig('visualStyle', style.value)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        config.visualStyle === style.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Brand color</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={config.primaryColor}
                    onChange={(e) => updateConfig('primaryColor', e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border"
                  />
                  <div className="flex gap-2">
                    {['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'].map((c) => (
                      <button
                        key={c}
                        onClick={() => updateConfig('primaryColor', c)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          config.primaryColor === c ? 'border-foreground scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Section Selection */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-1">Choose page sections</h3>
                <p className="text-sm text-muted-foreground">Select which sections to include</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SECTIONS.map((section) => {
                  const selected = config.sections.includes(section.value);
                  return (
                    <button
                      key={section.value}
                      onClick={() => toggleSection(section.value)}
                      disabled={section.required}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        selected
                          ? 'border-primary bg-primary/5'
                          : 'border-transparent bg-muted/50 hover:bg-muted'
                      } ${section.required ? 'opacity-80' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-sm">{section.label}</p>
                        {section.required && <Badge variant="secondary" className="text-[10px]">Required</Badge>}
                        {selected && !section.required && <Check className="w-4 h-4 text-primary" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{section.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 6: Content Length */}
          {step === 6 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-1">Content depth</h3>
                <p className="text-sm text-muted-foreground">How much detail should AI generate?</p>
              </div>
              <div className="space-y-2">
                {CONTENT_LENGTHS.map((len) => (
                  <button
                    key={len.value}
                    onClick={() => updateConfig('contentLength', len.value)}
                    className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all ${
                      config.contentLength === len.value
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      config.contentLength === len.value ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                    }`}>
                      {config.contentLength === len.value && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <p className="font-medium">{len.label}</p>
                      <p className="text-xs text-muted-foreground">{len.desc} · {len.lines}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Summary */}
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium mb-1">Summary:</p>
                <p className="text-muted-foreground">
                  {config.tone} · {config.visualStyle} · {config.sections.length} sections · {config.contentLength} copy · Goal: {config.conversionGoal}
                  {heroImage ? ' · Hero image added' : ''}
                  {featureImages.filter(Boolean).length > 0 ? ` · ${featureImages.filter(Boolean).length} feature image(s)` : ''}
                  {extractedText ? ' · Document attached' : ''}
                  {language !== 'en' ? ` · Language: ${language}` : ''}
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t">
        <div>
          {step > 1 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          )}
        </div>
        <Button onClick={handleNext} disabled={!canProceed() || isGenerating} className="gap-2">
          {isGenerating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
          ) : step < TOTAL_STEPS ? (
            <>Next <ArrowRight className="w-4 h-4" /></>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate Page</>
          )}
        </Button>
      </div>
    </div>
  );
}
