'use client';

import { useCallback } from 'react';
import { InlineEditableText } from '../../editor/inline-editable-text';
import type { ProblemContent } from '@1person/workflow/landing-pages/blocks';

interface ProblemBlockProps {
  content: ProblemContent;
  primaryColor: string;
  isEditing?: boolean;
  onFieldClick?: (fieldPath: string[]) => void;
  onContentChange?: (content: Partial<ProblemContent>) => void;
}

export function ProblemBlock({
  content,
  primaryColor,
  isEditing,
  onFieldClick,
  onContentChange,
}: ProblemBlockProps) {
  const handleFieldClick = (path: string[]) => (e: React.MouseEvent) => {
    if (isEditing && onFieldClick) {
      e.preventDefault();
      e.stopPropagation();
      onFieldClick(path);
    }
  };

  const handleTextChange = useCallback(
    (field: keyof ProblemContent, value: string) => {
      if (onContentChange) {
        onContentChange({ [field]: value });
      }
    },
    [onContentChange]
  );

  const handlePainPointChange = useCallback(
    (index: number, field: 'title' | 'description', value: string) => {
      if (onContentChange && content.painPoints) {
        const updatedPainPoints = [...content.painPoints];
        updatedPainPoints[index] = { ...updatedPainPoints[index], [field]: value };
        onContentChange({ painPoints: updatedPainPoints });
      }
    },
    [onContentChange, content.painPoints]
  );

  return (
    <section className="py-16 px-4 bg-gray-50">
      <div className="container mx-auto max-w-4xl">
        <InlineEditableText
          value={content.title || 'The Problem'}
          onChange={(value) => handleTextChange('title', value)}
          isEditing={!!isEditing}
          as="h2"
          className="text-3xl font-bold text-center mb-4 text-gray-900"
          placeholder="Enter title..."
        />
        {(content.description || isEditing) && (
          <InlineEditableText
            value={content.description || ''}
            onChange={(value) => handleTextChange('description', value)}
            isEditing={!!isEditing}
            as="p"
            className="text-gray-600 text-center mb-12 max-w-2xl mx-auto"
            placeholder="Enter description..."
          />
        )}
        <div className="grid md:grid-cols-2 gap-6">
          {content.painPoints?.map((point, i) => (
            <div
              key={i}
              className={`p-6 bg-white rounded-lg shadow-sm border ${isEditing ? 'ring-1 ring-transparent hover:ring-blue-300' : ''}`}
            >
              <InlineEditableText
                value={point.title}
                onChange={(value) => handlePainPointChange(i, 'title', value)}
                isEditing={!!isEditing}
                as="h3"
                className="font-semibold text-lg mb-2 text-gray-900"
                placeholder="Pain point title..."
              />
              <InlineEditableText
                value={point.description}
                onChange={(value) => handlePainPointChange(i, 'description', value)}
                isEditing={!!isEditing}
                as="p"
                className="text-gray-600"
                placeholder="Pain point description..."
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
