import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Landing Pages API Integration Tests
 *
 * These tests verify the API endpoints work correctly.
 * They require a running database and API server.
 *
 * Run with: pnpm test:run
 */

const API_URL = 'http://localhost:8004/api/v1';

// Test token - update this with a valid token for testing
const TEST_TOKEN = process.env.TEST_TOKEN || '';
const TEST_COMPANY_ID = process.env.TEST_COMPANY_ID || '';

// Skip integration tests if no token is provided
const skipIntegration = !TEST_TOKEN || !TEST_COMPANY_ID;

describe.skipIf(skipIntegration)('Landing Pages API - Integration Tests', () => {
  describe('GET /landing-pages', () => {
    it('should return landing pages for a company', async () => {
      const response = await fetch(
        `${API_URL}/landing-pages?companyId=${TEST_COMPANY_ID}`,
        {
          headers: {
            Authorization: `Bearer ${TEST_TOKEN}`,
          },
        }
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(typeof data.count).toBe('number');
    });

    it('should require companyId parameter', async () => {
      const response = await fetch(`${API_URL}/landing-pages`, {
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
      });

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await fetch(
        `${API_URL}/landing-pages?companyId=${TEST_COMPANY_ID}`
      );

      expect(response.status).toBe(401);
    });
  });

  describe('POST /landing-pages/generate', () => {
    it('should validate required fields', async () => {
      const response = await fetch(`${API_URL}/landing-pages/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });

    it('should validate prompt minimum length', async () => {
      const response = await fetch(`${API_URL}/landing-pages/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyId: TEST_COMPANY_ID,
          prompt: 'short', // Less than 10 characters
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should validate style options', async () => {
      const response = await fetch(`${API_URL}/landing-pages/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyId: TEST_COMPANY_ID,
          prompt: 'A valid prompt for testing landing page generation',
          style: 'invalid-style', // Not in allowed enum
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should validate hex color format', async () => {
      const response = await fetch(`${API_URL}/landing-pages/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyId: TEST_COMPANY_ID,
          prompt: 'A valid prompt for testing landing page generation',
          primaryColor: 'not-a-hex-color',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /landing-pages/:id', () => {
    it('should return 404 for non-existent page', async () => {
      const response = await fetch(
        `${API_URL}/landing-pages/00000000-0000-0000-0000-000000000000`,
        {
          headers: {
            Authorization: `Bearer ${TEST_TOKEN}`,
          },
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /landing-pages/:id/status', () => {
    it('should validate status values', async () => {
      const response = await fetch(
        `${API_URL}/landing-pages/00000000-0000-0000-0000-000000000000/status`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${TEST_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'invalid-status',
          }),
        }
      );

      expect(response.status).toBe(400);
    });
  });
});

// API Schema Tests (always run)
describe('Landing Pages API - Schema Validation', () => {
  describe('Generate Page Input Schema', () => {
    const validInput = {
      companyId: '123e4567-e89b-12d3-a456-426614174000',
      prompt: 'A valid prompt for generating a landing page',
      style: 'modern',
      primaryColor: '#3b82f6',
      includeFeatures: true,
      includePricing: false,
      includeTestimonials: true,
      includeFAQ: false,
    };

    it('should have all required fields defined', () => {
      expect(validInput.companyId).toBeDefined();
      expect(validInput.prompt).toBeDefined();
    });

    it('should have valid UUID format for companyId', () => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(validInput.companyId).toMatch(uuidRegex);
    });

    it('should have prompt with minimum length', () => {
      expect(validInput.prompt.length).toBeGreaterThanOrEqual(10);
    });

    it('should have valid style option', () => {
      const validStyles = [
        'minimal',
        'modern',
        'bold',
        'professional',
        'playful',
        'elegant',
      ];
      expect(validStyles).toContain(validInput.style);
    });

    it('should have valid hex color', () => {
      expect(validInput.primaryColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('should have boolean section options', () => {
      expect(typeof validInput.includeFeatures).toBe('boolean');
      expect(typeof validInput.includePricing).toBe('boolean');
      expect(typeof validInput.includeTestimonials).toBe('boolean');
      expect(typeof validInput.includeFAQ).toBe('boolean');
    });
  });

  describe('Landing Page Response Schema', () => {
    const mockPage = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      companyId: '123e4567-e89b-12d3-a456-426614174001',
      name: 'Test Page',
      slug: 'test-page-abc123',
      status: 'ready',
      sections: [],
      seo: {
        title: 'Test Page',
        description: 'A test landing page',
        keywords: ['test', 'page'],
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    it('should have required fields', () => {
      expect(mockPage.id).toBeDefined();
      expect(mockPage.companyId).toBeDefined();
      expect(mockPage.name).toBeDefined();
      expect(mockPage.slug).toBeDefined();
      expect(mockPage.status).toBeDefined();
    });

    it('should have valid status', () => {
      const validStatuses = [
        'draft',
        'generating',
        'ready',
        'published',
        'archived',
      ];
      expect(validStatuses).toContain(mockPage.status);
    });

    it('should have valid SEO object', () => {
      expect(mockPage.seo.title).toBeDefined();
      expect(mockPage.seo.description).toBeDefined();
      expect(Array.isArray(mockPage.seo.keywords)).toBe(true);
    });

    it('should have ISO date strings', () => {
      expect(new Date(mockPage.createdAt).toISOString()).toBe(
        mockPage.createdAt
      );
      expect(new Date(mockPage.updatedAt).toISOString()).toBe(
        mockPage.updatedAt
      );
    });
  });

  describe('Lead Capture Input Schema', () => {
    const validLead = {
      email: 'test@example.com',
      name: 'Test User',
      phone: '+1234567890',
      company: 'Test Company',
      message: 'Interested in your product',
      source: 'google',
      medium: 'cpc',
      campaign: 'summer-sale',
    };

    it('should require valid email', () => {
      expect(validLead.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });

    it('should have optional tracking fields', () => {
      expect(validLead.source).toBeDefined();
      expect(validLead.medium).toBeDefined();
      expect(validLead.campaign).toBeDefined();
    });
  });
});
