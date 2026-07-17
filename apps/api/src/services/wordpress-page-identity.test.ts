import { describe, expect, it } from 'vitest';
import {
  assertWordPressPageIdentity,
  resolveWordPressPageId,
} from './wordpress-page-identity';

describe('WordPress page identity', () => {
  it('creates a page only when no prior WordPress deployment exists', () => {
    expect(resolveWordPressPageId(null)).toBeNull();
  });

  it('reuses the saved WordPress Page ID for later publishes', () => {
    expect(resolveWordPressPageId({ externalDeploymentId: '123' })).toBe(123);
  });

  it('stops instead of creating a duplicate when the saved ID is invalid', () => {
    expect(() => resolveWordPressPageId({ externalDeploymentId: null })).toThrow(
      'stopped to avoid creating a duplicate page',
    );
    expect(() => resolveWordPressPageId({ externalDeploymentId: 'not-a-number' })).toThrow(
      'stopped to avoid creating a duplicate page',
    );
  });

  it('rejects an unexpected Page ID returned by WordPress', () => {
    expect(() => assertWordPressPageIdentity(123, 456)).toThrow(
      'linked to Page ID 123',
    );
    expect(() => assertWordPressPageIdentity(123, 123)).not.toThrow();
  });
});
