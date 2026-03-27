'use client';

import { useMemo, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useEditorStore, selectSortedBlocks } from '@/stores/editor-store';
import { BlockWrapper } from './block-wrapper';
import { BlockRenderer } from '../blocks/block-renderer';
import { cn } from '@/lib/utils';

interface EditorCanvasProps {
  primaryColor: string;
}

export function EditorCanvas({ primaryColor }: EditorCanvasProps) {
  const {
    page,
    selectedBlockId,
    isPreviewing,
    previewDevice,
    selectBlock,
    selectField,
    moveBlock,
    setDragging,
    draggedBlockId,
    updateBlockContent,
  } = useEditorStore();

  const sortedBlocks = useEditorStore(selectSortedBlocks);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const blockId = event.active.id as string;
      setDragging(true, blockId);
      selectBlock(blockId);
    },
    [setDragging, selectBlock]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setDragging(false, null);

      if (over && active.id !== over.id) {
        const oldIndex = sortedBlocks.findIndex((b) => b.id === active.id);
        const newIndex = sortedBlocks.findIndex((b) => b.id === over.id);
        moveBlock(oldIndex, newIndex);
      }
    },
    [sortedBlocks, moveBlock, setDragging]
  );

  const handleCanvasClick = useCallback(() => {
    selectBlock(null);
  }, [selectBlock]);

  const handleFieldClick = useCallback(
    (blockId: string, fieldPath: string[]) => {
      selectField(blockId, fieldPath);
    },
    [selectField]
  );

  const handleContentChange = useCallback(
    (blockId: string, content: Partial<Record<string, unknown>>) => {
      updateBlockContent(blockId, content as any);
    },
    [updateBlockContent]
  );

  const draggedBlock = useMemo(
    () => sortedBlocks.find((b) => b.id === draggedBlockId),
    [sortedBlocks, draggedBlockId]
  );

  const deviceWidth = useMemo(() => {
    switch (previewDevice) {
      case 'mobile':
        return '375px';
      case 'tablet':
        return '768px';
      default:
        return '100%';
    }
  }, [previewDevice]);

  return (
    <div
      className={cn(
        'flex-1 overflow-auto',
        isPreviewing ? 'bg-gray-900' : 'bg-gray-100'
      )}
      onClick={handleCanvasClick}
    >
      <div
        className={cn(
          'mx-auto min-h-full transition-all duration-300',
          isPreviewing && previewDevice !== 'desktop' && 'shadow-2xl'
        )}
        style={{
          maxWidth: deviceWidth,
          backgroundColor: 'white',
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedBlocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            {sortedBlocks.length === 0 ? (
              <div className="flex items-center justify-center h-96 text-gray-400">
                <div className="text-center">
                  <p className="text-lg font-medium mb-2">No blocks yet</p>
                  <p className="text-sm">
                    Add blocks from the sidebar to start building your page
                  </p>
                </div>
              </div>
            ) : (
              <div className={cn(!isPreviewing && 'pl-14 pr-14 py-8')}>
                {sortedBlocks.map((block) => (
                  <BlockWrapper
                    key={block.id}
                    blockId={block.id}
                    blockType={block.type}
                    isSelected={selectedBlockId === block.id}
                    isVisible={block.isVisible}
                    onSelect={() => selectBlock(block.id)}
                  >
                    <BlockRenderer
                      block={{
                        id: block.id,
                        type: block.type,
                        content: block.content as Record<string, unknown>,
                        order: block.order,
                        isVisible: block.isVisible,
                        backgroundColor: block.backgroundColor,
                      }}
                      primaryColor={primaryColor}
                      isEditing={!isPreviewing && selectedBlockId === block.id}
                      onFieldClick={(fieldPath) => handleFieldClick(block.id, fieldPath)}
                      onContentChange={(content) => handleContentChange(block.id, content)}
                    />
                  </BlockWrapper>
                ))}
              </div>
            )}
          </SortableContext>

          <DragOverlay>
            {draggedBlock && (
              <div className="opacity-80 shadow-2xl">
                <BlockRenderer
                  block={{
                    id: draggedBlock.id,
                    type: draggedBlock.type,
                    content: draggedBlock.content as Record<string, unknown>,
                    order: draggedBlock.order,
                    isVisible: true,
                  }}
                  primaryColor={primaryColor}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
