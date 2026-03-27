import { db } from '../lib/db';
import { templates, playbooks } from '@1person/core/db';
import { eq } from 'drizzle-orm';
import type { TemplateAgent, TemplateDepartment, TemplateStrategy } from '@1person/core/db';
import type { PlaybookStage } from '@1person/core/db';

interface TemplateMatch {
  templateId: string;
  score: number;
  template: typeof templates.$inferSelect;
}

// Default templates data (migrated from ftux-processor.ts hardcoded fallbacks)
const DEFAULT_TEMPLATES = [
  {
    slug: 'saas-startup',
    name: 'SaaS Startup',
    description: 'Perfect for software-as-a-service businesses with subscription models',
    category: 'saas' as const,
    businessModel: 'subscription' as const,
    audience: 'b2b' as const,
    keywords: ['saas', 'software', 'app', 'platform', 'subscription', 'cloud', 'tool', 'service'],
    icon: 'cloud',
    color: '#3b82f6',
    detectedInfo: {
      market: 'Enterprise Software',
      model: 'B2B SaaS Subscription',
      strategy: 'Product-led Growth',
    },
    agents: [
      { role: 'ceo', name: 'Alex Thompson', title: 'CEO', description: 'Product vision and company strategy', capabilities: ['strategic_planning', 'investor_relations', 'team_building'], isManager: true, color: '#8b5cf6' },
      { role: 'developer', name: 'Sarah Kim', title: 'Product Manager', description: 'Feature prioritization and user research', capabilities: ['feature_planning', 'user_interviews', 'analytics'], isManager: true, color: '#3b82f6' },
      { role: 'marketing_manager', name: 'Marcus Johnson', title: 'Growth Lead', description: 'User acquisition and retention', capabilities: ['growth_experiments', 'funnel_optimization', 'retention_strategies'], isManager: false, color: '#10b981' },
      { role: 'content_creator', name: 'Emily Chen', title: 'Content Lead', description: 'Documentation and educational content', capabilities: ['documentation', 'tutorials', 'blog_posts'], isManager: false, color: '#f59e0b' },
    ] as TemplateAgent[],
    departments: [
      { name: 'Executive', color: '#8b5cf6', icon: 'crown' },
      { name: 'Product', color: '#3b82f6', icon: 'box' },
      { name: 'Marketing', color: '#10b981', icon: 'megaphone' },
      { name: 'Engineering', color: '#f59e0b', icon: 'code' },
    ] as TemplateDepartment[],
    defaultStrategy: {
      vision: 'Launch beta and acquire first 100 users',
      days: [
        { day: 1, title: 'Foundation', activities: ['Define value proposition', 'Set up analytics', 'Create user personas'] },
        { day: 2, title: 'Landing Page', activities: ['Design high-converting landing page', 'Write compelling copy', 'Set up A/B testing'] },
        { day: 3, title: 'Content', activities: ['Create getting started guide', 'Record demo video', 'Write first blog post'] },
        { day: '4-5', title: 'Launch Prep', activities: ['Set up email sequences', 'Prepare Product Hunt launch', 'Reach out to beta testers'] },
        { day: '6-7', title: 'Go Live', activities: ['Launch on Product Hunt', 'Monitor feedback', 'Respond to users'] },
      ],
    } as TemplateStrategy,
  },
  {
    slug: 'ecommerce-brand',
    name: 'E-commerce Brand',
    description: 'Direct-to-consumer brand with online store and marketing focus',
    category: 'ecommerce' as const,
    businessModel: 'transaction' as const,
    audience: 'b2c' as const,
    keywords: ['ecommerce', 'store', 'shop', 'brand', 'product', 'retail', 'online', 'sell', 'buy', 'fashion', 'skincare'],
    icon: 'shopping-bag',
    color: '#ec4899',
    detectedInfo: {
      market: 'E-commerce & Retail',
      model: 'Direct-to-Consumer',
      strategy: 'Performance Marketing',
    },
    agents: [
      { role: 'ceo', name: 'Jordan Blake', title: 'CEO', description: 'Brand strategy and supplier relations', capabilities: ['brand_strategy', 'supplier_negotiations', 'growth_planning'], isManager: true, color: '#8b5cf6' },
      { role: 'marketing_manager', name: 'Nina Patel', title: 'Marketing Manager', description: 'Paid ads and email marketing', capabilities: ['paid_advertising', 'email_campaigns', 'influencer_outreach'], isManager: true, color: '#3b82f6' },
      { role: 'content_creator', name: 'Tyler Ross', title: 'Creative Lead', description: 'Product photography and ad creative', capabilities: ['product_photography', 'ad_creative', 'brand_visuals'], isManager: false, color: '#10b981' },
      { role: 'support', name: 'Lisa Wang', title: 'Operations Manager', description: 'Inventory and fulfillment', capabilities: ['inventory_management', 'fulfillment_optimization', 'customer_service'], isManager: false, color: '#f59e0b' },
    ] as TemplateAgent[],
    departments: [
      { name: 'Executive', color: '#8b5cf6', icon: 'crown' },
      { name: 'Marketing', color: '#3b82f6', icon: 'megaphone' },
      { name: 'Creative', color: '#10b981', icon: 'palette' },
      { name: 'Operations', color: '#f59e0b', icon: 'settings' },
    ] as TemplateDepartment[],
    defaultStrategy: {
      vision: 'Launch store and hit $10K in first month sales',
      days: [
        { day: 1, title: 'Store Setup', activities: ['Finalize product catalog', 'Optimize product pages', 'Set up payment processing'] },
        { day: 2, title: 'Creative', activities: ['Product photoshoot', 'Write product descriptions', 'Create ad templates'] },
        { day: 3, title: 'Marketing Setup', activities: ['Set up Facebook pixel', 'Create email welcome series', 'Plan influencer outreach'] },
        { day: '4-5', title: 'Launch', activities: ['Launch paid ads', 'Send to email list', 'Post on social media'] },
        { day: '6-7', title: 'Optimize', activities: ['Analyze ROAS', 'A/B test ads', 'Retarget visitors'] },
      ],
    } as TemplateStrategy,
  },
  {
    slug: 'agency',
    name: 'Agency / Consulting',
    description: 'Professional services firm with retainer-based client relationships',
    category: 'agency' as const,
    businessModel: 'service' as const,
    audience: 'b2b' as const,
    keywords: ['agency', 'consulting', 'services', 'clients', 'retainer', 'marketing agency', 'design agency', 'creative'],
    icon: 'briefcase',
    color: '#6366f1',
    detectedInfo: {
      market: 'Professional Services',
      model: 'Agency Retainer',
      strategy: 'Thought Leadership',
    },
    agents: [
      { role: 'ceo', name: 'David Miller', title: 'CEO', description: 'Client relationships and business development', capabilities: ['client_management', 'business_development', 'strategic_consulting'], isManager: true, color: '#8b5cf6' },
      { role: 'support', name: 'Rachel Green', title: 'Account Director', description: 'Client success and project delivery', capabilities: ['project_management', 'client_success', 'team_coordination'], isManager: true, color: '#3b82f6' },
      { role: 'content_creator', name: 'Kevin Park', title: 'Content Strategist', description: 'Thought leadership and case studies', capabilities: ['content_strategy', 'case_studies', 'white_papers'], isManager: false, color: '#10b981' },
      { role: 'sales_manager', name: 'Amanda Torres', title: 'Sales Lead', description: 'Lead qualification and proposals', capabilities: ['lead_qualification', 'proposal_writing', 'sales_calls'], isManager: false, color: '#f59e0b' },
    ] as TemplateAgent[],
    departments: [
      { name: 'Executive', color: '#8b5cf6', icon: 'crown' },
      { name: 'Client Services', color: '#3b82f6', icon: 'users' },
      { name: 'Content', color: '#10b981', icon: 'edit' },
      { name: 'Sales', color: '#f59e0b', icon: 'dollar-sign' },
    ] as TemplateDepartment[],
    defaultStrategy: {
      vision: 'Establish authority and sign 3 retainer clients',
      days: [
        { day: 1, title: 'Positioning', activities: ['Define niche expertise', 'Create ideal client profile', 'Set pricing tiers'] },
        { day: 2, title: 'Credibility', activities: ['Write 2 case studies', 'Update LinkedIn profiles', 'Publish thought piece'] },
        { day: 3, title: 'Outreach', activities: ['Build prospect list', 'Create outreach sequences', 'Prepare proposal template'] },
        { day: '4-5', title: 'Networking', activities: ['Attend industry events', 'Schedule discovery calls', 'Ask for referrals'] },
        { day: '6-7', title: 'Follow-up', activities: ['Send proposals', 'Handle objections', 'Close first deal'] },
      ],
    } as TemplateStrategy,
  },
  {
    slug: 'creator-business',
    name: 'Creator Business',
    description: 'Content creator or influencer building a personal brand and monetizing audience',
    category: 'creator' as const,
    businessModel: 'subscription' as const,
    audience: 'creator' as const,
    keywords: ['creator', 'influencer', 'youtube', 'newsletter', 'podcast', 'content', 'audience', 'community', 'monetize'],
    icon: 'video',
    color: '#ef4444',
    detectedInfo: {
      market: 'Creator Economy',
      model: 'Multi-Revenue Streams',
      strategy: 'Audience Building',
    },
    agents: [
      { role: 'ceo', name: 'Jamie Rivera', title: 'CEO', description: 'Content strategy and brand partnerships', capabilities: ['content_planning', 'brand_deals', 'audience_growth'], isManager: true, color: '#8b5cf6' },
      { role: 'content_creator', name: 'Sam Lee', title: 'Content Lead', description: 'Content creation and editing', capabilities: ['video_editing', 'writing', 'social_media'], isManager: true, color: '#3b82f6' },
      { role: 'marketing_manager', name: 'Alex Chen', title: 'Community Manager', description: 'Community engagement and growth', capabilities: ['community_management', 'engagement', 'newsletter'], isManager: false, color: '#10b981' },
      { role: 'analyst', name: 'Jordan Kim', title: 'Monetization Lead', description: 'Revenue optimization and sponsorships', capabilities: ['sponsorship_outreach', 'pricing_strategy', 'analytics'], isManager: false, color: '#f59e0b' },
    ] as TemplateAgent[],
    departments: [
      { name: 'Executive', color: '#8b5cf6', icon: 'crown' },
      { name: 'Content', color: '#3b82f6', icon: 'video' },
      { name: 'Community', color: '#10b981', icon: 'users' },
      { name: 'Revenue', color: '#f59e0b', icon: 'dollar-sign' },
    ] as TemplateDepartment[],
    defaultStrategy: {
      vision: 'Grow to 10K followers and launch first product',
      days: [
        { day: 1, title: 'Content Strategy', activities: ['Define content pillars', 'Create content calendar', 'Set up publishing workflow'] },
        { day: 2, title: 'Platform Setup', activities: ['Optimize profiles', 'Set up analytics', 'Create branded templates'] },
        { day: 3, title: 'Community', activities: ['Start newsletter', 'Create community space', 'Plan engagement strategy'] },
        { day: '4-5', title: 'Content Sprint', activities: ['Batch create content', 'Schedule posts', 'Engage with audience'] },
        { day: '6-7', title: 'Monetization', activities: ['Research sponsorship rates', 'Create media kit', 'Reach out to brands'] },
      ],
    } as TemplateStrategy,
  },
  {
    slug: 'local-service',
    name: 'Local Service Business',
    description: 'Local business serving a geographic area (restaurants, salons, contractors, etc.)',
    category: 'local_service' as const,
    businessModel: 'service' as const,
    audience: 'b2c' as const,
    keywords: ['restaurant', 'local', 'salon', 'contractor', 'food', 'cafe', 'bar', 'gym', 'fitness', 'cleaning', 'plumber'],
    icon: 'map-pin',
    color: '#22c55e',
    detectedInfo: {
      market: 'Local Services',
      model: 'Service Business',
      strategy: 'Local Marketing',
    },
    agents: [
      { role: 'ceo', name: 'Chen Wei', title: 'CEO', description: 'Operations and partnerships', capabilities: ['operations_management', 'local_partnerships', 'team_building'], isManager: true, color: '#8b5cf6' },
      { role: 'marketing_manager', name: 'Maria Santos', title: 'Marketing Manager', description: 'Local marketing and promotions', capabilities: ['local_seo', 'social_media', 'promotions'], isManager: true, color: '#3b82f6' },
      { role: 'support', name: 'James O\'Brien', title: 'Customer Success', description: 'Customer service and retention', capabilities: ['customer_service', 'reviews_management', 'loyalty_programs'], isManager: false, color: '#10b981' },
      { role: 'analyst', name: 'Priya Sharma', title: 'Operations Analyst', description: 'Process optimization and scheduling', capabilities: ['scheduling', 'process_optimization', 'reporting'], isManager: false, color: '#f59e0b' },
    ] as TemplateAgent[],
    departments: [
      { name: 'Executive', color: '#8b5cf6', icon: 'crown' },
      { name: 'Marketing', color: '#3b82f6', icon: 'megaphone' },
      { name: 'Customer Success', color: '#10b981', icon: 'heart' },
      { name: 'Operations', color: '#f59e0b', icon: 'settings' },
    ] as TemplateDepartment[],
    defaultStrategy: {
      vision: 'Establish local presence and get first 50 customers',
      days: [
        { day: 1, title: 'Local Setup', activities: ['Set up Google Business Profile', 'Claim directory listings', 'Create service packages'] },
        { day: 2, title: 'Online Presence', activities: ['Create simple website', 'Set up booking system', 'Add customer reviews'] },
        { day: 3, title: 'Marketing', activities: ['Design flyers and materials', 'Plan grand opening', 'Set up social media'] },
        { day: '4-5', title: 'Outreach', activities: ['Partner with local businesses', 'Attend community events', 'Launch referral program'] },
        { day: '6-7', title: 'Operations', activities: ['Train on customer service', 'Set up feedback system', 'Optimize scheduling'] },
      ],
    } as TemplateStrategy,
  },
];

// Default playbooks for each template
const DEFAULT_PLAYBOOKS: Record<string, Omit<PlaybookStage, 'tasks'>[]> = {
  'saas-startup': [
    { stage: 'idea', name: 'Idea Validation', description: 'Validate your SaaS idea with potential customers', estimatedDays: 14, milestones: [{ id: 'icp', title: 'ICP Defined' }, { id: 'interviews', title: '5 Customer Interviews' }, { id: 'landing', title: 'Landing Page Live' }], exitCriteria: ['50+ waitlist signups', '5 customer interviews completed', 'Clear value proposition'] },
    { stage: 'mvp', name: 'Build MVP', description: 'Build minimum viable product with core features', estimatedDays: 30, milestones: [{ id: 'core', title: 'Core Features Built' }, { id: 'beta', title: 'Beta Users Onboarded' }, { id: 'feedback', title: 'Initial Feedback Collected' }], exitCriteria: ['MVP deployed', '10 beta users', 'Core workflow working'] },
    { stage: 'launch', name: 'Product Launch', description: 'Launch product and acquire first paying customers', estimatedDays: 14, milestones: [{ id: 'launch', title: 'Product Launched' }, { id: 'customers', title: 'First 10 Customers' }, { id: 'revenue', title: 'First Revenue' }], exitCriteria: ['Public launch completed', '10 paying customers', '$1000 MRR'] },
    { stage: 'growth', name: 'Growth Phase', description: 'Scale customer acquisition and optimize conversion', estimatedDays: 60, milestones: [{ id: 'channels', title: 'Growth Channels Identified' }, { id: 'mrr', title: '$10K MRR' }, { id: 'retention', title: '80% Retention' }], exitCriteria: ['3 acquisition channels working', '$10K MRR', 'Less than 5% monthly churn'] },
    { stage: 'optimize', name: 'Optimize & Scale', description: 'Optimize operations and prepare for scale', estimatedDays: 90, milestones: [{ id: 'automation', title: 'Processes Automated' }, { id: 'team', title: 'Team Expanded' }, { id: 'profitability', title: 'Profitable' }], exitCriteria: ['80% processes automated', 'Profitable unit economics', 'Scalable infrastructure'] },
  ],
  'ecommerce-brand': [
    { stage: 'idea', name: 'Brand Development', description: 'Define your brand and validate product-market fit', estimatedDays: 14, milestones: [{ id: 'brand', title: 'Brand Identity Created' }, { id: 'products', title: 'Product Line Defined' }, { id: 'suppliers', title: 'Suppliers Secured' }], exitCriteria: ['Brand guidelines complete', 'Initial inventory secured', 'Pricing strategy set'] },
    { stage: 'mvp', name: 'Store Setup', description: 'Build your online store and prepare for launch', estimatedDays: 14, milestones: [{ id: 'store', title: 'Store Built' }, { id: 'photos', title: 'Product Photos Done' }, { id: 'payments', title: 'Payments Working' }], exitCriteria: ['Store live', 'All products listed', 'Checkout working'] },
    { stage: 'launch', name: 'Launch Campaign', description: 'Launch marketing and get first customers', estimatedDays: 14, milestones: [{ id: 'ads', title: 'Ads Running' }, { id: 'orders', title: 'First 50 Orders' }, { id: 'reviews', title: 'First Reviews' }], exitCriteria: ['50 orders', 'Positive ROAS', '5 customer reviews'] },
    { stage: 'growth', name: 'Scale Marketing', description: 'Scale winning channels and optimize AOV', estimatedDays: 60, milestones: [{ id: 'revenue', title: '$50K Monthly Revenue' }, { id: 'influencers', title: 'Influencer Program' }, { id: 'email', title: 'Email Automation' }], exitCriteria: ['$50K monthly revenue', 'Email contributing 30%', 'Repeat customer rate 20%'] },
    { stage: 'optimize', name: 'Operations Excellence', description: 'Optimize fulfillment and expand product line', estimatedDays: 90, milestones: [{ id: 'fulfillment', title: 'Fulfillment Optimized' }, { id: 'products', title: 'Product Line Expanded' }, { id: 'wholesale', title: 'Wholesale Channel' }], exitCriteria: ['2-day shipping', '50+ SKUs', 'Multiple sales channels'] },
  ],
  'agency': [
    { stage: 'idea', name: 'Positioning', description: 'Define your niche and ideal client profile', estimatedDays: 7, milestones: [{ id: 'niche', title: 'Niche Defined' }, { id: 'icp', title: 'ICP Created' }, { id: 'pricing', title: 'Pricing Set' }], exitCriteria: ['Clear positioning statement', 'Service packages defined', 'Pricing tiers set'] },
    { stage: 'mvp', name: 'Credibility Building', description: 'Build portfolio and thought leadership', estimatedDays: 14, milestones: [{ id: 'cases', title: 'Case Studies Done' }, { id: 'content', title: 'Thought Leadership Content' }, { id: 'profiles', title: 'Profiles Optimized' }], exitCriteria: ['3 case studies', '5 content pieces', 'LinkedIn optimized'] },
    { stage: 'launch', name: 'Client Acquisition', description: 'Land first retainer clients', estimatedDays: 21, milestones: [{ id: 'outreach', title: 'Outreach System' }, { id: 'calls', title: '10 Discovery Calls' }, { id: 'clients', title: 'First 3 Clients' }], exitCriteria: ['3 retainer clients', '$10K MRR', 'Proposal template'] },
    { stage: 'growth', name: 'Scale Operations', description: 'Build team and systemize delivery', estimatedDays: 60, milestones: [{ id: 'team', title: 'Team Hired' }, { id: 'processes', title: 'SOPs Created' }, { id: 'mrr', title: '$30K MRR' }], exitCriteria: ['3 team members', 'All processes documented', '$30K MRR'] },
    { stage: 'optimize', name: 'Premium Positioning', description: 'Move upmarket and increase margins', estimatedDays: 90, milestones: [{ id: 'premium', title: 'Premium Clients' }, { id: 'margins', title: '50% Margins' }, { id: 'referrals', title: 'Referral System' }], exitCriteria: ['Average deal size $5K+', '50% profit margins', '50% clients from referrals'] },
  ],
  'creator-business': [
    { stage: 'idea', name: 'Content Strategy', description: 'Define your content pillars and audience', estimatedDays: 7, milestones: [{ id: 'pillars', title: 'Content Pillars Defined' }, { id: 'persona', title: 'Audience Persona' }, { id: 'calendar', title: 'Content Calendar' }], exitCriteria: ['3 content pillars', 'Publishing schedule set', 'Platform chosen'] },
    { stage: 'mvp', name: 'Content Foundation', description: 'Build initial content library and audience', estimatedDays: 30, milestones: [{ id: 'content', title: '20 Posts Published' }, { id: 'followers', title: '1K Followers' }, { id: 'newsletter', title: 'Newsletter Started' }], exitCriteria: ['20 pieces of content', '1K followers', '500 newsletter subs'] },
    { stage: 'launch', name: 'Monetization Start', description: 'Launch first revenue stream', estimatedDays: 21, milestones: [{ id: 'product', title: 'First Product' }, { id: 'revenue', title: 'First $1K' }, { id: 'community', title: 'Community Launched' }], exitCriteria: ['First product launched', '$1K revenue', 'Community active'] },
    { stage: 'growth', name: 'Audience Scaling', description: 'Scale audience and diversify revenue', estimatedDays: 60, milestones: [{ id: 'followers', title: '10K Followers' }, { id: 'mrr', title: '$5K MRR' }, { id: 'sponsors', title: 'Brand Sponsors' }], exitCriteria: ['10K followers', '$5K monthly revenue', '3 revenue streams'] },
    { stage: 'optimize', name: 'Brand Building', description: 'Build team and scale content production', estimatedDays: 90, milestones: [{ id: 'team', title: 'Team Built' }, { id: 'systems', title: 'Systems Automated' }, { id: 'brand', title: 'Brand Deals' }], exitCriteria: ['Content team hired', 'Consistent posting', '$20K monthly'] },
  ],
  'local-service': [
    { stage: 'idea', name: 'Local Setup', description: 'Establish local presence and service offering', estimatedDays: 7, milestones: [{ id: 'gmb', title: 'Google Business Setup' }, { id: 'services', title: 'Services Defined' }, { id: 'pricing', title: 'Pricing Set' }], exitCriteria: ['Google Business verified', 'Service packages ready', 'Local SEO basics done'] },
    { stage: 'mvp', name: 'Operations Setup', description: 'Set up booking and operations', estimatedDays: 14, milestones: [{ id: 'booking', title: 'Booking System' }, { id: 'website', title: 'Website Live' }, { id: 'processes', title: 'Service Processes' }], exitCriteria: ['Online booking working', 'Website live', 'Team trained'] },
    { stage: 'launch', name: 'Grand Opening', description: 'Launch and acquire first customers', estimatedDays: 14, milestones: [{ id: 'opening', title: 'Grand Opening' }, { id: 'customers', title: '50 Customers' }, { id: 'reviews', title: '10 Reviews' }], exitCriteria: ['50 customers served', '10 positive reviews', 'Referral program launched'] },
    { stage: 'growth', name: 'Local Marketing', description: 'Scale local marketing and partnerships', estimatedDays: 60, milestones: [{ id: 'partnerships', title: 'Local Partnerships' }, { id: 'loyalty', title: 'Loyalty Program' }, { id: 'revenue', title: '$20K Monthly' }], exitCriteria: ['5 local partnerships', 'Loyalty program active', '$20K monthly revenue'] },
    { stage: 'optimize', name: 'Operations Excellence', description: 'Optimize operations and consider expansion', estimatedDays: 90, milestones: [{ id: 'automation', title: 'Automated Scheduling' }, { id: 'team', title: 'Team Expanded' }, { id: 'expansion', title: 'Expansion Plan' }], exitCriteria: ['85% capacity utilization', 'Full team hired', 'Expansion plan ready'] },
  ],
};

// Generate tasks for each stage
function generateStageTasks(stage: string, templateSlug: string): { id: string; title: string; description: string; type: string; priority: 'critical' | 'high' | 'medium' | 'low'; assignedRole?: string }[] {
  const baseTasks: Record<string, Record<string, { id: string; title: string; description: string; type: string; priority: 'critical' | 'high' | 'medium' | 'low'; assignedRole?: string }[]>> = {
    idea: {
      default: [
        { id: 'icp-1', title: 'Define Ideal Customer Profile', description: 'Create detailed persona of your target customer', type: 'research', priority: 'critical', assignedRole: 'ceo' },
        { id: 'icp-2', title: 'List customer pain points', description: 'Document the top 5 problems your customers face', type: 'research', priority: 'high', assignedRole: 'ceo' },
        { id: 'comp-1', title: 'Research top 3 competitors', description: 'Analyze competitor offerings, pricing, and positioning', type: 'research', priority: 'high', assignedRole: 'analyst' },
        { id: 'value-1', title: 'Write value proposition', description: 'Create a compelling one-liner about your offering', type: 'content', priority: 'critical', assignedRole: 'ceo' },
        { id: 'interview-1', title: 'Schedule 5 customer interviews', description: 'Reach out to potential customers for feedback', type: 'outreach', priority: 'high', assignedRole: 'ceo' },
        { id: 'interview-2', title: 'Conduct customer interviews', description: 'Complete interviews and document insights', type: 'research', priority: 'high', assignedRole: 'ceo' },
        { id: 'landing-1', title: 'Create landing page wireframe', description: 'Design the structure of your landing page', type: 'design', priority: 'medium', assignedRole: 'content_creator' },
        { id: 'landing-2', title: 'Write landing page copy', description: 'Create compelling copy for your landing page', type: 'content', priority: 'high', assignedRole: 'content_creator' },
        { id: 'landing-3', title: 'Build and publish landing page', description: 'Deploy your landing page with signup form', type: 'development', priority: 'high', assignedRole: 'developer' },
        { id: 'analytics-1', title: 'Set up analytics tracking', description: 'Install analytics to track visitor behavior', type: 'development', priority: 'medium', assignedRole: 'developer' },
        { id: 'waitlist-1', title: 'Create waitlist form', description: 'Set up email capture for interested users', type: 'development', priority: 'medium', assignedRole: 'developer' },
        { id: 'pricing-1', title: 'Draft initial pricing model', description: 'Create preliminary pricing structure', type: 'strategy', priority: 'medium', assignedRole: 'ceo' },
      ],
    },
    mvp: {
      default: [
        { id: 'mvp-1', title: 'Define MVP feature set', description: 'List the minimum features needed for launch', type: 'planning', priority: 'critical', assignedRole: 'developer' },
        { id: 'mvp-2', title: 'Set up development environment', description: 'Configure tools and infrastructure', type: 'development', priority: 'high', assignedRole: 'developer' },
        { id: 'mvp-3', title: 'Build core feature #1', description: 'Implement the primary feature of your product', type: 'development', priority: 'critical', assignedRole: 'developer' },
        { id: 'mvp-4', title: 'Build core feature #2', description: 'Implement the secondary feature', type: 'development', priority: 'high', assignedRole: 'developer' },
        { id: 'mvp-5', title: 'Build user authentication', description: 'Implement login and registration', type: 'development', priority: 'high', assignedRole: 'developer' },
        { id: 'beta-1', title: 'Recruit beta users', description: 'Find 10 people to test your product', type: 'outreach', priority: 'high', assignedRole: 'marketing_manager' },
        { id: 'beta-2', title: 'Onboard beta users', description: 'Guide first users through the product', type: 'support', priority: 'high', assignedRole: 'support' },
        { id: 'feedback-1', title: 'Collect beta feedback', description: 'Gather and organize user feedback', type: 'research', priority: 'high', assignedRole: 'support' },
        { id: 'iterate-1', title: 'Fix critical bugs', description: 'Address issues found by beta users', type: 'development', priority: 'critical', assignedRole: 'developer' },
        { id: 'docs-1', title: 'Create getting started guide', description: 'Write documentation for new users', type: 'content', priority: 'medium', assignedRole: 'content_creator' },
      ],
    },
    launch: {
      default: [
        { id: 'launch-1', title: 'Finalize launch checklist', description: 'Create comprehensive launch plan', type: 'planning', priority: 'critical', assignedRole: 'ceo' },
        { id: 'launch-2', title: 'Prepare launch announcement', description: 'Write blog post and social media content', type: 'content', priority: 'high', assignedRole: 'content_creator' },
        { id: 'launch-3', title: 'Set up email sequences', description: 'Create automated welcome and onboarding emails', type: 'marketing', priority: 'high', assignedRole: 'marketing_manager' },
        { id: 'launch-4', title: 'Execute launch campaign', description: 'Go live with marketing campaign', type: 'marketing', priority: 'critical', assignedRole: 'marketing_manager' },
        { id: 'support-1', title: 'Set up support channels', description: 'Prepare customer support infrastructure', type: 'support', priority: 'high', assignedRole: 'support' },
        { id: 'monitor-1', title: 'Monitor launch metrics', description: 'Track signups, activation, and engagement', type: 'analytics', priority: 'high', assignedRole: 'analyst' },
        { id: 'respond-1', title: 'Respond to user feedback', description: 'Address questions and concerns from new users', type: 'support', priority: 'high', assignedRole: 'support' },
        { id: 'iterate-2', title: 'Quick fixes and improvements', description: 'Rapidly address issues found during launch', type: 'development', priority: 'high', assignedRole: 'developer' },
      ],
    },
    growth: {
      default: [
        { id: 'growth-1', title: 'Analyze acquisition channels', description: 'Identify which channels drive best results', type: 'analytics', priority: 'high', assignedRole: 'analyst' },
        { id: 'growth-2', title: 'Optimize top channel', description: 'Double down on best performing channel', type: 'marketing', priority: 'critical', assignedRole: 'marketing_manager' },
        { id: 'growth-3', title: 'Set up referral program', description: 'Create incentives for user referrals', type: 'marketing', priority: 'high', assignedRole: 'marketing_manager' },
        { id: 'content-1', title: 'Create content strategy', description: 'Plan content for organic acquisition', type: 'content', priority: 'medium', assignedRole: 'content_creator' },
        { id: 'content-2', title: 'Publish 5 blog posts', description: 'Create valuable content for target audience', type: 'content', priority: 'medium', assignedRole: 'content_creator' },
        { id: 'retention-1', title: 'Analyze churn reasons', description: 'Understand why users leave', type: 'analytics', priority: 'high', assignedRole: 'analyst' },
        { id: 'retention-2', title: 'Implement retention features', description: 'Build features to reduce churn', type: 'development', priority: 'high', assignedRole: 'developer' },
        { id: 'expand-1', title: 'Explore new segments', description: 'Research adjacent customer segments', type: 'research', priority: 'medium', assignedRole: 'ceo' },
      ],
    },
    optimize: {
      default: [
        { id: 'ops-1', title: 'Document all processes', description: 'Create SOPs for all operations', type: 'documentation', priority: 'high', assignedRole: 'support' },
        { id: 'ops-2', title: 'Automate repetitive tasks', description: 'Set up automation for common workflows', type: 'development', priority: 'high', assignedRole: 'developer' },
        { id: 'team-1', title: 'Define hiring needs', description: 'Identify roles needed for scale', type: 'planning', priority: 'medium', assignedRole: 'ceo' },
        { id: 'team-2', title: 'Create job descriptions', description: 'Write compelling job posts', type: 'content', priority: 'medium', assignedRole: 'ceo' },
        { id: 'metrics-1', title: 'Build metrics dashboard', description: 'Create real-time KPI tracking', type: 'analytics', priority: 'high', assignedRole: 'analyst' },
        { id: 'efficiency-1', title: 'Optimize unit economics', description: 'Improve profitability per customer', type: 'strategy', priority: 'high', assignedRole: 'ceo' },
        { id: 'scale-1', title: 'Prepare for scaling', description: 'Ensure infrastructure can handle growth', type: 'development', priority: 'high', assignedRole: 'developer' },
      ],
    },
  };

  return baseTasks[stage]?.default || [];
}

export class TemplateService {
  // Match prompt to best template using keywords
  async matchTemplate(prompt: string): Promise<TemplateMatch | null> {
    const allTemplates = await db.select().from(templates).where(eq(templates.isActive, 1));

    if (allTemplates.length === 0) {
      return null;
    }

    const promptLower = prompt.toLowerCase();
    let bestMatch: TemplateMatch | null = null;
    let highestScore = 0;

    for (const template of allTemplates) {
      const keywords = (template.keywords as string[]) || [];
      let score = 0;

      // Check keyword matches
      for (const keyword of keywords) {
        if (promptLower.includes(keyword.toLowerCase())) {
          score += 10;
        }
      }

      // Check category match
      if (promptLower.includes(template.category)) {
        score += 5;
      }

      // Check name match
      if (promptLower.includes(template.name.toLowerCase())) {
        score += 15;
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = {
          templateId: template.id,
          score,
          template,
        };
      }
    }

    // Return best match if score is above threshold, otherwise return first template as default
    if (bestMatch && bestMatch.score > 5) {
      return bestMatch;
    }

    // Return default template
    const defaultTemplate = allTemplates.find(t => t.slug === 'saas-startup') || allTemplates[0];
    return {
      templateId: defaultTemplate.id,
      score: 0,
      template: defaultTemplate,
    };
  }

  // Get template by ID
  async getTemplate(templateId: string) {
    const result = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
    return result[0] || null;
  }

  // Get template by slug
  async getTemplateBySlug(slug: string) {
    const result = await db.select().from(templates).where(eq(templates.slug, slug)).limit(1);
    return result[0] || null;
  }

  // Get all templates
  async getAllTemplates() {
    return db.select().from(templates).where(eq(templates.isActive, 1));
  }

  // Get playbook for template
  async getPlaybookForTemplate(templateId: string) {
    const result = await db.select().from(playbooks).where(eq(playbooks.templateId, templateId)).limit(1);
    return result[0] || null;
  }

  // Seed default templates
  async seedDefaultTemplates(): Promise<void> {
    console.log('Seeding default templates...');

    for (const templateData of DEFAULT_TEMPLATES) {
      // Check if template already exists
      const existing = await this.getTemplateBySlug(templateData.slug);
      if (existing) {
        console.log(`Template ${templateData.slug} already exists, skipping...`);
        continue;
      }

      // Insert template
      const [template] = await db.insert(templates).values({
        slug: templateData.slug,
        name: templateData.name,
        description: templateData.description,
        category: templateData.category,
        businessModel: templateData.businessModel,
        audience: templateData.audience,
        keywords: templateData.keywords,
        icon: templateData.icon,
        color: templateData.color,
        agents: templateData.agents,
        departments: templateData.departments,
        defaultStrategy: templateData.defaultStrategy,
        detectedInfo: templateData.detectedInfo,
        isActive: 1,
        isSystem: 1,
      }).returning();

      console.log(`Created template: ${templateData.slug} (${template.id})`);

      // Create playbook for this template
      const playbookStages = DEFAULT_PLAYBOOKS[templateData.slug];
      if (playbookStages) {
        const stagesWithTasks: PlaybookStage[] = playbookStages.map(stage => ({
          ...stage,
          tasks: generateStageTasks(stage.stage, templateData.slug),
        }));

        const [playbook] = await db.insert(playbooks).values({
          templateId: template.id,
          slug: `${templateData.slug}-playbook`,
          name: `${templateData.name} Playbook`,
          description: `Standard playbook for ${templateData.name.toLowerCase()} businesses`,
          stages: stagesWithTasks,
          targetBusinessType: templateData.category,
          isActive: 1,
          isSystem: 1,
        }).returning();

        console.log(`Created playbook: ${playbook.slug} (${playbook.id})`);
      }
    }

    console.log('Default templates seeded successfully!');
  }

  // Increment usage count
  async incrementUsage(templateId: string): Promise<void> {
    const template = await this.getTemplate(templateId);
    if (template) {
      await db.update(templates)
        .set({ usageCount: (template.usageCount || 0) + 1 })
        .where(eq(templates.id, templateId));
    }
  }
}

export const templateService = new TemplateService();
