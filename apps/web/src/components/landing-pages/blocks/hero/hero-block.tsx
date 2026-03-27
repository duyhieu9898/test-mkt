'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { InlineEditableText } from '../../editor/inline-editable-text';
import type { HeroContent } from '@1person/workflow/landing-pages/blocks';

interface HeroBlockProps {
  content: HeroContent;
  primaryColor: string;
  isEditing?: boolean;
  onFieldClick?: (fieldPath: string[]) => void;
  onContentChange?: (content: Partial<HeroContent>) => void;
}

export function HeroBlock({ content, primaryColor, isEditing, onFieldClick, onContentChange }: HeroBlockProps) {
  const handleFieldClick = (path: string[]) => (e: React.MouseEvent) => {
    if (isEditing && onFieldClick) {
      e.preventDefault();
      e.stopPropagation();
      onFieldClick(path);
    }
  };

  const handleTextChange = useCallback(
    (field: keyof HeroContent, value: string) => {
      if (onContentChange) {
        onContentChange({ [field]: value });
      }
    },
    [onContentChange]
  );

  const alignmentClasses = {
    left: 'text-left items-start',
    center: 'text-center items-center',
    right: 'text-right items-end',
  };

  return (
    <section
      className="py-20 px-4"
      style={{
        background: content.backgroundImage
          ? `url(${content.backgroundImage}) center/cover`
          : `linear-gradient(135deg, ${primaryColor}15, ${primaryColor}05)`,
      }}
    >
      <div
        className={`container mx-auto max-w-4xl flex flex-col ${alignmentClasses[content.alignment || 'center']}`}
      >
        <InlineEditableText
          value={content.headline || 'Welcome'}
          onChange={(value) => handleTextChange('headline', value)}
          isEditing={!!isEditing}
          as="h1"
          className="text-4xl md:text-5xl font-bold mb-6 text-gray-900"
          placeholder="Enter headline..."
        />
        {(content.subheadline || isEditing) && (
          <InlineEditableText
            value={content.subheadline || ''}
            onChange={(value) => handleTextChange('subheadline', value)}
            isEditing={!!isEditing}
            as="p"
            className={`text-xl text-gray-600 mb-8 max-w-2xl ${content.alignment === 'center' ? 'mx-auto' : ''}`}
            placeholder="Enter subheadline..."
          />
        )}
        <div
          className={`flex flex-col sm:flex-row gap-4 ${content.alignment === 'center' ? 'justify-center' : content.alignment === 'right' ? 'justify-end' : 'justify-start'}`}
        >
          {(content.ctaText || isEditing) && (
            <Button
              size="lg"
              style={{ backgroundColor: primaryColor }}
              className="text-white hover:opacity-90"
              onClick={isEditing ? handleFieldClick(['ctaText']) : undefined}
            >
              <InlineEditableText
                value={content.ctaText || ''}
                onChange={(value) => handleTextChange('ctaText', value)}
                isEditing={!!isEditing}
                as="span"
                placeholder="Button text"
              />
            </Button>
          )}
          {(content.ctaSecondaryText || isEditing) && (
            <Button
              size="lg"
              variant="outline"
              onClick={isEditing ? handleFieldClick(['ctaSecondaryText']) : undefined}
            >
              <InlineEditableText
                value={content.ctaSecondaryText || ''}
                onChange={(value) => handleTextChange('ctaSecondaryText', value)}
                isEditing={!!isEditing}
                as="span"
                placeholder="Secondary button"
              />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
