/**
 * AI Engines Index
 *
 * Central export for all AI-powered engines in the marketing workflow:
 *
 * Market Intelligence → Content Research → Content Planning
 *                          ↓
 *                   SEO Content Factory
 *                          ↓
 *                   Landing Page SEO Engine
 *                          ↓
 *                   Deployment Engine
 *                          ↓
 *                   Distribution Engine
 *                          ↓
 *                   Data Collection
 *                          ↓
 *                   Optimization Engine
 */

// Core Engines
export { marketIntelligenceEngine, type MarketIntelligenceReport } from './market-intelligence-engine';
export {
  contentResearchEngine,
  type ContentTopic,
  type ContentBrief,
  type ContentResearchReport,
} from './content-research-engine';
export {
  contentPlanningEngine,
  type ContentPlanItem,
  type ContentCalendar,
  type CampaignPlan,
} from './content-planning-engine';
export {
  optimizationEngine,
  type OptimizationRecommendation,
  type OptimizationReport,
} from './optimization-engine';

// SEO Engines
export {
  seoContentFactory,
  type SEOContentType,
  type SearchIntent,
  type SEOKeyword,
  type SEOContentInput,
  type SEOContentOutput,
  type SEOFactoryResult,
} from './seo-content-factory';
export {
  landingPageSEOEngine,
  type SEOConfig,
  type TechnicalSEO,
  type SitemapEntry,
  type RenderedPage,
} from './landing-page-seo-engine';
export {
  landingPageDeploymentEngine,
  type DeploymentStatus,
  type DomainType,
  type SSLStatus,
  type DeploymentConfig,
  type DeploymentResult,
  type DomainConfig,
} from './landing-page-deployment-engine';
export {
  seoRankingFeedbackEngine,
  type KeywordRanking,
  type PagePerformance,
  type RankingReport,
  type OptimizationAction,
  type FeedbackLoopResult,
} from './seo-ranking-feedback-engine';

// Execution Loop
export {
  agentExecutionLoop,
  type ExecutionContext,
  type ExecutionResult,
  type ExecutionStep,
} from './agent-execution-loop';
