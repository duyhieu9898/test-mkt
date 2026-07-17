import { describe, expect, it } from 'vitest';
import { mapToOpenAIImageSize } from './image-generator';

describe('OpenAI image sizing', () => {
  it('preserves the campaign banner aspect ratio for GPT Image 2', () => {
    expect(mapToOpenAIImageSize(1200, 628, 'gpt-image-2')).toBe('1200x624');
  });

  it('keeps legacy GPT Image models on their supported preset sizes', () => {
    expect(mapToOpenAIImageSize(1200, 628, 'gpt-image-1.5')).toBe('1536x1024');
  });
});
