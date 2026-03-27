import type { FTUXAgent, FTUXStrategy, DetectedInfo } from './types';

export type BusinessType = 'fashion' | 'saas' | 'agency' | 'ecommerce' | 'content' | 'default';

interface BusinessTemplate {
  detectedInfo: DetectedInfo;
  agents: FTUXAgent[];
  strategy: FTUXStrategy;
}

export const EXAMPLE_IDEAS = [
  'AI content agency for startups',
  'SaaS for restaurant management',
  'Fitness coaching platform',
  'Online education platform',
  'stripe.com',
  'shopify.com',
];

const templates: Record<BusinessType, BusinessTemplate> = {
  fashion: {
    detectedInfo: {
      market: 'Fashion & Apparel',
      model: 'D2C E-commerce',
      strategy: 'Brand-first, Social-driven',
    },
    agents: [
      {
        id: 'ceo-1',
        name: 'Sarah Chen',
        role: 'ceo',
        title: 'CEO',
        emoji: '👔',
        color: '#8b5cf6',
        responsibilities: ['Strategic vision', 'Brand partnerships', 'Growth strategy'],
      },
      {
        id: 'marketing-1',
        name: 'Alex Rivera',
        role: 'marketing_manager',
        title: 'Marketing Manager',
        emoji: '📈',
        color: '#3b82f6',
        supervisorId: 'ceo-1',
        responsibilities: ['Campaign strategy', 'Brand voice', 'Social media'],
      },
      {
        id: 'content-1',
        name: 'Casey Taylor',
        role: 'content_creator',
        title: 'Content Creator',
        emoji: '✍️',
        color: '#10b981',
        supervisorId: 'marketing-1',
        responsibilities: ['Visual content', 'Copywriting', 'Influencer content'],
      },
      {
        id: 'ads-1',
        name: 'Jordan Kim',
        role: 'ads_specialist',
        title: 'Ads Specialist',
        emoji: '🎯',
        color: '#f59e0b',
        supervisorId: 'marketing-1',
        responsibilities: ['Paid social', 'Google Ads', 'Retargeting'],
      },
    ],
    strategy: {
      vision: 'Build a recognizable sustainable fashion brand that resonates with Gen Z',
      days: [
        { day: 1, title: 'Brand Foundation', activities: ['Define brand identity and values', 'Set up social media accounts', 'Create brand guidelines'] },
        { day: 2, title: 'Content Setup', activities: ['Design content calendar', 'Create visual templates', 'Plan first photo shoot'] },
        { day: 3, title: 'Marketing Launch', activities: ['Set up Meta ads account', 'Create initial ad campaigns', 'Launch organic social'] },
        { day: '4-5', title: 'Outreach & Engagement', activities: ['Begin influencer outreach', 'Community engagement', 'User-generated content strategy'] },
        { day: '6-7', title: 'Optimization', activities: ['Analyze first week metrics', 'A/B test ad creatives', 'Refine targeting'] },
      ],
    },
  },
  saas: {
    detectedInfo: {
      market: 'Technology & Software',
      model: 'SaaS Subscription',
      strategy: 'Product-led Growth',
    },
    agents: [
      {
        id: 'ceo-1',
        name: 'Michael Chen',
        role: 'ceo',
        title: 'CEO',
        emoji: '👔',
        color: '#8b5cf6',
        responsibilities: ['Product vision', 'Go-to-market strategy', 'Investor relations'],
      },
      {
        id: 'marketing-1',
        name: 'Emma Wilson',
        role: 'marketing_manager',
        title: 'Marketing Manager',
        emoji: '📈',
        color: '#3b82f6',
        supervisorId: 'ceo-1',
        responsibilities: ['Demand generation', 'Content marketing', 'SEO strategy'],
      },
      {
        id: 'content-1',
        name: 'David Park',
        role: 'content_creator',
        title: 'Content Creator',
        emoji: '✍️',
        color: '#10b981',
        supervisorId: 'marketing-1',
        responsibilities: ['Blog posts', 'Documentation', 'Case studies'],
      },
      {
        id: 'analyst-1',
        name: 'Lisa Zhang',
        role: 'analyst',
        title: 'Data Analyst',
        emoji: '📊',
        color: '#06b6d4',
        supervisorId: 'ceo-1',
        responsibilities: ['Market research', 'Competitor analysis', 'User analytics'],
      },
    ],
    strategy: {
      vision: 'Launch a product-led SaaS with strong organic growth engine',
      days: [
        { day: 1, title: 'Market Research', activities: ['Competitor analysis', 'User persona development', 'Value proposition refinement'] },
        { day: 2, title: 'Landing Page', activities: ['Create high-converting landing page', 'Set up analytics', 'A/B testing framework'] },
        { day: 3, title: 'Content Foundation', activities: ['SEO keyword research', 'Create first 5 blog posts', 'Documentation setup'] },
        { day: '4-5', title: 'Lead Generation', activities: ['Set up email marketing', 'Create lead magnets', 'Launch PPC campaigns'] },
        { day: '6-7', title: 'Outreach', activities: ['Product Hunt preparation', 'Influencer partnerships', 'Community building'] },
      ],
    },
  },
  agency: {
    detectedInfo: {
      market: 'Professional Services',
      model: 'Agency / Retainer',
      strategy: 'Authority-first, Referral-driven',
    },
    agents: [
      {
        id: 'ceo-1',
        name: 'James Miller',
        role: 'ceo',
        title: 'CEO',
        emoji: '👔',
        color: '#8b5cf6',
        responsibilities: ['Client relationships', 'Business development', 'Service innovation'],
      },
      {
        id: 'marketing-1',
        name: 'Sophie Brown',
        role: 'marketing_manager',
        title: 'Marketing Manager',
        emoji: '📈',
        color: '#3b82f6',
        supervisorId: 'ceo-1',
        responsibilities: ['Thought leadership', 'Case study creation', 'Lead generation'],
      },
      {
        id: 'content-1',
        name: 'Ryan Lee',
        role: 'content_creator',
        title: 'Content Creator',
        emoji: '✍️',
        color: '#10b981',
        supervisorId: 'marketing-1',
        responsibilities: ['Blog content', 'Social media', 'Email campaigns'],
      },
      {
        id: 'sales-1',
        name: 'Kate Johnson',
        role: 'sales_manager',
        title: 'Sales Manager',
        emoji: '🤝',
        color: '#ef4444',
        supervisorId: 'ceo-1',
        responsibilities: ['Lead qualification', 'Proposal creation', 'Client onboarding'],
      },
    ],
    strategy: {
      vision: 'Establish authority in your niche and build a referral engine',
      days: [
        { day: 1, title: 'Positioning', activities: ['Define service offerings', 'Ideal client profile', 'Pricing strategy'] },
        { day: 2, title: 'Authority Building', activities: ['Create case studies', 'Thought leadership content', 'LinkedIn optimization'] },
        { day: 3, title: 'Lead Generation', activities: ['Outreach sequences', 'Referral program', 'Partnership outreach'] },
        { day: '4-5', title: 'Content Marketing', activities: ['Weekly newsletter', 'Industry insights', 'Guest posting'] },
        { day: '6-7', title: 'Sales Pipeline', activities: ['CRM setup', 'Proposal templates', 'Follow-up automation'] },
      ],
    },
  },
  ecommerce: {
    detectedInfo: {
      market: 'E-commerce & Retail',
      model: 'Online Store',
      strategy: 'Performance Marketing',
    },
    agents: [
      {
        id: 'ceo-1',
        name: 'Amanda Scott',
        role: 'ceo',
        title: 'CEO',
        emoji: '👔',
        color: '#8b5cf6',
        responsibilities: ['Business strategy', 'Supplier relations', 'Growth planning'],
      },
      {
        id: 'marketing-1',
        name: 'Chris Evans',
        role: 'marketing_manager',
        title: 'Marketing Manager',
        emoji: '📈',
        color: '#3b82f6',
        supervisorId: 'ceo-1',
        responsibilities: ['Marketing strategy', 'Channel optimization', 'Budget allocation'],
      },
      {
        id: 'ads-1',
        name: 'Nina Patel',
        role: 'ads_specialist',
        title: 'Ads Specialist',
        emoji: '🎯',
        color: '#f59e0b',
        supervisorId: 'marketing-1',
        responsibilities: ['Facebook Ads', 'Google Shopping', 'Retargeting'],
      },
      {
        id: 'content-1',
        name: 'Tom Harris',
        role: 'content_creator',
        title: 'Content Creator',
        emoji: '✍️',
        color: '#10b981',
        supervisorId: 'marketing-1',
        responsibilities: ['Product descriptions', 'Email campaigns', 'Social content'],
      },
    ],
    strategy: {
      vision: 'Build a profitable e-commerce brand with strong ROAS',
      days: [
        { day: 1, title: 'Store Optimization', activities: ['Product page optimization', 'Checkout flow review', 'Speed optimization'] },
        { day: 2, title: 'Ad Setup', activities: ['Facebook pixel setup', 'Google Ads account', 'Product feed creation'] },
        { day: 3, title: 'Campaign Launch', activities: ['Launch initial campaigns', 'Set up retargeting', 'Email welcome series'] },
        { day: '4-5', title: 'Content & Email', activities: ['Product photography', 'Abandoned cart emails', 'Social proof collection'] },
        { day: '6-7', title: 'Optimization', activities: ['Analyze ROAS', 'Scale winning ads', 'Test new audiences'] },
      ],
    },
  },
  content: {
    detectedInfo: {
      market: 'Creator Economy',
      model: 'Content & Media',
      strategy: 'Audience-first Growth',
    },
    agents: [
      {
        id: 'ceo-1',
        name: 'Morgan Reed',
        role: 'ceo',
        title: 'CEO',
        emoji: '👔',
        color: '#8b5cf6',
        responsibilities: ['Content strategy', 'Brand partnerships', 'Monetization'],
      },
      {
        id: 'content-1',
        name: 'Jamie Cruz',
        role: 'content_creator',
        title: 'Lead Content Creator',
        emoji: '✍️',
        color: '#10b981',
        supervisorId: 'ceo-1',
        responsibilities: ['Content production', 'Editorial calendar', 'Quality control'],
      },
      {
        id: 'marketing-1',
        name: 'Taylor Swift',
        role: 'marketing_manager',
        title: 'Growth Manager',
        emoji: '📈',
        color: '#3b82f6',
        supervisorId: 'ceo-1',
        responsibilities: ['Audience growth', 'Platform optimization', 'Community management'],
      },
      {
        id: 'analyst-1',
        name: 'Sam Chen',
        role: 'analyst',
        title: 'Analytics Specialist',
        emoji: '📊',
        color: '#06b6d4',
        supervisorId: 'ceo-1',
        responsibilities: ['Performance tracking', 'Trend analysis', 'Content optimization'],
      },
    ],
    strategy: {
      vision: 'Build a loyal audience and establish authority in your niche',
      days: [
        { day: 1, title: 'Content Strategy', activities: ['Define content pillars', 'Audience research', 'Platform selection'] },
        { day: 2, title: 'Content Production', activities: ['Create content templates', 'Batch first week content', 'Set up scheduling'] },
        { day: 3, title: 'Platform Setup', activities: ['Optimize all profiles', 'Cross-posting strategy', 'Hashtag research'] },
        { day: '4-5', title: 'Launch & Engage', activities: ['Publish first content', 'Community engagement', 'Collaboration outreach'] },
        { day: '6-7', title: 'Analyze & Iterate', activities: ['Review metrics', 'Double down on winners', 'Plan next week'] },
      ],
    },
  },
  default: {
    detectedInfo: {
      market: 'General Business',
      model: 'Service / Product',
      strategy: 'Multi-channel Growth',
    },
    agents: [
      {
        id: 'ceo-1',
        name: 'Alex Morgan',
        role: 'ceo',
        title: 'CEO',
        emoji: '👔',
        color: '#8b5cf6',
        responsibilities: ['Strategic planning', 'Team coordination', 'Growth strategy'],
      },
      {
        id: 'marketing-1',
        name: 'Jordan Lee',
        role: 'marketing_manager',
        title: 'Marketing Manager',
        emoji: '📈',
        color: '#3b82f6',
        supervisorId: 'ceo-1',
        responsibilities: ['Marketing strategy', 'Brand building', 'Lead generation'],
      },
      {
        id: 'content-1',
        name: 'Sam Rivera',
        role: 'content_creator',
        title: 'Content Creator',
        emoji: '✍️',
        color: '#10b981',
        supervisorId: 'marketing-1',
        responsibilities: ['Content creation', 'Social media', 'Copywriting'],
      },
      {
        id: 'ops-1',
        name: 'Taylor Kim',
        role: 'support',
        title: 'Operations',
        emoji: '⚙️',
        color: '#f59e0b',
        supervisorId: 'ceo-1',
        responsibilities: ['Process optimization', 'Customer support', 'Quality assurance'],
      },
    ],
    strategy: {
      vision: 'Build a solid foundation and establish market presence',
      days: [
        { day: 1, title: 'Foundation', activities: ['Define value proposition', 'Target audience research', 'Competitive analysis'] },
        { day: 2, title: 'Online Presence', activities: ['Website optimization', 'Social media setup', 'Google Business profile'] },
        { day: 3, title: 'Content Launch', activities: ['Create initial content', 'Email list setup', 'Lead magnet creation'] },
        { day: '4-5', title: 'Marketing Activation', activities: ['Launch campaigns', 'Outreach sequences', 'Partnership outreach'] },
        { day: '6-7', title: 'Review & Optimize', activities: ['Analyze results', 'Gather feedback', 'Plan next phase'] },
      ],
    },
  },
};

export function detectBusinessType(prompt: string): BusinessType {
  const lower = prompt.toLowerCase();

  if (lower.includes('fashion') || lower.includes('clothing') || lower.includes('apparel') || lower.includes('sustainable')) {
    return 'fashion';
  }
  if (lower.includes('saas') || lower.includes('software') || lower.includes('app') || lower.includes('platform')) {
    return 'saas';
  }
  if (lower.includes('agency') || lower.includes('consulting') || lower.includes('service')) {
    return 'agency';
  }
  if (lower.includes('ecommerce') || lower.includes('e-commerce') || lower.includes('store') || lower.includes('shop') || lower.includes('dropship')) {
    return 'ecommerce';
  }
  if (lower.includes('content') || lower.includes('creator') || lower.includes('media') || lower.includes('blog') || lower.includes('newsletter')) {
    return 'content';
  }

  return 'default';
}

export function getTemplateForPrompt(prompt: string): BusinessTemplate {
  const businessType = detectBusinessType(prompt);
  return templates[businessType];
}

export function generateCompanyName(prompt: string): string {
  const words = prompt.split(' ').filter((w) => w.length > 3);
  const meaningful = words.slice(0, 2).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  if (meaningful.length >= 2) {
    return `${meaningful[0]} ${meaningful[1]} Co`;
  }
  return 'AI Startup Co';
}
