'use client';

import type { PostPreviewMetrics } from './index';

export function formatPostMetric(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPostTimestamp(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function hasPostMetrics(metrics?: PostPreviewMetrics | null): boolean {
  return Boolean(metrics && [
    metrics.views,
    metrics.reach,
    metrics.reactions,
    metrics.comments,
    metrics.shares,
  ].some((value) => typeof value === 'number'));
}
