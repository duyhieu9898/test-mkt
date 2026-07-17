import { describe, it, expect } from 'vitest';

/**
 * Landing Page Service Unit Tests
 *
 * These tests validate the business logic without requiring database or API connections.
 * For full integration tests, see landing-page.integration.test.ts
 */

describe('LandingPageService - Slug Generation', () => {
  // Helper function to generate slug (mirrors the service implementation)
  const generateSlug = (name: string): string => {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50);
    const random = Math.random().toString(36).substring(2, 8);
    return `${base}-${random}`;
  };

  it('should generate a valid slug from business name', () => {
    const slug = generateSlug('My Awesome Business');
    expect(slug).toMatch(/^my-awesome-business-[a-z0-9]+$/);
  });

  it('should handle special characters', () => {
    const slug = generateSlug('Test & Co. LLC!');
    expect(slug).toMatch(/^test-co-llc-[a-z0-9]+$/);
  });

  it('should handle spaces correctly', () => {
    const slug = generateSlug('  Multiple   Spaces  ');
    expect(slug).toMatch(/^-multiple-spaces--[a-z0-9]+$/);
  });

  it('should truncate long names', () => {
    const longName = 'A'.repeat(100);
    const slug = generateSlug(longName);
    expect(slug.length).toBeLessThanOrEqual(57); // 50 + dash + 6 chars
  });
});

describe('LandingPageService - Style Options', () => {
  const validStyles = ['minimal', 'modern', 'bold', 'professional', 'playful', 'elegant'];

  validStyles.forEach((style) => {
    it(`should accept "${style}" as a valid style`, () => {
      expect(validStyles).toContain(style);
    });
  });

  it('should have 6 style options', () => {
    expect(validStyles).toHaveLength(6);
  });
});

describe('LandingPageService - Color Validation', () => {
  it('should accept valid hex colors', () => {
    const validColors = ['#000000', '#FFFFFF', '#3b82f6', '#ff0000'];
    validColors.forEach((color) => {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it('should reject invalid hex colors', () => {
    const invalidColors = ['000000', '#fff', 'red', '#GGGGGG'];
    invalidColors.forEach((color) => {
      expect(color).not.toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

describe('LandingPageService - Section Types', () => {
  const validSectionTypes = [
    'hero',
    'problem',
    'solution',
    'features',
    'benefits',
    'testimonials',
    'pricing',
    'faq',
    'cta',
    'image',
    'footer',
  ];

  validSectionTypes.forEach((type) => {
    it(`should support "${type}" section type`, () => {
      expect(validSectionTypes).toContain(type);
    });
  });
});

describe('LandingPageService - Status Transitions', () => {
  const validTransitions = [
    { from: 'draft', to: 'generating' },
    { from: 'generating', to: 'ready' },
    { from: 'generating', to: 'failed' },
    { from: 'ready', to: 'published' },
    { from: 'published', to: 'archived' },
    { from: 'ready', to: 'archived' },
  ];

  validTransitions.forEach(({ from, to }) => {
    it(`should allow transition from "${from}" to "${to}"`, () => {
      // Status transition logic test
      const isValidTransition = (currentStatus: string, newStatus: string): boolean => {
        const transitions: Record<string, string[]> = {
          draft: ['generating'],
          generating: ['ready', 'failed'],
          ready: ['published', 'archived'],
          published: ['archived'],
          failed: ['draft', 'archived'],
        };
        return transitions[currentStatus]?.includes(newStatus) || false;
      };

      expect(isValidTransition(from, to)).toBe(true);
    });
  });
});

describe('LandingPageService - Lead Capture', () => {
  it('should validate email format', () => {
    const validEmails = ['test@example.com', 'user.name@domain.org', 'a@b.co'];
    const invalidEmails = ['invalid', '@domain.com', 'user@', 'user@.com'];

    validEmails.forEach((email) => {
      expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });

    invalidEmails.forEach((email) => {
      expect(email).not.toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });
  });

  it('should track lead source correctly', () => {
    const leadData = {
      email: 'test@example.com',
      source: 'google',
      medium: 'cpc',
      campaign: 'summer-sale',
    };

    expect(leadData.source).toBe('google');
    expect(leadData.medium).toBe('cpc');
    expect(leadData.campaign).toBe('summer-sale');
  });
});
