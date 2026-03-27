'use client';

import { useMemo } from 'react';
import type { BlockType } from '@1person/workflow/landing-pages/blocks';
import {
  HeroBlock,
  ProblemBlock,
  SolutionBlock,
  FeaturesBlock,
  TestimonialsBlock,
  PricingBlock,
  FAQBlock,
  CTABlock,
  FooterBlock,
} from './index';

interface BlockData {
  id: string;
  type: BlockType | string;
  content: Record<string, unknown>;
  order: number;
  isVisible?: boolean;
  backgroundColor?: string;
}

interface BlockRendererProps {
  block: BlockData;
  primaryColor: string;
  isEditing?: boolean;
  onFieldClick?: (fieldPath: string[]) => void;
  onContentChange?: (content: Partial<Record<string, unknown>>) => void;
}

export function BlockRenderer({
  block,
  primaryColor,
  isEditing,
  onFieldClick,
  onContentChange,
}: BlockRendererProps) {
  const Component = useMemo(() => {
    switch (block.type) {
      case 'hero':
        return HeroBlock;
      case 'problem':
        return ProblemBlock;
      case 'solution':
        return SolutionBlock;
      case 'features':
        return FeaturesBlock;
      case 'testimonials':
        return TestimonialsBlock;
      case 'pricing':
        return PricingBlock;
      case 'faq':
        return FAQBlock;
      case 'cta':
        return CTABlock;
      case 'footer':
        return FooterBlock;
      default:
        return null;
    }
  }, [block.type]);

  if (!Component) {
    return (
      <div className="py-8 px-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
        <p className="text-yellow-700">Unknown block type: {block.type}</p>
      </div>
    );
  }

  return (
    <Component
      content={block.content as any}
      primaryColor={primaryColor}
      isEditing={isEditing}
      onFieldClick={onFieldClick}
      onContentChange={onContentChange}
    />
  );
}

interface BlockListRendererProps {
  blocks: BlockData[];
  primaryColor: string;
  isEditing?: boolean;
  onBlockFieldClick?: (blockId: string, fieldPath: string[]) => void;
}

export function BlockListRenderer({
  blocks,
  primaryColor,
  isEditing,
  onBlockFieldClick,
}: BlockListRendererProps) {
  const sortedBlocks = useMemo(
    () => [...blocks].sort((a, b) => a.order - b.order),
    [blocks]
  );

  return (
    <>
      {sortedBlocks.map((block) => (
        <BlockRenderer
          key={block.id}
          block={block}
          primaryColor={primaryColor}
          isEditing={isEditing}
          onFieldClick={
            onBlockFieldClick
              ? (fieldPath) => onBlockFieldClick(block.id, fieldPath)
              : undefined
          }
        />
      ))}
    </>
  );
}
