export type ProcessingStep =
  | 'understanding'
  | 'analyzing_website'
  | 'creating_ceo'
  | 'creating_marketing'
  | 'creating_operations'
  | 'generating_strategy';

export type FTUXStep =
  | 'landing'
  | 'processing'
  | 'business-confirmation'
  | 'org-chart'
  | 'master-plan'
  | 'execution-trigger'
  | 'celebration';

export type InputType = 'text' | 'url';

export interface DetectedInfo {
  market: string;
  model: string;
  strategy: string;
}

export interface DetectedBusinessInfo extends DetectedInfo {
  companyName: string;
  industry: string;
  audience: string;
  offerings: string[];
  valueProposition: string;
}

export interface SEOAuditResult {
  score: number;
  metaTags: { title: string; description: string; hasOgTags: boolean };
  headings: { h1Count: number; h2Count: number; issues: string[] };
  missingElements: string[];
  performanceHints: string[];
}

export interface CompetitorInfo {
  name: string;
  domain: string;
  strengths: string[];
}

export interface SocialProfile {
  platform: string;
  url: string;
  detected: boolean;
}

export interface KeywordOpportunity {
  keyword: string;
  volume: string;
  competition: 'low' | 'medium' | 'high';
  relevance: number;
}

export interface WebsiteAnalysis {
  businessInfo: DetectedBusinessInfo;
  seoAudit: SEOAuditResult;
  competitors: CompetitorInfo[];
  socialProfiles: SocialProfile[];
  keywordOpportunities: KeywordOpportunity[];
}

export interface PlanItem {
  action: string;
  timeline: string;
  expectedImpact: string;
  priority: 'high' | 'medium' | 'low';
}

export interface PlanBlock {
  title: string;
  description: string;
  items: PlanItem[];
}

export interface MasterPlan {
  seoGrowthPlan: PlanBlock;
  contentPlan: PlanBlock;
  socialMediaPlan: PlanBlock;
}

export interface FTUXAgent {
  id: string;
  name: string;
  role: string;
  title: string;
  emoji: string;
  color: string;
  supervisorId?: string;
  responsibilities: string[];
}

export interface StrategyDay {
  day: number | string;
  title: string;
  activities: string[];
  assignedAgents?: string[];
}

export interface FTUXStrategy {
  vision: string;
  days: StrategyDay[];
}

export interface FTUXResults {
  company: {
    id: string;
    name: string;
    slug: string;
  };
  agents: FTUXAgent[];
  strategy: FTUXStrategy;
  masterPlan?: MasterPlan;
  websiteAnalysis?: WebsiteAnalysis;
}

export interface ProcessingTimeline {
  step: ProcessingStep;
  duration: number;
  thinkingTexts: string[];
}
