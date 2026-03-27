'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import {
  GripVertical,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/stores/editor-store';

interface BlockWrapperProps {
  blockId: string;
  blockType: string;
  isSelected: boolean;
  isVisible: boolean;
  children: React.ReactNode;
  onSelect: () => void;
}

export function BlockWrapper({
  blockId,
  blockType,
  isSelected,
  isVisible,
  children,
  onSelect,
}: BlockWrapperProps) {
  const {
    removeBlock,
    duplicateBlock,
    updateBlockVisibility,
    moveBlockUp,
    moveBlockDown,
    getBlockIndex,
    blocks,
    isPreviewing,
  } = useEditorStore();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: blockId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const index = getBlockIndex(blockId);
  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);
  const isFirst = index === 0;
  const isLast = index === sortedBlocks.length - 1;

  if (isPreviewing) {
    return isVisible ? <>{children}</> : null;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group',
        !isVisible && 'opacity-50'
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Selection outline */}
      <div
        className={cn(
          'absolute inset-0 pointer-events-none transition-all duration-150',
          isSelected
            ? 'ring-2 ring-blue-500 ring-inset'
            : 'ring-0 group-hover:ring-2 group-hover:ring-blue-300 group-hover:ring-inset'
        )}
      />

      {/* Block type label */}
      <div
        className={cn(
          'absolute -top-7 left-0 px-2 py-1 text-xs font-medium rounded-t-md transition-opacity',
          isSelected
            ? 'bg-blue-500 text-white opacity-100'
            : 'bg-gray-700 text-white opacity-0 group-hover:opacity-100'
        )}
      >
        {blockType}
      </div>

      {/* Drag handle and actions */}
      <div
        className={cn(
          'absolute -left-12 top-0 flex flex-col gap-1 transition-opacity',
          isSelected || isDragging
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100'
        )}
      >
        <button
          {...attributes}
          {...listeners}
          className="w-8 h-8 flex items-center justify-center rounded bg-gray-800 text-white hover:bg-gray-700 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 bg-gray-800 text-white hover:bg-gray-700"
          onClick={(e) => {
            e.stopPropagation();
            moveBlockUp(blockId);
          }}
          disabled={isFirst}
        >
          <ChevronUp className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 bg-gray-800 text-white hover:bg-gray-700"
          onClick={(e) => {
            e.stopPropagation();
            moveBlockDown(blockId);
          }}
          disabled={isLast}
        >
          <ChevronDown className="w-4 h-4" />
        </Button>
      </div>

      {/* Right side actions */}
      <div
        className={cn(
          'absolute -right-12 top-0 flex flex-col gap-1 transition-opacity',
          isSelected || isDragging
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100'
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 bg-gray-800 text-white hover:bg-gray-700"
          onClick={(e) => {
            e.stopPropagation();
            duplicateBlock(blockId);
          }}
        >
          <Copy className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 bg-gray-800 text-white hover:bg-gray-700"
          onClick={(e) => {
            e.stopPropagation();
            updateBlockVisibility(blockId, !isVisible);
          }}
        >
          {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 bg-red-600 text-white hover:bg-red-700"
          onClick={(e) => {
            e.stopPropagation();
            removeBlock(blockId);
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <div className={cn(!isVisible && 'pointer-events-none')}>
        {children}
      </div>
    </div>
  );
}
