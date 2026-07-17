'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  Eye,
  Edit,
  Copy,
  CheckCircle2,
  Loader2,
  Sparkles,
  Shield,
  Smartphone,
  MapPin,
  Calendar,
  CreditCard,
  Headphones,
  Zap,
  Users,
  TrendingUp,
  MessageSquare,
  HelpCircle,
} from 'lucide-react';
import { useLandingPage } from '@/lib/api/hooks';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { toast } from 'sonner';
import { PublishDialog } from '@/components/landing-pages/publish-dialog';
import { BlockRenderer } from '@/components/landing-pages/blocks/block-renderer';

// Icon mapping for features
const iconMap: Record<string, React.ReactNode> = {
  'shield-check': <Shield className="w-6 h-6" />,
  smartphone: <Smartphone className="w-6 h-6" />,
  'map-pin': <MapPin className="w-6 h-6" />,
  calendar: <Calendar className="w-6 h-6" />,
  'credit-card': <CreditCard className="w-6 h-6" />,
  headphones: <Headphones className="w-6 h-6" />,
  zap: <Zap className="w-6 h-6" />,
  users: <Users className="w-6 h-6" />,
  'trending-up': <TrendingUp className="w-6 h-6" />,
  message: <MessageSquare className="w-6 h-6" />,
  help: <HelpCircle className="w-6 h-6" />,
};

const getIcon = (iconName: string) => {
  return iconMap[iconName] || <Sparkles className="w-6 h-6" />;
};

export default function LandingPagePreview() {
  const params = useParams();
  const router = useRouter();
  const pageId = params.pageId as string;
  const companyId = params.companyId as string;
  const [isGenerating, setIsGenerating] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);

  const { data: page, isLoading, error, refetch } = useLandingPage(pageId);

  const handleCopyUrl = () => {
    if (page?.status === 'published' && page.publishedUrl) {
      navigator.clipboard.writeText(page.publishedUrl);
      toast.success('URL copied to clipboard');
    } else {
      toast.info('Publish this page first to create a public URL.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-red-400 mb-4">Failed to load landing page</p>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  const primaryColor = page.primaryColor || '#3b82f6';
  const isWordPressDraft = page.status !== 'published'
    && page.deploymentProvider === 'wordpress'
    && !!(page.wordpressReviewUrl || page.publishedUrl);
  const wordpressDraftUrl = page.wordpressReviewUrl || page.publishedUrl;

  return (
    <div className="min-h-screen bg-background">
      {/* Preview Header */}
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/${companyId}/landing-pages`)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-foreground">{page.name}</h1>
              <Badge
                variant="outline"
                className={
                  page.status === 'published'
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                }
              >
                {page.status === 'published' ? (
                  <Globe className="w-3 h-3 mr-1" />
                ) : (
                  <Eye className="w-3 h-3 mr-1" />
                )}
                {isWordPressDraft ? 'WordPress draft' : page.status}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/${companyId}/landing-pages/${pageId}/edit`)}
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            {isWordPressDraft ? (
              <Button variant="outline" size="sm" asChild>
                <a href={wordpressDraftUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Review draft
                </a>
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={handleCopyUrl}>
                <Copy className="w-4 h-4 mr-2" />
                Copy URL
              </Button>
            )}
            {page.status !== 'generating' && page.status !== 'archived' && (
              <Button
                size="sm"
                onClick={() => setPublishDialogOpen(true)}
              >
                <Globe className="w-4 h-4 mr-2" />
                {page.status === 'published' ? 'Manage publishing' : 'Publish'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <PublishDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        pageId={pageId}
        companyId={companyId}
        onPublished={() => {
          refetch();
        }}
      />

      {/* Landing Page Preview */}
      <div className="bg-white text-gray-900">
        {/* Render sections */}
        {page.sections?.filter((section) => section.isVisible !== 0).map((section, index) => (
          <motion.div
            key={section.id || index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <BlockRenderer
              block={{
                id: section.id,
                type: section.type,
                content: section.content || {},
                order: section.order,
                isVisible: section.isVisible !== 0,
                backgroundColor: section.backgroundColor,
              }}
              primaryColor={primaryColor}
            />
          </motion.div>
        ))}

        {/* If no sections, auto-generate content via direct API */}
        {(!page.sections || page.sections.length === 0) && (
          <EmptyPageContent
            pageId={pageId}
            pageName={page.name}
            companyId={companyId}
            isGenerating={isGenerating}
            onGenerate={async () => {
              setIsGenerating(true);
              try {
                const token = useAuthStore.getState().token;
                if (!token) return;
                // Generate content for this page immediately
                await api.post(`/landing-pages/${pageId}/generate-content`, {}, { token });
                await refetch();
                setIsGenerating(false);
                toast.success('Content generated!');
              } catch {
                toast.error('Failed to generate content');
                setIsGenerating(false);
              }
            }}
            onRefetch={() => refetch()}
          />
        )}
      </div>
    </div>
  );
}

function EmptyPageContent({
  pageId,
  pageName,
  companyId,
  isGenerating,
  onGenerate,
  onRefetch,
}: {
  pageId: string;
  pageName: string;
  companyId: string;
  isGenerating: boolean;
  onGenerate: () => void;
  onRefetch: () => void;
}) {
  // Auto-trigger on mount
  useEffect(() => {
    // Small delay to prevent double-trigger
    const timer = setTimeout(() => {
      if (!isGenerating) {
        onGenerate();
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="py-20 text-center">
      {isGenerating ? (
        <>
          <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            AI is generating content...
          </h2>
          <p className="text-gray-500 mb-6">
            Creating sections for "{pageName}". This takes about 15 seconds.
          </p>
        </>
      ) : (
        <>
          <Sparkles className="w-12 h-12 mx-auto text-primary/40 mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Content is being prepared
          </h2>
          <p className="text-gray-500 mb-6">
            AI will generate content for this page automatically.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={onGenerate} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Generate Now
            </Button>
            <Button variant="outline" onClick={onRefetch}>
              Refresh
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function renderSection(section: any, primaryColor: string) {
  const content = section.content || {};

  switch (section.type) {
    case 'hero':
      return (
        <section
          className="py-20 px-4"
          style={{ background: `linear-gradient(135deg, ${primaryColor}15, ${primaryColor}05)` }}
        >
          <div className="container mx-auto max-w-4xl text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900">
              {content.headline || 'Welcome'}
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              {content.subheadline || 'Your compelling subheadline here'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                style={{ backgroundColor: primaryColor }}
                className="text-white hover:opacity-90"
              >
                {content.ctaText || 'Get Started'}
              </Button>
              {content.ctaSecondaryText && (
                <Button size="lg" variant="outline">
                  {content.ctaSecondaryText}
                </Button>
              )}
            </div>
          </div>
        </section>
      );

    case 'problem':
      return (
        <section className="py-16 px-4 bg-gray-50">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-3xl font-bold text-center mb-4 text-gray-900">
              {content.title || 'The Problem'}
            </h2>
            <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
              {content.description}
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              {content.painPoints?.map((point: any, i: number) => (
                <div key={i} className="p-6 bg-white rounded-lg shadow-sm border">
                  <h3 className="font-semibold text-lg mb-2 text-gray-900">
                    {point.title}
                  </h3>
                  <p className="text-gray-600">{point.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case 'solution':
      return (
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-3xl font-bold text-center mb-4 text-gray-900">
              {content.title || 'Our Solution'}
            </h2>
            <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
              {content.description}
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              {content.benefits?.map((benefit: any, i: number) => (
                <div key={i} className="flex gap-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{benefit.title}</h3>
                    <p className="text-gray-600 text-sm">{benefit.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case 'features':
      return (
        <section className="py-16 px-4 bg-gray-50">
          <div className="container mx-auto max-w-5xl">
            <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
              {content.title || 'Features'}
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {content.features?.map((feature: any, i: number) => (
                <div key={i} className="text-center">
                  <div
                    className="w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                  >
                    {getIcon(feature.icon)}
                  </div>
                  <h3 className="font-semibold text-lg mb-2 text-gray-900">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 text-sm">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case 'cta':
      return (
        <section
          className="py-20 px-4"
          style={{ backgroundColor: primaryColor }}
        >
          <div className="container mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold mb-4 text-white">
              {content.title || 'Ready to Get Started?'}
            </h2>
            <p className="text-white/80 mb-8">
              {content.description}
            </p>
            <Button
              size="lg"
              className="bg-white hover:bg-gray-100"
              style={{ color: primaryColor }}
            >
              {content.ctaText || 'Get Started Today'}
            </Button>
          </div>
        </section>
      );

    case 'testimonials':
      return (
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-5xl">
            <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
              {content.title || 'What Our Customers Say'}
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {content.testimonials?.map((testimonial: any, i: number) => (
                <div key={i} className="p-6 bg-gray-50 rounded-lg">
                  <p className="text-gray-600 italic mb-4">"{testimonial.quote}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-300" />
                    <div>
                      <p className="font-semibold text-gray-900">{testimonial.name}</p>
                      <p className="text-sm text-gray-500">{testimonial.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case 'pricing':
      return (
        <section className="py-16 px-4 bg-gray-50">
          <div className="container mx-auto max-w-5xl">
            <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
              {content.title || 'Pricing'}
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {content.plans?.map((plan: any, i: number) => (
                <div
                  key={i}
                  className={`p-6 rounded-lg border ${
                    plan.featured ? 'border-2 bg-white shadow-lg' : 'bg-white'
                  }`}
                  style={{ borderColor: plan.featured ? primaryColor : undefined }}
                >
                  {plan.featured && (
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
                    >
                      Most Popular
                    </span>
                  )}
                  <h3 className="text-xl font-bold mt-4 text-gray-900">{plan.name}</h3>
                  <p className="text-3xl font-bold my-4" style={{ color: primaryColor }}>
                    {plan.price}
                  </p>
                  <ul className="space-y-2 mb-6">
                    {plan.features?.map((feature: string, j: number) => (
                      <li key={j} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle2 className="w-4 h-4" style={{ color: primaryColor }} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    style={plan.featured ? { backgroundColor: primaryColor } : undefined}
                    variant={plan.featured ? 'default' : 'outline'}
                  >
                    {plan.ctaText || 'Get Started'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case 'faq':
      return (
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
              {content.title || 'Frequently Asked Questions'}
            </h2>
            <div className="space-y-4">
              {content.questions?.map((faq: any, i: number) => (
                <div key={i} className="p-4 border rounded-lg">
                  <h3 className="font-semibold text-gray-900">{faq.question}</h3>
                  <p className="text-gray-600 mt-2">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    default:
      return null;
  }
}
