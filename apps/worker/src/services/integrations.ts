import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { agentLogger } from '../lib/logger';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

// Integration types
export type IntegrationType =
  | 'google_ads'
  | 'facebook_ads'
  | 'instagram'
  | 'twitter'
  | 'linkedin'
  | 'google_analytics'
  | 'hubspot'
  | 'salesforce'
  | 'slack'
  | 'email'
  | 'custom_webhook';

export interface IntegrationConfig {
  type: IntegrationType;
  enabled: boolean;
  credentials?: Record<string, string>;
  settings?: Record<string, unknown>;
}

export interface IntegrationAction {
  type: string;
  payload: Record<string, unknown>;
}

export interface IntegrationResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// Base integration class
abstract class BaseIntegration {
  protected type: IntegrationType;
  protected config: IntegrationConfig;
  protected logger: ReturnType<typeof agentLogger.child>;

  constructor(type: IntegrationType, config: IntegrationConfig) {
    this.type = type;
    this.config = config;
    this.logger = agentLogger.child({ integration: type });
  }

  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract execute(action: IntegrationAction): Promise<IntegrationResult>;
  abstract testConnection(): Promise<boolean>;
}

// Google Ads Integration
class GoogleAdsIntegration extends BaseIntegration {
  constructor(config: IntegrationConfig) {
    super('google_ads', config);
  }

  async connect(): Promise<boolean> {
    this.logger.info('Connecting to Google Ads');
    // In production, implement OAuth2 flow
    return true;
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from Google Ads');
  }

  async testConnection(): Promise<boolean> {
    // Test API connectivity
    return !!this.config.credentials?.apiKey;
  }

  async execute(action: IntegrationAction): Promise<IntegrationResult> {
    this.logger.info('Executing Google Ads action', { action: action.type });

    switch (action.type) {
      case 'get_campaigns':
        return this.getCampaigns();
      case 'get_metrics':
        return this.getMetrics(action.payload as { campaignId: string; dateRange: string });
      case 'create_campaign':
        return this.createCampaign(action.payload as { name: string; budget: number });
      case 'update_campaign':
        return this.updateCampaign(action.payload as { campaignId: string; updates: Record<string, unknown> });
      default:
        return { success: false, error: `Unknown action: ${action.type}` };
    }
  }

  private async getCampaigns(): Promise<IntegrationResult> {
    // Simulated response - in production, call Google Ads API
    return {
      success: true,
      data: {
        campaigns: [
          { id: 'camp_1', name: 'Brand Awareness', status: 'active', spend: 1500 },
          { id: 'camp_2', name: 'Lead Generation', status: 'active', spend: 2300 },
        ],
      },
    };
  }

  private async getMetrics(payload: { campaignId: string; dateRange: string }): Promise<IntegrationResult> {
    return {
      success: true,
      data: {
        campaignId: payload.campaignId,
        impressions: 150000,
        clicks: 4500,
        ctr: 3.0,
        conversions: 120,
        cost: 850,
      },
    };
  }

  private async createCampaign(payload: { name: string; budget: number }): Promise<IntegrationResult> {
    this.logger.info('Creating campaign', payload);
    return {
      success: true,
      data: {
        campaignId: `camp_${Date.now()}`,
        name: payload.name,
        budget: payload.budget,
        status: 'draft',
      },
    };
  }

  private async updateCampaign(payload: { campaignId: string; updates: Record<string, unknown> }): Promise<IntegrationResult> {
    this.logger.info('Updating campaign', payload);
    return {
      success: true,
      data: {
        campaignId: payload.campaignId,
        updated: true,
      },
    };
  }
}

// Facebook/Meta Ads Integration
class FacebookAdsIntegration extends BaseIntegration {
  constructor(config: IntegrationConfig) {
    super('facebook_ads', config);
  }

  async connect(): Promise<boolean> {
    this.logger.info('Connecting to Facebook Ads');
    return true;
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from Facebook Ads');
  }

  async testConnection(): Promise<boolean> {
    return !!this.config.credentials?.accessToken;
  }

  async execute(action: IntegrationAction): Promise<IntegrationResult> {
    this.logger.info('Executing Facebook Ads action', { action: action.type });

    switch (action.type) {
      case 'get_ad_accounts':
        return {
          success: true,
          data: { accounts: [{ id: 'acc_1', name: 'Main Account' }] },
        };
      case 'get_campaigns':
        return {
          success: true,
          data: {
            campaigns: [
              { id: 'fb_camp_1', name: 'Engagement Campaign', objective: 'ENGAGEMENT' },
            ],
          },
        };
      case 'get_insights':
        return {
          success: true,
          data: {
            impressions: 200000,
            reach: 85000,
            clicks: 5200,
            spend: 1200,
          },
        };
      default:
        return { success: false, error: `Unknown action: ${action.type}` };
    }
  }
}

// Slack Integration
class SlackIntegration extends BaseIntegration {
  constructor(config: IntegrationConfig) {
    super('slack', config);
  }

  async connect(): Promise<boolean> {
    this.logger.info('Connecting to Slack');
    return true;
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from Slack');
  }

  async testConnection(): Promise<boolean> {
    return !!this.config.credentials?.botToken;
  }

  async execute(action: IntegrationAction): Promise<IntegrationResult> {
    this.logger.info('Executing Slack action', { action: action.type });

    switch (action.type) {
      case 'send_message':
        return this.sendMessage(action.payload as { channel: string; message: string });
      case 'post_update':
        return this.postUpdate(action.payload as { channel: string; blocks: unknown[] });
      default:
        return { success: false, error: `Unknown action: ${action.type}` };
    }
  }

  private async sendMessage(payload: { channel: string; message: string }): Promise<IntegrationResult> {
    this.logger.info('Sending Slack message', { channel: payload.channel });
    // In production, call Slack API
    return {
      success: true,
      data: {
        channel: payload.channel,
        messageId: `msg_${Date.now()}`,
        sent: true,
      },
    };
  }

  private async postUpdate(payload: { channel: string; blocks: unknown[] }): Promise<IntegrationResult> {
    return {
      success: true,
      data: { posted: true },
    };
  }
}

// Email Integration (SendGrid, Mailgun, etc.)
class EmailIntegration extends BaseIntegration {
  constructor(config: IntegrationConfig) {
    super('email', config);
  }

  async connect(): Promise<boolean> {
    this.logger.info('Connecting to Email service');
    return true;
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from Email service');
  }

  async testConnection(): Promise<boolean> {
    return !!this.config.credentials?.apiKey;
  }

  async execute(action: IntegrationAction): Promise<IntegrationResult> {
    this.logger.info('Executing Email action', { action: action.type });

    switch (action.type) {
      case 'send_email':
        return this.sendEmail(action.payload as {
          to: string;
          subject: string;
          body: string;
          html?: boolean;
        });
      case 'send_template':
        return this.sendTemplate(action.payload as {
          to: string;
          templateId: string;
          variables: Record<string, string>;
        });
      default:
        return { success: false, error: `Unknown action: ${action.type}` };
    }
  }

  private async sendEmail(payload: {
    to: string;
    subject: string;
    body: string;
    html?: boolean;
  }): Promise<IntegrationResult> {
    this.logger.info('Sending email', { to: payload.to, subject: payload.subject });
    return {
      success: true,
      data: {
        messageId: `email_${Date.now()}`,
        to: payload.to,
        sent: true,
      },
    };
  }

  private async sendTemplate(payload: {
    to: string;
    templateId: string;
    variables: Record<string, string>;
  }): Promise<IntegrationResult> {
    return {
      success: true,
      data: {
        messageId: `email_${Date.now()}`,
        templateId: payload.templateId,
        sent: true,
      },
    };
  }
}

// Webhook Integration
class WebhookIntegration extends BaseIntegration {
  constructor(config: IntegrationConfig) {
    super('custom_webhook', config);
  }

  async connect(): Promise<boolean> {
    return true;
  }

  async disconnect(): Promise<void> {}

  async testConnection(): Promise<boolean> {
    return !!this.config.settings?.webhookUrl;
  }

  async execute(action: IntegrationAction): Promise<IntegrationResult> {
    const webhookUrl = this.config.settings?.webhookUrl as string;
    if (!webhookUrl) {
      return { success: false, error: 'Webhook URL not configured' };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.credentials?.authHeader && {
            Authorization: this.config.credentials.authHeader,
          }),
        },
        body: JSON.stringify({
          action: action.type,
          payload: action.payload,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        return { success: false, error: `Webhook returned ${response.status}` };
      }

      return {
        success: true,
        data: { status: response.status },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Webhook failed',
      };
    }
  }
}

// Integration Manager
class IntegrationManager {
  private integrations: Map<string, BaseIntegration> = new Map();
  private logger = agentLogger.child({ service: 'integrations' });

  async loadCompanyIntegrations(companyId: string): Promise<void> {
    const company = await db.query.companies.findFirst({
      where: eq(schema.companies.id, companyId),
    });

    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    // In production, load from company settings or integrations table
    const integrationConfigs = (company.settings as { integrations?: IntegrationConfig[] })?.integrations || [];

    for (const config of integrationConfigs) {
      if (config.enabled) {
        const integration = this.createIntegration(config);
        if (integration) {
          this.integrations.set(`${companyId}:${config.type}`, integration);
          await integration.connect();
        }
      }
    }

    this.logger.info('Loaded integrations', {
      companyId,
      count: this.integrations.size,
    });
  }

  private createIntegration(config: IntegrationConfig): BaseIntegration | null {
    switch (config.type) {
      case 'google_ads':
        return new GoogleAdsIntegration(config);
      case 'facebook_ads':
        return new FacebookAdsIntegration(config);
      case 'slack':
        return new SlackIntegration(config);
      case 'email':
        return new EmailIntegration(config);
      case 'custom_webhook':
        return new WebhookIntegration(config);
      default:
        this.logger.warn('Unknown integration type', { type: config.type });
        return null;
    }
  }

  async executeAction(
    companyId: string,
    integrationType: IntegrationType,
    action: IntegrationAction
  ): Promise<IntegrationResult> {
    const key = `${companyId}:${integrationType}`;
    const integration = this.integrations.get(key);

    if (!integration) {
      return { success: false, error: `Integration not configured: ${integrationType}` };
    }

    try {
      return await integration.execute(action);
    } catch (error) {
      this.logger.error('Integration action failed', {
        companyId,
        type: integrationType,
        action: action.type,
        error: String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async testIntegration(
    companyId: string,
    integrationType: IntegrationType
  ): Promise<boolean> {
    const key = `${companyId}:${integrationType}`;
    const integration = this.integrations.get(key);
    if (!integration) return false;
    return integration.testConnection();
  }

  async disconnect(companyId: string): Promise<void> {
    for (const [key, integration] of this.integrations) {
      if (key.startsWith(`${companyId}:`)) {
        await integration.disconnect();
        this.integrations.delete(key);
      }
    }
  }
}

// Export singleton instance
export const integrationManager = new IntegrationManager();

// Helper function for agents to use integrations
export async function executeIntegrationAction(
  companyId: string,
  integrationType: IntegrationType,
  actionType: string,
  payload: Record<string, unknown>
): Promise<IntegrationResult> {
  return integrationManager.executeAction(companyId, integrationType, {
    type: actionType,
    payload,
  });
}

// Available integration actions for agents
export const AVAILABLE_INTEGRATION_ACTIONS: Record<IntegrationType, string[]> = {
  google_ads: ['get_campaigns', 'get_metrics', 'create_campaign', 'update_campaign'],
  facebook_ads: ['get_ad_accounts', 'get_campaigns', 'get_insights'],
  instagram: ['get_insights', 'schedule_post', 'get_followers'],
  twitter: ['post_tweet', 'get_analytics', 'schedule_tweet'],
  linkedin: ['post_update', 'get_company_analytics'],
  google_analytics: ['get_traffic', 'get_conversions', 'get_audience'],
  hubspot: ['create_contact', 'update_deal', 'get_pipeline'],
  salesforce: ['create_lead', 'update_opportunity', 'get_reports'],
  slack: ['send_message', 'post_update'],
  email: ['send_email', 'send_template'],
  custom_webhook: ['send'],
};
