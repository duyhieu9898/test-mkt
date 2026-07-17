/**
 * Block Registry
 *
 * Central registry for all available block types
 */

import type {
  BlockType,
  BlockDefinition,
  HeroContent,
  ProblemContent,
  SolutionContent,
  FeaturesContent,
  TestimonialsContent,
  PricingContent,
  FAQContent,
  CTAContent,
  ImageContent,
  FooterContent,
} from './types';
import {
  BlockTypeEnum,
  heroContentSchema,
  problemContentSchema,
  solutionContentSchema,
  featuresContentSchema,
  testimonialsContentSchema,
  pricingContentSchema,
  faqContentSchema,
  ctaContentSchema,
  imageContentSchema,
  footerContentSchema,
  customContentSchema,
} from './types';

// =============================================================================
// DEFAULT CONTENT
// =============================================================================

const defaultHeroContent: HeroContent = {
  headline: 'Welcome to Our Platform',
  subheadline: 'The best solution for your business needs',
  ctaText: 'Get Started',
  ctaUrl: '#signup',
  ctaOpenInNewTab: false,
  ctaSecondaryText: 'Learn More',
  ctaSecondaryUrl: '#features',
  ctaSecondaryOpenInNewTab: false,
  alignment: 'center',
};

const defaultProblemContent: ProblemContent = {
  title: 'The Problem',
  description: 'Many businesses face common challenges that slow down growth.',
  painPoints: [
    { title: 'Time Consuming', description: 'Manual processes waste valuable time' },
    { title: 'Expensive', description: 'High costs eat into your profits' },
    { title: 'Inefficient', description: 'Outdated methods limit productivity' },
    { title: 'Frustrating', description: 'Poor tools lead to team burnout' },
  ],
};

const defaultSolutionContent: SolutionContent = {
  title: 'Our Solution',
  description: 'We provide the tools you need to overcome these challenges.',
  benefits: [
    { title: 'Save Time', description: 'Automate repetitive tasks' },
    { title: 'Reduce Costs', description: 'Cut expenses by up to 50%' },
    { title: 'Boost Productivity', description: 'Work smarter, not harder' },
    { title: 'Stay Happy', description: 'Enjoy work with better tools' },
  ],
};

const defaultFeaturesContent: FeaturesContent = {
  title: 'Features',
  subtitle: 'Everything you need to succeed',
  features: [
    { title: 'Feature 1', description: 'Description of the first feature', icon: 'zap' },
    { title: 'Feature 2', description: 'Description of the second feature', icon: 'shield-check' },
    { title: 'Feature 3', description: 'Description of the third feature', icon: 'trending-up' },
  ],
  layout: 'grid',
  columns: 3,
};

const defaultTestimonialsContent: TestimonialsContent = {
  title: 'What Our Customers Say',
  subtitle: 'Join thousands of satisfied users',
  testimonials: [
    {
      name: 'John Doe',
      role: 'CEO',
      company: 'Acme Inc',
      quote: 'This product transformed our business. Highly recommended!',
      rating: 5,
    },
    {
      name: 'Jane Smith',
      role: 'CTO',
      company: 'Tech Corp',
      quote: 'The best solution we have ever used. Amazing support team.',
      rating: 5,
    },
    {
      name: 'Bob Johnson',
      role: 'Manager',
      company: 'StartupXYZ',
      quote: 'Easy to use and incredibly powerful. A game changer.',
      rating: 5,
    },
  ],
  layout: 'grid',
};

const defaultPricingContent: PricingContent = {
  title: 'Simple, Transparent Pricing',
  subtitle: 'Choose the plan that fits your needs',
  plans: [
    {
      name: 'Starter',
      price: '$9',
      period: '/month',
      description: 'Perfect for individuals',
      features: ['Up to 5 projects', 'Basic analytics', 'Email support'],
      ctaText: 'Start Free Trial',
      ctaOpenInNewTab: false,
      featured: false,
    },
    {
      name: 'Pro',
      price: '$29',
      period: '/month',
      description: 'Best for growing teams',
      features: ['Unlimited projects', 'Advanced analytics', 'Priority support', 'Team collaboration'],
      ctaText: 'Start Free Trial',
      ctaOpenInNewTab: false,
      featured: true,
      badge: 'Most Popular',
    },
    {
      name: 'Enterprise',
      price: '$99',
      period: '/month',
      description: 'For large organizations',
      features: ['Everything in Pro', 'Custom integrations', 'Dedicated support', 'SLA guarantee'],
      ctaText: 'Contact Sales',
      ctaOpenInNewTab: false,
      featured: false,
    },
  ],
  showAnnualToggle: false,
};

const defaultFAQContent: FAQContent = {
  title: 'Frequently Asked Questions',
  subtitle: 'Find answers to common questions',
  questions: [
    {
      question: 'How do I get started?',
      answer: 'Simply sign up for a free account and follow the onboarding process.',
    },
    {
      question: 'Is there a free trial?',
      answer: 'Yes, we offer a 14-day free trial with all features included.',
    },
    {
      question: 'Can I cancel anytime?',
      answer: 'Absolutely. No contracts, no hidden fees. Cancel with one click.',
    },
  ],
  layout: 'accordion',
};

const defaultCTAContent: CTAContent = {
  title: 'Ready to Get Started?',
  description: 'Join thousands of satisfied customers today.',
  ctaText: 'Start Free Trial',
  ctaUrl: '#signup',
  ctaOpenInNewTab: false,
  ctaSecondaryOpenInNewTab: false,
  showEmailCapture: false,
};

const defaultImageContent: ImageContent = {
  url: '',
  alt: '',
  caption: '',
  linkUrl: '',
  openInNewTab: false,
  aspectRatio: 'wide',
  fit: 'cover',
};

const defaultFooterContent: FooterContent = {
  companyName: 'Company Name',
  tagline: 'Building the future, today.',
  linkGroups: [
    {
      title: 'Product',
      links: [
        { label: 'Features', url: '#features' },
        { label: 'Pricing', url: '#pricing' },
        { label: 'FAQ', url: '#faq' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About', url: '#about' },
        { label: 'Blog', url: '#blog' },
        { label: 'Careers', url: '#careers' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy', url: '/privacy' },
        { label: 'Terms', url: '/terms' },
      ],
    },
  ],
  socialLinks: [
    { platform: 'twitter', url: 'https://twitter.com' },
    { platform: 'linkedin', url: 'https://linkedin.com' },
  ],
  showNewsletter: false,
};

// =============================================================================
// BLOCK DEFINITIONS
// =============================================================================

export const blockDefinitions: Record<BlockType, BlockDefinition> = {
  [BlockTypeEnum.HERO]: {
    type: BlockTypeEnum.HERO,
    name: 'Hero',
    description: 'Main headline section with call-to-action',
    icon: 'layout-template',
    category: 'header',
    defaultContent: defaultHeroContent,
    schema: heroContentSchema,
  },
  [BlockTypeEnum.PROBLEM]: {
    type: BlockTypeEnum.PROBLEM,
    name: 'Problem',
    description: 'Highlight pain points your audience faces',
    icon: 'alert-triangle',
    category: 'content',
    defaultContent: defaultProblemContent,
    schema: problemContentSchema,
  },
  [BlockTypeEnum.SOLUTION]: {
    type: BlockTypeEnum.SOLUTION,
    name: 'Solution',
    description: 'Present your solution and benefits',
    icon: 'lightbulb',
    category: 'content',
    defaultContent: defaultSolutionContent,
    schema: solutionContentSchema,
  },
  [BlockTypeEnum.FEATURES]: {
    type: BlockTypeEnum.FEATURES,
    name: 'Features',
    description: 'Showcase your product features',
    icon: 'grid-3x3',
    category: 'content',
    defaultContent: defaultFeaturesContent,
    schema: featuresContentSchema,
  },
  [BlockTypeEnum.TESTIMONIALS]: {
    type: BlockTypeEnum.TESTIMONIALS,
    name: 'Testimonials',
    description: 'Display customer testimonials',
    icon: 'message-square-quote',
    category: 'social-proof',
    defaultContent: defaultTestimonialsContent,
    schema: testimonialsContentSchema,
  },
  [BlockTypeEnum.PRICING]: {
    type: BlockTypeEnum.PRICING,
    name: 'Pricing',
    description: 'Show your pricing plans',
    icon: 'credit-card',
    category: 'conversion',
    defaultContent: defaultPricingContent,
    schema: pricingContentSchema,
  },
  [BlockTypeEnum.FAQ]: {
    type: BlockTypeEnum.FAQ,
    name: 'FAQ',
    description: 'Answer frequently asked questions',
    icon: 'help-circle',
    category: 'content',
    defaultContent: defaultFAQContent,
    schema: faqContentSchema,
  },
  [BlockTypeEnum.CTA]: {
    type: BlockTypeEnum.CTA,
    name: 'Call to Action',
    description: 'Encourage users to take action',
    icon: 'megaphone',
    category: 'conversion',
    defaultContent: defaultCTAContent,
    schema: ctaContentSchema,
  },
  [BlockTypeEnum.IMAGE]: {
    type: BlockTypeEnum.IMAGE,
    name: 'Image',
    description: 'Add a visual from your media library',
    icon: 'image',
    category: 'content',
    defaultContent: defaultImageContent,
    schema: imageContentSchema,
  },
  [BlockTypeEnum.FOOTER]: {
    type: BlockTypeEnum.FOOTER,
    name: 'Footer',
    description: 'Page footer with links',
    icon: 'panel-bottom',
    category: 'footer',
    defaultContent: defaultFooterContent,
    schema: footerContentSchema,
  },
  [BlockTypeEnum.CUSTOM]: {
    type: BlockTypeEnum.CUSTOM,
    name: 'Custom',
    description: 'Custom HTML block',
    icon: 'code',
    category: 'content',
    defaultContent: { html: '', css: '' },
    schema: customContentSchema,
  },
};

// =============================================================================
// HELPERS
// =============================================================================

export function getBlockDefinition(type: BlockType): BlockDefinition {
  return blockDefinitions[type];
}

export function getBlocksByCategory(category: BlockDefinition['category']): BlockDefinition[] {
  return Object.values(blockDefinitions).filter((def) => def.category === category);
}

export function getAllBlockTypes(): BlockType[] {
  return Object.keys(blockDefinitions) as BlockType[];
}

export function createDefaultBlock(type: BlockType, order: number): {
  type: BlockType;
  content: unknown;
  order: number;
  isVisible: boolean;
} {
  const definition = getBlockDefinition(type);
  return {
    type,
    content: structuredClone(definition.defaultContent),
    order,
    isVisible: true,
  };
}

// Category ordering for the sidebar
export const categoryOrder: BlockDefinition['category'][] = [
  'header',
  'content',
  'social-proof',
  'conversion',
  'footer',
];

export const categoryLabels: Record<BlockDefinition['category'], string> = {
  header: 'Header',
  content: 'Content',
  'social-proof': 'Social Proof',
  conversion: 'Conversion',
  footer: 'Footer',
};
