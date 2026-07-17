'use client';

import { useState } from 'react';

interface ExpandablePostTextProps {
  text: string;
  threshold?: number;
  className?: string;
  buttonClassName?: string;
  as?: 'p' | 'span';
}

export function ExpandablePostText({
  text,
  threshold = 180,
  className,
  buttonClassName = 'text-slate-500 hover:text-slate-700',
  as = 'p',
}: ExpandablePostTextProps) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = text.length > threshold;
  const visibleText = shouldCollapse && !expanded
    ? text.slice(0, threshold).trimEnd()
    : text;
  const Tag = as;

  return (
    <Tag className={className}>
      {visibleText}
      {shouldCollapse && !expanded && (
        <>
          <span className={buttonClassName}>... </span>
          <button
            type="button"
            className={buttonClassName}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(true);
            }}
          >
            more
          </button>
        </>
      )}
    </Tag>
  );
}
