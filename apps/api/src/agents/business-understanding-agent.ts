/**
 * Business Understanding Agent - LAYER 3: The AI Brain
 *
 * Takes REAL extracted content (not raw HTML) and user input.
 * Produces specific business classification with confidence score.
 *
 * RULES:
 * - NEVER returns "General Business" or "General audience"
 * - User input has HIGHER priority than AI guessing
 * - Must explain reasoning
 * - Must include confidence score
 */

import { llmGenerate, extractJSON } from '../lib/llm';
import { BaseAgent, type AgentContext, type AgentResult } from './base-agent';
import type { ExtractedContent } from './content-extraction-agent';

export interface BusinessProfile {
  businessType: string;
  targetAudience: string;
  coreOffering: string;
  industry: string;
  offerings: string[];
  valueProposition: string;
  monetizationModel: string;
  market: string;
  strategy: string;
  confidence: number;
  reasoning: string;
}

export class BusinessUnderstandingAgent extends BaseAgent {
  readonly name = 'business_understanding';
  readonly description = 'Analyzes extracted website content and user input to build a specific business profile with confidence score';
  readonly capabilities = ['analyze_business', 'extract_business_info', 'identify_competitors', 'find_keywords'];

  canHandle(taskType: string): boolean {
    return this.capabilities.includes(taskType);
  }

  async execute(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult> {
    const extractedContent = input.extractedContent as ExtractedContent | undefined;
    const userInput = input.userInput as string | undefined;
    const url = input.url as string | undefined;

    // We need at least extracted content or user input
    if (!extractedContent && !userInput) {
      return { success: false, data: {}, error: 'Either extractedContent or userInput is required' };
    }

    // Check memory for existing profile to evolve
    let previousProfile: string | undefined;
    try {
      const existing = await context.memory.recallKnowledge('company_profile');
      if (existing.length > 0) {
        previousProfile = existing[0].content.substring(0, 1000);
      }
    } catch {}

    try {
      const profile = await this.analyzeWithAI(extractedContent, userInput, url, previousProfile);

      // Merge: user input overrides AI if conflict
      const finalProfile = this.mergeWithUserInput(profile, userInput);

      return {
        success: true,
        data: {
          businessInfo: finalProfile,
          confidence: finalProfile.confidence,
        },
        suggestedNextTasks: [
          {
            type: 'generate_plan',
            title: 'Generate growth plan',
            input: {
              businessInfo: finalProfile,
              url,
            },
            priority: 'high',
          },
        ],
        memoryEntries: [
          {
            type: 'customer_insight',
            title: `Business Profile: ${finalProfile.businessType}`,
            content: JSON.stringify(finalProfile),
            metadata: {
              tags: ['business', 'profile'],
              url,
              confidence: finalProfile.confidence,
            },
          },
        ],
      };
    } catch (error) {
      console.error('Business understanding failed:', error);
      return { success: false, data: {}, error: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown'}` };
    }
  }

  private async analyzeWithAI(
    extracted: ExtractedContent | undefined,
    userInput: string | undefined,
    url: string | undefined,
    previousProfile: string | undefined
  ): Promise<BusinessProfile> {
    const contentSection = extracted
      ? `EXTRACTED WEBSITE CONTENT:
<<<
Hero: ${extracted.heroMessage}
What they do: ${extracted.whatTheyDo}
Services: ${extracted.services.join(', ')}
Target signals: ${extracted.targetSignals.join(', ')}
Keywords: ${extracted.keywords.join(', ')}
Pricing: ${extracted.pricingSignals.join(', ')}
Social proof: ${extracted.testimonialSignals.join(', ')}

Sample text:
${extracted.rawTextSample}
>>>`
      : 'No website content available.';

    const userSection = userInput
      ? `\nUSER INPUT (HIGHER PRIORITY):\n<<<\n${userInput}\n>>>`
      : '';

    const previousSection = previousProfile
      ? `\nPREVIOUS ANALYSIS (improve upon this):\n${previousProfile}`
      : '';

    const { text } = await llmGenerate([{
        role: 'system',
        content: `You are a business analyst who creates precise business profiles. STRICT RULES:
1. Return valid JSON only
2. NEVER return "Unknown", "General", "Various", or vague descriptions
3. Extract EXACT information from the provided content — quote directly when possible
4. If information is missing, infer from context and set confidence accordingly
5. businessType must be 3-5 words, hyper-specific (e.g., "Kids Coding Academy in HCMC" not "Education")
6. targetAudience must include demographics: age, role, location, income level if detectable
7. offerings must list SPECIFIC products/services with names, not categories`,
      }, {
        role: 'user',
        content: `Analyze this business and create a precise profile. ${url ? `URL: ${url}` : ''}

${contentSection}
${userSection}
${previousSection}

Return JSON:
{
  "businessType": "hyper-specific type (e.g., 'English-Medium Kids Coding Academy' not 'Education')",
  "targetAudience": "specific demographics + psychographics (e.g., 'Affluent parents in HCMC, ages 30-45, with children 6-15, who value bilingual education and STEM skills')",
  "coreOffering": "the primary product/service they sell",
  "industry": "specific niche within industry (e.g., 'EdTech - Children's Programming Education')",
  "offerings": ["Exact Service 1 with details", "Exact Service 2 with details"],
  "valueProposition": "one sentence that captures their unique advantage over competitors",
  "monetizationModel": "specific revenue model (e.g., 'Monthly class subscriptions $X-$Y + workshop fees')",
  "market": "geographic + demographic market (e.g., 'Premium children's education in Ho Chi Minh City')",
  "strategy": "recommended growth approach based on their positioning",
  "confidence": 0.85,
  "reasoning": "specific evidence from the content that supports this analysis"
}`,
      }], { maxTokens: 800 });

    const parsed = extractJSON(text);

    if (!parsed) {
      throw new Error('AI returned no structured data');
    }

    // Validate: reject vague answers
    if (parsed.businessType?.toLowerCase().includes('general')) {
      parsed.businessType = extracted?.whatTheyDo || userInput || 'Business (needs more data)';
      parsed.confidence = Math.min(parsed.confidence || 0.5, 0.4);
    }
    if (parsed.targetAudience?.toLowerCase().includes('general')) {
      parsed.targetAudience = extracted?.targetSignals?.join(', ') || 'To be determined';
      parsed.confidence = Math.min(parsed.confidence || 0.5, 0.4);
    }

    return {
      businessType: parsed.businessType || 'Unknown',
      targetAudience: parsed.targetAudience || 'Unknown',
      coreOffering: parsed.coreOffering || '',
      industry: parsed.industry || '',
      offerings: parsed.offerings || [],
      valueProposition: parsed.valueProposition || '',
      monetizationModel: parsed.monetizationModel || '',
      market: parsed.market || '',
      strategy: parsed.strategy || '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning || '',
    };
  }

  private mergeWithUserInput(profile: BusinessProfile, userInput: string | undefined): BusinessProfile {
    if (!userInput) return profile;

    const input = userInput.trim();
    // Skip if input is just a URL
    if (/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(input) && input.split(' ').length <= 3) {
      return profile;
    }

    // User gave substantial input - it OVERRIDES AI inference
    if (input.length > 15) {
      // Extract key phrases from user input
      const lower = input.toLowerCase();

      // Detect explicit business type from user
      const userBusinessType = this.extractUserBusinessType(input);
      const userAudience = this.extractUserAudience(input);

      const merged = { ...profile };

      // User input ALWAYS overrides if they provide specific info
      if (userBusinessType) {
        merged.coreOffering = userBusinessType;
        // Don't override businessType entirely - blend it
        if (!merged.businessType.toLowerCase().includes(userBusinessType.toLowerCase())) {
          merged.businessType = `${userBusinessType} (${merged.businessType})`;
        }
      }

      if (userAudience) {
        merged.targetAudience = userAudience;
      }

      // User description becomes part of value proposition
      merged.valueProposition = input.length > merged.valueProposition.length
        ? input
        : merged.valueProposition;

      merged.reasoning = `${merged.reasoning}. User explicitly stated: "${input.substring(0, 150)}" — user input takes priority.`;
      merged.confidence = Math.min(merged.confidence + 0.15, 0.99);

      return merged;
    }

    return profile;
  }

  private extractUserBusinessType(input: string): string | null {
    // Look for "we do X", "we teach X", "we sell X", "we build X"
    const patterns = [
      /(?:we|i)\s+(?:do|teach|sell|build|offer|provide|create|run|manage)\s+(.+?)(?:\.|,|$)/i,
      /(?:our|my)\s+(?:company|business|platform|service)\s+(?:is|does|offers?)\s+(.+?)(?:\.|,|$)/i,
      /(?:a|an)\s+(.+?)\s+(?:platform|service|company|agency|tool|app)/i,
    ];
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }

  private extractUserAudience(input: string): string | null {
    const patterns = [
      /(?:for|targeting|serving)\s+(.+?)(?:\.|,|$)/i,
      /(?:our|my)\s+(?:customers?|users?|clients?|audience)\s+(?:are|is)\s+(.+?)(?:\.|,|$)/i,
    ];
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }
}
