'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface InlineEditableTextProps {
  value: string;
  onChange: (value: string) => void;
  isEditing: boolean;
  className?: string;
  placeholder?: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  multiline?: boolean;
  onStartEdit?: () => void;
  onEndEdit?: () => void;
}

export function InlineEditableText({
  value,
  onChange,
  isEditing,
  className,
  placeholder = 'Click to edit...',
  as: Component = 'span',
  multiline = false,
  onStartEdit,
  onEndEdit,
}: InlineEditableTextProps) {
  const [isActive, setIsActive] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const elementRef = useRef<HTMLElement>(null);

  // Sync local value with prop value
  useEffect(() => {
    if (!isActive) {
      setLocalValue(value);
    }
  }, [value, isActive]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing && !isActive) {
        e.preventDefault();
        e.stopPropagation();
        setIsActive(true);
        onStartEdit?.();
        // Focus the element after state update
        setTimeout(() => {
          if (elementRef.current) {
            elementRef.current.focus();
            // Select all text
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(elementRef.current);
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }, 0);
      }
    },
    [isEditing, isActive, onStartEdit]
  );

  const handleBlur = useCallback(() => {
    if (isActive) {
      setIsActive(false);
      if (localValue !== value) {
        onChange(localValue);
      }
      onEndEdit?.();
    }
  }, [isActive, localValue, value, onChange, onEndEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !multiline) {
        e.preventDefault();
        elementRef.current?.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setLocalValue(value);
        setIsActive(false);
        onEndEdit?.();
      }
    },
    [multiline, value, onEndEdit]
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLElement>) => {
    const newValue = e.currentTarget.textContent || '';
    setLocalValue(newValue);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const displayValue = localValue || (isEditing ? placeholder : '');

  return (
    <Component
      ref={elementRef as any}
      className={cn(
        className,
        isEditing && !isActive && 'cursor-text hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2',
        isActive && 'outline outline-2 outline-blue-500 outline-offset-2'
      )}
      contentEditable={isActive}
      suppressContentEditableWarning
      onClick={handleClick}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      onPaste={handlePaste}
      style={{ minWidth: isActive ? '50px' : undefined }}
    >
      {displayValue}
    </Component>
  );
}
