/**
 * Social Detection Agent - Detects social media profiles from HTML
 */

import { BaseAgent, type AgentContext, type AgentResult } from './base-agent';

export class SocialDetectionAgent extends BaseAgent {
  readonly name = 'social_detection';
  readonly description = 'Detects social media profiles linked from a website';
  readonly capabilities = ['detect_social_profiles'];

  canHandle(taskType: string): boolean {
    return this.capabilities.includes(taskType);
  }

  async execute(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult> {
    const html = input.html as string;
    if (!html) {
      return { success: false, data: {}, error: 'HTML content is required' };
    }

    const platforms = [
      { platform: 'Facebook', pattern: /href=["'](https?:\/\/(www\.)?facebook\.com\/[^"'\s]+)["']/gi },
      { platform: 'Instagram', pattern: /href=["'](https?:\/\/(www\.)?instagram\.com\/[^"'\s]+)["']/gi },
      { platform: 'Twitter', pattern: /href=["'](https?:\/\/(www\.)?(twitter|x)\.com\/[^"'\s]+)["']/gi },
      { platform: 'LinkedIn', pattern: /href=["'](https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[^"'\s]+)["']/gi },
      { platform: 'YouTube', pattern: /href=["'](https?:\/\/(www\.)?youtube\.com\/(c|channel|@)[^"'\s]+)["']/gi },
      { platform: 'TikTok', pattern: /href=["'](https?:\/\/(www\.)?tiktok\.com\/@[^"'\s]+)["']/gi },
    ];

    const profiles = platforms.map(({ platform, pattern }) => {
      const match = pattern.exec(html);
      return { platform, url: match ? match[1] : '', detected: !!match };
    });

    const detected = profiles.filter((p) => p.detected);

    return {
      success: true,
      data: { socialProfiles: profiles },
      memoryEntries: detected.length > 0 ? [
        {
          type: 'customer_insight',
          title: `Social profiles detected: ${detected.map((p) => p.platform).join(', ')}`,
          content: JSON.stringify(detected),
          metadata: { tags: ['social', 'profiles'] },
        },
      ] : undefined,
    };
  }
}
